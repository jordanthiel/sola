import { format, parseISO } from 'date-fns'
import { Baby, CalendarOff, Clock, Sparkles } from 'lucide-react'
import type { CalendarEvent } from '@/lib/calendar-events'
import { isTemplateOccurrence } from '@/lib/schedule'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const KIND_STYLES: Record<CalendarEvent['kind'], string> = {
  shift: 'border-l-[var(--color-primary)] bg-[var(--color-primary)]/5',
  time_off: 'border-l-amber-500 bg-amber-50/80',
  activity: 'border-l-emerald-500 bg-emerald-50/80',
  holiday: 'border-l-violet-500 bg-violet-50/80',
}

function formatEventTime(event: CalendarEvent): string {
  if (event.allDay) return 'All day'
  return `${format(event.startsAt, 'h:mm a')} – ${format(event.endsAt, 'h:mm a')}`
}

function KindIcon({ kind }: { kind: CalendarEvent['kind'] }) {
  if (kind === 'activity') return <Baby className="h-4 w-4 shrink-0 opacity-70" />
  if (kind === 'time_off') return <CalendarOff className="h-4 w-4 shrink-0 opacity-70" />
  if (kind === 'holiday') return <Sparkles className="h-4 w-4 shrink-0 opacity-70" />
  return <Clock className="h-4 w-4 shrink-0 opacity-70" />
}

export function ScheduleEventRow({
  event,
  compact = false,
  isParent,
  isNanny,
  onEditDay,
  onReportLate,
  onCancel,
  materializingId,
}: {
  event: CalendarEvent
  compact?: boolean
  isParent: boolean
  isNanny: boolean
  onEditDay?: (event: CalendarEvent) => void
  onReportLate?: (event: CalendarEvent) => void
  onCancel?: (id: string) => void
  materializingId?: string | null
}) {
  const item = event.scheduleItem
  const isTpl = item ? isTemplateOccurrence(item) : false
  const block = item && !isTpl ? item : null

  return (
    <li
      className={cn(
        'flex flex-wrap items-start justify-between gap-2 rounded-r-md border-l-4 px-3 py-2',
        KIND_STYLES[event.kind],
        compact && 'py-1.5',
      )}
    >
      <section className="flex min-w-0 flex-1 gap-2">
        <KindIcon kind={event.kind} />
        <section className="min-w-0">
          <p className={cn('font-medium', compact && 'text-sm')}>{event.title}</p>
          <p className={cn('text-sm text-[var(--color-muted-foreground)]', compact && 'text-xs')}>
            {formatEventTime(event)}
          </p>
          {event.subtitle && (
            <p className={cn('text-sm text-[var(--color-muted-foreground)]', compact && 'text-xs')}>
              {event.subtitle}
            </p>
          )}
          {event.hasLate && block && 'ends_at' in block && typeof block.ends_at === 'string' && (
            <p className="text-xs text-amber-700">
              Scheduled until {format(parseISO(block.ends_at), 'h:mm a')}
            </p>
          )}
        </section>
      </section>
      <section className="flex flex-wrap items-center gap-1.5">
        {event.kind === 'shift' && (
          <>
            {isTpl && <Badge variant="outline">Usual day</Badge>}
            {event.hasLate && <Badge variant="warning">Worked late</Badge>}
          </>
        )}
        {event.kind === 'time_off' && event.timeOffStatus && (
          <Badge
            variant={
              event.timeOffStatus === 'approved'
                ? 'success'
                : event.timeOffStatus === 'denied'
                  ? 'destructive'
                  : 'warning'
            }
          >
            {event.timeOffStatus}
          </Badge>
        )}
        {event.kind === 'activity' && event.activityType && (
          <Badge variant="outline">{event.activityType}</Badge>
        )}
        {event.kind === 'shift' && isParent && onEditDay && item && (
          <Button size="sm" variant="outline" onClick={() => onEditDay(event)}>
            Change times
          </Button>
        )}
        {event.kind === 'shift' && isNanny && onReportLate && item && (
          <Button
            size="sm"
            variant="outline"
            disabled={materializingId === item.id}
            onClick={() => onReportLate(event)}
          >
            {materializingId === item.id ? 'Loading...' : 'Worked late'}
          </Button>
        )}
        {event.kind === 'shift' &&
          isParent &&
          block &&
          'status' in block &&
          block.status === 'scheduled' &&
          onCancel && (
          <Button size="sm" variant="ghost" onClick={() => onCancel(block.id)}>
            Cancel day
          </Button>
        )}
      </section>
    </li>
  )
}
