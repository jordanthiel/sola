import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  dollarsToCents,
  mapSnapshotToNkEmployeeEarnings,
  mapSoolaPayPeriod,
  nkFetch,
  requireNannyKeeperApiKey,
} from '../_shared/nannykeeper.ts'
import { requireFeatureAccess } from '../_shared/feature-gates.ts'
import { getServiceSupabase, requireParentForHousehold } from '../_shared/supabase.ts'
import { httpStatusForError, serializeError } from '../_shared/log-error.ts'

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

    const { userId } = await requireParentForHousehold(authHeader, householdId)
    await requireFeatureAccess(userId, 'household_payroll')
    requireNannyKeeperApiKey()

    switch (action) {
      case 'get_status':
        return json(await handleGetStatus(householdId))
      case 'create_employer':
        return json(await handleCreateEmployer(householdId, body))
      case 'create_employee':
        return json(await handleCreateEmployee(householdId, body))
      case 'preview_payroll':
        return json(await handlePreviewPayroll(householdId, body, userId))
      case 'run_payroll':
        return json(await handleRunPayroll(householdId, body, userId))
      case 'initiate_ach':
        return json(await handleInitiateAch(householdId, body))
      case 'generate_document':
        return json(await handleGenerateDocument(householdId, body))
      default:
        return json({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (e) {
    const serialized = serializeError(e)
    console.error('nannykeeper-api error', { action, householdId, ...serialized })
    const status =
      typeof (e as { status?: number })?.status === 'number'
        ? (e as { status: number }).status
        : httpStatusForError(serialized.message)
    return json(
      {
        error: serialized.message,
        details: serialized.details,
        body: (e as { body?: unknown })?.body,
      },
      status >= 400 && status < 600 ? status : 500,
    )
  }
})

async function handleGetStatus(householdId: string) {
  const admin = getServiceSupabase()
  const { data: employer } = await admin
    .from('nk_employers')
    .select('id, employer_id, state, admin_email, first_name, last_name, created_at')
    .eq('household_id', householdId)
    .maybeSingle()

  const { data: employees } = await admin
    .from('nk_employees')
    .select(
      'id, household_nanny_id, employee_id, email, portal_url, onboarding_status, created_at',
    )
    .eq('household_id', householdId)

  return {
    configured: !!Deno.env.get('NANNYKEEPER_API_KEY'),
    employer,
    employees: employees ?? [],
  }
}

async function handleCreateEmployer(
  householdId: string,
  body: Record<string, unknown>,
) {
  const admin = getServiceSupabase()
  const { data: existing } = await admin
    .from('nk_employers')
    .select('id, employer_id')
    .eq('household_id', householdId)
    .maybeSingle()
  if (existing) {
    return { employer: existing, alreadyExists: true }
  }

  const firstName = String(body.firstName ?? '').trim()
  const lastName = String(body.lastName ?? '').trim()
  const email = String(body.email ?? '').trim()
  const state = String(body.state ?? '').trim().toUpperCase()
  if (!firstName || !lastName || !email || !/^[A-Z]{2}$/.test(state)) {
    throw new Error('firstName, lastName, email, and 2-letter state are required')
  }

  const created = await nkFetch<{ data?: { id?: string } } & { id?: string }>('/employers', {
    method: 'POST',
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName,
      email,
      state,
    }),
  })

  const employerId = created?.data?.id ?? created?.id
  if (!employerId) throw new Error('NannyKeeper did not return an employer id')

  const { data: row, error } = await admin
    .from('nk_employers')
    .insert({
      household_id: householdId,
      employer_id: employerId,
      state,
      admin_email: email,
      first_name: firstName,
      last_name: lastName,
    })
    .select('id, employer_id, state, admin_email, first_name, last_name, created_at')
    .single()
  if (error) throw error

  return { employer: row }
}

