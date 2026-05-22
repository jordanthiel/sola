import { format, parseISO } from 'date-fns'
import type { AdvanceRepaymentMode, PayPeriodType, PaymentAdvance } from '@/types/database'
import type { AdvanceRepayment } from '@/types/advance-repayment'
import { getPayPeriodBounds } from '@/lib/pay-period'
import type { HoursBasis, PayPeriodClose } from '@/types/features'

export interface AdvanceDeductionLine {
  advanceId: string
  deductedCents: number
  repaymentMode: AdvanceRepaymentMode
}

export function totalAdvanceBalance(advances: PaymentAdvance[]): number {
  return advances
    .filter((a) => a.status === 'open')
    .reduce((sum, a) => sum + a.balance_cents, 0)
}

export function calculateAdvanceDeductions(
  advances: PaymentAdvance[],
  overtimePayCents: number,
  grossPayCents: number,
): { totalDeductionCents: number; lines: AdvanceDeductionLine[] } {
  const open = advances
    .filter((a) => a.status === 'open' && a.balance_cents > 0)
    .sort((a, b) => a.issued_on.localeCompare(b.issued_on))

  let otPool = overtimePayCents
  let paycheckPool = grossPayCents
  const lines: AdvanceDeductionLine[] = []

  for (const advance of open.filter((a) => a.repayment_mode === 'overtime_only')) {
    const deducted = Math.min(advance.balance_cents, otPool)
    if (deducted <= 0) continue
    otPool -= deducted
    paycheckPool = Math.max(0, paycheckPool - deducted)
    lines.push({
      advanceId: advance.id,
      deductedCents: deducted,
      repaymentMode: 'overtime_only',
    })
  }

  for (const advance of open.filter((a) => a.repayment_mode === 'per_paycheck')) {
    const installment = advance.repayment_per_paycheck_cents ?? advance.balance_cents
    const deducted = Math.min(advance.balance_cents, installment, paycheckPool)
    if (deducted <= 0) continue
    paycheckPool -= deducted
    lines.push({
      advanceId: advance.id,
      deductedCents: deducted,
      repaymentMode: 'per_paycheck',
    })
  }

  const totalDeductionCents = lines.reduce((s, l) => s + l.deductedCents, 0)
  return { totalDeductionCents, lines }
}

export function repaymentModeLabel(mode: AdvanceRepaymentMode): string {
  return mode === 'overtime_only' ? 'Overtime only' : 'Each paycheck'
}

/** Repayments tied to this pay period (payroll rows or paid_on within the period). */
export function repaymentsForPayPeriod(
  repayments: AdvanceRepayment[],
  periodStart: string,
  periodEnd: string,
): AdvanceRepayment[] {
  return repayments.filter(
    (r) =>
      r.pay_period_start === periodStart ||
      (r.paid_on >= periodStart && r.paid_on <= periodEnd),
  )
}

export function totalRepaymentCents(repayments: AdvanceRepayment[]): number {
  return repayments.reduce((sum, r) => sum + r.amount_cents, 0)
}

export function payrollRepaymentsFullyRecorded(
  repayments: AdvanceRepayment[],
  periodStart: string,
  lines: AdvanceDeductionLine[],
): boolean {
  if (!lines.length) return true
  const payrollRows = repayments.filter(
    (r) => r.source === 'payroll' && r.pay_period_start === periodStart,
  )
  return lines.every((line) => {
    const paid = payrollRows
      .filter((r) => r.payment_advance_id === line.advanceId)
      .reduce((sum, r) => sum + r.amount_cents, 0)
    return paid >= line.deductedCents
  })
}

export interface PayPeriodAppliedRepayment {
  periodStart: string
  periodEnd: string
  appliedCents: number
}

/** Canonical pay-period start for a repayment row. */
export function periodStartForRepayment(
  repayment: AdvanceRepayment,
  payPeriod: PayPeriodType,
): string {
  if (repayment.pay_period_start) return repayment.pay_period_start
  const { start } = getPayPeriodBounds(payPeriod, parseISO(repayment.paid_on))
  return format(start, 'yyyy-MM-dd')
}

/** Total recorded repayments grouped by pay period (newest first). */
export function summarizeAppliedRepaymentsByPayPeriod(
  repayments: AdvanceRepayment[],
  payPeriod: PayPeriodType,
): PayPeriodAppliedRepayment[] {
  const totals = new Map<string, number>()
  for (const r of repayments) {
    const key = periodStartForRepayment(r, payPeriod)
    totals.set(key, (totals.get(key) ?? 0) + r.amount_cents)
  }
  return [...totals.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([periodStart, appliedCents]) => {
      const { start, end } = getPayPeriodBounds(payPeriod, parseISO(periodStart))
      return {
        periodStart: format(start, 'yyyy-MM-dd'),
        periodEnd: format(end, 'yyyy-MM-dd'),
        appliedCents,
      }
    })
}

export interface PayPeriodHistoryRow {
  periodStart: string
  periodEnd: string
  hoursBasis?: HoursBasis
  netPayCents?: number
  appliedCents: number
  isClosed: boolean
}

/** Merge closed periods with repayment totals for payroll history. */
export function buildPayPeriodHistoryRows(
  closes: PayPeriodClose[] | undefined,
  repaymentSummaries: PayPeriodAppliedRepayment[],
): PayPeriodHistoryRow[] {
  const map = new Map<string, PayPeriodHistoryRow>()

  for (const c of closes ?? []) {
    const snap = c.snapshot as { netPayCents?: number }
    map.set(c.period_start, {
      periodStart: c.period_start,
      periodEnd: c.period_end,
      hoursBasis: c.hours_basis,
      netPayCents: snap?.netPayCents ?? 0,
      appliedCents: 0,
      isClosed: true,
    })
  }

  for (const s of repaymentSummaries) {
    const existing = map.get(s.periodStart)
    if (existing) {
      existing.appliedCents = s.appliedCents
    } else {
      map.set(s.periodStart, {
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        appliedCents: s.appliedCents,
        isClosed: false,
      })
    }
  }

  return [...map.values()].sort((a, b) => b.periodStart.localeCompare(a.periodStart))
}
