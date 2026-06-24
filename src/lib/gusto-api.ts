import { supabase } from '@/lib/supabase'

export type GustoOnboardingStatus =
  | 'pending'
  | 'terms_required'
  | 'setup_in_progress'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'

export interface GustoCompanyPublic {
  id: string
  household_id: string
  company_uuid: string
  onboarding_status: GustoOnboardingStatus
  terms_accepted_at: string | null
  approved_at: string | null
  onboarding_steps: Record<string, { completed?: boolean; title?: string }>
  created_at: string
  updated_at: string
}

export interface GustoEmployeeLink {
  id: string
  household_nanny_id: string
  employee_uuid: string | null
  contractor_uuid: string | null
  worker_type: 'employee' | 'contractor'
  onboarding_status: string
}

export type PayrollRunStatus =
  | 'draft'
  | 'previewing'
  | 'ready'
  | 'submitted'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'cancelled'

export interface PayrollRun {
  id: string
  household_id: string
  household_nanny_id: string
  pay_period_close_id: string
  gusto_payroll_uuid: string | null
  status: PayrollRunStatus
  company_debit_cents: number | null
  net_pay_cents: number | null
  tax_debit_cents: number | null
  preview_payload: unknown
  error_message: string | null
  submitted_at: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

export interface GustoStatusResponse {
  configured: boolean
  company: GustoCompanyPublic | null
  employees: GustoEmployeeLink[]
  gustoEnv: 'demo' | 'production'
  flowsBaseUrl: string
  termsUrl: string
}

async function invokeGusto<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('gusto-api', { body })
  if (error) {
    console.error('gusto-api invoke failed', { action: body.action, error })
    throw error
  }
  const payload = data as {
    error?: string
    details?: string
    hint?: string
    code?: string
    action?: string
  } & T
  if (payload?.error) {
    const parts = [payload.error, payload.details, payload.hint].filter(Boolean)
    console.error('gusto-api returned error', {
      action: body.action,
      code: payload.code,
      error: payload.error,
      details: payload.details,
      hint: payload.hint,
    })
    throw new Error(parts.join(' — '))
  }
  return payload as T
}

export function fetchGustoStatus(householdId: string) {
  return invokeGusto<GustoStatusResponse>({ action: 'get_status', householdId })
}

export function createGustoCompany(params: {
  householdId: string
  userEmail: string
  userFirstName: string
  userLastName: string
  companyName: string
  ein?: string
}) {
  return invokeGusto<{ companyUuid: string; onboardingStatus: string }>({
    action: 'create_company',
    ...params,
  })
}

export function acceptGustoTerms(params: {
  householdId: string
  userEmail: string
  clientIp?: string
}) {
  return invokeGusto<{ success: boolean }>({
    action: 'accept_terms',
    householdId: params.householdId,
    userEmail: params.userEmail,
    clientIp: params.clientIp,
  })
}

export function syncGustoOnboarding(householdId: string) {
  return invokeGusto<{ onboardingStatus: GustoOnboardingStatus; steps: Record<string, unknown> }>({
    action: 'sync_onboarding',
    householdId,
  })
}

export type GustoFlowEntityType = 'Company' | 'Employee' | 'Contractor' | 'Payroll'

export function createGustoFlow(params: {
  householdId: string
  flowType: string
  entityType?: GustoFlowEntityType
  entityUuid?: string
  options?: Record<string, unknown>
}) {
  return invokeGusto<{ url: string; flowType: string }>({
    action: 'create_flow',
    ...params,
  })
}

export function demoApproveGustoCompany(householdId: string) {
  return invokeGusto<{ approved: boolean }>({ action: 'demo_approve_company', householdId })
}

export function linkGustoEmployee(params: {
  householdId: string
  householdNannyId: string
  workerType?: 'employee' | 'contractor'
}) {
  return invokeGusto<{ employeeUuid: string }>({ action: 'link_employee', ...params })
}

export function createGustoPayroll(params: { householdId: string; payPeriodCloseId: string }) {
  return invokeGusto<{
    payrollRunId: string
    gustoPayrollUuid: string
    existing?: boolean
  }>({ action: 'create_payroll', ...params })
}

export function previewGustoPayroll(params: { householdId: string; payrollRunId: string }) {
  return invokeGusto<{
    companyDebitCents: number | null
    netPayCents: number | null
    taxDebitCents: number | null
    preview: unknown
  }>({ action: 'preview_payroll', ...params })
}

export function submitGustoPayroll(params: { householdId: string; payrollRunId: string }) {
  return invokeGusto<{ submitted: boolean; status: string }>({ action: 'submit_payroll', ...params })
}

export const GUSTO_TERMS_URL = 'https://flows.gusto.com/terms'
export const GUSTO_TERMS_URL_DEMO = 'https://flows.gusto-demo.com/terms'
