import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { addHours, format, parseISO, startOfDay } from 'date-fns'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import type { useCalendarMutations } from '@/hooks/useCalendarMutations'
import { formatSupabaseError } from '@/lib/errors'
import {
  combineDateAndTime,
  defaultPlanDatetimeRange,
  fromDatetimeLocalValue,
  snapToNextHalfHour,
  toDateInputValue,
  toDatetimeLocalValue,
  toTimeInputValue,
} from '@/lib/calendar-slot'
import {
  defaultPlanAttendee,
  defaultPlanAttendeeFromSchedule,
  planAttendeeFromFields,
  planAttendeeToFields,
  type PlanAttendeeValue,
  type ScheduleCoverageItem,
} from '@/lib/plan-attendee'
import { PlanAttendeeSelect } from '@/components/activities/PlanAttendeeSelect'
import type { CalendarEventKind } from '@/lib/calendar-events'
import { isTemplateOccurrence } from '@/lib/schedule'
import type { CalendarDialogState } from '@/types/calendar-dialog'
import type { HouseholdNanny } from '@/types/household-nanny'
import { nannyDisplayName } from '@/lib/nanny'
import { ChildrenMultiSelect } from '@/components/activities/ChildrenMultiSelect'
import {
  activityTypeLabel,
  minutesBetween,
  PLANNED_ACTIVITY_TYPES,
} from '@/lib/child-plans'
import { insertChildPlan } from '@/lib/child-plans-multi'
import { invalidateCalendarQueries } from '@/lib/invalidate-calendar'
import {
  dayOfWeekFromDatetimeLocal,
  PLAN_REPEAT_OPTIONS,
  timeFromDatetimeLocal,
  weeklyRepeatLabel,
  type PlanRepeatMode,
} from '@/lib/plan-repeat'
import { recurringPlanScheduleFromStartsAt } from '@/lib/recurring-plans'
import { supabase } from '@/lib/supabase'
import type { ActivityType, Child, MoodType, TimeOffType } from '@/types/database'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { DateTimePicker } from '@/components/ui/datetime-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TimePicker } from '@/components/ui/time-picker'
import { Textarea } from '@/components/ui/textarea'
import { DialogFooter } from '@/components/ui/dialog'
import { selectCn } from '@/lib/utils'

const MOODS: MoodType[] = ['happy', 'calm', 'fussy', 'tired', 'sick']
const TIME_OFF_TYPES: TimeOffType[] = ['sick', 'pto', 'unpaid', 'vacation']

const selectClass = 'flex h-10 w-full rounded-md border border-[var(--color-border)] bg-transparent px-3 text-sm'

function currencyToCents(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null
}

