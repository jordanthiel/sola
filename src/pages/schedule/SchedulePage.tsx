import { useMemo, useState } from 'react'
import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  setHours,
  setMinutes,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { Plus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useChildActivities,
  useChildren,
  useMembers,
  useNannies,
  useScheduleBlocks,
  useScheduleTemplates,
  useTimeOffRequests,
} from '@/hooks/useHouseholdData'
import { enrichActivitiesWithAttendeeLabels } from '@/lib/plan-attendee'
import { useHouseholdHolidays } from '@/hooks/useHouseholdHolidays'
import { nannyDisplayName } from '@/lib/nanny'
import { mergeScheduleWithTemplates } from '@/lib/schedule'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import {
  buildCalendarEvents,
  eventsInRange,
  type CalendarEvent,
  type CalendarEventKind,
} from '@/lib/calendar-events'
import { PageHeader } from '@/components/layout/PageHeader'
import { CalendarDialog } from '@/components/schedule/CalendarDialog'
import { ScheduleViewToggle, type ScheduleViewMode } from '@/components/schedule/ScheduleViewToggle'
import { ScheduleDateNav } from '@/components/schedule/ScheduleDateNav'
import { ScheduleDayView } from '@/components/schedule/ScheduleDayView'
import { ScheduleWeekView } from '@/components/schedule/ScheduleWeekView'
import { ScheduleMonthView } from '@/components/schedule/ScheduleMonthView'
import { ScheduleListView } from '@/components/schedule/ScheduleListView'
import { Button } from '@/components/ui/button'
import type { CalendarDialogState, CalendarSlotDraft } from '@/types/calendar-dialog'

const LIST_RANGE = {
  from: addDays(startOfDay(new Date()), -14),
  to: addDays(startOfDay(new Date()), 42),
}

function rangeForView(viewMode: ScheduleViewMode, focusDate: Date) {
  if (viewMode === 'day') {
    return { from: startOfDay(focusDate), to: endOfDay(focusDate) }
  }
  if (viewMode === 'week') {
    const weekStart = startOfWeek(focusDate, { weekStartsOn: 1 })
    return { from: weekStart, to: endOfWeek(focusDate, { weekStartsOn: 1 }) }
  }
  if (viewMode === 'month') {
    return { from: startOfMonth(focusDate), to: endOfMonth(focusDate) }
  }
  return LIST_RANGE
}

