import { X } from 'lucide-react'
import type { CalendarEvent } from '@/lib/calendar-events'
import { eventTimeLabel } from '@/lib/calendar-grid'
import { ScheduleEventRow } from '@/components/schedule/ScheduleEventRow'
import { Button } from '@/components/ui/button'

export function CalendarEventDetail({
  event,
  isParent,
  isNanny,
  onClose,
  onEditDay,
  onReportLate,
  onCancel,
  materializingId,
}: {
  event: CalendarEvent
  isParent: boolean
  isNanny: boolean
  onClose: () => void
  onEditDay?: (event: CalendarEvent) => void
  onReportLate?: (event: CalendarEvent) => void
  onCancel?: (id: string) => void
  materializingId?: string | null
}) {
  return (
    <section className="rounded-lg border bg-[var(--color-card)] shadow-sm">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <p className="text-sm text-[var(--color-muted-foreground)]">{eventTimeLabel(event)}</p>
        <Button type="button" size="sm" variant="ghost" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>
      <ul className="p-2">
        <ScheduleEventRow
          event={event}
          isParent={isParent}
          isNanny={isNanny}
          onEditDay={onEditDay}
          onReportLate={onReportLate}
          onCancel={onCancel}
          materializingId={materializingId}
        />
      </ul>
    </section>
  )
}
