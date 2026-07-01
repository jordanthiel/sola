import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { CalendarEvent } from '@/lib/calendar-events'
import { eventColors, eventTimeLabel } from '@/lib/calendar-grid'
import { formatSupabaseError } from '@/lib/errors'
import type { useCalendarMutations } from '@/hooks/useCalendarMutations'
import { TimeOffReviewActions } from '@/components/time-off/TimeOffReviewActions'
import { PlanPeopleChips } from '@/components/activities/PlanPeopleChips'
import { TimeOffReviewNotesDisplay } from '@/components/time-off/time-off-notes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const KIND_LABELS = {
  shift: 'Nanny shift',
  time_off: 'Time off',
  activity: "Kid's plan",
  holiday: 'Paid holiday',
} as const

export function CalendarEventView({
  event,
  isParent,
  isNanny,
  onEdit,
  onReportLate,
  onClose,
  mutations,
}: {
  event: CalendarEvent
  isParent: boolean
  isNanny: boolean
  onEdit: () => void
  onReportLate?: () => void
  onClose: () => void
  mutations: ReturnType<typeof useCalendarMutations>
}) {
  const colors = eventColors(event)
  const [error, setError] = useState('')
  const pending = mutations.deleteTimeOff.isPending

  const isHoliday = event.kind === 'holiday'

  const canEditShift = isParent && event.kind === 'shift'
  const canEditTimeOff =
    event.kind === 'time_off' && (isParent || (isNanny && event.timeOffStatus === 'pending'))
  const canEditActivity = event.kind === 'activity'
  const canEdit = canEditShift || canEditTimeOff || canEditActivity

  const canDelete =
    (event.kind === 'shift' && event.sourceId && !event.isTemplate) ||
    (event.kind === 'time_off' &&
      event.sourceId &&
      (isParent || event.timeOffStatus === 'pending')) ||
    (event.kind === 'activity' && event.sourceId)

  async function handleDelete() {
    setError('')
    try {
      if (event.kind === 'shift' && event.sourceId) {
        if (!confirm('Cancel this scheduled day?')) return
        await mutations.cancelShift.mutateAsync(event.sourceId)
      } else if (event.kind === 'time_off' && event.sourceId) {
        if (!confirm('Delete this time off request?')) return
        await mutations.deleteTimeOff.mutateAsync(event.sourceId)
      } else if (event.kind === 'activity') {
        const ids = event.sourceIds?.length ? event.sourceIds : event.sourceId ? [event.sourceId] : []
        if (!ids.length) return
        if (!confirm(ids.length > 1 ? 'Delete this plan for all children?' : 'Delete this activity?')) return
        for (const id of ids) {
          await mutations.deleteActivity.mutateAsync(id)
        }
      }
      onClose()
    } catch (e) {
      setError(formatSupabaseError(e))
    }
  }

  return (
    <>
      <article className={cn('rounded-md border-l-4 px-3 py-2', colors.bg, colors.border)}>
        <p className="text-xs font-medium uppercase tracking-wide opacity-70">{KIND_LABELS[event.kind]}</p>
        <p className="font-semibold">{event.title}</p>
        {event.kind === 'activity' && (
          <PlanPeopleChips
            children={event.childAttendees}
            attendeeLabel={event.attendeeLabel}
            className="mt-1"
          />
        )}
        {event.subtitle && <p className="text-sm opacity-80">{event.subtitle}</p>}
        <p className="mt-1 text-sm">{eventTimeLabel(event)}</p>
        {event.description && (
          <p className="mt-2 text-sm">
            <span className="font-medium">Request note:</span> {event.description}
          </p>
        )}
        {event.kind === 'time_off' && (
          <div className="mt-2">
            <TimeOffReviewNotesDisplay notes={event.timeOffReviewNotes ?? null} />
          </div>
        )}
        {event.timeOffStatus && (
          <Badge
            className="mt-2"
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
        {event.hasLate && (
          <Badge className="mt-2 ml-1" variant="warning">
            Worked late
          </Badge>
        )}
        {event.isTemplate && (
          <Badge className="mt-2 ml-1" variant="outline">
            Usual day
          </Badge>
        )}
      </article>

      {isParent && event.kind === 'time_off' && event.timeOffStatus === 'pending' && event.sourceId && (
        <TimeOffReviewActions
          requestId={event.sourceId}
          onComplete={onClose}
          invalidateCalendar
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {isHoliday && isParent && (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Change which holidays are off in{' '}
          <Link to="/settings" className="font-medium text-[var(--color-primary)] underline-offset-2 hover:underline">
            Settings → Nanny holidays
          </Link>
          .
        </p>
      )}

      <DialogFooter className="flex-wrap gap-2">
        <span className="flex-1" />
        {isNanny && event.kind === 'shift' && onReportLate && (
          <Button size="sm" variant="outline" onClick={onReportLate}>
            Worked late
          </Button>
        )}
        {canEdit && (
          <Button size="sm" variant="outline" onClick={onEdit}>
            Edit
          </Button>
        )}
        {canDelete && (
          <Button size="sm" variant="destructive" disabled={pending} onClick={handleDelete}>
            Delete
          </Button>
        )}
        <Button size="sm" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
  )
}
