import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  getSystemAccessToken,
  gustoFetch,
  mapGustoOnboardingToStatus,
  parseGustoJson,
  getGustoEnv,
} from '../_shared/gusto.ts'
import { mapSnapshotToGustoCompensations } from '../_shared/gusto-payroll-map.ts'
import {
  getServiceSupabase,
  requireParentForHousehold,
  getCompanyTokens,
  withFreshCompanyToken,
} from '../_shared/supabase.ts'
import { httpStatusForError, logGustoApiError } from '../_shared/log-error.ts'
import { isEinAlreadyInUseError, resolveEinForCreate } from '../_shared/gusto-ein.ts'
import { resolveIpForGusto } from '../_shared/client-ip.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let action = 'unknown'
  let householdId = ''

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json()
    action = (body.action as string) ?? 'unknown'
    householdId = (body.householdId as string) ?? ''
    if (!action || action === 'unknown' || !householdId) {
      return json({ error: 'action and householdId are required' }, 400)
    }

    console.info('gusto-api request', { action, householdId, gustoEnv: getGustoEnv() })

    const { userId } = await requireParentForHousehold(authHeader, householdId)

    switch (action) {
      case 'get_status':
        return json(await handleGetStatus(householdId))
      case 'create_company':
        return json(await handleCreateCompany(householdId, body))
      case 'accept_terms':
        return json(await handleAcceptTerms(householdId, body, userId, req))
      case 'sync_onboarding':
        return json(await handleSyncOnboarding(householdId))
      case 'create_flow':
        return json(await handleCreateFlow(householdId, body))
      case 'demo_approve_company':
        return json(await handleDemoApprove(householdId))
      case 'link_employee':
        return json(await handleLinkEmployee(householdId, body))
      case 'create_payroll':
        return json(await handleCreatePayroll(householdId, body, authHeader))
      case 'preview_payroll':
        return json(await handlePreviewPayroll(householdId, body))
      case 'submit_payroll':
        return json(await handleSubmitPayroll(householdId, body))
      default:
        return json({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (e) {
    const serialized = logGustoApiError(action, e, { householdId })
    return json(
      {
        error: serialized.message,
        code: serialized.code,
        details: serialized.details,
        hint: serialized.hint,
        action,
      },
      httpStatusForError(serialized.message),
    )
  }
})

const GUSTO_COMPANY_PUBLIC_COLUMNS =
  'id, household_id, company_uuid, onboarding_status, terms_accepted_at, approved_at, onboarding_steps, payroll_admin_email, created_at, updated_at'

async function handleGetStatus(householdId: string) {
  const admin = getServiceSupabase()
  // Query base table (service role); omit tokens. Do not use gusto_companies_public here —
  // its is_parent_role() filter breaks when auth.uid() is null (service role).
  const { data: company, error: companyError } = await admin
    .from('gusto_companies')
    .select(GUSTO_COMPANY_PUBLIC_COLUMNS)
    .eq('household_id', householdId)
    .maybeSingle()

  if (companyError) {
    console.error('gusto-api get_status: gusto_companies query failed', {
      householdId,
      code: companyError.code,
      message: companyError.message,
      details: companyError.details,
      hint: companyError.hint,
    })
    throw companyError
  }

  const { data: employees, error: employeesError } = await admin
    .from('gusto_employees')
    .select('id, household_nanny_id, employee_uuid, contractor_uuid, worker_type, onboarding_status')
    .eq('household_id', householdId)

  if (employeesError) {
    console.error('gusto-api get_status: gusto_employees query failed', {
      householdId,
      code: employeesError.code,
      message: employeesError.message,
      details: employeesError.details,
    })
    throw employeesError
  }

  return {
    configured: !!company,
    company,
    employees: employees ?? [],
    gustoEnv: getGustoEnv(),
    flowsBaseUrl: getGustoEnv() === 'demo' ? 'https://flows.gusto-demo.com' : 'https://flows.gusto.com',
    termsUrl: getGustoEnv() === 'demo' ? 'https://flows.gusto-demo.com/terms' : 'https://flows.gusto.com/terms',
  }
}

async function handleCreateCompany(
  householdId: string,
  body: { userEmail: string; userFirstName: string; userLastName: string; companyName: string; ein?: string },
) {
  const existing = await getCompanyTokens(householdId)
  if (existing) {
    return { alreadyExists: true, companyUuid: existing.company_uuid }
  }

  const admin = getServiceSupabase()
  const { data: household } = await admin.from('households').select('name').eq('id', householdId).single()
  if (!household) throw new Error('Household not found')

  const systemToken = await getSystemAccessToken()
  const companyName = body.companyName?.trim() || household.name
  const { ein, generated } = resolveEinForCreate(householdId, body.ein)

  console.info('gusto-api create_company', {
    householdId,
    companyName,
    einLast4: ein.slice(-4),
    einGeneratedForDemo: generated,
    gustoEnv: getGustoEnv(),
  })

  const res = await gustoFetch('/v1/partner_managed_companies', {
    method: 'POST',
    token: systemToken,
    body: {
      user: {
        first_name: body.userFirstName,
        last_name: body.userLastName,
        email: body.userEmail,
      },
      company: {
        name: companyName,
        ein: Number(ein),
      },
    },
  })

  let created: { company_uuid: string; access_token: string; refresh_token: string }
  try {
    created = await parseGustoJson(res)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (isEinAlreadyInUseError(msg)) {
      throw new Error(
        generated
          ? 'A Gusto demo company may already exist for this household. Enter a different 9-digit test EIN below and try again.'
          : 'That EIN is already registered in Gusto. Use a different EIN or sign in to your existing Gusto company.',
      )
    }
    throw e
  }

  const { error } = await admin.from('gusto_companies').insert({
    household_id: householdId,
    company_uuid: created.company_uuid,
    access_token: created.access_token,
    refresh_token: created.refresh_token,
    payroll_admin_email: body.userEmail.trim().toLowerCase(),
    onboarding_status: 'terms_required',
  })
  if (error) throw error

  return {
    companyUuid: created.company_uuid,
    onboardingStatus: 'terms_required',
    einGeneratedForDemo: generated,
  }
}

async function handleAcceptTerms(
  householdId: string,
  body: { userEmail?: string; clientIp?: string },
  userId: string,
  req: Request,
) {
  const admin = getServiceSupabase()
  const row = await getCompanyTokens(householdId)
  if (!row) throw new Error('Gusto company not found')

  const { data: companyRow } = await admin
    .from('gusto_companies')
    .select('payroll_admin_email')
    .eq('household_id', householdId)
    .maybeSingle()

  const email = (body.userEmail ?? companyRow?.payroll_admin_email ?? '').trim().toLowerCase()
  if (!email) {
    throw new Error('Payroll admin email is required to accept Gusto terms')
  }

  const ip_address = resolveIpForGusto(req, body.clientIp)

  console.info('gusto-api accept_terms', {
    householdId,
    email,
    external_user_id: userId,
    ip_address,
  })

  const res = await gustoFetch(
    `/v1/partner_managed_companies/${row.company_uuid}/accept_terms_of_service`,
    {
      method: 'POST',
      token: row.access_token,
      body: {
        email,
        external_user_id: userId,
        ip_address,
      },
    },
  )
  await parseGustoJson(res)

  await admin
    .from('gusto_companies')
    .update({
      terms_accepted_at: new Date().toISOString(),
      onboarding_status: 'setup_in_progress',
      payroll_admin_email: email,
      updated_at: new Date().toISOString(),
    })
    .eq('household_id', householdId)

  return { success: true }
}

const ALLOWED_COMPANY_FLOWS = new Set([
  'company_onboarding',
  'add_addresses',
  'add_bank_info',
  'add_bank_plaid_only',
  'verify_bank_info',
  'federal_tax_setup',
  'payroll_schedule',
  'add_employees',
  'state_setup',
  'sign_all_forms',
  'select_industry',
  'employee_management',
])

const ALLOWED_EMPLOYEE_FLOWS = new Set([
  'employee_self_management',
  'employee_form_signing',
  'employee_federal_setup',
  'employee_state_setup',
  'manage_employee_addresses',
])

async function handleCreateFlow(
  householdId: string,
  body: {
    flowType?: string
    entityType?: string
    entityUuid?: string
    options?: Record<string, unknown>
  },
) {
  const admin = getServiceSupabase()
  const row = await getCompanyTokens(householdId)
  if (!row) throw new Error('Gusto company not found')

  const { data: companyMeta } = await admin
    .from('gusto_companies')
    .select('terms_accepted_at')
    .eq('household_id', householdId)
    .maybeSingle()

  if (!companyMeta?.terms_accepted_at) {
    throw new Error('Accept Gusto terms before opening setup flows')
  }

  const flowType = (body.flowType ?? 'company_onboarding').trim()
  const isEmployeeFlow = ALLOWED_EMPLOYEE_FLOWS.has(flowType)
  const isCompanyFlow = ALLOWED_COMPANY_FLOWS.has(flowType)

  if (!isEmployeeFlow && !isCompanyFlow) {
    throw new Error(`Flow type not allowed: ${flowType}`)
  }

  if (isEmployeeFlow) {
    const entityUuid = body.entityUuid?.trim()
    if (!entityUuid) {
      throw new Error('entityUuid is required for employee onboarding flows')
    }
    const { data: link } = await admin
      .from('gusto_employees')
      .select('employee_uuid')
      .eq('household_id', householdId)
      .eq('employee_uuid', entityUuid)
      .maybeSingle()
    if (!link?.employee_uuid) {
      throw new Error('Employee is not linked to this household in Gusto')
    }
  }

  const payload: Record<string, unknown> = { flow_type: flowType }
  if (body.entityUuid) {
    payload.entity_uuid = body.entityUuid.trim()
    payload.entity_type = body.entityType ?? 'Employee'
  }
  if (body.options && typeof body.options === 'object') {
    payload.options = body.options
  }

  console.info('gusto-api create_flow', { householdId, flowType })

  const result = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const res = await gustoFetch(`/v1/companies/${companyUuid}/flows`, {
      method: 'POST',
      token,
      body: payload,
    })
    return parseGustoJson<{ url: string }>(res)
  })

  if (!result.url) throw new Error('Gusto did not return a flow URL')

  return { url: result.url, flowType }
}

