import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { CalendarEvent } from '@/lib/calendar-events'
import { eventsOnDay } from '@/lib/calendar-events'
import { eventColors } from '@/lib/calendar-grid'
import { cn } from '@/lib/utils'

export function ScheduleMonthView({
  focusDate,
  events,
  onSelectDay,
  onSelectEvent,
}: {
  focusDate: Date
  events: CalendarEvent[]
  onSelectDay: (day: Date) => void
  onSelectEvent: (event: CalendarEvent) => void
}) {
  const monthStart = startOfMonth(focusDate)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(focusDate), { weekStartsOn: 1 })
  const days: Date[] = []
  let cursor = gridStart
  while (cursor <= gridEnd) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }

  const weeks: Date[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-[var(--color-card)] shadow-sm">
      <header className="grid grid-cols-7 border-b bg-[var(--color-muted)]/20 text-center text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <span key={d} className="py-2">
            {d}
          </span>
        ))}
      </header>
      {weeks.map((week) => (
        <section key={week[0]!.toISOString()} className="grid grid-cols-7 border-b last:border-b-0">
          {week.map((day) => {
            const dayEvents = eventsOnDay(events, day)
            const inMonth = isSameMonth(day, focusDate)
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => onSelectDay(day)}
                className={cn(
                  'min-h-[5.5rem] border-r p-1 text-left last:border-r-0 hover:bg-[var(--color-muted)]/30',
                  !inMonth && 'bg-[var(--color-muted)]/10 text-[var(--color-muted-foreground)]',
                  isToday(day) && 'bg-[#e8f0fe]/50',
                )}
              >
                <span
                  className={cn(
                    'inline-flex size-7 items-center justify-center rounded-full text-sm',
                    isToday(day) && 'bg-[#1a73e8] font-medium text-white',
                  )}
                >
                  {format(day, 'd')}
                </span>
                <ul className="mt-0.5 space-y-0.5">
                  {dayEvents.slice(0, 3).map((event) => {
                    const colors = eventColors(event)
                    return (
                      <li key={event.id}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectEvent(event)
                          }}
                          className={cn(
                            'w-full truncate rounded border-l-2 px-1 py-0.5 text-left text-[10px] font-medium',
                            colors.bg,
                            colors.border,
                            colors.text,
                          )}
                        >
                          {event.allDay
                            ? event.title
                            : `${format(event.startsAt, 'h:mm a')} ${event.title}`}
                        </button>
                      </li>
                    )
                  })}
                  {dayEvents.length > 3 && (
                    <li className="px-1 text-[10px] text-[var(--color-muted-foreground)]">
                      +{dayEvents.length - 3} more
                    </li>
                  )}
                </ul>
              </button>
            )
          })}
        </section>
      ))}
    </section>
  )
}
