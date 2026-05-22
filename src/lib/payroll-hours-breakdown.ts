import { format, parseISO } from 'date-fns'
import type { EmploymentSetting } from '@/types/database'
import { payableShiftMinutes, type PayableShift } from '@/lib/schedule-hours'

export interface ShiftHoursLine {
  id: string
  timeRange: string
  minutes: number
  isFromTemplate: boolean
}

export interface DailyHoursRow {
  date: string
  dayLabel: string
  minutes: number
  shifts: ShiftHoursLine[]
}

export function periodThresholdMinutes(settings: EmploymentSetting): number {
  const weeks =
    settings.pay_period === 'monthly' ? 4.33 : settings.pay_period === 'biweekly' ? 2 : 1
  return Math.round(Number(settings.standard_hours_per_week) * 60 * weeks)
}

function formatShiftTimeRange(shift: PayableShift): string {
  const end = shift.actual_ends_at ?? shift.ends_at
  const startLabel = format(parseISO(shift.starts_at), 'h:mm a')
  const endLabel = format(parseISO(end), 'h:mm a')
  return `${startLabel} – ${endLabel}`
}

export function buildDailyHoursBreakdown(shifts: PayableShift[]): DailyHoursRow[] {
  const byDate = new Map<string, PayableShift[]>()

  for (const shift of shifts) {
    const date = shift.starts_at.split('T')[0]
    const list = byDate.get(date) ?? []
    list.push(shift)
    byDate.set(date, list)
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayShifts]) => {
      const sorted = [...dayShifts].sort(
        (a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime(),
      )
      const shiftLines: ShiftHoursLine[] = sorted.map((s) => ({
        id: s.id,
        timeRange: formatShiftTimeRange(s),
        minutes: payableShiftMinutes(s),
        isFromTemplate: s.isFromTemplate,
      }))
      const minutes = shiftLines.reduce((sum, line) => sum + line.minutes, 0)
      return {
        date,
        dayLabel: format(parseISO(`${date}T12:00:00`), 'EEE, MMM d'),
        minutes,
        shifts: shiftLines,
      }
    })
}

export function payPeriodWeeksLabel(settings: EmploymentSetting): string {
  if (settings.pay_period === 'monthly') return '4.33 weeks (monthly)'
  if (settings.pay_period === 'biweekly') return '2 weeks (biweekly)'
  return '1 week (weekly)'
}