async function handleCreateEmployee(
  householdId: string,
  body: Record<string, unknown>,
) {
  const householdNannyId = String(body.householdNannyId ?? '')
  if (!householdNannyId) throw new Error('householdNannyId is required')

  const admin = getServiceSupabase()
  const { data: employer } = await admin
    .from('nk_employers')
    .select('id, employer_id')
    .eq('household_id', householdId)
    .maybeSingle()
  if (!employer) throw new Error('Create a NannyKeeper employer for this household first')

  const { data: existing } = await admin
    .from('nk_employees')
    .select('id, employee_id, portal_url, onboarding_status')
    .eq('household_nanny_id', householdNannyId)
    .maybeSingle()
  if (existing) return { employee: existing, alreadyExists: true }

  const { data: nanny, error: nannyError } = await admin
    .from('household_nannies')
    .select('id, user_id')
    .eq('id', householdNannyId)
    .eq('household_id', householdId)
    .maybeSingle()
  if (nannyError || !nanny) throw new Error('Nanny not found in this household')

  const email = String(body.email ?? '').trim()
  if (!email) throw new Error('email is required')

  let firstName = String(body.firstName ?? '').trim()
  let lastName = String(body.lastName ?? '').trim()
  if (!firstName || !lastName) {
    let display = email.split('@')[0] || 'Nanny'
    if (nanny.user_id) {
      const { data: profile } = await admin
        .from('profiles')
        .select('display_name')
        .eq('id', nanny.user_id)
        .maybeSingle()
      if (profile?.display_name?.trim()) display = profile.display_name.trim()
    }
    const parts = display.split(/\s+/)
    firstName = firstName || parts[0] || 'Nanny'
    lastName = lastName || parts.slice(1).join(' ') || 'Employee'
  }

  const startDate = body.startDate ? String(body.startDate) : undefined
  const payload: Record<string, unknown> = {
    employer_id: employer.employer_id,
    first_name: firstName,
    last_name: lastName,
    email,
  }
  if (startDate) payload.start_date = startDate

  const created = await nkFetch<{
    data?: { id?: string; portal_url?: string; onboarding_url?: string }
    id?: string
    portal_url?: string
  }>('/employees', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  const employeeId = created?.data?.id ?? created?.id
  if (!employeeId) throw new Error('NannyKeeper did not return an employee id')
  const portalUrl =
    created?.data?.portal_url ??
    created?.data?.onboarding_url ??
    created?.portal_url ??
    null

  const { data: row, error } = await admin
    .from('nk_employees')
    .insert({
      household_nanny_id: householdNannyId,
      household_id: householdId,
      employer_row_id: employer.id,
      employee_id: employeeId,
      email,
      portal_url: portalUrl,
      onboarding_status: 'created',
    })
    .select('id, household_nanny_id, employee_id, email, portal_url, onboarding_status')
    .single()
  if (error) throw error

  return { employee: row }
}

async function loadCloseAndLinks(
  householdId: string,
  payPeriodCloseId: string,
  householdNannyId: string,
) {
  const admin = getServiceSupabase()
  const { data: close, error: closeError } = await admin
    .from('pay_period_closes')
    .select('*')
    .eq('id', payPeriodCloseId)
    .eq('household_id', householdId)
    .eq('household_nanny_id', householdNannyId)
    .maybeSingle()
  if (closeError || !close) throw new Error('Pay period close not found')

  const { data: employer } = await admin
    .from('nk_employers')
    .select('id, employer_id')
    .eq('household_id', householdId)
    .maybeSingle()
  if (!employer) throw new Error('NannyKeeper employer not set up')

  const { data: employee } = await admin
    .from('nk_employees')
    .select('id, employee_id')
    .eq('household_id', householdId)
    .eq('household_nanny_id', householdNannyId)
    .maybeSingle()
  if (!employee) throw new Error('Link this nanny to NannyKeeper first')

  const { data: settings } = await admin
    .from('employment_settings')
    .select('pay_period, pay_reporting_mode')
    .eq('household_nanny_id', householdNannyId)
    .maybeSingle()

  const reportingMode = (settings as { pay_reporting_mode?: string } | null)?.pay_reporting_mode
  if (reportingMode && reportingMode !== 'all_over') {
    throw new Error('Compliant payroll requires pay reporting mode “All on the books”')
  }

  return { admin, close, employer, employee, settings }
}

function extractPreviewCents(preview: unknown): {
  netPayCents: number | null
  taxDebitCents: number | null
  companyDebitCents: number | null
} {
  const data = (preview as { data?: Record<string, unknown> })?.data ?? preview
  const root = data as Record<string, unknown>
  const employees = (root.employees as unknown[]) ?? []
  const first = (employees[0] as Record<string, unknown>) ?? {}

  const net =
    dollarsToCents(first.net_pay) ??
    dollarsToCents(first.net) ??
    dollarsToCents(root.net_pay) ??
    dollarsToCents(root.total_net_pay)

  const employeeTax =
    dollarsToCents((first.employee_taxes as { total?: unknown })?.total) ??
    dollarsToCents(first.employee_tax_total)
  const employerTax =
    dollarsToCents((first.employer_taxes as { total?: unknown })?.total) ??
    dollarsToCents((root.employer_taxes as { total?: unknown })?.total) ??
    dollarsToCents(root.employer_tax_total)

  const companyDebit =
    dollarsToCents(root.total_employer_cost) ??
    (net != null && employerTax != null ? net + employerTax : null)

  return {
    netPayCents: net,
    taxDebitCents: employeeTax != null || employerTax != null
      ? (employeeTax ?? 0) + (employerTax ?? 0)
      : null,
    companyDebitCents: companyDebit,
  }
}

async function handlePreviewPayroll(
  householdId: string,
  body: Record<string, unknown>,
  userId: string,
) {
  const payPeriodCloseId = String(body.payPeriodCloseId ?? '')
  const householdNannyId = String(body.householdNannyId ?? '')
  if (!payPeriodCloseId || !householdNannyId) {
    throw new Error('payPeriodCloseId and householdNannyId are required')
  }

  const { admin, close, employer, employee, settings } = await loadCloseAndLinks(
    householdId,
    payPeriodCloseId,
    householdNannyId,
  )

  const snapshot = close.snapshot as Record<string, unknown>
  const earnings = mapSnapshotToNkEmployeeEarnings(snapshot)
  const payDate =
    String(body.payDate ?? '').trim() ||
    close.period_end

  const payload = {
    employer_id: employer.employer_id,
    pay_period_start: close.period_start,
    pay_period_end: close.period_end,
    pay_date: payDate,
    pay_frequency: mapSoolaPayPeriod(
      (settings as { pay_period?: string } | null)?.pay_period,
    ),
    employees: [
      {
        employee_id: employee.employee_id,
        regular_hours: earnings.regular_hours,
        overtime_hours: earnings.overtime_hours,
        other_earnings: earnings.other_earnings,
      },
    ],
  }

  const preview = await nkFetch('/payroll/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const cents = extractPreviewCents(preview)

  const { data: run, error } = await admin
    .from('payroll_runs')
    .upsert(
      {
        household_id: householdId,
        household_nanny_id: householdNannyId,
        pay_period_close_id: payPeriodCloseId,
        provider: 'nannykeeper',
        status: 'ready',
        net_pay_cents: cents.netPayCents,
        tax_debit_cents: cents.taxDebitCents,
        company_debit_cents: cents.companyDebitCents,
        preview_payload: { request: payload, response: preview, soola: earnings.soola },
        error_message: null,
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'pay_period_close_id' },
    )
    .select('*')
    .single()
  if (error) throw error

  return {
    payrollRun: run,
    netPayCents: cents.netPayCents,
    taxDebitCents: cents.taxDebitCents,
    companyDebitCents: cents.companyDebitCents,
  }
}

async function handleRunPayroll(
  householdId: string,
  body: Record<string, unknown>,
  userId: string,
) {
  const payrollRunId = String(body.payrollRunId ?? '')
  if (!payrollRunId) throw new Error('payrollRunId is required')

  const admin = getServiceSupabase()
  const { data: run, error: runError } = await admin
    .from('payroll_runs')
    .select('*')
    .eq('id', payrollRunId)
    .eq('household_id', householdId)
    .maybeSingle()
  if (runError || !run) throw new Error('Payroll run not found')
  if (!run.preview_payload) throw new Error('Preview payroll before running')

  const previewPayload = run.preview_payload as { request?: Record<string, unknown> }
  const request = previewPayload.request
  if (!request) throw new Error('Missing preview request payload')

  const paymentMethod = String(body.paymentMethod ?? 'check')
  const employees = ((request.employees as Record<string, unknown>[]) ?? []).map((e) => ({
    ...e,
    payment_method: paymentMethod === 'direct_deposit' ? 'direct_deposit' : paymentMethod,
  }))

  const result = await nkFetch<{
    data?: { payroll_id?: string; status?: string }
    payroll_id?: string
  }>('/payroll/run', {
    method: 'POST',
    body: JSON.stringify({ ...request, employees, notes: body.notes ?? undefined }),
  })

  const externalId = result?.data?.payroll_id ?? result?.payroll_id ?? null
  const status = result?.data?.status === 'scheduled' ? 'submitted' : 'submitted'

  const { data: updated, error } = await admin
    .from('payroll_runs')
    .update({
      external_payroll_id: externalId,
      status,
      submitted_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
      created_by: run.created_by ?? userId,
      preview_payload: {
        ...previewPayload,
        runResponse: result,
      },
    })
    .eq('id', payrollRunId)
    .select('*')
    .single()
  if (error) throw error

  if (run.net_pay_cents != null) {
    await admin
      .from('pay_period_closes')
      .update({
        paid_at: new Date().toISOString(),
        paid_amount_cents: run.net_pay_cents,
      })
      .eq('id', run.pay_period_close_id)
  }

  return { payrollRun: updated, externalPayrollId: externalId }
}

async function handleInitiateAch(
  householdId: string,
  body: Record<string, unknown>,
) {
  const payrollRunId = String(body.payrollRunId ?? '')
  if (!payrollRunId) throw new Error('payrollRunId is required')

  const admin = getServiceSupabase()
  const { data: run } = await admin
    .from('payroll_runs')
    .select('id, external_payroll_id, household_id')
    .eq('id', payrollRunId)
    .eq('household_id', householdId)
    .maybeSingle()
  if (!run?.external_payroll_id) throw new Error('Run payroll before initiating ACH')

  const result = await nkFetch('/ach/transfer', {
    method: 'POST',
    body: JSON.stringify({
      payroll_id: run.external_payroll_id,
      ...(typeof body.achPayload === 'object' && body.achPayload ? body.achPayload : {}),
    }),
  })

  const { data: full } = await admin
    .from('payroll_runs')
    .select('preview_payload')
    .eq('id', payrollRunId)
    .single()
  const prev = (full?.preview_payload as Record<string, unknown>) ?? {}
  await admin
    .from('payroll_runs')
    .update({
      status: 'processing',
      preview_payload: { ...prev, achResponse: result },
      updated_at: new Date().toISOString(),
    })
    .eq('id', payrollRunId)

  return { result }
}

async function handleGenerateDocument(
  householdId: string,
  body: Record<string, unknown>,
) {
  const docType = String(body.docType ?? '')
  const path =
    docType === 'w2'
      ? '/documents/w2'
      : docType === 'schedule-h'
        ? '/documents/schedule-h'
        : docType === 'paystub'
          ? '/documents/paystub'
          : null
  if (!path) throw new Error('docType must be w2, schedule-h, or paystub')

  const admin = getServiceSupabase()
  const { data: employer } = await admin
    .from('nk_employers')
    .select('employer_id')
    .eq('household_id', householdId)
    .maybeSingle()
  if (!employer) throw new Error('NannyKeeper employer not set up')

  const payload: Record<string, unknown> = {
    employer_id: employer.employer_id,
    ...(typeof body.documentPayload === 'object' && body.documentPayload
      ? body.documentPayload
      : {}),
  }
  if (body.employeeId) payload.employee_id = body.employeeId
  if (body.taxYear) payload.tax_year = body.taxYear
  if (body.payrollId) payload.payroll_id = body.payrollId

  const result = await nkFetch(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return { document: result }
}
