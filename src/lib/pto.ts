import { eachDayOfInterval, format, isWeekend, parseISO, startOfDay } from 'date-fns'
import { federalHolidaysInRange } from '@/lib/federal-holidays'
import { enabledFederalHolidayKeys } from '@/lib/holiday-settings'
import type { HouseholdHoliday, PtoBalance } from '@/types/database'

export const DEFAULT_PTO_HOURS_PER_DAY = 8

export type HolidayOverride = Pick<HouseholdHoliday, 'holiday_key' | 'enabled'>

export function ptoRemaining(balance: PtoBalance, kind: 'sick' | 'pto'): number {
  const accrued = kind === 'sick' ? balance.sick_hours_accrued : balance.pto_hours_accrued
  const used = kind === 'sick' ? balance.sick_hours_used : balance.pto_hours_used
  return accrued - used
}

export function formatPtoHours(hours: number): string {
  return `${hours.toFixed(1)}h`
}

function parseDateOnly(value: string): Date | null {
  if (!value) return null
  const parsed = startOfDay(parseISO(`${value}T12:00:00`))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function paidHolidayDates(startsOn: string, endsOn: string, holidayOverrides: HolidayOverride[]): Set<string> {
  const start = parseDateOnly(startsOn)
  const end = parseDateOnly(endsOn)
  if (!start || !end) return new Set()
  const enabledKeys = new Set(enabledFederalHolidayKeys(holidayOverrides))
  return new Set(
    federalHolidaysInRange(start, end)
      .filter((occ) => enabledKeys.has(occ.key))
      .map((occ) => format(occ.date, 'yyyy-MM-dd')),
  )
}

/** Weekdays between YYYY-MM-DD start and end, excluding paid holidays. */
export function workingDaysInRange(
  startsOn: string,
  endsOn: string,
  holidayOverrides: HolidayOverride[] = [],
): number {
  const start = parseDateOnly(startsOn)
  const end = parseDateOnly(endsOn)
  if (!start || !end || end < start) return 0
  const holidays = paidHolidayDates(startsOn, endsOn, holidayOverrides)
  return eachDayOfInterval({ start, end }).filter((day) => {
    if (isWeekend(day)) return false
    return !holidays.has(format(day, 'yyyy-MM-dd'))
  }).length
}

export function parseHoursPerDay(value: string): number | null {
  const parsed = parseFloat(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

export function calculatedTimeOffHours(
  startsOn: string,
  endsOn: string,
  hoursPerDay: number,
  holidayOverrides: HolidayOverride[] = [],
): number {
  if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0) return 0
  return workingDaysInRange(startsOn, endsOn, holidayOverrides) * hoursPerDay
}

export function hoursPerDayFromTotal(
  totalHours: number | null | undefined,
  startsOn: string,
  endsOn: string,
  holidayOverrides: HolidayOverride[] = [],
): string {
  const days = workingDaysInRange(startsOn, endsOn, holidayOverrides)
  if (totalHours == null || !Number.isFinite(totalHours) || days <= 0) {
    return String(DEFAULT_PTO_HOURS_PER_DAY)
  }
  return String(Number((totalHours / days).toFixed(2)))
}
