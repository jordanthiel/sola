import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { addDays, endOfWeek, format, isAfter, parseISO, startOfDay, startOfWeek } from 'date-fns'
import {
  Calendar,
  ChevronRight,
  FileText,
  MessageSquare,
  Palmtree,
  Wallet,
} from 'lucide-react'
import { NannyAdvanceDashboardCard } from '@/components/advances/NannyAdvanceDashboardCard'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import {
  useChildActivities,
  useEmploymentSettings,
  useMembers,
  useMyHouseholdNanny,
  useNannies,
  usePtoBalances,
  useScheduleBlocks,
  useScheduleTemplates,
  useTimeOffRequests,
} from '@/hooks/useHouseholdData'
import { useFeedPosts, useMyNannyHouseholds } from '@/hooks/useExtendedFeatures'
import { useHouseholdHolidays } from '@/hooks/useHouseholdHolidays'
import { useExtendedChildren } from '@/hooks/useExtendedFeatures'
import {
  blockHasLateReport,
  payableShiftMinutes,
  payableShiftsInPeriod,
} from '@/lib/schedule-hours'
import { mergeScheduleWithTemplates, isTemplateOccurrence } from '@/lib/schedule'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import type { ScheduleBlock } from '@/types/database'
import { calculatePayroll, getPayPeriodBounds } from '@/lib/payroll'
import {
  childAttendeesFromGroup,
  groupChildActivities,
  type ChildActivityWithChild,
} from '@/lib/group-child-activities'
import { PlanPeopleChips } from '@/components/activities/PlanPeopleChips'
import { enrichActivitiesWithAttendeeLabels } from '@/lib/plan-attendee'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatHours } from '@/lib/utils'

function shiftStartAt(item: ScheduleBlock | { starts_at: string | Date }): Date {
  return typeof item.starts_at === 'string' ? parseISO(item.starts_at) : item.starts_at
}

