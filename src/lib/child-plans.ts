import type { ActivityType } from '@/types/database'

/** Types shown when scheduling future child plans (calendar-first). */
export const PLANNED_ACTIVITY_TYPES = [
  'gymnastics',
  'library',
  'class',
  'appointment',
  'playdate',
  'outdoor',
  'learning',
  'other',
] as const satisfies readonly ActivityType[]

export type PlannedActivityType = (typeof PLANNED_ACTIVITY_TYPES)[number]

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  gymnastics: 'Gymnastics',
  library: 'Library',
  class: 'Class / lesson',
  appointment: 'Appointment',
  playdate: 'Playdate',
  outdoor: 'Outdoor',
  learning: 'Learning',
  meal: 'Meal',
  nap: 'Nap',
  other: 'Other',
}

export function activityTypeLabel(type: ActivityType): string {
  return ACTIVITY_TYPE_LABELS[type] ?? type
}

export function minutesBetween(start: Date, end: Date): number {
  return Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000))
}
