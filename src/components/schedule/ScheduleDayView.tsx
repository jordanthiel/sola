import type { CalendarEvent } from '@/lib/calendar-events'
import type { CalendarSlotDraft } from '@/types/calendar-dialog'
import { CalendarTimeGrid } from '@/components/schedule/CalendarTimeGrid'

export function ScheduleDayView({
  day,
  events,
  selectedEventId,
  onSelectEvent,
  onSlotSelect,
}: {
  day: Date
  events: CalendarEvent[]
  selectedEventId?: string | null
  onSelectEvent?: (event: CalendarEvent) => void
  onSlotSelect?: (slot: CalendarSlotDraft) => void
}) {
  return (
    <CalendarTimeGrid
      days={[day]}
      events={events}
      selectedEventId={selectedEventId}
      onSelectEvent={onSelectEvent}
      onSlotSelect={onSlotSelect}
    />
  )
}