async function handleSyncOnboarding(householdId: string) {
  const result = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const res = await gustoFetch(`/v1/companies/${companyUuid}/onboarding_status`, {
      token,
    })
    return parseGustoJson<{ onboarding_steps: Record<string, { completed?: boolean }> }>(res)
  })

  const row = await getCompanyTokens(householdId)
  const admin = getServiceSupabase()
  const status = mapGustoOnboardingToStatus(result.onboarding_steps, row?.approved_at ?? null)

  await admin
    .from('gusto_companies')
    .update({
      onboarding_status: status,
      onboarding_steps: result.onboarding_steps,
      updated_at: new Date().toISOString(),
    })
    .eq('household_id', householdId)

  return { onboardingStatus: status, steps: result.onboarding_steps }
}

async function handleDemoApprove(householdId: string) {
  if (getGustoEnv() !== 'demo') {
    throw new Error('demo_approve_company is only available in Gusto demo environment')
  }

  await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const res = await gustoFetch(`/v1/companies/${companyUuid}/approve`, {
      method: 'PUT',
      token,
      body: {},
    })
    return parseGustoJson(res)
  })

  const admin = getServiceSupabase()
  const approvedAt = new Date().toISOString()
  await admin
    .from('gusto_companies')
    .update({
      approved_at: approvedAt,
      onboarding_status: 'approved',
      updated_at: approvedAt,
    })
    .eq('household_id', householdId)

  return { approved: true, approvedAt }
}

