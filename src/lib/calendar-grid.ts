import {
  differenceInMinutes,
  format,
  isSameDay,
  max,
  min,
  setHours,
  setMinutes,
  startOfDay,
} from 'date-fns'
import type { CalendarEvent } from '@/lib/calendar-events'
import { eventsOnDay } from '@/lib/calendar-events'
import { childColorClasses } from '@/lib/child-colors'

export const GRID_START_HOUR = 6
export const GRID_END_HOUR = 22
export const HOUR_HEIGHT_PX = 56
export const TIME_COLUMN_WIDTH_PX = 52
/** Right edge reserved for click/drag to add events. */
export const CALENDAR_SLOT_GUTTER_PX = 36
/** Nanny shifts render in the left portion so the grid stays usable. */
export const SHIFT_LANE_WIDTH_PCT = 40

const TOTAL_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60

export function gridHeightPx(): number {
  return (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT_PX
}

export function hourLabels(): { hour: number; label: string }[] {
  const labels: { hour: number; label: string }[] = []
  for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) {
    const d = setMinutes(setHours(startOfDay(new Date()), h % 24), 0)
    labels.push({ hour: h, label: format(d, 'h a') })
  }
  return labels
}

function dayGridBounds(day: Date) {
  const dayStart = startOfDay(day)
  return {
    gridStart: setMinutes(setHours(dayStart, GRID_START_HOUR), 0),
    gridEnd: setMinutes(setHours(dayStart, GRID_END_HOUR), 0),
  }
}

export function clipEventToDayGrid(
  event: CalendarEvent,
  day: Date,
): { start: Date; end: Date } | null {
  if (event.allDay) return null
  const { gridStart, gridEnd } = dayGridBounds(day)
  const start = max([event.startsAt, gridStart])
  const end = min([event.endsAt, gridEnd])
  if (end <= start) return null
  return { start, end }
}

function toPercentPosition(start: Date, end: Date, day: Date): { top: number; height: number } {
  const { gridStart } = dayGridBounds(day)
  const topMinutes = differenceInMinutes(start, gridStart)
  const durationMinutes = Math.max(differenceInMinutes(end, start), 15)
  return {
    top: (topMinutes / TOTAL_MINUTES) * 100,
    height: (durationMinutes / TOTAL_MINUTES) * 100,
  }
}

export interface PositionedCalendarEvent {
  event: CalendarEvent
  top: number
  height: number
  column: number
  columnCount: number
  /** Shifts sit behind other events and do not block slot selection. */
  layer: 'background' | 'foreground'
}

function eventsOverlap(a: { start: Date; end: Date }, b: { start: Date; end: Date }) {
  return a.start < b.end && b.start < a.end
}

function layoutTimedSlices(
  timed: TimedSlice[],
  layer: PositionedCalendarEvent['layer'],
): PositionedCalendarEvent[] {
  const columnEnds: Date[] = []
  const positioned: PositionedCalendarEvent[] = []

  for (const item of timed) {
    let column = 0
    while (column < columnEnds.length && columnEnds[column]! > item.start) {
      column++
    }
    if (column === columnEnds.length) columnEnds.push(item.end)
    else columnEnds[column] = item.end

    positioned.push({
      event: item.event,
      top: item.top,
      height: item.height,
      column,
      columnCount: 1,
      layer,
    })
  }

  for (const item of positioned) {
    const slice = timed.find((t) => t.event.id === item.event.id)!
    const overlapping = positioned.filter((other) => {
      const otherSlice = timed.find((t) => t.event.id === other.event.id)!
      return eventsOverlap(slice, otherSlice)
    })
    item.columnCount = Math.max(...overlapping.map((o) => o.column), 0) + 1
  }

  return positioned
}

type TimedSlice = {
  event: CalendarEvent
  start: Date
  end: Date
  top: number
  height: number
}

function timedSlicesForDay(events: CalendarEvent[], day: Date): TimedSlice[] {
  return eventsOnDay(events, day)
    .filter((e) => !e.allDay)
    .map((event) => {
      const clipped = clipEventToDayGrid(event, day)
      if (!clipped) return null
      const { top, height } = toPercentPosition(clipped.start, clipped.end, day)
      return { event, start: clipped.start, end: clipped.end, top, height }
    })
    .filter((x): x is TimedSlice => x !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

export function layoutTimedEventsForDay(
  events: CalendarEvent[],
  day: Date,
): PositionedCalendarEvent[] {
  const timed = timedSlicesForDay(events, day)
  const shifts = timed.filter((t) => t.event.kind === 'shift')
  const foreground = timed.filter((t) => t.event.kind !== 'shift')

  return [
    ...layoutTimedSlices(shifts, 'background'),
    ...layoutTimedSlices(foreground, 'foreground'),
  ]
}

export function allDayEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return eventsOnDay(events, day).filter((e) => e.allDay)
}

export function nowIndicatorTop(day: Date, now = new Date()): number | null {
  if (!isSameDay(day, now)) return null
  const { gridStart, gridEnd } = dayGridBounds(day)
  if (now < gridStart || now > gridEnd) return null
  const topMinutes = differenceInMinutes(now, gridStart)
  return (topMinutes / TOTAL_MINUTES) * 100
}

export function eventTimeLabel(event: CalendarEvent): string {
  if (event.allDay) return 'All day'
  return `${format(event.startsAt, 'h:mm a')} – ${format(event.endsAt, 'h:mm a')}`
}

export type EventColorClasses = { bg: string; border: string; text: string }

export const EVENT_COLORS: Record<CalendarEvent['kind'], EventColorClasses> = {
  shift: {
    bg: 'bg-[#e8f0fe]',
    border: 'border-[#1a73e8]',
    text: 'text-[#174ea6]',
  },
  time_off: {
    bg: 'bg-[#fef7e0]',
    border: 'border-[#f9ab00]',
    text: 'text-[#b06000]',
  },
  activity: {
    bg: 'bg-[#e6f4ea]',
    border: 'border-[#34a853]',
    text: 'text-[#137333]',
  },
  holiday: {
    bg: 'bg-[#f3e8fd]',
    border: 'border-[#9334e6]',
    text: 'text-[#7627bb]',
  },
}

export function eventColors(event: CalendarEvent): EventColorClasses {
  if (event.kind === 'activity' && event.childColorKey) {
    return childColorClasses(event.childColorKey)
  }
  return EVENT_COLORS[event.kind]
}
