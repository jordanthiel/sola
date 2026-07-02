import { format, startOfDay } from 'date-fns'
import { Plus } from 'lucide-react'
import type { CalendarEvent } from '@/lib/calendar-events'
import { eachDayInRange, eventsOnDay } from '@/lib/calendar-events'
import { eventColors, eventTimeLabel } from '@/lib/calendar-grid'
import { PlanPeopleChips } from '@/components/activities/PlanPeopleChips'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function ScheduleDayGroup({
  title,
  groupDays,
  events,
  onSelectEvent,
  onSlotClick,
}: {
  title: string
  groupDays: Date[]
  events: CalendarEvent[]
  onSelectEvent: (event: CalendarEvent) => void
  onSlotClick?: (day: Date) => void
}) {
  if (!groupDays.length) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {groupDays.map((day) => {
          const dayEvents = eventsOnDay(events, day)
          return (
            <section key={day.toISOString()}>
              <header className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--color-muted-foreground)]">
                  {format(day, 'EEEE, MMM d, yyyy')}
                </h3>
                {onSlotClick && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => onSlotClick(day)}>
                    <Plus className="mr-1 size-3" />
                    Add
                  </Button>
                )}
              </header>
              <ul className="space-y-2">
                {dayEvents.map((event) => {
                  const colors = eventColors(event)
                  return (
                    <li key={event.id}>
                      <button
                        type="button"
                        onClick={() => onSelectEvent(event)}
                        className={cn(
                          'flex w-full flex-col rounded-md border-l-4 px-3 py-2 text-left transition-colors hover:bg-[var(--color-muted)]/40',
                          colors.bg,
                          colors.border,
                        )}
                      >
                        <span className={cn('flex flex-wrap items-center gap-2 font-medium', colors.text)}>
                          <span>{event.title}</span>
                          {event.kind === 'activity' && (
                            <PlanPeopleChips
                              children={event.childAttendees}
                              attendeeLabel={event.attendeeLabel}
                              size="sm"
                            />
                          )}
                        </span>
                        <span className="text-sm text-[var(--color-muted-foreground)]">
                          {eventTimeLabel(event)}
                        </span>
                        {event.subtitle && (
                          <span className="text-sm text-[var(--color-muted-foreground)]">
                            {event.subtitle}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </CardContent>
    </Card>
  )
}

export function ScheduleListView({
  from,
  to,
  events,
  onSelectEvent,
  onSlotClick,
}: {
  from: Date
  to: Date
  events: CalendarEvent[]
  onSelectEvent: (event: CalendarEvent) => void
  onSlotClick?: (day: Date) => void
}) {
  const days = eachDayInRange(from, to).filter((day) => eventsOnDay(events, day).length > 0)

  if (!days.length) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-[var(--color-muted-foreground)]">No events in this range.</p>
          {onSlotClick && (
            <Button variant="outline" onClick={() => onSlotClick(startOfDay(new Date()))}>
              <Plus className="mr-1 size-4" />
              Create event
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  const today = startOfDay(new Date())
  const upcomingDays = days.filter((d) => d >= today)
  const pastDays = days.filter((d) => d < today).reverse()

  return (
    <section className="space-y-4">
      <ScheduleDayGroup
        title="Upcoming"
        groupDays={upcomingDays}
        events={events}
        onSelectEvent={onSelectEvent}
        onSlotClick={onSlotClick}
      />
      <ScheduleDayGroup
        title="Past"
        groupDays={pastDays}
        events={events}
        onSelectEvent={onSelectEvent}
        onSlotClick={onSlotClick}
      />
    </section>
  )
}
