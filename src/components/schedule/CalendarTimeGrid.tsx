import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { format, isSameDay, isToday } from 'date-fns'
import { allDaySlot, slotFromDrag } from '@/lib/calendar-slot'
import type { CalendarEvent } from '@/lib/calendar-events'
import { CalendarAllDayChip } from '@/components/schedule/CalendarAllDayChip'
import { CalendarEventBlock } from '@/components/schedule/CalendarEventBlock'
import {
  allDayEventsForDay,
  CALENDAR_SLOT_GUTTER_PX,
  GRID_START_HOUR,
  gridHeightPx,
  HOUR_HEIGHT_PX,
  hourLabels,
  layoutTimedEventsForDay,
  nowIndicatorTop,
  TIME_COLUMN_WIDTH_PX,
} from '@/lib/calendar-grid'
import type { CalendarSlotDraft } from '@/types/calendar-dialog'
import { cn } from '@/lib/utils'

type DragPreview = {
  day: Date
  startY: number
  currentY: number
}

export function CalendarTimeGrid({
  days,
  events,
  selectedEventId,
  onSelectDay,
  onSelectEvent,
  onSlotSelect,
}: {
  days: Date[]
  events: CalendarEvent[]
  selectedEventId?: string | null
  onSelectDay?: (day: Date) => void
  onSelectEvent?: (event: CalendarEvent) => void
  /** Fired after click or drag-select on the grid (times pre-filled). */
  onSlotSelect?: (slot: CalendarSlotDraft) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const columnRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [drag, setDrag] = useState<DragPreview | null>(null)
  const dragRef = useRef<DragPreview | null>(null)
  dragRef.current = drag
  const hours = hourLabels()
  const gridHeight = gridHeightPx()

  const hasAllDay = useMemo(
    () => days.some((day) => allDayEventsForDay(events, day).length > 0),
    [days, events],
  )

  const layoutsByDay = useMemo(
    () => days.map((day) => layoutTimedEventsForDay(events, day)),
    [days, events],
  )

  const finishDrag = useCallback(
    (preview: DragPreview) => {
      const col = columnRefs.current.get(preview.day.toISOString())
      if (!col || !onSlotSelect) return
      onSlotSelect(slotFromDrag(preview.day, preview.startY, preview.currentY, gridHeight))
    },
    [onSlotSelect, gridHeight],
  )

  useEffect(() => {
    if (!drag) return

    function onMove(e: MouseEvent) {
      const preview = dragRef.current
      if (!preview) return
      const col = columnRefs.current.get(preview.day.toISOString())
      if (!col) return
      const rect = col.getBoundingClientRect()
      const y = Math.max(0, Math.min(gridHeight, e.clientY - rect.top))
      setDrag((d) => (d ? { ...d, currentY: y } : null))
    }

    function onUp() {
      const preview = dragRef.current
      if (preview) finishDrag(preview)
      setDrag(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, finishDrag, gridHeight])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const now = new Date()
    const todayIndex = days.findIndex((d) => isSameDay(d, now))
    if (todayIndex < 0) return
    const indicator = nowIndicatorTop(days[todayIndex]!, now)
    if (indicator == null) return
    const offset = (indicator / 100) * gridHeight - el.clientHeight / 3
    el.scrollTop = Math.max(0, offset)
  }, [days, gridHeight])

  function handleColumnMouseDown(day: Date, e: ReactMouseEvent<HTMLElement>) {
    if (!onSlotSelect || e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return
    const col = columnRefs.current.get(day.toISOString())
    if (!col) return
    const rect = col.getBoundingClientRect()
    const y = e.clientY - rect.top
    setDrag({ day, startY: y, currentY: y })
  }

  function dragOverlayStyle(preview: DragPreview) {
    const top = Math.min(preview.startY, preview.currentY)
    const height = Math.max(4, Math.abs(preview.currentY - preview.startY))
    return { top, height }
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-[var(--color-card)] shadow-sm">
      <header className="sticky top-0 z-20 flex border-b bg-[var(--color-card)]">
        <span
          className="shrink-0 border-r bg-[var(--color-muted)]/30"
          style={{ width: TIME_COLUMN_WIDTH_PX }}
          aria-hidden
        />
        {days.map((day) => (
          <DayHeader
            key={day.toISOString()}
            day={day}
            onClick={onSelectDay ? () => onSelectDay(day) : undefined}
          />
        ))}
      </header>

      {(hasAllDay || onSlotSelect) && (
        <section className="flex border-b">
          <span
            className="flex shrink-0 items-center justify-end border-r px-1 text-[10px] text-[var(--color-muted-foreground)]"
            style={{ width: TIME_COLUMN_WIDTH_PX }}
          >
            All day
          </span>
          {days.map((day) => (
            <section
              key={`allday-${day.toISOString()}`}
              className={cn(
                'min-h-[28px] flex-1 space-y-0.5 border-r p-0.5 last:border-r-0',
                onSlotSelect && 'cursor-pointer hover:bg-[var(--color-muted)]/40',
              )}
              onClick={
                onSlotSelect
                  ? (e) => {
                      if ((e.target as HTMLElement).closest('button')) return
                      onSlotSelect(allDaySlot(day))
                    }
                  : undefined
              }
            >
              {allDayEventsForDay(events, day).map((event) => (
                <CalendarAllDayChip
                  key={`${event.id}-${format(day, 'yyyy-MM-dd')}`}
                  event={event}
                  isSelected={selectedEventId === event.id}
                  onClick={() => onSelectEvent?.(event)}
                />
              ))}
            </section>
          ))}
        </section>
      )}

      {onSlotSelect && (
        <p className="border-b px-3 py-1.5 text-xs text-[var(--color-muted-foreground)]">
          Click or drag on open grid space (nanny hours stay on the left) to schedule activities and
          time off.
        </p>
      )}

      <section ref={scrollRef} className="max-h-[calc(100vh-14rem)] overflow-auto">
        <section className="flex min-w-fit">
          <section
            className="relative shrink-0 border-r"
            style={{ width: TIME_COLUMN_WIDTH_PX, height: gridHeight }}
          >
            {hours.slice(0, -1).map(({ hour, label }) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-[var(--color-muted-foreground)]"
                style={{ top: (hour - GRID_START_HOUR) * HOUR_HEIGHT_PX }}
              >
                {label}
              </span>
            ))}
          </section>

          {days.map((day, dayIndex) => {
            const layouts = layoutsByDay[dayIndex]!
            const indicatorTop = nowIndicatorTop(day)
            const isDraggingHere = drag && isSameDay(drag.day, day)

            return (
              <section
                key={day.toISOString()}
                ref={(el) => {
                  if (el) columnRefs.current.set(day.toISOString(), el)
                  else columnRefs.current.delete(day.toISOString())
                }}
                onMouseDown={(e) => handleColumnMouseDown(day, e)}
                className={cn(
                  'relative min-w-[4.5rem] flex-1 select-none border-r last:border-r-0',
                  isToday(day) && 'bg-[#e8f0fe]/40',
                  onSlotSelect && 'cursor-crosshair',
                  isDraggingHere && 'bg-[#e8f0fe]/60',
                )}
                style={{
                  height: gridHeight,
                  paddingRight: onSlotSelect ? CALENDAR_SLOT_GUTTER_PX : undefined,
                }}
              >
                {hours.slice(0, -1).map(({ hour }) => (
                  <span
                    key={hour}
                    className="pointer-events-none absolute inset-x-0 block border-t border-[var(--color-border)]"
                    style={{ top: (hour - GRID_START_HOUR) * HOUR_HEIGHT_PX }}
                  />
                ))}

                {indicatorTop != null && (
                  <span
                    className="pointer-events-none absolute inset-x-0 z-20 block border-t-2 border-[#ea4335]"
                    style={{ top: `${indicatorTop}%` }}
                  >
                    <span className="absolute -left-1 -top-1.5 size-2.5 rounded-full bg-[#ea4335]" />
                  </span>
                )}

                {isDraggingHere && drag && (
                  <span
                    className="pointer-events-none absolute inset-x-1 z-30 rounded border-2 border-[#1a73e8] bg-[#1a73e8]/25"
                    style={dragOverlayStyle(drag)}
                  />
                )}

                {onSlotSelect && (
                  <span
                    className="pointer-events-none absolute inset-y-0 right-0 z-[1] border-l border-dashed border-[var(--color-border)]/80 bg-[var(--color-muted)]/15"
                    style={{ width: CALENDAR_SLOT_GUTTER_PX }}
                    aria-hidden
                  />
                )}

                {layouts.map((layout) => (
                  <CalendarEventBlock
                    key={`${layout.event.id}-${format(day, 'yyyy-MM-dd')}`}
                    layout={layout}
                    compact={days.length > 3}
                    isSelected={selectedEventId === layout.event.id}
                    onClick={() => onSelectEvent?.(layout.event)}
                  />
                ))}
              </section>
            )
          })}
        </section>
      </section>
    </section>
  )
}

function DayHeader({ day, onClick }: { day: Date; onClick?: () => void }) {
  const inner = (
    <>
      <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {format(day, 'EEE')}
      </span>
      <span
        className={cn(
          'mt-0.5 flex size-9 items-center justify-center rounded-full text-lg',
          isToday(day) ? 'bg-[#1a73e8] font-medium text-white' : 'font-normal',
        )}
      >
        {format(day, 'd')}
      </span>
    </>
  )

  return (
    <section className="flex min-w-[4.5rem] flex-1 flex-col items-center border-r py-2 last:border-r-0">
      {onClick ? (
        <button type="button" onClick={onClick} className="flex flex-col items-center hover:opacity-80">
          {inner}
        </button>
      ) : (
        <section className="flex flex-col items-center">{inner}</section>
      )}
    </section>
  )
}
