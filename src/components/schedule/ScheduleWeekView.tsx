import { addDays, startOfWeek } from 'date-fns'
import type { CalendarEvent } from '@/lib/calendar-events'
import type { CalendarSlotDraft } from '@/types/calendar-dialog'
import { CalendarTimeGrid } from '@/components/schedule/CalendarTimeGrid'

export function ScheduleWeekView({
  focusDate,
  events,
  selectedEventId,
  onSelectDay,
  onSelectEvent,
  onSlotSelect,
}: {
  focusDate: Date
  events: CalendarEvent[]
  selectedEventId?: string | null
  onSelectDay?: (day: Date) => void
  onSelectEvent?: (event: CalendarEvent) => void
  onSlotSelect?: (slot: CalendarSlotDraft) => void
}) {
  const weekStart = startOfWeek(focusDate, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <CalendarTimeGrid
      days={days}
      events={events}
      selectedEventId={selectedEventId}
      onSelectDay={onSelectDay}
      onSelectEvent={onSelectEvent}
      onSlotSelect={onSlotSelect}
    />
  )
}
