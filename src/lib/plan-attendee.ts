import { parseISO } from 'date-fns'
import { householdMemberDisplayName } from '@/lib/member-display'
import { nannyDisplayName } from '@/lib/nanny'
import { effectiveEndIso } from '@/lib/schedule-hours'
import { isTemplateOccurrence, type TemplateOccurrence } from '@/lib/schedule'
import type { HouseholdNanny } from '@/types/household-nanny'
import type { HouseholdMember, Profile, ScheduleBlock } from '@/types/database'

export type ScheduleCoverageItem = ScheduleBlock | TemplateOccurrence

/** Encoded value for plan attendee select: `user:<uuid>` or `nanny:<uuid>`. */
export type PlanAttendeeValue = '' | `user:${string}` | `nanny:${string}`

export type PlanAttendeeFields = {
  attendee_user_id: string | null
  attendee_household_nanny_id: string | null
}

export function planAttendeeFromFields(
  activity: Pick<PlanAttendeeFields, 'attendee_user_id' | 'attendee_household_nanny_id'>,
): PlanAttendeeValue {
  if (activity.attendee_household_nanny_id) return `nanny:${activity.attendee_household_nanny_id}`
  if (activity.attendee_user_id) return `user:${activity.attendee_user_id}`
  return ''
}

export function planAttendeeToFields(value: PlanAttendeeValue): PlanAttendeeFields {
  if (value.startsWith('user:')) {
    return { attendee_user_id: value.slice(5), attendee_household_nanny_id: null }
  }
  if (value.startsWith('nanny:')) {
    return { attendee_user_id: null, attendee_household_nanny_id: value.slice(6) }
  }
  return { attendee_user_id: null, attendee_household_nanny_id: null }
}

export function defaultPlanAttendee(options: {
  userId?: string
  isNanny: boolean
  myNannyId?: string
}): PlanAttendeeValue {
  if (options.isNanny && options.myNannyId) return `nanny:${options.myNannyId}`
  if (options.userId) return `user:${options.userId}`
  return ''
}

function scheduleItemInterval(item: ScheduleCoverageItem): {
  start: Date
  end: Date
  nannyId: string
} | null {
  if ('status' in item && item.status !== 'scheduled') return null
  const nannyId = item.household_nanny_id
  if (!nannyId) return null

  if (isTemplateOccurrence(item)) {
    return { start: item.starts_at, end: item.ends_at, nannyId }
  }

  return {
    start: parseISO(item.starts_at),
    end: parseISO(effectiveEndIso(item)),
    nannyId,
  }
}

/** Nanny scheduled to work at the given instant (shift or usual-day template). */
export function nannyOnDutyAt(
  scheduleItems: ScheduleCoverageItem[],
  at: Date,
): string | null {
  for (const item of scheduleItems) {
    const interval = scheduleItemInterval(item)
    if (!interval) continue
    if (at >= interval.start && at < interval.end) {
      return interval.nannyId
    }
  }
  return null
}

export function planAttendeeForNanny(
  householdNannyId: string,
  nannies?: HouseholdNanny[],
): PlanAttendeeValue {
  const nanny = nannies?.find((n) => n.id === householdNannyId)
  if (nanny?.user_id) return `user:${nanny.user_id}`
  return `nanny:${householdNannyId}`
}

export function defaultPlanAttendeeFromSchedule(options: {
  scheduleItems: ScheduleCoverageItem[]
  planStartsAt: Date
  nannies?: HouseholdNanny[]
  userId?: string
  isNanny: boolean
  myNannyId?: string
}): PlanAttendeeValue {
  const onDuty = nannyOnDutyAt(options.scheduleItems, options.planStartsAt)
  if (onDuty) {
    return planAttendeeForNanny(onDuty, options.nannies)
  }
  return defaultPlanAttendee({
    userId: options.userId,
    isNanny: options.isNanny,
    myNannyId: options.myNannyId,
  })
}

export function formatPlanAttendeeLabel(
  activity: PlanAttendeeFields,
  sources: {
    members?: (HouseholdMember & { profiles: Pick<Profile, 'display_name'> | null })[]
    nannies?: HouseholdNanny[]
    currentUserId?: string
    currentUserEmail?: string | null
  },
): string | null {
  if (activity.attendee_household_nanny_id) {
    const nanny = sources.nannies?.find((n) => n.id === activity.attendee_household_nanny_id)
    if (nanny) return nannyDisplayName(nanny)
  }
  if (activity.attendee_user_id) {
    const member = sources.members?.find((m) => m.user_id === activity.attendee_user_id)
    if (member) {
      return householdMemberDisplayName(member, {
        currentUserId: sources.currentUserId,
        currentUserEmail: sources.currentUserEmail,
      })
    }
    const nanny = sources.nannies?.find((n) => n.user_id === activity.attendee_user_id)
    if (nanny) return nannyDisplayName(nanny)
  }
  return null
}

export function enrichActivitiesWithAttendeeLabels<
  T extends PlanAttendeeFields,
>(
  activities: T[],
  sources: Parameters<typeof formatPlanAttendeeLabel>[1],
): (T & { attendeeLabel: string | null })[] {
  return activities.map((a) => ({
    ...a,
    attendeeLabel: formatPlanAttendeeLabel(a, sources),
  }))
}
