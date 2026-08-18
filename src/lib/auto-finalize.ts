import { addDays, format, startOfDay } from 'date-fns'
import type { PayPeriodType } from '@/types/database'
import { getPayPeriodBounds } from '@/lib/pay-period'

export const DEFAULT_AUTO_FINALIZE_GRACE_DAYS = 2
export const AUTO_FINALIZE_MAX_LOOKBACK_DAYS = 45

export function clampAutoFinalizeGraceDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AUTO_FINALIZE_GRACE_DAYS
  return Math.min(28, Math.max(0, Math.round(value)))
}

/** Last calendar day the household can still edit this period (inclusive). */
export function autoFinalizeDeadlineDate(periodEnd: Date, graceDays: number): Date {
  return startOfDay(addDays(periodEnd, clampAutoFinalizeGraceDays(graceDays)))
}

export function isPastAutoFinalizeDeadline(
  periodEnd: Date,
  graceDays: number,
  now: Date = new Date(),
): boolean {
  const deadline = format(autoFinalizeDeadlineDate(periodEnd, graceDays), 'yyyy-MM-dd')
  return format(now, 'yyyy-MM-dd') > deadline
}

export function autoFinalizeLookbackDays(payPeriod: PayPeriodType, graceDays: number): number {
  const periodDays = payPeriod === 'monthly' ? 31 : payPeriod === 'biweekly' ? 14 : 7
  return Math.min(
    AUTO_FINALIZE_MAX_LOOKBACK_DAYS,
    Math.max(clampAutoFinalizeGraceDays(graceDays) + periodDays + 7, periodDays + 7),
  )
}

/** Completed pay periods whose edit deadline has passed, newest first. */
export function dueAutoFinalizePeriods(
  payPeriod: PayPeriodType,
  graceDays: number,
  now: Date = new Date(),
): { start: Date; end: Date }[] {
  const lookbackDays = autoFinalizeLookbackDays(payPeriod, graceDays)
  const lookbackStart = startOfDay(addDays(now, -lookbackDays))
  const out: { start: Date; end: Date }[] = []
  let cursor = addDays(getPayPeriodBounds(payPeriod, now).start, -1)
  let guard = 0

  while (guard < 12) {
    const { start, end } = getPayPeriodBounds(payPeriod, cursor)
    if (end < lookbackStart) break
    if (isPastAutoFinalizeDeadline(end, graceDays, now)) {
      out.push({ start, end })
    }
    cursor = addDays(start, -1)
    guard++
  }

  return out
}