export function CalendarEventForm({
  state,
  nannies,
  childrenList,
  scheduleItems,
  myNannyId,
  mutations,
  onSaved,
  onCancel,
}: {
  state: CalendarDialogState
  nannies: HouseholdNanny[] | undefined
  childrenList: Child[] | undefined
  scheduleItems?: ScheduleCoverageItem[]
  myNannyId?: string
  mutations: ReturnType<typeof useCalendarMutations>
  onSaved: () => void
  onCancel: () => void
}) {
  const { user } = useAuth()
  const { isParent, isNanny, activeHousehold } = useHousehold()
  const defaultPlanTimes = defaultPlanDatetimeRange()
  const qc = useQueryClient()
  const isCreate = state.mode === 'create'
  const event = state.mode !== 'create' ? state.event : null
  const scheduleBlock =
    event?.scheduleItem && !isTemplateOccurrence(event.scheduleItem) ? event.scheduleItem : null

  const defaultKind: CalendarEventKind =
    state.mode === 'create'
      ? (state.kind ?? 'activity')
      : event!.kind

  const [kind, setKind] = useState<CalendarEventKind>(defaultKind)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const draft = state.mode === 'create' ? state.draft : null
  const baseDay = event ? startOfDay(event.startsAt) : draft ? draft.day : startOfDay(new Date())

  const [nannyId, setNannyId] = useState(
    event?.householdNannyId ?? myNannyId ?? nannies?.[0]?.id ?? '',
  )
  const [workDate, setWorkDate] = useState(toDateInputValue(baseDay))
  const [startTime, setStartTime] = useState(
    event ? toTimeInputValue(event.startsAt) : draft ? toTimeInputValue(draft.startsAt) : '09:00',
  )
  const [endTime, setEndTime] = useState(
    event ? toTimeInputValue(event.endsAt) : draft ? toTimeInputValue(draft.endsAt) : '17:00',
  )
  const [notes, setNotes] = useState(event?.description ?? event?.subtitle ?? '')
  const [isOvernightShift, setIsOvernightShift] = useState(scheduleBlock?.is_overnight ?? false)
  const [shiftOvernightRate, setShiftOvernightRate] = useState(
    scheduleBlock?.overnight_rate_cents == null
      ? ''
      : (scheduleBlock.overnight_rate_cents / 100).toFixed(2),
  )
  const [shiftOvernightStartTime, setShiftOvernightStartTime] = useState(
    scheduleBlock?.overnight_start_time?.slice(0, 5) ?? '',
  )
  const [shiftOvernightEndTime, setShiftOvernightEndTime] = useState(
    scheduleBlock?.overnight_end_time?.slice(0, 5) ?? '',
  )
  const [holidayWorked, setHolidayWorked] = useState(
    scheduleBlock?.holiday_worked ?? draft?.holidayWorked ?? false,
  )

  const [timeOffType, setTimeOffType] = useState<TimeOffType>(event?.timeOffType ?? 'pto')
  const [startsOn, setStartsOn] = useState(
    event ? toDateInputValue(event.startsAt) : toDateInputValue(baseDay),
  )
  const [endsOn, setEndsOn] = useState(
    event ? toDateInputValue(event.endsAt) : toDateInputValue(baseDay),
  )
  const [hours, setHours] = useState(String(event?.timeOffHours ?? 8))
  const [nannyJoinsVacation, setNannyJoinsVacation] = useState(
    event?.timeOffNannyJoinsVacation ?? false,
  )
  const [vacationDailyRate, setVacationDailyRate] = useState(
    event?.timeOffVacationRateCents == null
      ? ''
      : (event.timeOffVacationRateCents / 100).toFixed(2),
  )

  const [selectedChildIds, setSelectedChildIds] = useState<string[]>(
    event?.childIds?.length ? event.childIds : event?.childId ? [event.childId] : [],
  )
  const [activityType, setActivityType] = useState<ActivityType>(event?.activityType ?? 'gymnastics')
  const [title, setTitle] = useState(event?.title ?? '')
  const [planNotes, setPlanNotes] = useState(event?.description ?? '')
  const [planStartsAt, setPlanStartsAt] = useState(
    event
      ? toDatetimeLocalValue(event.startsAt)
      : draft
        ? toDatetimeLocalValue(snapToNextHalfHour(draft.startsAt))
        : defaultPlanTimes.startsAt,
  )
  const [planEndsAt, setPlanEndsAt] = useState(
    event
      ? toDatetimeLocalValue(event.endsAt)
      : draft
        ? toDatetimeLocalValue(
            draft.endsAt > draft.startsAt ? draft.endsAt : addHours(snapToNextHalfHour(draft.startsAt), 1),
          )
        : defaultPlanTimes.endsAt,
  )
  const [planAttendee, setPlanAttendee] = useState<PlanAttendeeValue>(() =>
    event
      ? planAttendeeFromFields({
          attendee_user_id: event.attendeeUserId ?? null,
          attendee_household_nanny_id: event.attendeeHouseholdNannyId ?? null,
        })
      : defaultPlanAttendee({ userId: user?.id, isNanny, myNannyId: myNannyId }),
  )
  const [mood, setMood] = useState<MoodType | ''>(event?.mood ?? '')
  const [repeatMode, setRepeatMode] = useState<PlanRepeatMode>('none')
  const [repeatUntil, setRepeatUntil] = useState('')

  const [actualEndTime, setActualEndTime] = useState(
    event?.scheduleItem && !isTemplateOccurrence(event.scheduleItem)
      ? event.scheduleItem.actual_ends_at
        ? toTimeInputValue(parseISO(event.scheduleItem.actual_ends_at))
        : toTimeInputValue(event.endsAt)
      : '17:00',
  )

  useEffect(() => {
    setKind(defaultKind)
    setError('')
    const ev = state.mode !== 'create' ? state.event : null
    const block =
      ev?.scheduleItem && !isTemplateOccurrence(ev.scheduleItem) ? ev.scheduleItem : null
    setNotes(ev?.description ?? ev?.subtitle ?? '')
    setIsOvernightShift(block?.is_overnight ?? false)
    setShiftOvernightRate(
      block?.overnight_rate_cents == null ? '' : (block.overnight_rate_cents / 100).toFixed(2),
    )
    setShiftOvernightStartTime(block?.overnight_start_time?.slice(0, 5) ?? '')
    setShiftOvernightEndTime(block?.overnight_end_time?.slice(0, 5) ?? '')
    setHolidayWorked(block?.holiday_worked ?? (state.mode === 'create' ? state.draft?.holidayWorked ?? false : false))
    setTimeOffType(ev?.timeOffType ?? 'pto')
    setHours(String(ev?.timeOffHours ?? 8))
    setNannyJoinsVacation(ev?.timeOffNannyJoinsVacation ?? false)
    setVacationDailyRate(
      ev?.timeOffVacationRateCents == null ? '' : (ev.timeOffVacationRateCents / 100).toFixed(2),
    )
    setSelectedChildIds(
      ev?.childIds?.length ? ev.childIds : ev?.childId ? [ev.childId] : [],
    )
    if (ev) {
      setPlanAttendee(
        planAttendeeFromFields({
          attendee_user_id: ev.attendeeUserId ?? null,
          attendee_household_nanny_id: ev.attendeeHouseholdNannyId ?? null,
        }),
      )
    }
  }, [state, defaultKind])

  useEffect(() => {
    if (state.mode !== 'create' || kind !== 'activity') return
    setPlanAttendee(
      defaultPlanAttendeeFromSchedule({
        scheduleItems: scheduleItems ?? [],
        planStartsAt: fromDatetimeLocalValue(planStartsAt),
        nannies,
        userId: user?.id,
        isNanny,
        myNannyId,
      }),
    )
  }, [state.mode, kind, planStartsAt, scheduleItems, nannies, user?.id, isNanny, myNannyId])

  useEffect(() => {
    if (state.mode !== 'create' || !state.draft || state.draft.allDay) return
    const snappedStart = snapToNextHalfHour(state.draft.startsAt)
    setPlanStartsAt(toDatetimeLocalValue(snappedStart))
    setPlanEndsAt(
      toDatetimeLocalValue(
        state.draft.endsAt > state.draft.startsAt
          ? state.draft.endsAt
          : addHours(snappedStart, 1),
      ),
    )
    setStartTime(toTimeInputValue(state.draft.startsAt))
    setEndTime(toTimeInputValue(state.draft.endsAt))
    setWorkDate(toDateInputValue(state.draft.day))
  }, [state])

  const allowedKinds: CalendarEventKind[] = isParent
    ? ['shift', 'time_off', 'activity']
    : isNanny
      ? ['time_off', 'activity']
      : ['activity']

  const timeOffTypeOptions = isParent
    ? TIME_OFF_TYPES
    : TIME_OFF_TYPES.filter((t) => t !== 'vacation')

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      if (kind === 'shift' && isNanny && !isCreate) {
        await handleReportLate()
        return
      }
      if (kind === 'shift') {
        if (!isParent) throw new Error('Only parents can manage shifts')
        if (!nannyId) throw new Error('Select a nanny')
        const day = new Date(workDate + 'T12:00:00')
        const startsAt = combineDateAndTime(day, startTime)
        let endsAt = combineDateAndTime(day, endTime)
        if (endsAt <= startsAt) endsAt = addHours(endsAt, 24)
        await mutations.upsertShift.mutateAsync({
          householdNannyId: nannyId,
          workDate: day,
          startsAt,
          endsAt,
          notes: notes.trim() || null,
          isOvernight: isOvernightShift,
          overnightRateCents: isOvernightShift ? currencyToCents(shiftOvernightRate) : null,
          overnightStartTime: isOvernightShift ? shiftOvernightStartTime || null : null,
          overnightEndTime: isOvernightShift ? shiftOvernightEndTime || null : null,
          holidayWorked,
        })
      } else if (kind === 'time_off') {
        const nid = isNanny ? myNannyId : nannyId
        if (!nid) throw new Error('Nanny profile required')
        const isVacation = timeOffType === 'vacation'
        const vacationRateCents = isVacation ? currencyToCents(vacationDailyRate) : null
        if (isCreate) {
          await mutations.createTimeOff.mutateAsync({
            householdNannyId: nid,
            type: timeOffType,
            startsOn,
            endsOn,
            hours: parseFloat(hours),
            notes: notes.trim() || null,
            status: isParent ? 'approved' : 'pending',
            nannyJoinsVacation: isVacation ? nannyJoinsVacation : false,
            vacationDailyRateCents: vacationRateCents,
          })
        } else if (event?.sourceId) {
          await mutations.updateTimeOff.mutateAsync({
            id: event.sourceId,
            type: timeOffType,
            startsOn,
            endsOn,
            hours: parseFloat(hours),
            notes: notes.trim() || null,
            nannyJoinsVacation: isVacation ? nannyJoinsVacation : false,
            vacationDailyRateCents: vacationRateCents,
          })
        }
      } else {
        if (!selectedChildIds.length) throw new Error('Select at least one child')
        if (!title.trim()) throw new Error('Title is required')
        const start = fromDatetimeLocalValue(planStartsAt)
        const end = fromDatetimeLocalValue(planEndsAt)
        if (end <= start) throw new Error('End time must be after start time')
        const durationMinutes = minutesBetween(start, end)
        const attendee = planAttendeeToFields(planAttendee)
        if (isCreate && repeatMode === 'weekly') {
          const schedule = recurringPlanScheduleFromStartsAt(planStartsAt, repeatUntil)
          const { error } = await supabase.from('recurring_child_plans').insert({
            household_id: activeHousehold!.id,
            title: title.trim(),
            activity_type: activityType,
            description: planNotes.trim() || null,
            day_of_week: dayOfWeekFromDatetimeLocal(planStartsAt),
            start_time: timeFromDatetimeLocal(planStartsAt),
            duration_minutes: durationMinutes,
            child_ids: selectedChildIds,
            created_by: user!.id,
            ...attendee,
            ...schedule,
          })
          if (error) throw error
          const { error: genError } = await supabase.rpc('generate_recurring_child_plans', {
            p_household_id: activeHousehold!.id,
          })
          if (genError) throw genError
          await qc.invalidateQueries({ queryKey: ['schedule'] })
          await qc.invalidateQueries({ queryKey: ['activities'] })
          await qc.invalidateQueries({ queryKey: ['recurring_plans'] })
        } else if (isCreate) {
          await insertChildPlan({
            householdId: activeHousehold!.id,
            childIds: selectedChildIds,
            loggedBy: user!.id,
            activityType,
            title: title.trim(),
            description: planNotes.trim() || null,
            occurredAt: start.toISOString(),
            durationMinutes,
            ...attendee,
          })
          invalidateCalendarQueries(qc)
        } else if (event?.sourceId) {
          await mutations.updateActivity.mutateAsync({
            id: event.sourceId,
            childId: selectedChildIds[0],
            activityType,
            title: title.trim(),
            description: planNotes.trim() || null,
            occurredAt: start,
            durationMinutes,
            mood: mood || null,
            ...attendee,
          })
        }
      }
      onSaved()
    } catch (e) {
      setError(formatSupabaseError(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleReportLate() {
    if (!event?.scheduleItem) return
    setError('')
    setSaving(true)
    try {
      let blockId = event.sourceId
      if (isTemplateOccurrence(event.scheduleItem)) {
        const block = await mutations.materializeTemplate.mutateAsync(event.scheduleItem)
        blockId = block.id
      }
      if (!blockId) throw new Error('Could not find shift')
      const day = startOfDay(event.startsAt)
      const scheduledEnd = isTemplateOccurrence(event.scheduleItem)
        ? event.scheduleItem.ends_at
        : parseISO(event.scheduleItem.ends_at)
      const actualEnd = combineDateAndTime(day, actualEndTime)
      if (actualEnd < scheduledEnd) {
        throw new Error('End time must be at or after the scheduled end')
      }
      await mutations.reportLate.mutateAsync({
        scheduleBlockId: blockId,
        actualEndsAt: actualEnd,
        notes: notes.trim() || null,
      })
      onSaved()
    } catch (e) {
      setError(formatSupabaseError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        handleSave()
      }}
    >
      {isCreate && (
        <fieldset className="space-y-2">
          <Label>Event type</Label>
          <select
            className={selectClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as CalendarEventKind)}
          >
            {allowedKinds.map((k) => (
              <option key={k} value={k}>
                {k === 'shift' ? 'Nanny shift' : k === 'time_off' ? 'Time off' : "Kid's plan"}
              </option>
            ))}
          </select>
        </fieldset>
      )}

      {kind === 'shift' && isParent && (
        <>
          <fieldset className="space-y-2">
            <Label>Nanny</Label>
            <select className={selectClass} value={nannyId} onChange={(e) => setNannyId(e.target.value)}>
              {nannies?.map((n) => (
                <option key={n.id} value={n.id}>
                  {nannyDisplayName(n)}
                </option>
              ))}
            </select>
          </fieldset>
          <fieldset className="space-y-2">
            <Label>Date</Label>
            <DatePicker value={workDate} onChange={setWorkDate} />
          </fieldset>
          <section className="grid grid-cols-2 gap-4">
            <fieldset className="space-y-2">
              <Label>Start</Label>
              <TimePicker value={startTime} onChange={setStartTime} />
            </fieldset>
            <fieldset className="space-y-2">
              <Label>End</Label>
              <TimePicker value={endTime} onChange={setEndTime} />
            </fieldset>
          </section>
          <fieldset className="space-y-3 rounded-md border p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={isOvernightShift}
                onChange={(e) => setIsOvernightShift(e.target.checked)}
              />
              <span>
                <span className="font-medium">Overnight stay</span>
                <span className="mt-0.5 block text-sm text-[var(--color-muted-foreground)]">
                  Use overnight pay settings for this shift. Optional overrides below apply only to
                  this calendar day.
                </span>
              </span>
            </label>
            {isOvernightShift && (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Overnight rate ($/hr)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={shiftOvernightRate}
                    onChange={(e) => setShiftOvernightRate(e.target.value)}
                    placeholder="Use default"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Overnight starts</Label>
                  <Input
                    type="time"
                    value={shiftOvernightStartTime}
                    onChange={(e) => setShiftOvernightStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Overnight ends</Label>
                  <Input
                    type="time"
                    value={shiftOvernightEndTime}
                    onChange={(e) => setShiftOvernightEndTime(e.target.value)}
                  />
                </div>
              </div>
            )}
          </fieldset>
          <fieldset className="space-y-3 rounded-md border p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={holidayWorked}
                onChange={(e) => setHolidayWorked(e.target.checked)}
              />
              <span>
                <span className="font-medium">Nanny actually worked this holiday</span>
                <span className="mt-0.5 block text-sm text-[var(--color-muted-foreground)]">
                  If this date is a paid holiday, these shift hours count toward the period total and
                  overtime threshold in addition to the automatic full-day holiday hours.
                </span>
              </span>
            </label>
          </fieldset>
          <fieldset className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </fieldset>
        </>
      )}

      {kind === 'time_off' && (
        <>
          {isParent && (
            <fieldset className="space-y-2">
              <Label>Nanny</Label>
              <select className={selectClass} value={nannyId} onChange={(e) => setNannyId(e.target.value)}>
                {nannies?.map((n) => (
                  <option key={n.id} value={n.id}>
                    {nannyDisplayName(n)}
                  </option>
                ))}
              </select>
            </fieldset>
          )}
          <fieldset className="space-y-2">
            <Label>Type</Label>
            <select
              className={selectClass}
              value={timeOffType}
              onChange={(e) => setTimeOffType(e.target.value as TimeOffType)}
            >
              {timeOffTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t === 'pto' ? 'PTO' : t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </fieldset>
          <section className="grid grid-cols-2 gap-4">
            <fieldset className="space-y-2">
              <Label>Start date</Label>
              <DatePicker value={startsOn} onChange={setStartsOn} />
            </fieldset>
            <fieldset className="space-y-2">
              <Label>End date</Label>
              <DatePicker value={endsOn} onChange={setEndsOn} min={startsOn || undefined} />
            </fieldset>
          </section>
          <fieldset className="space-y-2">
            <Label>{timeOffType === 'vacation' ? 'Hours (for records)' : 'Hours'}</Label>
            <Input type="number" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
          </fieldset>
          {timeOffType === 'vacation' && (
            <fieldset className="space-y-3 rounded-md border p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={nannyJoinsVacation}
                  onChange={(e) => setNannyJoinsVacation(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Nanny joins this vacation</span>
                  <span className="mt-0.5 block text-sm text-[var(--color-muted-foreground)]">
                    Approved vacation days with a daily rate are included in payroll for the period.
                  </span>
                </span>
              </label>
              {nannyJoinsVacation && (
                <div className="space-y-2">
                  <Label>Vacation rate ($/day)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={vacationDailyRate}
                    onChange={(e) => setVacationDailyRate(e.target.value)}
                    placeholder="Use nanny default"
                  />
                </div>
              )}
            </fieldset>
          )}
          <fieldset className="space-y-2">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </fieldset>
        </>
      )}

      {kind === 'activity' && (
        <>
          <section className="grid gap-4 md:grid-cols-2">
            <fieldset className="space-y-2 md:col-span-2">
              <Label htmlFor="calendar-plan-children">Children</Label>
              <ChildrenMultiSelect
                id="calendar-plan-children"
                children={childrenList ?? []}
                value={selectedChildIds}
                onChange={setSelectedChildIds}
              />
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {selectedChildIds.length === 0
                  ? 'Choose one or more children, or select All children.'
                  : selectedChildIds.length === childrenList?.length
                    ? 'All children selected.'
                    : `${selectedChildIds.length} selected.`}
              </p>
            </fieldset>
            <fieldset className="space-y-2">
              <Label>Category</Label>
              <select
                className={selectCn}
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as ActivityType)}
              >
                {PLANNED_ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {activityTypeLabel(t)}
                  </option>
                ))}
              </select>
            </fieldset>
          </section>
          <fieldset className="space-y-2">
            <Label>What&apos;s planned</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Gymnastics, Library, Music class..."
            />
          </fieldset>
          <PlanAttendeeSelect id="calendar-plan-attendee" value={planAttendee} onChange={setPlanAttendee} />
          <section className="grid gap-4 md:grid-cols-2">
            <fieldset className="space-y-2">
              <Label>{isCreate && repeatMode === 'weekly' ? 'First occurrence' : 'Starts'}</Label>
              <DateTimePicker value={planStartsAt} onChange={setPlanStartsAt} minuteStep={30} />
            </fieldset>
            <fieldset className="space-y-2">
              <Label>Ends</Label>
              <DateTimePicker value={planEndsAt} onChange={setPlanEndsAt} minuteStep={30} />
            </fieldset>
          </section>
          {isCreate && (
            <fieldset className="space-y-2">
              <Label>Repeat</Label>
              <select
                className={selectCn}
                value={repeatMode}
                onChange={(e) => setRepeatMode(e.target.value as PlanRepeatMode)}
              >
                {PLAN_REPEAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value === 'weekly' ? weeklyRepeatLabel(planStartsAt) : o.label}
                  </option>
                ))}
              </select>
              {repeatMode === 'weekly' && (
                <>
                  <fieldset className="space-y-2">
                    <Label htmlFor="calendar-repeat-until">Repeat until (optional)</Label>
                    <DatePicker
                      id="calendar-repeat-until"
                      value={repeatUntil}
                      min={format(fromDatetimeLocalValue(planStartsAt), 'yyyy-MM-dd')}
                      onChange={setRepeatUntil}
                    />
                  </fieldset>
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Repeats at the same time each {format(fromDatetimeLocalValue(planStartsAt), 'EEEE')}
                    {repeatUntil
                      ? `, through ${format(new Date(repeatUntil + 'T12:00:00'), 'MMM d, yyyy')}.`
                      : '. Leave the end date blank to keep repeating.'}{' '}
                    Upcoming dates are added to the schedule automatically.
                  </p>
                </>
              )}
            </fieldset>
          )}
          <fieldset className="space-y-2">
            <Label>Notes {isCreate ? '(optional — add later)' : '(optional)'}</Label>
            <Textarea
              value={planNotes}
              onChange={(e) => setPlanNotes(e.target.value)}
              rows={2}
              placeholder="What to bring, pickup info, how it went..."
            />
          </fieldset>
          {!isCreate && (
            <fieldset className="space-y-2">
              <Label>Afterwards (optional)</Label>
              <select
                className={selectClass}
                value={mood}
                onChange={(e) => setMood(e.target.value as MoodType | '')}
              >
                <option value="">—</option>
                {MOODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </fieldset>
          )}
        </>
      )}

      {kind === 'shift' && isNanny && event && !isCreate && (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm font-medium text-amber-900">Worked late?</p>
          <Label>Actual end time</Label>
          <TimePicker value={actualEndTime} onChange={setActualEndTime} />
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={handleReportLate}>
            Save actual end
          </Button>
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            saving ||
            (kind === 'activity' && isCreate && (!selectedChildIds.length || !title.trim()))
          }
        >
          {saving
            ? 'Saving...'
            : isCreate && kind === 'activity'
              ? repeatMode === 'weekly'
                ? 'Save repeating plan'
                : 'Save plan'
              : isCreate
                ? 'Create'
                : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  )
}
