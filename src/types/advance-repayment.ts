export type AdvanceRepaymentSource = 'payroll' | 'manual' | 'backfill'

export interface AdvanceRepayment {
  id: string
  payment_advance_id: string
  household_id: string
  amount_cents: number
  paid_on: string
  source: AdvanceRepaymentSource
  pay_period_start: string | null
  notes: string | null
  created_at: string
}

export function repaymentSourceLabel(source: AdvanceRepaymentSource): string {
  switch (source) {
    case 'payroll':
      return 'Payroll'
    case 'manual':
      return 'Outside payroll'
    case 'backfill':
      return 'Prior payments'
  }
}
