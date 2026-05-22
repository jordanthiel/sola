import {
  FEDERAL_HOLIDAY_KEYS,
  type FederalHolidayKey,
} from '@/lib/federal-holidays'
import type { HouseholdHoliday } from '@/types/database'

/** Federal holidays are on by default; rows override that default. */
export function resolveHolidayEnabled(
  key: FederalHolidayKey,
  overrides: Pick<HouseholdHoliday, 'holiday_key' | 'enabled'>[],
): boolean {
  const row = overrides.find((o) => o.holiday_key === key)
  if (row) return row.enabled
  return FEDERAL_HOLIDAY_KEYS.includes(key)
}

export function enabledFederalHolidayKeys(
  overrides: Pick<HouseholdHoliday, 'holiday_key' | 'enabled'>[],
): FederalHolidayKey[] {
  return FEDERAL_HOLIDAY_KEYS.filter((key) => resolveHolidayEnabled(key, overrides))
}
