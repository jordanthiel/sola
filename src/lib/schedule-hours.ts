import { addDays, differenceInMinutes, format, isWithinInterval, parseISO, startOfDay } from 'date-fns'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import type { EmploymentSetting, ScheduleBlock } from '@/types/database'
import { expandTemplateOccurrences } from '@/lib/schedule'

export function effectiveEndIso(block: ScheduleBlock): string {
  return block.actual_ends_at ?? block.ends_at
}

export function blockWorkedMinutes(block: ScheduleBlock): number {
  if (block.status !== 'scheduled') return 0
  const total = differenceInMinutes(parseISO(effectiveEndIso(block)), parseISO(block.starts_at))
  return Math.max(0, total - (block.break_minutes ?? 0))
}

export function blockHasLateReport(block: ScheduleBlock): boolean {
  return !!block.actual_ends_at && block.actual_ends_at !== block.ends_at
}

export interface PayableShift {
  id: string
  household_nanny_id: string
  starts_at: string
  ends_at: string
  actual_ends_at: string | null
  break_minutes: number
  isFromTemplate: boolean
  schedule_block_id?: string | null
  is_overnight?: boolean
  overnight_rate_cents?: number | null
  overnight_start_time?: string | null
  overnight_end_time?: string | null
  holiday_worked?: boolean
}

export function isShiftOnOrAfterPayStart(
  shiftStartsAt: string,
  payStartDate?: string | null,
): boolean {
  if (!payStartDate) return true
  return format(parseISO(shiftStartsAt), 'yyyy-MM-dd') >= payStartDate
}

export function filterPayableShiftsByStartDate(
  shifts: PayableShift[],
  payStartDate?: string | null,
): PayableShift[] {
  if (!payStartDate) return shifts
  return shifts.filter((s) => isShiftOnOrAfterPayStart(s.starts_at, payStartDate))
}

export function payableShiftsInPeriod(
  blocks: ScheduleBlock[],
  templates: NannyScheduleTemplate[],
  householdNannyId: string,
  periodStart: Date,
  periodEnd: Date,
  payStartDate?: string | null,
): PayableShift[] {
  const scheduled = blocks.filter(
    (b) =>
      b.status === 'scheduled' &&
      b.household_nanny_id === householdNannyId &&
      isWithinInterval(parseISO(b.starts_at), {
        start: startOfDay(periodStart),
        end: addDays(startOfDay(periodEnd), 1),
      }),
  )

  const coveredDates = new Set(
    scheduled.map((b) => format(parseISO(b.starts_at), 'yyyy-MM-dd')),
  )

  const fromTemplate = expandTemplateOccurrences(
    templates,
    householdNannyId,
    periodStart,
    periodEnd,
  )
    .filter((occ) => {
      const d = format(occ.starts_at, 'yyyy-MM-dd')
      return !coveredDates.has(d)
    })
    .map((occ) => ({
      id: occ.id,
      household_nanny_id: occ.household_nanny_id,
      starts_at: occ.starts_at.toISOString(),
      ends_at: occ.ends_at.toISOString(),
      actual_ends_at: null,
      break_minutes: 0,
      isFromTemplate: true,
      schedule_block_id: null,
      is_overnight: false,
      overnight_rate_cents: null,
      overnight_start_time: null,
      overnight_end_time: null,
      holiday_worked: false,
    }))

  const fromBlocks: PayableShift[] = scheduled.map((b) => ({
    id: b.id,
    household_nanny_id: b.household_nanny_id!,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    actual_ends_at: b.actual_ends_at,
    break_minutes: b.break_minutes ?? 0,
    isFromTemplate: false,
    schedule_block_id: b.id,
    is_overnight: b.is_overnight,
    overnight_rate_cents: b.overnight_rate_cents,
    overnight_start_time: b.overnight_start_time,
    overnight_end_time: b.overnight_end_time,
    holiday_worked: b.holiday_worked,
  }))

  return filterPayableShiftsByStartDate([...fromBlocks, ...fromTemplate], payStartDate)
}

export function payableShiftMinutes(shift: PayableShift): number {
  const end = shift.actual_ends_at ?? shift.ends_at
  const total = differenceInMinutes(parseISO(end), parseISO(shift.starts_at))
  return Math.max(0, total - shift.break_minutes)
}

function timeParts(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number)
  return { hours: hours || 0, minutes: minutes || 0 }
}

function dateAtLocalTime(day: Date, time: string): Date {
  const { hours, minutes } = timeParts(time)
  const d = new Date(day)
  d.setHours(hours, minutes, 0, 0)
  return d
}

function overlapsInMinutes(start: Date, end: Date, windowStart: Date, windowEnd: Date): number {
  const overlapStart = Math.max(start.getTime(), windowStart.getTime())
  const overlapEnd = Math.min(end.getTime(), windowEnd.getTime())
  return Math.max(0, Math.round((overlapEnd - overlapStart) / 60000))
}

function timeValue(time: string): number {
  const { hours, minutes } = timeParts(time)
  return hours * 60 + minutes
}

function effectiveOvernightRateCents(
  shift: PayableShift,
  settings: EmploymentSetting,
): number | null {
  return shift.overnight_rate_cents ?? settings.overnight_rate_cents ?? null
}

export function payableShiftOvernightMinutes(
  shift: PayableShift,
  settings: EmploymentSetting,
): number {
  const overnightRate = effectiveOvernightRateCents(shift, settings)
  if (!overnightRate) return 0

  const start = parseISO(shift.starts_at)
  const end = parseISO(shift.actual_ends_at ?? shift.ends_at)
  if (end <= start) return 0

  const windowStartTime =
    shift.overnight_start_time ?? settings.overnight_start_time ?? '22:00'
  const windowEndTime =
    shift.overnight_end_time ?? settings.overnight_end_time ?? '06:00'
  const crossesMidnight = timeValue(windowEndTime) <= timeValue(windowStartTime)

  let rawOvernightMinutes = 0
  let cursor = addDays(startOfDay(start), -1)
  const lastDay = addDays(startOfDay(end), 1)

  while (cursor <= lastDay) {
    const windowStart = dateAtLocalTime(cursor, windowStartTime)
    let windowEnd = dateAtLocalTime(cursor, windowEndTime)
    if (crossesMidnight) {
      windowEnd = addDays(windowEnd, 1)
    }
    rawOvernightMinutes += overlapsInMinutes(start, end, windowStart, windowEnd)
    cursor = addDays(cursor, 1)
  }

  if (rawOvernightMinutes <= 0) return 0

  const rawShiftMinutes = differenceInMinutes(end, start)
  const payableMinutes = payableShiftMinutes(shift)
  if (rawShiftMinutes <= 0 || payableMinutes <= 0) return 0

  return Math.min(payableMinutes, Math.round((rawOvernightMinutes / rawShiftMinutes) * payableMinutes))
}

export function payableShiftOvernightPremiumCents(
  shift: PayableShift,
  settings: EmploymentSetting,
): number {
  const overnightRate = effectiveOvernightRateCents(shift, settings)
  if (!overnightRate) return 0
  const premiumRate = Math.max(0, overnightRate - settings.hourly_rate_cents)
  if (premiumRate <= 0) return 0
  return Math.round((payableShiftOvernightMinutes(shift, settings) / 60) * premiumRate)
}
