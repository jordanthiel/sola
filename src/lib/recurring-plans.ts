import { addDays, format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { dateFromDatetimeLocal, validateRepeatEndsOn } from '@/lib/plan-repeat'

export type RecurringPlanScheduleFields = {
  repeat_starts_on: string
  repeat_ends_on: string | null
}

export function recurringPlanScheduleFromStartsAt(
  planStartsAt: string,
  repeatUntil: string,
): RecurringPlanScheduleFields {
  validateRepeatEndsOn(planStartsAt, repeatUntil)
  return {
    repeat_starts_on: dateFromDatetimeLocal(planStartsAt),
    repeat_ends_on: repeatUntil.trim() || null,
  }
}

/** Remove generated occurrences after the plan's repeat end date. */
export async function trimRecurringPlanAfterEnd(planId: string, repeatEndsOn: string | null) {
  if (!repeatEndsOn) return
  const afterEnd = format(addDays(parseISO(repeatEndsOn), 1), 'yyyy-MM-dd')
  const { error } = await supabase
    .from('child_activities')
    .delete()
    .eq('recurring_plan_id', planId)
    .gte('occurred_at', `${afterEnd}T00:00:00`)
  if (error) throw error
}
