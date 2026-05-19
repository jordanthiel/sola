import {
  addDays,
  addWeeks,
  differenceInMinutes,
  endOfMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { EmploymentSetting, PayPeriodType, TimeEntry } from '@/types/database'

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

export function entryWorkedMinutes(entry: TimeEntry): number {
  if (!entry.clock_out) return 0
  const total = differenceInMinutes(parseISO(entry.clock_out), parseISO(entry.clock_in))
  return Math.max(0, total - entry.break_minutes)
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
  entries: TimeEntry[],
  settings: EmploymentSetting,
  periodStart: Date,
  periodEnd: Date,
  openAdvancesCents: number,
): PayrollSummary {
  const inPeriod = entries.filter((e) => {
    const clockIn = parseISO(e.clock_in)
    return clockIn >= periodStart && clockIn <= addDays(periodEnd, 1)
  })

  const totalMinutes = inPeriod.reduce((sum, e) => sum + entryWorkedMinutes(e), 0)

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

export function exportTimeEntriesCsv(
  entries: TimeEntry[],
  profiles: Record<string, string>,
): string {
  const header = 'Date,Clock In,Clock Out,Break (min),Worked (min),Nanny,Source,Notes'
  const rows = entries.map((e) => {
    const worked = entryWorkedMinutes(e)
    const date = e.clock_in.split('T')[0]
    return [
      date,
      e.clock_in,
      e.clock_out ?? '',
      e.break_minutes,
      worked,
      (e.household_nanny_id && profiles[e.household_nanny_id]) ??
        e.nanny_user_id ??
        e.household_nanny_id ??
        '',
      e.source,
      (e.notes ?? '').replace(/"/g, '""'),
    ]
      .map((v) => `"${v}"`)
      .join(',')
  })
  return [header, ...rows].join('\n')
}
