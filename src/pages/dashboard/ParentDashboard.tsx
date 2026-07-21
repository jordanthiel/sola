import { useMemo } from 'react'
import { addDays, endOfWeek, format, parseISO, startOfDay, startOfWeek } from 'date-fns'
import { Link } from 'react-router-dom'
import { Calendar, ChevronRight, Clock } from 'lucide-react'
import { useHousehold } from '@/contexts/HouseholdContext'
import {
  useChildActivities,
  useEmploymentSettings,
  useMembers,
  useNannies,
  usePendingTimeOff,
  useScheduleBlocks,
  useScheduleTemplates,
} from '@/hooks/useHouseholdData'
import { useHouseholdHolidays } from '@/hooks/useHouseholdHolidays'
import { nannyDisplayName } from '@/lib/nanny'
import {
  blockHasLateReport,
  payableShiftMinutes,
  payableShiftsInPeriod,
} from '@/lib/schedule-hours'
import { isTemplateOccurrence, mergeScheduleWithTemplates } from '@/lib/schedule'
import type { TemplateOccurrence } from '@/lib/schedule'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import { buildCalendarEvents } from '@/lib/calendar-events'
import type { EmploymentSetting, ScheduleBlock } from '@/types/database'
import { calculatePayroll, holidayPayItemsInPeriod } from '@/lib/payroll'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { GettingStartedCard } from '@/components/dashboard/GettingStartedCard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatHours } from '@/lib/utils'
import {
  childAttendeesFromGroup,
  groupChildActivities,
  type ChildActivityWithChild,
} from '@/lib/group-child-activities'
import { PlanPeopleChips } from '@/components/activities/PlanPeopleChips'
import { enrichActivitiesWithAttendeeLabels } from '@/lib/plan-attendee'

function shiftStartAt(item: ScheduleBlock | TemplateOccurrence): Date {
  return typeof item.starts_at === 'string' ? parseISO(item.starts_at) : item.starts_at
}

function shiftEndAt(item: ScheduleBlock | TemplateOccurrence): Date {
  if (!isTemplateOccurrence(item) && item.actual_ends_at) {
    return parseISO(item.actual_ends_at)
  }
  const end = item.ends_at
  return typeof end === 'string' ? parseISO(end) : end
}

function currentSettingsByNanny(settings: EmploymentSetting[] | undefined) {
  const byId = new Map<string, EmploymentSetting>()
  for (const setting of settings ?? []) {
    if (!setting.household_nanny_id) continue
    if (!byId.has(setting.household_nanny_id)) {
      byId.set(setting.household_nanny_id, setting)
    }
  }
  return byId
}