export function SchedulePage() {
  const { user } = useAuth()
  const { data: members } = useMembers()
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('week')
  const [focusDate, setFocusDate] = useState(() => startOfDay(new Date()))
  const [dialogState, setDialogState] = useState<CalendarDialogState | null>(null)

  const visibleRange = useMemo(
    () => rangeForView(viewMode, focusDate),
    [viewMode, focusDate],
  )

  const fetchRange = useMemo(() => {
    const pad = addDays(visibleRange.from, -1)
    const padEnd = addDays(visibleRange.to, 1)
    return { from: pad.toISOString(), to: padEnd.toISOString() }
  }, [visibleRange])

  const { data: blocks, isLoading, isError, error } = useScheduleBlocks(
    fetchRange.from,
    fetchRange.to,
  )
  const { data: templates, isLoading: templatesLoading } = useScheduleTemplates()
  const { data: nannies } = useNannies()
  const { data: children } = useChildren()
  const { data: timeOff, isLoading: timeOffLoading } = useTimeOffRequests()
  const { data: holidayOverrides, isLoading: holidaysLoading } = useHouseholdHolidays()
  const { data: activities, isLoading: activitiesLoading } = useChildActivities(
    undefined,
    { from: fetchRange.from, to: fetchRange.to },
  )

  const nannyIds = useMemo(() => nannies?.map((n) => n.id) ?? [], [nannies])

  const merged = useMemo(() => {
    if (!blocks) return []
    const tpl = (templates ?? []) as NannyScheduleTemplate[]
    return mergeScheduleWithTemplates(
      blocks,
      tpl,
      addDays(visibleRange.from, -1),
      addDays(visibleRange.to, 1),
      nannyIds,
    )
  }, [blocks, templates, nannyIds, visibleRange])

  const allEvents = useMemo(() => {
    const nameFor = (householdNannyId: string | null) => {
      if (!householdNannyId) return 'Nanny'
      const n = nannies?.find((x) => x.id === householdNannyId)
      return n ? nannyDisplayName(n) : 'Nanny'
    }
    const activitiesWithAttendee = enrichActivitiesWithAttendeeLabels(activities ?? [], {
      members,
      nannies,
      currentUserId: user?.id,
      currentUserEmail: user?.email,
    })
    return buildCalendarEvents({
      scheduleItems: merged,
      timeOffRequests: timeOff ?? [],
      activities: activitiesWithAttendee,
      nannyName: nameFor,
      holidayOverrides: holidayOverrides ?? [],
      holidayRange: {
        from: addDays(visibleRange.from, -1),
        to: addDays(visibleRange.to, 1),
      },
    })
  }, [merged, timeOff, activities, members, nannies, user?.id, user?.email, holidayOverrides, visibleRange])

  const visibleEvents = useMemo(
    () => eventsInRange(allEvents, visibleRange.from, visibleRange.to),
    [allEvents, visibleRange],
  )

  const pageLoading =
    isLoading || templatesLoading || timeOffLoading || activitiesLoading || holidaysLoading

  function openEvent(event: CalendarEvent) {
    setDialogState({ mode: 'view', event })
  }

  function openCreate(slot?: CalendarSlotDraft, preferredKind?: CalendarEventKind) {
    if (slot) {
      setDialogState({
        mode: 'create',
        draft: slot,
        kind: preferredKind ?? (slot.allDay ? undefined : 'activity'),
      })
      return
    }
    const day = startOfDay(focusDate)
    const startsAt = setMinutes(setHours(day, 9), 0)
    const endsAt = setMinutes(setHours(day, 10), 0)
    setDialogState({ mode: 'create', draft: { day, startsAt, endsAt } })
  }

  function openCreateHolidayShift(dayInput: Date) {
    const day = startOfDay(dayInput)
    setDialogState({
      mode: 'create',
      kind: 'shift',
      draft: {
        day,
        startsAt: setMinutes(setHours(day, 9), 0),
        endsAt: setMinutes(setHours(day, 17), 0),
        holidayWorked: true,
      },
    })
  }

  function handleWeekDaySelect(day: Date) {
    setFocusDate(startOfDay(day))
    setViewMode('day')
  }

  function handleMonthDaySelect(day: Date) {
    setFocusDate(startOfDay(day))
    setViewMode('day')
  }

  const listEvents = allEvents

  return (
    <article className="space-y-6">
      <PageHeader
        title="Schedule"
        subtitle="Drag on the calendar to pick a time, or use Create. Click events to view, edit, or add notes."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => openCreate()}>
              <Plus className="mr-1 size-4" />
              Create
            </Button>
            <ScheduleViewToggle
              value={viewMode}
              onChange={(mode) => {
                setViewMode(mode)
                setDialogState(null)
              }}
            />
          </div>
        }
      />

      {viewMode !== 'list' && (
        <ScheduleDateNav
          viewMode={viewMode}
          focusDate={focusDate}
          onFocusDateChange={(d) => {
            setFocusDate(d)
            setDialogState(null)
          }}
        />
      )}

      {isError ? (
        <p className="text-sm text-red-600">
          Could not load schedule: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      ) : pageLoading ? (
        <p>Loading...</p>
      ) : viewMode === 'day' ? (
        <ScheduleDayView
          day={focusDate}
          events={visibleEvents}
          onSelectEvent={openEvent}
          onSlotSelect={(slot) => openCreate(slot)}
        />
      ) : viewMode === 'week' ? (
        <ScheduleWeekView
          focusDate={focusDate}
          events={visibleEvents}
          onSelectDay={handleWeekDaySelect}
          onSelectEvent={openEvent}
          onSlotSelect={(slot) => openCreate(slot)}
        />
      ) : viewMode === 'month' ? (
        <ScheduleMonthView
          focusDate={focusDate}
          events={visibleEvents}
          onSelectDay={handleMonthDaySelect}
          onSelectEvent={openEvent}
        />
      ) : (
        <ScheduleListView
          from={LIST_RANGE.from}
          to={LIST_RANGE.to}
          events={listEvents}
          onSelectEvent={openEvent}
          onSlotClick={(day) => {
            const d = startOfDay(day)
            openCreate({
              day: d,
              startsAt: setMinutes(setHours(d, 9), 0),
              endsAt: setMinutes(setHours(d, 10), 0),
            })
          }}
        />
      )}

      <CalendarDialog
        state={dialogState}
        onClose={() => setDialogState(null)}
        onCreateHolidayShift={openCreateHolidayShift}
        nannies={nannies}
        childrenList={children}
        scheduleItems={merged}
      />
    </article>
  )
}