export function NannyDashboard() {
  const { user } = useAuth()
  const { activeHousehold } = useHousehold()
  const today = useMemo(() => startOfDay(new Date()), [])
  const weekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today])
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const upcomingEnd = useMemo(() => addDays(today, 14), [today])

  const { data: myNanny } = useMyHouseholdNanny()
  const { data: allJobs } = useMyNannyHouseholds()
  const { data: settingsList } = useEmploymentSettings(myNanny?.id)
  const settings = settingsList?.[0]
  const period = settings ? getPayPeriodBounds(settings.pay_period, new Date()) : null

  const { data: weekBlocks } = useScheduleBlocks(
    weekStart.toISOString(),
    endOfWeek(today, { weekStartsOn: 1 }).toISOString(),
  )
  const { data: upcomingBlocks } = useScheduleBlocks(today.toISOString(), upcomingEnd.toISOString())
  const { data: templates } = useScheduleTemplates(myNanny?.id)
  const { data: timeOff } = useTimeOffRequests()
  const { data: ptoBalances } = usePtoBalances()
  const { data: children } = useExtendedChildren()
  const { data: feed } = useFeedPosts()
  const { data: activities } = useChildActivities()
  const { data: holidayOverrides } = useHouseholdHolidays()
  const { data: members } = useMembers()
  const { data: nannies } = useNannies()

  const myPto = ptoBalances?.find((b) => b.household_nanny_id === myNanny?.id)
  const pendingOff = timeOff?.filter((t) => t.status === 'pending').length ?? 0

  const weekMinutes = useMemo(() => {
    if (!weekBlocks || !myNanny) return 0
    const shifts = payableShiftsInPeriod(
      weekBlocks,
      (templates ?? []) as NannyScheduleTemplate[],
      myNanny.id,
      weekStart,
      weekEnd,
      myNanny.start_date,
    )
    return shifts.reduce((s, sh) => s + payableShiftMinutes(sh), 0)
  }, [weekBlocks, templates, myNanny, weekStart, weekEnd])

  const periodPreview = useMemo(() => {
    if (!settings || !weekBlocks || !period || !myNanny) return null
    const shifts = payableShiftsInPeriod(
      weekBlocks,
      (templates ?? []) as NannyScheduleTemplate[],
      myNanny.id,
      period.start,
      period.end,
      myNanny.start_date,
    )
    return calculatePayroll(
      shifts,
      settings,
      period.start,
      period.end,
      [],
      [],
      holidayOverrides ?? [],
    )
  }, [settings, weekBlocks, templates, period, myNanny, holidayOverrides])

  const myUpcoming = useMemo(() => {
    if (!upcomingBlocks || !myNanny) return []
    return mergeScheduleWithTemplates(
      upcomingBlocks,
      (templates ?? []) as NannyScheduleTemplate[],
      today,
      upcomingEnd,
      [myNanny.id],
    )
      .filter((item) => isAfter(shiftStartAt(item), new Date()))
      .slice(0, 5)
  }, [upcomingBlocks, templates, myNanny, today, upcomingEnd])

  const mentionedPosts = feed?.filter((p) =>
    p.mentions?.some((m) => m.mentioned_user_id === user?.id),
  ).slice(0, 3)

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
      <PageHeader
        title="My dashboard"
        subtitle={
          (allJobs?.length ?? 0) > 1
            ? `${activeHousehold?.name} · ${allJobs?.length} households`
            : activeHousehold?.name
        }
      />

      <NannyAdvanceDashboardCard householdNannyId={myNanny?.id} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className={cn('stat-card stat-card-highlight')}>
          <CardHeader className="pb-2">
            <CardDescription>This week</CardDescription>
            <CardTitle className="text-3xl font-bold">{formatHours(weekMinutes)}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="link" className="h-auto px-0 py-0 text-xs" asChild>
              <Link to="/schedule">My schedule →</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5" />
              Current period (est.)
            </CardDescription>
            <CardTitle className="text-2xl font-bold">
              {periodPreview ? formatCurrency(periodPreview.netPayCents) : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="link" className="h-auto px-0 py-0 text-xs" asChild>
              <Link to="/payroll">Earnings details →</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Palmtree className="h-3.5 w-3.5" />
              PTO balance
            </CardDescription>
            <CardTitle className="text-2xl font-bold">
              {myPto
                ? `${(Number(myPto.pto_hours_accrued) - Number(myPto.pto_hours_used)).toFixed(1)}h`
                : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {pendingOff > 0 ? `${pendingOff} pending request(s)` : 'Sick/PTO available'}
            </p>
            <Button variant="link" className="mt-1 h-auto px-0 py-0 text-xs" asChild>
              <Link to="/time-off">Time off →</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Care sheets
            </CardDescription>
            <CardTitle className="text-2xl font-bold">{children?.length ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="link" className="h-auto px-0 py-0 text-xs" asChild>
              <Link to="/children">View children →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {mentionedPosts && mentionedPosts.length > 0 && (
        <Card className="border-l-4 border-l-amber-400">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              You were mentioned
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {mentionedPosts.map((p) => (
                <li key={p.id} className="text-sm line-clamp-2">{p.body}</li>
              ))}
            </ul>
            <Button variant="link" className="mt-2 h-auto px-0 py-0 text-xs" asChild>
              <Link to="/feed">Open feed →</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <CardTitle className="text-base">My upcoming shifts</CardTitle>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/schedule">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!myUpcoming.length ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">No upcoming shifts.</p>
          ) : (
            <ul className="divide-y">
              {myUpcoming.map((s) => {
                const start = shiftStartAt(s)
                return (
                  <li key={s.id} className="flex justify-between py-3">
                    <div>
                      <p className="font-medium">{format(start, 'EEE, MMM d')}</p>
                      <p className="text-sm text-[var(--color-muted-foreground)]">
                        {format(start, 'h:mm a')}
                      </p>
                    </div>
                    {!isTemplateOccurrence(s) && blockHasLateReport(s) && (
                      <Badge variant="warning">Late</Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Upcoming kids&apos; plans</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/activities">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!groupedPlans.length ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">Nothing scheduled.</p>
          ) : (
            <ul className="divide-y">
              {groupedPlans.map((plan) => (
                <li key={plan.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{plan.title}</span>
                    <PlanPeopleChips
                      children={childAttendeesFromGroup(plan)}
                      attendeeLabel={plan.attendeeLabel}
                      size="sm"
                    />
                  </div>
                  <p className="text-[var(--color-muted-foreground)]">
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
