import type { EmploymentSetting, PaymentAdvance } from '@/types/database'
export { getPayPeriodBounds } from '@/lib/pay-period'
import { calculateAdvanceDeductions, totalAdvanceBalance, type AdvanceDeductionLine } from '@/lib/advances'
import {
  getPayReportingFromSettings,
  splitPayByReporting,
  type PayReportingSplit,
} from '@/lib/pay-reporting'
import { type PayableShift, payableShiftMinutes } from '@/lib/schedule-hours'

export interface PayrollSummary {
  totalMinutes: number
  regularMinutes: number
  overtimeMinutes: number
  regularPayCents: number
  overtimePayCents: number
  grossPayCents: number
  advanceBalanceCents: number
  advanceDeductionCents: number
  advanceDeductions: AdvanceDeductionLine[]
  netPayCents: number
  reporting: PayReportingSplit
}

export function calculatePayroll(
  shifts: PayableShift[],
  settings: EmploymentSetting,
  _periodStart: Date,
  _periodEnd: Date,
  advances: PaymentAdvance[],
): PayrollSummary {
  const totalMinutes = shifts.reduce((sum, s) => sum + payableShiftMinutes(s), 0)

  const weeks =
    settings.pay_period === 'monthly'
      ? 4.33
      : settings.pay_period === 'biweekly'
        ? 2
        : 1

  const thresholdMinutes = Math.round(Number(settings.standard_hours_per_week) * 60 * weeks)
  const regularMinutes = Math.min(totalMinutes, thresholdMinutes)
  const overtimeMinutes = Math.max(0, totalMinutes - thresholdMinutes)

  const hourly = settings.hourly_rate_cents
  const otRate = hourly * Number(settings.overtime_multiplier)

  const regularPayCents = Math.round((regularMinutes / 60) * hourly)
  const overtimePayCents = Math.round((overtimeMinutes / 60) * otRate)
  const grossPayCents = regularPayCents + overtimePayCents

  const advanceBalanceCents = totalAdvanceBalance(advances)
  const { totalDeductionCents, lines } = calculateAdvanceDeductions(
    advances,
    overtimePayCents,
    grossPayCents,
  )
  const netPayCents = Math.max(0, grossPayCents - totalDeductionCents)
  const reporting = splitPayByReporting(regularPayCents, overtimePayCents, 0, getPayReportingFromSettings(settings))

  return {
    totalMinutes,
    regularMinutes,
    overtimeMinutes,
    regularPayCents,
    overtimePayCents,
    grossPayCents,
    advanceBalanceCents,
    advanceDeductionCents: totalDeductionCents,
    advanceDeductions: lines,
    netPayCents,
    reporting,
  }
}

export function exportShiftsCsv(
  shifts: PayableShift[],
  profiles: Record<string, string>,
): string {
  const header = 'Date,Start,Scheduled End,Actual End,Break (min),Worked (min),Nanny'
  const rows = shifts.map((s) => {
    const worked = payableShiftMinutes(s)
    const date = s.starts_at.split('T')[0]
    return [
      date,
      s.starts_at,
      s.ends_at,
      s.actual_ends_at ?? '',
      s.break_minutes,
      worked,
      profiles[s.household_nanny_id] ?? s.household_nanny_id,
    ]
      .map((v) => `"${v}"`)
      .join(',')
  })
  return [header, ...rows].join('\n')
}
