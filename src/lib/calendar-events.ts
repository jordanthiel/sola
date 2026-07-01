import {
  addDays,
  addMinutes,
  endOfDay,
  format,
  isWithinInterval,
  parseISO,
  startOfDay,
} from 'date-fns'
import { isTemplateOccurrence, type TemplateOccurrence } from '@/lib/schedule'
import { blockHasLateReport, effectiveEndIso } from '@/lib/schedule-hours'
import { activityTypeLabel } from '@/lib/child-plans'
import { formatChildNames, groupChildActivities, childAttendeesFromGroup, type ChildActivityWithChild, type GroupedChildActivity } from '@/lib/group-child-activities'
import {
  federalHolidaysInRange,
  type FederalHolidayKey,
  type FederalHolidayOccurrence,
} from '@/lib/federal-holidays'
import { enabledFederalHolidayKeys } from '@/lib/holiday-settings'
import { type ChildColorKey } from '@/lib/child-colors'
import type {
  ActivityType,
  ChildActivity,
  HouseholdHoliday,
  ScheduleBlock,
  TimeOffRequest,
  TimeOffType,
} from '@/types/database'

export type CalendarEventKind = 'shift' | 'time_off' | 'activity' | 'holiday'

export type ScheduleItem = ScheduleBlock | TemplateOccurrence

export interface CalendarEvent {
  id: string
  kind: CalendarEventKind
  title: string
  subtitle?: string | null
  startsAt: Date
  endsAt: Date
  allDay: boolean
  scheduleItem?: ScheduleItem
  /** Underlying row id (without synthetic prefix). */
  sourceId?: string
  householdNannyId?: string | null
  timeOffType?: TimeOffType
  timeOffStatus?: TimeOffRequest['status']
  timeOffHours?: number
  timeOffReviewNotes?: string | null
  activityType?: ActivityType
  childId?: string
  childIds?: string[]
  childName?: string | null
  childAttendees?: { id: string; name: string; colorKey?: ChildColorKey }[]
  childColorKey?: ChildColorKey
  planGroupId?: string | null
  sourceIds?: string[]
  description?: string | null
  mood?: ChildActivity['mood']
  attendeeUserId?: string | null
  attendeeHouseholdNannyId?: string | null
  attendeeLabel?: string | null
  hasLate?: boolean
  isTemplate?: boolean
  holidayKey?: FederalHolidayKey
}

const TIME_OFF_LABELS: Record<TimeOffType, string> = {
  sick: 'Sick time',
  pto: 'PTO',
  unpaid: 'Unpaid time off',
}

function scheduleItemTimes(item: ScheduleItem): { start: Date; end: Date } {
  if (isTemplateOccurrence(item)) {
    return { start: item.starts_at, end: item.ends_at }
  }
  const start = parseISO(item.starts_at)
  const end = parseISO(effectiveEndIso(item))
  return { start, end }
}

export function scheduleItemToEvent(item: ScheduleItem, nannyLabel: string): CalendarEvent {
  const { start, end } = scheduleItemTimes(item)
  const isTpl = isTemplateOccurrence(item)
  const block = isTpl ? null : item

  return {
    id: item.id,
    kind: 'shift',
    title: nannyLabel,
    subtitle: isTpl ? item.notes : item.notes,
    startsAt: start,
    endsAt: end,
    allDay: false,
    scheduleItem: item,
    sourceId: isTpl ? undefined : item.id,
    householdNannyId: item.household_nanny_id,
    hasLate: block ? blockHasLateReport(block) : false,
    isTemplate: isTpl,
  }
}

export function timeOffToEvent(req: TimeOffRequest, nannyLabel: string): CalendarEvent {
  const start = startOfDay(parseISO(req.starts_on))
  const end = endOfDay(parseISO(req.ends_on))

  return {
    id: `time-off-${req.id}`,
    kind: 'time_off',
    title: TIME_OFF_LABELS[req.type],
    subtitle: `${nannyLabel}${req.notes ? ` · ${req.notes}` : ''}`,
    startsAt: start,
    endsAt: end,
    allDay: true,
    sourceId: req.id,
    householdNannyId: req.household_nanny_id,
    timeOffType: req.type,
    timeOffStatus: req.status,
    timeOffHours: req.hours,
    description: req.notes,
    timeOffReviewNotes: req.review_notes,
  }
}