async function handleLinkEmployee(
  householdId: string,
  body: { householdNannyId: string; workerType?: 'employee' | 'contractor' },
) {
  const admin = getServiceSupabase()
  const { data: nanny } = await admin
    .from('household_nannies')
    .select('id, first_name, last_name, email, user_id')
    .eq('id', body.householdNannyId)
    .eq('household_id', householdId)
    .single()
  if (!nanny) throw new Error('Nanny not found')

  const workerType = body.workerType ?? 'employee'

  const employeePayload = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const res = await gustoFetch(`/v1/companies/${companyUuid}/employees`, {
      method: 'POST',
      token,
      body: {
        first_name: nanny.first_name,
        last_name: nanny.last_name,
        email: nanny.email,
      },
    })
    return parseGustoJson<{ uuid: string }>(res)
  })

  const { error } = await admin.from('gusto_employees').upsert(
    {
      household_nanny_id: nanny.id,
      household_id: householdId,
      employee_uuid: workerType === 'employee' ? employeePayload.uuid : null,
      worker_type: workerType,
      onboarding_status: 'created',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'household_nanny_id' },
  )
  if (error) throw error

  return { employeeUuid: employeePayload.uuid }
}

async function handleCreatePayroll(
  householdId: string,
  body: { payPeriodCloseId: string },
  authHeader: string,
) {
  const admin = getServiceSupabase()
  const { data: close } = await admin
    .from('pay_period_closes')
    .select('*')
    .eq('id', body.payPeriodCloseId)
    .eq('household_id', householdId)
    .single()

  if (!close) throw new Error('Pay period close not found')

  const { data: existingRun } = await admin
    .from('payroll_runs')
    .select('*')
    .eq('pay_period_close_id', close.id)
    .maybeSingle()

  if (existingRun?.gusto_payroll_uuid && existingRun.status !== 'failed') {
    return { payrollRunId: existingRun.id, gustoPayrollUuid: existingRun.gusto_payroll_uuid, existing: true }
  }

  const { data: gustoEmployee } = await admin
    .from('gusto_employees')
    .select('*')
    .eq('household_nanny_id', close.household_nanny_id)
    .maybeSingle()

  if (!gustoEmployee?.employee_uuid) {
    throw new Error('Link this nanny to Gusto before running payroll')
  }

  const { data: settings } = await admin
    .from('employment_settings')
    .select('*')
    .eq('household_nanny_id', close.household_nanny_id)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!settings) throw new Error('Employment settings not found')

  if (settings.pay_reporting_mode && settings.pay_reporting_mode !== 'all_over') {
    throw new Error(
      'Gusto payroll requires all wages on the books. Set pay reporting to "All pay on the books" in nanny settings.',
    )
  }

  const snapshot = close.snapshot as Record<string, unknown>
  const mapped = mapSnapshotToGustoCompensations(
    {
      regularMinutes: Number(snapshot.regularMinutes ?? 0),
      overtimeMinutes: Number(snapshot.overtimeMinutes ?? 0),
      regularPayCents: Number(snapshot.regularPayCents ?? 0),
      overtimePayCents: Number(snapshot.overtimePayCents ?? 0),
      grossPayCents: Number(snapshot.grossPayCents ?? 0),
      lineItemsTotalCents: Number(snapshot.lineItemsTotalCents ?? 0),
      advanceDeductionCents: Number(snapshot.advanceDeductionCents ?? 0),
      netPayCents: Number(snapshot.netPayCents ?? 0),
    },
    settings.hourly_rate_cents,
    Number(settings.overtime_multiplier),
  )

  const payrollUuid = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const createRes = await gustoFetch(`/v1/companies/${companyUuid}/payrolls`, {
      method: 'POST',
      token,
      body: {
        off_cycle: true,
        off_cycle_reason: 'Correction',
        start_date: close.period_start,
        end_date: close.period_end,
        check_date: close.period_end,
        employee_uuids: [gustoEmployee.employee_uuid],
      },
    })
    const payroll = await parseGustoJson<{ uuid: string }>(createRes)

    await gustoFetch(`/v1/companies/${companyUuid}/payrolls/${payroll.uuid}`, {
      method: 'PUT',
      token,
      body: {
        employee_compensations: [
          {
            employee_uuid: gustoEmployee.employee_uuid,
            hourly_compensations: mapped.hourly_compensations,
            fixed_compensations: mapped.fixed_compensations,
          },
        ],
      },
    })

    return payroll.uuid
  })

  const supabaseUser = await requireParentForHousehold(authHeader, householdId)

  const { data: run, error: runError } = await admin
    .from('payroll_runs')
    .upsert(
      {
        household_id: householdId,
        household_nanny_id: close.household_nanny_id,
        pay_period_close_id: close.id,
        gusto_payroll_uuid: payrollUuid,
        status: 'draft',
        preview_payload: mapped,
        created_by: supabaseUser.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'pay_period_close_id' },
    )
    .select()
    .single()

  if (runError) throw runError

  return { payrollRunId: run.id, gustoPayrollUuid: payrollUuid, mapped }
}

