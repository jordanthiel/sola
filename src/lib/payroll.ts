import { addDays, addWeeks, endOfMonth, startOfMonth, startOfWeek } from 'date-fns'
import type { EmploymentSetting, PayPeriodType } from '@/types/database'
import { type PayableShift, payableShiftMinutes } from '@/lib/schedule-hours'

export function getPayPeriodBounds(
  payPeriod: PayPeriodType,
  anchor: Date,
): { start: Date; end: Date } {
  if (payPeriod === 'weekly') {
    const start = startOfWeek(anchor, { weekStartsOn: 1 })
    return { start, end: addDays(start, 6) }
  }
  if (payPeriod === 'biweekly') {
    const start = startOfWeek(anchor, { weekStartsOn: 1 })
    const weekNum = Math.floor(start.getTime() / (7 * 24 * 60 * 60 * 1000))
    const biStart = weekNum % 2 === 0 ? start : addWeeks(start, -1)
    return { start: biStart, end: addDays(biStart, 13) }
  }
  const start = startOfMonth(anchor)
  return { start, end: endOfMonth(anchor) }
}

export interface PayrollSummary {
  totalMinutes: number
  regularMinutes: number
  overtimeMinutes: number
  regularPayCents: number
  overtimePayCents: number
  grossPayCents: number
  openAdvancesCents: number
  netPayCents: number
}

export function calculatePayroll(
  shifts: PayableShift[],
  settings: EmploymentSetting,
  _periodStart: Date,
  _periodEnd: Date,
  openAdvancesCents: number,
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
  const netPayCents = Math.max(0, grossPayCents - openAdvancesCents)

  return {
    totalMinutes,
    regularMinutes,
    overtimeMinutes,
    regularPayCents,
    overtimePayCents,
    grossPayCents,
    openAdvancesCents,
    netPayCents,
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
