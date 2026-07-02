import type { ChildActivity } from '@/types/database'
import { isChildColorKey, type ChildColorKey } from '@/lib/child-colors'

export type ChildActivityWithChild = ChildActivity & {
  children: { name: string; color_key?: string | null } | null
  attendeeLabel?: string | null
}

export type GroupedChildActivity = {
  id: string
  title: string
  occurred_at: string
  activity_type: ChildActivity['activity_type']
  duration_minutes: number | null
  description: string | null
  mood: ChildActivity['mood']
  attendee_user_id: string | null
  attendee_household_nanny_id: string | null
  attendeeLabel?: string | null
  planGroupId: string | null
  childIds: string[]
  childNames: string[]
  childColorKeys: ChildColorKey[]
  sourceIds: string[]
}

export function childAttendeesFromGroup(
  group: Pick<GroupedChildActivity, 'childIds' | 'childNames' | 'childColorKeys'>,
): { id: string; name: string; colorKey?: ChildColorKey }[] {
  return group.childIds.map((id, index) => ({
    id,
    name: group.childNames[index] ?? '',
    colorKey: group.childColorKeys[index],
  }))
}

export function formatChildNames(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

export function groupChildActivities(activities: ChildActivityWithChild[]): GroupedChildActivity[] {
  const groups = new Map<string, GroupedChildActivity>()

  for (const activity of activities) {
    const key = activity.plan_group_id ?? activity.id
    const childName = activity.children?.name
    const colorKey = isChildColorKey(activity.children?.color_key)
      ? activity.children.color_key
      : null
    const existing = groups.get(key)

    if (!existing) {
      groups.set(key, {
        id: key,
        title: activity.title,
        occurred_at: activity.occurred_at,
        activity_type: activity.activity_type,
        duration_minutes: activity.duration_minutes,
        description: activity.description,
        mood: activity.mood,
        attendee_user_id: activity.attendee_user_id,
        attendee_household_nanny_id: activity.attendee_household_nanny_id,
        attendeeLabel: activity.attendeeLabel ?? null,
        planGroupId: activity.plan_group_id,
        childIds: [activity.child_id],
        childNames: childName ? [childName] : [],
        childColorKeys: colorKey ? [colorKey] : [],
        sourceIds: [activity.id],
      })
      continue
    }

    if (!existing.childIds.includes(activity.child_id)) {
      existing.childIds.push(activity.child_id)
    }
    if (childName && !existing.childNames.includes(childName)) {
      existing.childNames.push(childName)
    }
    if (colorKey && !existing.childColorKeys.includes(colorKey)) {
      existing.childColorKeys.push(colorKey)
    }
    if (!existing.sourceIds.includes(activity.id)) {
      existing.sourceIds.push(activity.id)
    }
  }

  return [...groups.values()]
}
