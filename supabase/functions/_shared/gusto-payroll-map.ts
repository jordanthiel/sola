/**
 * Maps Soola PayrollSnapshot → Gusto payroll item payloads.
 * @see docs/GUSTO_EMBEDDED.md
 */

export interface SoolaPayrollSnapshot {
  regularMinutes: number
  overtimeMinutes: number
  regularPayCents: number
  overtimePayCents: number
  grossPayCents: number
  lineItemsTotalCents?: number
  advanceDeductionCents: number
  netPayCents: number
  hourlyRateCents?: number
}

export interface GustoHourlyCompensation {
  name: string
  hours: string
  job_uuid?: string
}

export interface GustoFixedCompensation {
  name: string
  amount: string
}

export interface MappedGustoPayrollItems {
  hourly_compensations: GustoHourlyCompensation[]
  fixed_compensations: GustoFixedCompensation[]
  reimbursements: { name: string; amount: string }[]
  /** Post-tax deduction for advance repayments (cents as dollars string) */
  post_tax_deductions?: { name: string; amount: string }[]
  soolaSummary: {
    regularHours: number
    overtimeHours: number
    grossPayDollars: number
    advanceDeductionDollars: number
  }
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2)
}

function minutesToHours(minutes: number): string {
  return (minutes / 60).toFixed(2)
}

/**
 * Build Gusto compensation lines from a closed Soola snapshot.
 * Regular and OT are separate hourly lines when both exist.
 */
export function mapSnapshotToGustoCompensations(
  snapshot: SoolaPayrollSnapshot,
  hourlyRateCents: number,
  otMultiplier: number,
): MappedGustoPayrollItems {
  const regularHours = snapshot.regularMinutes / 60
  const overtimeHours = snapshot.overtimeMinutes / 60
  const hourlyRate = hourlyRateCents / 100
  const otRate = hourlyRate * otMultiplier

  const hourly_compensations: GustoHourlyCompensation[] = []

  if (regularHours > 0) {
    hourly_compensations.push({
      name: 'Regular',
      hours: minutesToHours(snapshot.regularMinutes),
    })
  }

  if (overtimeHours > 0) {
    hourly_compensations.push({
      name: 'Overtime',
      hours: minutesToHours(snapshot.overtimeMinutes),
    })
  }

  const fixed_compensations: GustoFixedCompensation[] = []
  const lineItems = snapshot.lineItemsTotalCents ?? 0
  if (lineItems > 0) {
    fixed_compensations.push({
      name: 'Bonuses and reimbursements',
      amount: centsToDollars(lineItems),
    })
  }

  const post_tax_deductions =
    snapshot.advanceDeductionCents > 0
      ? [
          {
            name: 'Advance repayment',
            amount: centsToDollars(snapshot.advanceDeductionCents),
          },
        ]
      : undefined

  return {
    hourly_compensations,
    fixed_compensations,
    reimbursements: [],
    post_tax_deductions,
    soolaSummary: {
      regularHours,
      overtimeHours,
      grossPayDollars: snapshot.grossPayCents / 100,
      advanceDeductionDollars: snapshot.advanceDeductionCents / 100,
    },
  }
}

export function payPeriodToGustoFrequency(
  payPeriod: 'weekly' | 'biweekly' | 'monthly',
): 'Every Week' | 'Every Other Week' | 'Twice per Month' | 'Monthly' {
  switch (payPeriod) {
    case 'weekly':
      return 'Every Week'
    case 'biweekly':
      return 'Every Other Week'
    case 'monthly':
      return 'Monthly'
    default:
      return 'Every Other Week'
  }
}
