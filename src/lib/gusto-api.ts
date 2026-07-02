import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

async function edgeFunctionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError && error.context) {
    try {
      const body = (await error.context.clone().json()) as { error?: string }
      if (body?.error) return body.error
    } catch {
      /* fall through */
    }
  }
  if (error instanceof Error) return error.message
  return 'Request failed. Check that supabase functions serve is running.'
}

export async function invokeGustoApi<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('gusto-api', { body })
  if (error) throw new Error(await edgeFunctionErrorMessage(error))
  const result = data as T & { error?: string }
  if (result && typeof result === 'object' && 'error' in result && result.error) {
    throw new Error(result.error)
  }
  return result as T
}

export type GustoOnboardingStatus =
  | 'pending'
  | 'terms_required'
  | 'setup_in_progress'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'

export type GustoStatusResponse = {
  configured: boolean
  company: {
    id: string
    household_id: string
    company_uuid: string
    onboarding_status: GustoOnboardingStatus
    terms_accepted_at: string | null
    approved_at: string | null
    onboarding_steps: Record<string, { completed?: boolean }>
    payroll_admin_email: string | null
  } | null
  employees: {
    id: string
    household_nanny_id: string
    employee_uuid: string | null
    contractor_uuid: string | null
    worker_type: string
    onboarding_status: string
  }[]
  gustoEnv: string
  flowsBaseUrl: string
  termsUrl: string
}

export type GustoFlowType =
  | 'company_onboarding'
  | 'add_addresses'
  | 'add_bank_info'
  | 'add_bank_plaid_only'
  | 'verify_bank_info'
  | 'federal_tax_setup'
  | 'payroll_schedule'
  | 'add_employees'
  | 'state_setup'
  | 'sign_all_forms'
  | 'select_industry'
  | 'employee_management'
  | 'employee_self_management'
  | 'employee_form_signing'
  | 'employee_federal_setup'
  | 'employee_state_setup'
  | 'manage_employee_addresses'

export const GUSTO_ONBOARDING_STEP_LABELS: Record<string, string> = {
  add_addresses: 'Business address',
  add_bank_info: 'Bank account',
  federal_tax_setup: 'Federal tax details',
  select_industry: 'Industry',
  payroll_schedule: 'Pay schedule',
  add_employees: 'Employees',
  state_setup: 'State taxes',
  verify_bank_info: 'Verify bank account',
  sign_all_forms: 'Sign required forms',
}

/** @deprecated Use GUSTO_ONBOARDING_STEP_LABELS */
export const GUSTO_COMPANY_FLOW_LABELS = GUSTO_ONBOARDING_STEP_LABELS

export async function getGustoStatus(householdId: string) {
  return invokeGustoApi<GustoStatusResponse>({ action: 'get_status', householdId })
}

export async function createGustoCompany(
  householdId: string,
  params: {
    userEmail: string
    userFirstName: string
    userLastName: string
    companyName: string
    ein?: string
  },
) {
  return invokeGustoApi<{ companyUuid: string; onboardingStatus: string; einGeneratedForDemo?: boolean; companyEin?: string }>({
    action: 'create_company',
    householdId,
    ...params,
  })
}

export async function acceptGustoTerms(householdId: string, userEmail?: string) {
  return invokeGustoApi<{ success: boolean }>({
    action: 'accept_terms',
    householdId,
    userEmail,
  })
}

export async function syncGustoOnboarding(householdId: string) {
  return invokeGustoApi<{
    onboardingStatus: GustoOnboardingStatus
    steps: Record<string, { completed?: boolean }>
  }>({ action: 'sync_onboarding', householdId })
}

export type GustoAddressInput = {
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
}

