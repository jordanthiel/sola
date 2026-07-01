import type { CalendarEvent, CalendarEventKind } from '@/lib/calendar-events'

export type CalendarDialogMode = 'view' | 'create' | 'edit'

export interface CalendarSlotDraft {
  day: Date
  startsAt: Date
  endsAt: Date
  allDay?: boolean
  holidayWorked?: boolean
}

export type CalendarDialogState =
  | { mode: 'view'; event: CalendarEvent }
  | { mode: 'create'; draft: CalendarSlotDraft; kind?: CalendarEventKind }
  | { mode: 'edit'; event: CalendarEvent }