export function ParentDashboard() {
  const { activeHousehold } = useHousehold()
  const { user } = useAuth()
  const todayKey = format(new Date(), 'yyyy-MM-dd')
  const today = useMemo(() => startOfDay(new Date()), [todayKey])
  const weekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today])
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const weekQueryTo = useMemo(() => endOfWeek(today, { weekStartsOn: 1 }), [today])
  const upcomingEnd = useMemo(() => addDays(today, 14), [today])

  const scheduleFrom = today.toISOString()
  const scheduleTo = upcomingEnd.toISOString()

  const { data: nannies } = useNannies()
  const { data: members } = useMembers()
  const nannyIds = useMemo(() => nannies?.map((n) => n.id) ?? [], [nannies])
  const { data: employmentSettings } = useEmploymentSettings()
  const { data: holidayOverrides } = useHouseholdHolidays()

  const { data: upcomingBlocks } = useScheduleBlocks(scheduleFrom, scheduleTo)
  const { data: weekBlocks } = useScheduleBlocks(weekStart.toISOString(), weekQueryTo.toISOString())
  const { data: templates } = useScheduleTemplates()
  const { data: pending } = usePendingTimeOff()
  const { data: activities } = useChildActivities()

  const weekMinutes = useMemo(() => {
    if (!weekBlocks || !nannyIds.length) return 0
    const tpl = (templates ?? []) as NannyScheduleTemplate[]
    const settingsByNanny = currentSettingsByNanny(employmentSettings)
    return nannyIds.reduce((total, nannyId) => {
      const nanny = nannies?.find((n) => n.id === nannyId)
      const shifts = payableShiftsInPeriod(
        weekBlocks,
        tpl,
        nannyId,
        weekStart,
        weekEnd,
        nanny?.start_date,
      )
      const settings = settingsByNanny.get(nannyId)
      if (!settings) {
        return total + shifts.reduce((s, sh) => s + payableShiftMinutes(sh), 0)
      }
      return total + calculatePayroll(
        shifts,
        settings,
        weekStart,
        weekEnd,
        [],
        [],
        holidayOverrides ?? [],
      ).totalMinutes
    }, 0)
  }, [weekBlocks, templates, nannyIds, weekStart, weekEnd, nannies, employmentSettings, holidayOverrides])

  const mergedUpcoming = useMemo(() => {
    if (!upcomingBlocks || !nannyIds.length) return []
    return mergeScheduleWithTemplates(
      upcomingBlocks,
      (templates ?? []) as NannyScheduleTemplate[],
      today,
      upcomingEnd,
      nannyIds,
    )
  }, [upcomingBlocks, templates, nannyIds, today, upcomingEnd])

  const nannyNameById = useMemo(
    () => Object.fromEntries((nannies ?? []).map((n) => [n.id, nannyDisplayName(n)])),
    [nannies],
  )

  const upcomingScheduleEvents = useMemo(() => {
    const now = new Date()
    const nameFor = (householdNannyId: string | null) => {
      if (!householdNannyId) return 'Nanny'
      return nannyNameById[householdNannyId] ?? 'Nanny'
    }
    return buildCalendarEvents({
      scheduleItems: mergedUpcoming,
      timeOffRequests: [],
      activities: [],
      nannyName: nameFor,
      holidayOverrides: holidayOverrides ?? [],
      holidayRange: { from: today, to: upcomingEnd },
    })
      .filter((event) => (event.kind === 'shift' || event.kind === 'holiday') && event.endsAt >= now)
      .slice(0, 5)
  }, [mergedUpcoming, nannyNameById, holidayOverrides, today, upcomingEnd])

  const holidayHoursByDate = useMemo(() => {
    const byDate = new Map<string, number>()
    const settingsByNanny = currentSettingsByNanny(employmentSettings)
    const tpl = (templates ?? []) as NannyScheduleTemplate[]
    for (const nanny of nannies ?? []) {
      const settings = settingsByNanny.get(nanny.id)
      if (!settings) continue
      const shifts = payableShiftsInPeriod(
        upcomingBlocks ?? [],
        tpl,
        nanny.id,
        today,
        upcomingEnd,
        nanny.start_date,
      )
      for (const holiday of holidayPayItemsInPeriod(holidayOverrides ?? [], settings, shifts, today, upcomingEnd)) {
        byDate.set(holiday.date, (byDate.get(holiday.date) ?? 0) + holiday.minutes)
      }
    }
    return byDate
  }, [employmentSettings, holidayOverrides, nannies, templates, upcomingBlocks, today, upcomingEnd])

  const groupedPlans = useMemo(() => {
    const enriched = enrichActivitiesWithAttendeeLabels(activities ?? [], {
      members,
      nannies,
      currentUserId: user?.id,
      currentUserEmail: user?.email,
    })
    return groupChildActivities(enriched as ChildActivityWithChild[]).slice(0, 5)
  }, [activities, members, nannies, user?.id, user?.email])

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={activeHousehold?.name} />

      <GettingStartedCard />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className={cn('stat-card stat-card-highlight border-l-0')}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              This week
            </CardDescription>
            <CardTitle className="text-3xl font-bold">{formatHours(weekMinutes)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-[var(--color-muted-foreground)]">Household scheduled hours</p>
            <Button variant="link" className="mt-1 h-auto px-0 py-0 text-xs" asChild>
              <Link to="/schedule">View schedule →</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardDescription>Pending approvals</CardDescription>
            <CardTitle className="text-3xl font-bold">{pending?.length ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-[var(--color-muted-foreground)]">Time off requests</p>
            <Button variant="link" className="mt-1 h-auto px-0 py-0 text-xs" asChild>
              <Link to="/time-off">Review requests →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[var(--color-muted-foreground)]" />
            <CardTitle className="text-base">Upcoming schedule</CardTitle>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/schedule" className="flex items-center gap-1 text-sm">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!upcomingScheduleEvents.length ? (
            <p className="py-4 text-center text-sm text-[var(--color-muted-foreground)]">
              No upcoming shifts or paid holidays in the next 14 days.
            </p>
          ) : (
            <ul className="divide-y">
              {upcomingScheduleEvents.map((event) => {
                const scheduleItem = event.scheduleItem
                const isShift = event.kind === 'shift' && scheduleItem
                const start = isShift ? shiftStartAt(scheduleItem) : event.startsAt
                const end = isShift ? shiftEndAt(scheduleItem) : event.endsAt
                const nannyLabel = event.householdNannyId ? nannyNameById[event.householdNannyId] : undefined
                const holidayDate = format(event.startsAt, 'yyyy-MM-dd')
                const holidayMinutes = event.kind === 'holiday' ? holidayHoursByDate.get(holidayDate) : undefined
                return (
                  <li
                    key={event.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">
                        {format(start, 'EEE, MMM d')}
                        {nannyLabel && (
                          <span className="font-normal text-[var(--color-muted-foreground)]">
                            {' '}· {nannyLabel}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-[var(--color-muted-foreground)]">
                        {event.kind === 'holiday'
                          ? `${event.title}${holidayMinutes ? ` · ${formatHours(holidayMinutes)} paid holiday` : ''}`
                          : `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`}
                      </p>
                      {event.subtitle && event.kind !== 'holiday' && (
                        <p className="text-xs text-[var(--color-muted-foreground)]">{event.subtitle}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {event.kind === 'holiday' && <Badge variant="secondary">Paid holiday</Badge>}
                      {event.holidayWorked && <Badge variant="secondary">Worked holiday</Badge>}
                      {isShift && !isTemplateOccurrence(scheduleItem) && blockHasLateReport(scheduleItem) && (
                        <Badge variant="warning">Late</Badge>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Kids&apos; plans</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/activities" className="flex items-center gap-1 text-sm">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!groupedPlans.length ? (
            <div className="py-4 text-center">
              <p className="text-sm text-[var(--color-muted-foreground)]">Nothing scheduled yet.</p>
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <Link to="/activities">Schedule a plan</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y">
              {groupedPlans.map((plan) => (
                <li key={plan.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="font-medium">{plan.title}</p>
                      <PlanPeopleChips
                        children={childAttendeesFromGroup(plan)}
                        attendeeLabel={plan.attendeeLabel}
                        size="sm"
                      />
                    </div>
                  </div>
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    {format(parseISO(plan.occurred_at), 'MMM d, h:mm a')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
