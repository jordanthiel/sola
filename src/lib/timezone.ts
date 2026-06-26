/** Common household timezones shown in setup; user's detected zone is always included. */
export const HOUSEHOLD_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
] as const

export function detectUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
  } catch {
    return 'America/New_York'
  }
}

export function resolveDefaultTimezone(): string {
  return detectUserTimezone()
}

export function buildTimezoneOptions(selected: string): string[] {
  const detected = detectUserTimezone()
  return [...new Set([detected, selected, ...HOUSEHOLD_TIMEZONES])]
}

export function formatTimezoneLabel(timezone: string): string {
  return timezone.replace(/_/g, ' ')
}