export type GustoSetupResponse = {
  onboardingSteps: Record<string, { completed?: boolean; title?: string }>
  locations: Array<{ uuid: string; street_1?: string; city?: string; state?: string; zip?: string }>
  bankAccounts: Array<{
    uuid: string
    verification_status?: string
    hidden_account_number?: string
    routing_number?: string
    account_type?: string
    name?: string
  }>
  federalTax: Record<string, unknown> | null
  industry: Record<string, unknown> | null
  paySchedules: unknown[]
  signatories: unknown[]
  forms: Array<{ uuid: string; name?: string; requires_signing?: boolean; signed?: boolean }>
  stateRequirements: Record<string, unknown>
  gustoEnv: string
}

export type GustoSetupMutationResult = {
  onboardingStatus: GustoOnboardingStatus
  steps: Record<string, { completed?: boolean; title?: string }>
}

export async function getGustoSetup(householdId: string) {
  return invokeGustoApi<GustoSetupResponse>({ action: 'get_setup', householdId })
}

export async function saveGustoLocation(householdId: string, address: GustoAddressInput & { phone?: string }) {
  return invokeGustoApi<GustoSetupMutationResult & { locationUuid: string }>({
    action: 'save_location',
    householdId,
    ...address,
  })
}

export async function saveGustoBankAccount(
  householdId: string,
  params: {
    routingNumber: string
    accountNumber: string
    accountType: 'Checking' | 'Savings'
    name?: string
  },
) {
  return invokeGustoApi<GustoSetupMutationResult & { bankAccountUuid: string }>({
    action: 'save_bank_account',
    householdId,
    ...params,
  })
}

export async function saveGustoFederalTax(
  householdId: string,
  params: {
    legalName: string
    ein: string
    taxPayerType: string
    filingForm: '941' | '944'
  },
) {
  return invokeGustoApi<GustoSetupMutationResult>({ action: 'save_federal_tax', householdId, ...params })
}

export async function saveGustoIndustry(householdId: string, params: { naicsCode: string; sicCodes?: string[] }) {
  return invokeGustoApi<GustoSetupMutationResult>({ action: 'save_industry', householdId, ...params })
}

export async function saveGustoPaySchedule(
  householdId: string,
  params: {
    frequency: string
    anchorPayDate: string
    anchorEndOfPayPeriod: string
    name?: string
  },
) {
  return invokeGustoApi<GustoSetupMutationResult & { payScheduleUuid: string }>({
    action: 'save_pay_schedule',
    householdId,
    ...params,
  })
}

export async function saveGustoSignatory(
  householdId: string,
  params: {
    firstName: string
    lastName: string
    title: string
    email: string
    phone?: string
    birthday?: string
    homeAddress: GustoAddressInput
  },
) {
  return invokeGustoApi<GustoSetupMutationResult & { signatoryUuid: string }>({
    action: 'save_signatory',
    householdId,
    ...params,
  })
}

export async function verifyGustoBankAccount(
  householdId: string,
  params: { bankAccountUuid?: string; deposit1?: number; deposit2?: number; sendTestDeposits?: boolean },
) {
  return invokeGustoApi<
    GustoSetupMutationResult & { bankAccountUuid: string; verificationStatus: string; verified?: boolean }
  >({ action: 'verify_bank_account', householdId, ...params })
}

export async function saveGustoStateTax(
  householdId: string,
  params: {
    state: string
    requirementSets: Array<{
      key: string
      state: string
      effective_from: string | null
      requirements: Array<{ key: string; value: string | boolean | number | null }>
    }>
  },
) {
  return invokeGustoApi<GustoSetupMutationResult>({ action: 'save_state_tax', householdId, ...params })
}

export async function signGustoForms(householdId: string) {
  return invokeGustoApi<GustoSetupMutationResult & { signedCount: number }>({
    action: 'sign_forms',
    householdId,
  })
}

export async function finishGustoOnboarding(householdId: string) {
  return invokeGustoApi<GustoSetupMutationResult>({ action: 'finish_onboarding', householdId })
}