async function handlePreviewPayroll(householdId: string, body: { payrollRunId: string }) {
  const admin = getServiceSupabase()
  const { data: run } = await admin
    .from('payroll_runs')
    .select('*')
    .eq('id', body.payrollRunId)
    .eq('household_id', householdId)
    .single()

  if (!run?.gusto_payroll_uuid) throw new Error('Payroll run not found')

  const preview = await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const res = await gustoFetch(
      `/v1/companies/${companyUuid}/payrolls/${run.gusto_payroll_uuid}/calculate`,
      {
        method: 'PUT',
        token,
      },
    )
    return parseGustoJson<{
      totals?: {
        company_debit?: string
        net_pay_debit?: string
        tax_debit?: string
      }
    }>(res)
  })

  const companyDebit = dollarsToCents(preview.totals?.company_debit)
  const netPay = dollarsToCents(preview.totals?.net_pay_debit)
  const taxDebit = dollarsToCents(preview.totals?.tax_debit)

  await admin
    .from('payroll_runs')
    .update({
      status: 'ready',
      company_debit_cents: companyDebit,
      net_pay_cents: netPay,
      tax_debit_cents: taxDebit,
      preview_payload: preview,
      updated_at: new Date().toISOString(),
    })
    .eq('id', run.id)

  return { preview, companyDebitCents: companyDebit, netPayCents: netPay, taxDebitCents: taxDebit }
}

async function handleSubmitPayroll(householdId: string, body: { payrollRunId: string }) {
  const admin = getServiceSupabase()
  const { data: run } = await admin
    .from('payroll_runs')
    .select('*')
    .eq('id', body.payrollRunId)
    .eq('household_id', householdId)
    .single()

  if (!run?.gusto_payroll_uuid) throw new Error('Payroll run not found')

  await withFreshCompanyToken(householdId, async (token, companyUuid) => {
    const res = await gustoFetch(
      `/v1/companies/${companyUuid}/payrolls/${run.gusto_payroll_uuid}/submit`,
      {
        method: 'PUT',
        token,
      },
    )
    return parseGustoJson(res)
  })

  const submittedAt = new Date().toISOString()
  await admin
    .from('payroll_runs')
    .update({
      status: 'submitted',
      submitted_at: submittedAt,
      updated_at: submittedAt,
    })
    .eq('id', run.id)

  return { submitted: true, status: 'submitted' }
}

function dollarsToCents(value?: string): number | null {
  if (value == null || value === '') return null
  const n = parseFloat(value)
  if (Number.isNaN(n)) return null
  return Math.round(n * 100)
}
