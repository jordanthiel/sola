import { format } from 'date-fns'
import { fromDatetimeLocalValue } from '@/lib/calendar-slot'

export type PlanRepeatMode = 'none' | 'weekly'

export const PLAN_REPEAT_OPTIONS: { value: PlanRepeatMode; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'weekly', label: 'Weekly' },
]

export function weeklyRepeatLabel(planStartsAt: string): string {
  const start = fromDatetimeLocalValue(planStartsAt)
  return `Weekly on ${format(start, 'EEEE')}`
}

export function dayOfWeekFromDatetimeLocal(planStartsAt: string): number {
  return fromDatetimeLocalValue(planStartsAt).getDay()
}

export function timeFromDatetimeLocal(planStartsAt: string): string {
  return format(fromDatetimeLocalValue(planStartsAt), 'HH:mm')
}

export function dateFromDatetimeLocal(planStartsAt: string): string {
  return format(fromDatetimeLocalValue(planStartsAt), 'yyyy-MM-dd')
}

export function validateRepeatEndsOn(planStartsAt: string, repeatUntil: string) {
  if (!repeatUntil.trim()) return
  const startDate = dateFromDatetimeLocal(planStartsAt)
  if (repeatUntil < startDate) {
    throw new Error('Repeat until must be on or after the first occurrence')
  }
}
