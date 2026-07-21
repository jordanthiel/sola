import { supabase } from '@/lib/supabase'

export async function invokeNannyKeeperApi<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('nannykeeper-api', { body })
  if (error) throw error
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error)
  }
  return data as T
}

export type NkEmployerStatus = {
  id: string
  employer_id: string
  state: string
  admin_email: string
  first_name: string
  last_name: string
  created_at: string
}

export type NkEmployeeStatus = {
  id: string
  household_nanny_id: string
  employee_id: string
  email: string | null
  portal_url: string | null
  onboarding_status: string
  created_at: string
}

export type NkStatus = {
  configured: boolean
  employer: NkEmployerStatus | null
  employees: NkEmployeeStatus[]
}

export function getNkStatus(householdId: string) {
  return invokeNannyKeeperApi<NkStatus>({ action: 'get_status', householdId })
}

export function createNkEmployer(
  householdId: string,
  input: { firstName: string; lastName: string; email: string; state: string },
) {
  return invokeNannyKeeperApi<{ employer: NkEmployerStatus; alreadyExists?: boolean }>({
    action: 'create_employer',
    householdId,
    ...input,
  })
}

export function createNkEmployee(
  householdId: string,
  input: {
    householdNannyId: string
    email: string
    firstName?: string
    lastName?: string
    startDate?: string
  },
) {
  return invokeNannyKeeperApi<{ employee: NkEmployeeStatus; alreadyExists?: boolean }>({
    action: 'create_employee',
    householdId,
    ...input,
  })
}

export function previewNkPayroll(
  householdId: string,
  input: { payPeriodCloseId: string; householdNannyId: string; payDate?: string },
) {
  return invokeNannyKeeperApi<{
    payrollRun: {
      id: string
      status: string
      net_pay_cents: number | null
      tax_debit_cents: number | null
      company_debit_cents: number | null
      external_payroll_id: string | null
    }
    netPayCents: number | null
    taxDebitCents: number | null
    companyDebitCents: number | null
  }>({
    action: 'preview_payroll',
    householdId,
    ...input,
  })
}

export function runNkPayroll(
  householdId: string,
  input: { payrollRunId: string; paymentMethod?: 'check' | 'cash' | 'direct_deposit' },
) {
  return invokeNannyKeeperApi<{
    payrollRun: { id: string; status: string; external_payroll_id: string | null }
    externalPayrollId: string | null
  }>({
    action: 'run_payroll',
    householdId,
    ...input,
  })
}

export function initiateNkAch(householdId: string, payrollRunId: string) {
  return invokeNannyKeeperApi<{ result: unknown }>({
    action: 'initiate_ach',
    householdId,
    payrollRunId,
  })
}

export function generateNkDocument(
  householdId: string,
  input: {
    docType: 'w2' | 'schedule-h' | 'paystub'
    employeeId?: string
    taxYear?: number
    payrollId?: string
  },
) {
  return invokeNannyKeeperApi<{ document: unknown }>({
    action: 'generate_document',
    householdId,
    ...input,
  })
}