export async function setupGustoEmployee(
  householdId: string,
  params: {
    householdNannyId: string
    locationUuid?: string
    dateOfBirth?: string
    ssn?: string
    homeAddress?: GustoAddressInput
    hireDate?: string
    jobTitle?: string
    hourlyRateCents?: number
    markOnboardingComplete?: boolean
  },
) {
  return invokeGustoApi<GustoSetupMutationResult & { employeeUuid: string }>({
    action: 'setup_gusto_employee',
    householdId,
    ...params,
  })
}

export async function inviteGustoEmployeeSelfOnboarding(
  householdId: string,
  params: {
    householdNannyId: string
    locationUuid?: string
    hireDate?: string
    jobTitle?: string
    hourlyRateCents?: number
  },
) {
  return invokeGustoApi<
    GustoSetupMutationResult & { employeeUuid: string; awaitingNannyLogin?: boolean }
  >({
    action: 'invite_gusto_employee',
    householdId,
    ...params,
  })
}

export async function submitGustoEmployeeSelfOnboarding(
  householdId: string,
  params: {
    householdNannyId: string
    dateOfBirth: string
    ssn: string
    homeAddress: GustoAddressInput
  },
) {
  return invokeGustoApi<GustoSetupMutationResult & { employeeUuid: string; alreadyComplete?: boolean }>({
    action: 'submit_gusto_employee_details',
    householdId,
    ...params,
  })
}

export async function finalizeGustoEmployeeOnboarding(
  householdId: string,
  params: { householdNannyId: string },
) {
  return invokeGustoApi<GustoSetupMutationResult & { employeeUuid: string }>({
    action: 'finalize_gusto_employee',
    householdId,
    ...params,
  })
}

export type GustoEmployeeOnboardingStatus =
  | 'pending'
  | 'created'
  | 'admin_in_progress'
  | 'awaiting_nanny'
  | 'awaiting_admin_review'
  | 'onboarding_completed'

export function gustoEmployeeOnboardingLabel(status: string | null | undefined): string {
  switch (status) {
    case 'awaiting_nanny':
      return 'Waiting for nanny'
    case 'awaiting_admin_review':
      return 'Ready for your review'
    case 'onboarding_completed':
      return 'Complete'
    case 'created':
    case 'admin_in_progress':
      return 'In progress'
    default:
      return 'Not started'
  }
}

/** @deprecated Prefer in-app setup via getGustoSetup and save* actions */
export async function createGustoFlow(
  householdId: string,
  params: { flowType: GustoFlowType; entityUuid?: string; entityType?: string },
) {
  return invokeGustoApi<{ url: string; flowType: string }>({
    action: 'create_flow',
    householdId,
    ...params,
  })
}

export async function demoApproveGustoCompany(householdId: string) {
  return invokeGustoApi<{ approved: boolean; approvedAt: string }>({
    action: 'demo_approve_company',
    householdId,
  })
}

export async function linkGustoEmployee(
  householdId: string,
  householdNannyId: string,
  workerType: 'employee' | 'contractor' = 'employee',
) {
  return invokeGustoApi<{ employeeUuid: string }>({
    action: 'link_employee',
    householdId,
    householdNannyId,
    workerType,
  })
}

export async function createGustoPayroll(householdId: string, payPeriodCloseId: string) {
  return invokeGustoApi<{ payrollRunId: string; gustoPayrollUuid: string; existing?: boolean }>({
    action: 'create_payroll',
    householdId,
    payPeriodCloseId,
  })
}

export async function previewGustoPayroll(householdId: string, payrollRunId: string) {
  return invokeGustoApi<{
    companyDebitCents: number | null
    netPayCents: number | null
    taxDebitCents: number | null
  }>({ action: 'preview_payroll', householdId, payrollRunId })
}

export async function submitGustoPayroll(householdId: string, payrollRunId: string) {
  return invokeGustoApi<{ submitted: boolean; status: string }>({
    action: 'submit_payroll',
    householdId,
    payrollRunId,
  })
}
