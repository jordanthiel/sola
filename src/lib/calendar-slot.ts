import { addHours, addMinutes, setHours, startOfDay } from 'date-fns'
import { GRID_END_HOUR, GRID_START_HOUR, gridHeightPx } from '@/lib/calendar-grid'
import type { CalendarSlotDraft } from '@/types/calendar-dialog'

const SNAP_MINUTES = 15

function yToMinutes(offsetY: number, gridHeight: number): number {
  const fraction = Math.max(0, Math.min(1, offsetY / gridHeight))
  const totalMinutes = (GRID_END_HOUR - GRID_START_HOUR) * 60
  return Math.round(fraction * totalMinutes)
}

function snapMinutes(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
}

function minutesToDate(day: Date, minutesFromGridStart: number): Date {
  const dayStart = startOfDay(day)
  const clamped = Math.max(0, Math.min((GRID_END_HOUR - GRID_START_HOUR) * 60 - SNAP_MINUTES, minutesFromGridStart))
  return addMinutes(setHours(dayStart, GRID_START_HOUR), clamped)
}

export function slotFromClick(day: Date, offsetY: number, gridHeight = gridHeightPx()): CalendarSlotDraft {
  const startMin = snapMinutes(yToMinutes(offsetY, gridHeight))
  const endMin = Math.min(startMin + 60, (GRID_END_HOUR - GRID_START_HOUR) * 60)
  const dayStart = startOfDay(day)
  return {
    day: dayStart,
    startsAt: minutesToDate(day, startMin),
    endsAt: minutesToDate(day, endMin),
    allDay: false,
  }
}

/** Drag-select a time range on the day column (Google Calendar style). */
export function slotFromDrag(
  day: Date,
  startY: number,
  endY: number,
  gridHeight = gridHeightPx(),
): CalendarSlotDraft {
  const minY = Math.min(startY, endY)
  const maxY = Math.max(startY, endY)
  const dragPx = maxY - minY

  if (dragPx < 8) {
    return slotFromClick(day, minY, gridHeight)
  }

  const startMin = snapMinutes(yToMinutes(minY, gridHeight))
  let endMin = snapMinutes(yToMinutes(maxY, gridHeight))
  if (endMin <= startMin) endMin = startMin + SNAP_MINUTES

  const dayStart = startOfDay(day)
  return {
    day: dayStart,
    startsAt: minutesToDate(day, startMin),
    endsAt: minutesToDate(day, endMin),
    allDay: false,
  }
}

export function allDaySlot(day: Date): CalendarSlotDraft {
  const dayStart = startOfDay(day)
  return {
    day: dayStart,
    startsAt: dayStart,
    endsAt: addMinutes(addHours(dayStart, 23), 59),
    allDay: true,
  }
}

/** Round up to the next 30-minute boundary (keeps exact half-hour marks). */
export function snapToNextHalfHour(d: Date = new Date()): Date {
  const result = new Date(d)
  result.setSeconds(0, 0)
  const totalMinutes = result.getHours() * 60 + result.getMinutes()
  const snappedMinutes = Math.ceil(totalMinutes / 30) * 30
  result.setHours(Math.floor(snappedMinutes / 60), snappedMinutes % 60, 0, 0)
  return result
}

export function defaultPlanDatetimeRange(): { startsAt: string; endsAt: string } {
  const start = snapToNextHalfHour(new Date())
  const end = addHours(start, 1)
  return {
    startsAt: toDatetimeLocalValue(start),
    endsAt: toDatetimeLocalValue(end),
  }
}

export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocalValue(value: string): Date {
  return new Date(value)
}

export function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function toTimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function combineDateAndTime(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number)
  const result = new Date(day)
  result.setHours(h, m, 0, 0)
  return result
}
