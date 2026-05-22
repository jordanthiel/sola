import type { CalendarEvent } from '@/lib/calendar-events'
import { eventColors, eventTimeLabel } from '@/lib/calendar-grid'
import { cn } from '@/lib/utils'

export function CalendarAllDayChip({
  event,
  isSelected,
  onClick,
}: {
  event: CalendarEvent
  isSelected?: boolean
  onClick?: () => void
}) {
  const colors = eventColors(event)
  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={cn(
        'block w-full truncate rounded border-l-[3px] px-1.5 py-0.5 text-left text-xs font-medium',
        colors.bg,
        colors.border,
        colors.text,
        isSelected && 'ring-2 ring-[var(--color-ring)]',
      )}
      title={`${event.title} · ${eventTimeLabel(event)}`}
    >
      {event.title}
    </button>
  )
}
