import { supabase } from '@/lib/supabase'
import type { PlanAttendeeFields } from '@/lib/plan-attendee'
import type { ActivityType, MoodType } from '@/types/database'

export async function insertChildPlan(
  params: {
    householdId: string
    childIds: string[]
    loggedBy: string
    activityType: ActivityType
    title: string
    description: string | null
    occurredAt: string
    durationMinutes: number
    mood?: MoodType | null
  } & PlanAttendeeFields,
) {
  const planGroupId = params.childIds.length > 1 ? crypto.randomUUID() : null
  const rows = params.childIds.map((childId) => ({
    household_id: params.householdId,
    child_id: childId,
    logged_by: params.loggedBy,
    activity_type: params.activityType,
    title: params.title,
    description: params.description,
    occurred_at: params.occurredAt,
    duration_minutes: params.durationMinutes,
    mood: params.mood ?? null,
    plan_group_id: planGroupId,
    attendee_user_id: params.attendee_user_id,
    attendee_household_nanny_id: params.attendee_household_nanny_id,
  }))

  const { data, error } = await supabase.from('child_activities').insert(rows).select('id, child_id')
  if (error) throw error

  if (data?.length) {
    const junction = data.map((a) => ({ activity_id: a.id, child_id: a.child_id }))
    await supabase.from('child_activity_children').upsert(junction)
  }

  return data
}