export function groupedActivityToEvent(group: GroupedChildActivity): CalendarEvent {
  const start = parseISO(group.occurred_at)
  const end = group.duration_minutes
    ? addMinutes(start, group.duration_minutes)
    : addMinutes(start, 30)

  const childAttendees = childAttendeesFromGroup(group)
  const childLabel = formatChildNames(group.childNames)
  const typeLabel = activityTypeLabel(group.activity_type)
  const subtitle = childLabel ? `${childLabel} · ${typeLabel}` : typeLabel

  return {
    id: `activity-${group.id}`,
    kind: 'activity',
    title: group.title,
    subtitle,
    startsAt: start,
    endsAt: end,
    allDay: false,
    sourceId: group.sourceIds[0],
    sourceIds: group.sourceIds,
    activityType: group.activity_type,
    childId: group.childIds[0],
    childIds: group.childIds,
    childName: childLabel || null,
    childAttendees,
    childColorKey: group.childColorKeys[0],
    planGroupId: group.planGroupId,
    description: group.description,
    mood: group.mood,
    attendeeUserId: group.attendee_user_id,
    attendeeHouseholdNannyId: group.attendee_household_nanny_id,
    attendeeLabel: group.attendeeLabel ?? null,
  }
}

export function activityToEvent(
  activity: ChildActivity & {
    children?: { name: string; color_key: string } | null
    attendeeLabel?: string | null
  },
): CalendarEvent {
  return groupedActivityToEvent(
    groupChildActivities([
      {
        ...activity,
        children: activity.children ?? null,
      },
    ] as ChildActivityWithChild[])[0],
  )
}

export function holidayToEvent(occurrence: FederalHolidayOccurrence): CalendarEvent {
  const start = startOfDay(occurrence.date)
  const end = endOfDay(occurrence.date)
  const dateKey = format(start, 'yyyy-MM-dd')

  return {
    id: `holiday-${occurrence.key}-${dateKey}`,
    kind: 'holiday',
    title: occurrence.name,
    subtitle: 'Paid holiday — nanny off',
    startsAt: start,
    endsAt: end,
    allDay: true,
    holidayKey: occurrence.key,
  }
}

export function buildHolidayEvents(
  rangeFrom: Date,
  rangeTo: Date,
  holidayOverrides: Pick<HouseholdHoliday, 'holiday_key' | 'enabled'>[],
): CalendarEvent[] {
  const enabledKeys = new Set(enabledFederalHolidayKeys(holidayOverrides))
  return federalHolidaysInRange(rangeFrom, rangeTo)
    .filter((occ) => enabledKeys.has(occ.key))
    .map(holidayToEvent)
}

export function buildCalendarEvents(input: {
  scheduleItems: ScheduleItem[]
  timeOffRequests: TimeOffRequest[]
  activities: (ChildActivity & { children?: { name: string; color_key: string } | null })[]
  nannyName: (householdNannyId: string | null) => string
  includeDeniedTimeOff?: boolean
  holidayOverrides?: Pick<HouseholdHoliday, 'holiday_key' | 'enabled'>[]
  holidayRange?: { from: Date; to: Date }
}): CalendarEvent[] {
  const {
    scheduleItems,
    timeOffRequests,
    activities,
    nannyName,
    includeDeniedTimeOff = false,
    holidayOverrides = [],
    holidayRange,
  } = input

  const events: CalendarEvent[] = []

  for (const item of scheduleItems) {
    events.push(scheduleItemToEvent(item, nannyName(item.household_nanny_id)))
  }

  for (const req of timeOffRequests) {
    if (!includeDeniedTimeOff && req.status === 'denied') continue
    events.push(timeOffToEvent(req, nannyName(req.household_nanny_id)))
  }

  for (const group of groupChildActivities(activities as ChildActivityWithChild[])) {
    events.push(groupedActivityToEvent(group))
  }

  if (holidayRange) {
    events.push(...buildHolidayEvents(holidayRange.from, holidayRange.to, holidayOverrides))
  }

  return events.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

export function eventOverlapsDay(event: CalendarEvent, day: Date): boolean {
  const dayStart = startOfDay(day)
  const dayEnd = endOfDay(day)
  return (
    isWithinInterval(event.startsAt, { start: dayStart, end: dayEnd }) ||
    isWithinInterval(event.endsAt, { start: dayStart, end: dayEnd }) ||
    (event.startsAt <= dayStart && event.endsAt >= dayEnd)
  )
}

export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((e) => eventOverlapsDay(e, day))
}

export function eventsInRange(events: CalendarEvent[], from: Date, to: Date): CalendarEvent[] {
  const rangeStart = startOfDay(from)
  const rangeEnd = endOfDay(to)
  return events.filter(
    (e) =>
      isWithinInterval(e.startsAt, { start: rangeStart, end: rangeEnd }) ||
      isWithinInterval(e.endsAt, { start: rangeStart, end: rangeEnd }) ||
      (e.startsAt <= rangeStart && e.endsAt >= rangeEnd),
  )
}

export function eachDayInRange(from: Date, to: Date): Date[] {
  const days: Date[] = []
  let cursor = startOfDay(from)
  const end = startOfDay(to)
  while (cursor <= end) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return days
}
