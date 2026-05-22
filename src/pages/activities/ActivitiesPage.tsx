import { useEffect, useMemo, useState } from 'react'
import { addDays, format, parseISO, startOfDay } from 'date-fns'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import {
  useChildActivities,
  useChildren,
  useMembers,
  useMergedSchedule,
  useMyHouseholdNanny,
  useNannies,
} from '@/hooks/useHouseholdData'
import { PageHeader } from '@/components/layout/PageHeader'
import { ChildrenMultiSelect } from '@/components/activities/ChildrenMultiSelect'
import { RecurringPlansCard } from '@/components/activities/RecurringPlansCard'
import { insertChildPlan } from '@/lib/child-plans-multi'
import {
  activityTypeLabel,
  minutesBetween,
  PLANNED_ACTIVITY_TYPES,
} from '@/lib/child-plans'
import { defaultPlanDatetimeRange, fromDatetimeLocalValue } from '@/lib/calendar-slot'
import {
  defaultPlanAttendeeFromSchedule,
  formatPlanAttendeeLabel,
  planAttendeeToFields,
  type PlanAttendeeValue,
} from '@/lib/plan-attendee'
import { PlanAttendeeSelect } from '@/components/activities/PlanAttendeeSelect'
import {
  dayOfWeekFromDatetimeLocal,
  PLAN_REPEAT_OPTIONS,
  timeFromDatetimeLocal,
  weeklyRepeatLabel,
  type PlanRepeatMode,
} from '@/lib/plan-repeat'
import { recurringPlanScheduleFromStartsAt } from '@/lib/recurring-plans'
import { formatSupabaseError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { DateTimePicker } from '@/components/ui/datetime-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn, selectCn } from '@/lib/utils'
import type { ActivityType, MoodType } from '@/types/database'

const defaultPlanTimes = defaultPlanDatetimeRange()

export function ActivitiesPage() {
  const { user } = useAuth()
  const { activeHousehold, isNanny } = useHousehold()
  const { data: children } = useChildren()
  const { data: members } = useMembers()
  const { data: nannies } = useNannies()
  const { data: myNanny } = useMyHouseholdNanny()
  const [childFilter, setChildFilter] = useState('')
  const { data: activities, isLoading } = useChildActivities(childFilter || undefined)
  const qc = useQueryClient()

  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([])
  const [activityType, setActivityType] = useState<ActivityType>('gymnastics')
  const [title, setTitle] = useState('')
  const [planNotes, setPlanNotes] = useState('')
  const [repeatMode, setRepeatMode] = useState<PlanRepeatMode>('none')
  const [repeatUntil, setRepeatUntil] = useState('')
  const [planStartsAt, setPlanStartsAt] = useState(defaultPlanTimes.startsAt)
  const [planEndsAt, setPlanEndsAt] = useState(defaultPlanTimes.endsAt)
  const [planAttendee, setPlanAttendee] = useState<PlanAttendeeValue>('')

  const scheduleRange = useMemo(() => {
    const start = fromDatetimeLocalValue(planStartsAt)
    return {
      from: addDays(startOfDay(start), -1),
      to: addDays(startOfDay(start), 2),
    }
  }, [planStartsAt])

  const { data: scheduleItems = [] } = useMergedSchedule(scheduleRange)

  useEffect(() => {
    setPlanAttendee(
      defaultPlanAttendeeFromSchedule({
        scheduleItems,
        planStartsAt: fromDatetimeLocalValue(planStartsAt),
        nannies,
        userId: user?.id,
        isNanny,
        myNannyId: myNanny?.id,
      }),
    )
  }, [planStartsAt, scheduleItems, nannies, user?.id, isNanny, myNanny?.id])

  const childIdsForPlan = selectedChildIds

  const savePlan = useMutation({
    mutationFn: async () => {
      if (!childIdsForPlan.length) throw new Error('Select at least one child')
      const start = fromDatetimeLocalValue(planStartsAt)
      const end = fromDatetimeLocalValue(planEndsAt)
      if (end <= start) throw new Error('End time must be after start time')

      const attendee = planAttendeeToFields(planAttendee)

      if (repeatMode === 'none') {
        await insertChildPlan({
          householdId: activeHousehold!.id,
          childIds: childIdsForPlan,
          loggedBy: user!.id,
          activityType,
          title,
          description: planNotes || null,
          occurredAt: start.toISOString(),
          durationMinutes: minutesBetween(start, end),
          ...attendee,
        })
        return
      }

      const schedule = recurringPlanScheduleFromStartsAt(planStartsAt, repeatUntil)
      const { error } = await supabase.from('recurring_child_plans').insert({
        household_id: activeHousehold!.id,
        title,
        activity_type: activityType,
        description: planNotes || null,
        day_of_week: dayOfWeekFromDatetimeLocal(planStartsAt),
        start_time: timeFromDatetimeLocal(planStartsAt),
        duration_minutes: minutesBetween(start, end),
        child_ids: childIdsForPlan,
        created_by: user!.id,
        ...attendee,
        ...schedule,
      })
      if (error) throw error

      const { error: genError } = await supabase.rpc('generate_recurring_child_plans', {
        p_household_id: activeHousehold!.id,
      })
      if (genError) throw genError
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities'] })
      qc.invalidateQueries({ queryKey: ['recurring_plans'] })
      setTitle('')
      setPlanNotes('')
      toast.success(repeatMode === 'none' ? 'Plan added' : 'Repeating plan saved')
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const now = Date.now()
  const upcoming =
    activities?.filter((a) => parseISO(a.occurred_at).getTime() >= now - 30 * 60 * 1000) ?? []
  const past =
    activities?.filter((a) => parseISO(a.occurred_at).getTime() < now - 30 * 60 * 1000) ?? []

  return (
    <article className="space-y-6">
      <PageHeader
        title="Kids' plans"
        subtitle="Schedule what's coming up — gymnastics, library, appointments. Add notes from the calendar or here."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="grid gap-4 md:grid-cols-2">
            <fieldset className="space-y-2 md:col-span-2">
              <Label htmlFor="plan-children">Children</Label>
              <ChildrenMultiSelect
                id="plan-children"
                children={children ?? []}
                value={selectedChildIds}
                onChange={setSelectedChildIds}
              />
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {selectedChildIds.length === 0
                  ? 'Choose one or more children, or select All children.'
                  : selectedChildIds.length === children?.length
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
          <PlanAttendeeSelect value={planAttendee} onChange={setPlanAttendee} />
          <section className="grid gap-4 md:grid-cols-2">
            <fieldset className="space-y-2">
              <Label>{repeatMode === 'weekly' ? 'First occurrence' : 'Starts'}</Label>
              <DateTimePicker value={planStartsAt} onChange={setPlanStartsAt} minuteStep={30} />
            </fieldset>
            <fieldset className="space-y-2">
              <Label>Ends</Label>
              <DateTimePicker value={planEndsAt} onChange={setPlanEndsAt} minuteStep={30} />
            </fieldset>
          </section>
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
                  <Label htmlFor="activities-repeat-until">Repeat until (optional)</Label>
                  <DatePicker
                    id="activities-repeat-until"
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
          <fieldset className="space-y-2">
            <Label>Notes (optional — add later)</Label>
            <Textarea
              value={planNotes}
              onChange={(e) => setPlanNotes(e.target.value)}
              placeholder="What to bring, pickup info, how it went..."
            />
          </fieldset>
          <Button
            onClick={() => savePlan.mutate()}
            disabled={!childIdsForPlan.length || !title || savePlan.isPending}
          >
            {savePlan.isPending ? 'Saving...' : repeatMode === 'weekly' ? 'Save repeating plan' : 'Save plan'}
          </Button>
        </CardContent>
      </Card>

      <RecurringPlansCard />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Upcoming & recent</CardTitle>
          <select
            className={cn(selectCn, 'h-9 w-auto min-w-[10rem] py-1.5')}
            value={childFilter}
            onChange={(e) => setChildFilter(e.target.value)}
          >
            <option value="">All children</option>
            {children?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <p>Loading...</p>
          ) : !activities?.length ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              No plans yet. Drag on the Schedule calendar or add one here.
            </p>
          ) : (
            <>
              {upcoming.length > 0 && (
                <PlanList
                  title="Coming up"
                  items={upcoming}
                  members={members}
                  nannies={nannies}
                  currentUserId={user?.id}
                  currentUserEmail={user?.email}
                />
              )}
              {past.length > 0 && (
                <PlanList
                  title="Earlier"
                  items={past}
                  members={members}
                  nannies={nannies}
                  currentUserId={user?.id}
                  currentUserEmail={user?.email}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </article>
  )
}

function PlanList({
  title,
  items,
  members,
  nannies,
  currentUserId,
  currentUserEmail,
}: {
  title: string
  items: {
    id: string
    title: string
    activity_type: ActivityType
    occurred_at: string
    duration_minutes: number | null
    description: string | null
    mood: MoodType | null
    attendee_user_id: string | null
    attendee_household_nanny_id: string | null
    children?: { name: string } | null
  }[]
  members?: Parameters<typeof formatPlanAttendeeLabel>[1]['members']
  nannies?: Parameters<typeof formatPlanAttendeeLabel>[1]['nannies']
  currentUserId?: string
  currentUserEmail?: string | null
}) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-[var(--color-muted-foreground)]">{title}</h3>
      <ul className="space-y-3">
        {items.map((a) => {
          const attendeeLabel = formatPlanAttendeeLabel(a, {
            members,
            nannies,
            currentUserId,
            currentUserEmail,
          })
          return (
          <li key={a.id} className="border-b pb-3 last:border-0">
            <header className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{a.title}</p>
              <Badge variant="outline">{activityTypeLabel(a.activity_type)}</Badge>
              {a.mood && <Badge variant="secondary">{a.mood}</Badge>}
            </header>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {a.children?.name} · {format(parseISO(a.occurred_at), 'EEE, MMM d · h:mm a')}
              {a.duration_minutes ? ` · ${a.duration_minutes} min` : ''}
              {attendeeLabel ? ` · ${attendeeLabel} going` : ''}
            </p>
            {a.description && <p className="mt-1 text-sm">{a.description}</p>}
          </li>
          )
        })}
      </ul>
    </section>
  )
}
