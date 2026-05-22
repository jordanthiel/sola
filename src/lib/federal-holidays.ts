import { addDays, endOfDay, getDay, startOfDay, subDays } from 'date-fns'

/** Stable keys stored in household_holidays.holiday_key */
export type FederalHolidayKey =
  | 'new_years_day'
  | 'mlk_day'
  | 'presidents_day'
  | 'memorial_day'
  | 'juneteenth'
  | 'independence_day'
  | 'labor_day'
  | 'columbus_day'
  | 'veterans_day'
  | 'thanksgiving'
  | 'christmas'

export interface FederalHolidayDefinition {
  key: FederalHolidayKey
  name: string
  /** Short hint for settings UI */
  rule: string
}

export const FEDERAL_HOLIDAY_DEFINITIONS: FederalHolidayDefinition[] = [
  { key: 'new_years_day', name: "New Year's Day", rule: 'January 1 (observed)' },
  { key: 'mlk_day', name: 'Martin Luther King Jr. Day', rule: 'Third Monday in January' },
  { key: 'presidents_day', name: "Washington's Birthday", rule: 'Third Monday in February' },
  { key: 'memorial_day', name: 'Memorial Day', rule: 'Last Monday in May' },
  { key: 'juneteenth', name: 'Juneteenth', rule: 'June 19 (observed)' },
  { key: 'independence_day', name: 'Independence Day', rule: 'July 4 (observed)' },
  { key: 'labor_day', name: 'Labor Day', rule: 'First Monday in September' },
  { key: 'columbus_day', name: 'Columbus Day', rule: 'Second Monday in October' },
  { key: 'veterans_day', name: 'Veterans Day', rule: 'November 11 (observed)' },
  { key: 'thanksgiving', name: 'Thanksgiving Day', rule: 'Fourth Thursday in November' },
  { key: 'christmas', name: 'Christmas Day', rule: 'December 25 (observed)' },
]

export const FEDERAL_HOLIDAY_KEYS = FEDERAL_HOLIDAY_DEFINITIONS.map((h) => h.key)

export function federalHolidayName(key: FederalHolidayKey): string {
  return FEDERAL_HOLIDAY_DEFINITIONS.find((h) => h.key === key)?.name ?? key
}

/** Saturday → Friday; Sunday → Monday (U.S. federal observance). */
export function observeFederalFixedHoliday(date: Date): Date {
  const day = getDay(date)
  if (day === 6) return subDays(date, 1)
  if (day === 0) return addDays(date, 1)
  return date
}

function calendarDate(year: number, monthIndex: number, day: number): Date {
  return startOfDay(new Date(year, monthIndex, day))
}

function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, n: number): Date {
  let cursor = calendarDate(year, monthIndex, 1)
  while (getDay(cursor) !== weekday) {
    cursor = addDays(cursor, 1)
  }
  return addDays(cursor, (n - 1) * 7)
}

function lastWeekdayOfMonth(year: number, monthIndex: number, weekday: number): Date {
  let cursor = calendarDate(year, monthIndex + 1, 0)
  while (getDay(cursor) !== weekday) {
    cursor = subDays(cursor, 1)
  }
  return cursor
}

function fixedHoliday(year: number, monthIndex: number, day: number): Date {
  return observeFederalFixedHoliday(calendarDate(year, monthIndex, day))
}

export interface FederalHolidayOccurrence {
  key: FederalHolidayKey
  name: string
  date: Date
}

export function federalHolidaysInYear(year: number): FederalHolidayOccurrence[] {
  return FEDERAL_HOLIDAY_DEFINITIONS.map((def) => ({
    key: def.key,
    name: def.name,
    date: federalHolidayDate(def.key, year),
  }))
}

function federalHolidayDate(key: FederalHolidayKey, year: number): Date {
  switch (key) {
    case 'new_years_day':
      return fixedHoliday(year, 0, 1)
    case 'mlk_day':
      return nthWeekdayOfMonth(year, 0, 1, 3)
    case 'presidents_day':
      return nthWeekdayOfMonth(year, 1, 1, 3)
    case 'memorial_day':
      return lastWeekdayOfMonth(year, 4, 1)
    case 'juneteenth':
      return fixedHoliday(year, 5, 19)
    case 'independence_day':
      return fixedHoliday(year, 6, 4)
    case 'labor_day':
      return nthWeekdayOfMonth(year, 8, 1, 1)
    case 'columbus_day':
      return nthWeekdayOfMonth(year, 9, 1, 2)
    case 'veterans_day':
      return fixedHoliday(year, 10, 11)
    case 'thanksgiving':
      return nthWeekdayOfMonth(year, 10, 4, 4)
    case 'christmas':
      return fixedHoliday(year, 11, 25)
    default:
      return fixedHoliday(year, 0, 1)
  }
}

export function federalHolidaysInRange(from: Date, to: Date): FederalHolidayOccurrence[] {
  const startYear = from.getFullYear() - 1
  const endYear = to.getFullYear() + 1
  const out: FederalHolidayOccurrence[] = []
  for (let year = startYear; year <= endYear; year++) {
    for (const occ of federalHolidaysInYear(year)) {
      if (occ.date >= startOfDay(from) && occ.date <= endOfDay(to)) {
        out.push(occ)
      }
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime())
}
