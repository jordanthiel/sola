import { format } from 'date-fns'
import {
  eventColors,
  eventTimeLabel,
  SHIFT_LANE_WIDTH_PCT,
  type PositionedCalendarEvent,
} from '@/lib/calendar-grid'
import { PlanPeopleChips } from '@/components/activities/PlanPeopleChips'
import { cn } from '@/lib/utils'

export function CalendarEventBlock({
  layout,
  compact,
  isSelected,
  onClick,
}: {
  layout: PositionedCalendarEvent
  compact?: boolean
  isSelected?: boolean
  onClick?: () => void
}) {
  const { event, top, height, column, columnCount, layer } = layout
  const colors = eventColors(event)
  const isShiftBackground = layer === 'background'
  const laneWidthPct = isShiftBackground ? SHIFT_LANE_WIDTH_PCT : 100
  const widthPct = laneWidthPct / columnCount
  const leftPct = column * widthPct
  const minHeight = compact ? 18 : 22
  const blockStyle = {
    top: `${top}%`,
    height: `max(${minHeight}px, ${height}%)`,
    left: `calc(${leftPct}% + 2px)`,
    width: `calc(${widthPct}% - 4px)`,
  }
  const title = `${event.title} · ${eventTimeLabel(event)}`

  if (isShiftBackground) {
    return (
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.()
        }}
        className={cn(
          'absolute z-[5] overflow-hidden rounded border border-dashed px-1 py-0.5 text-left transition-opacity hover:opacity-100',
          colors.bg,
          colors.border,
          colors.text,
          'cursor-pointer opacity-75',
          isSelected && 'opacity-100 ring-2 ring-[var(--color-ring)] ring-offset-1',
        )}
        style={blockStyle}
        title={title}
      >
        <p
          className={cn(
            'max-w-full truncate font-semibold leading-tight',
            compact ? 'text-[10px]' : 'text-xs',
          )}
        >
          {event.title}
        </p>
        {!compact && height > 4 && (
          <p className="truncate text-[10px] opacity-90">
            {format(event.startsAt, 'h:mm')} – {format(event.endsAt, 'h:mm a')}
          </p>
        )}
      </button>
    )
  }

  return (
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={cn(
        'absolute z-10 overflow-hidden rounded border-l-[3px] px-1 py-0.5 text-left shadow-sm transition-shadow hover:shadow-md',
        colors.bg,
        colors.border,
        colors.text,
        isSelected && 'ring-2 ring-[var(--color-ring)] ring-offset-1',
      )}
      style={blockStyle}
      title={title}
    >
      <p className={cn('truncate font-semibold leading-tight', compact ? 'text-[10px]' : 'text-xs')}>
        {event.title}
      </p>
      {event.kind === 'activity' && (event.childAttendees?.length || event.attendeeLabel) && (
        <PlanPeopleChips
          children={event.childAttendees}
          attendeeLabel={event.attendeeLabel}
          size="sm"
          className="mt-0.5"
        />
      )}
      {!compact && height > 4 && (
        <p className="truncate text-[10px] opacity-90">
          {format(event.startsAt, 'h:mm')} – {format(event.endsAt, 'h:mm a')}
        </p>
      )}
    </button>
  )
}
