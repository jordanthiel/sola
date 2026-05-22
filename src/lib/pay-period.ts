import { addDays, addWeeks, endOfDay, endOfMonth, startOfMonth, startOfWeek } from 'date-fns'
import type { PayPeriodType } from '@/types/database'

export function getPayPeriodBounds(
  payPeriod: PayPeriodType,
  anchor: Date,
): { start: Date; end: Date } {
  if (payPeriod === 'weekly') {
    const start = startOfWeek(anchor, { weekStartsOn: 1 })
    return { start, end: endOfDay(addDays(start, 6)) }
  }
  if (payPeriod === 'biweekly') {
    const start = startOfWeek(anchor, { weekStartsOn: 1 })
    const weekNum = Math.floor(start.getTime() / (7 * 24 * 60 * 60 * 1000))
    const biStart = weekNum % 2 === 0 ? start : addWeeks(start, -1)
    return { start: biStart, end: endOfDay(addDays(biStart, 13)) }
  }
  const start = startOfMonth(anchor)
  return { start, end: endOfMonth(anchor) }
}
