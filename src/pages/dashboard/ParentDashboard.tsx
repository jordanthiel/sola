import { useMemo } from 'react'
import { addDays, endOfWeek, format, isAfter, parseISO, startOfDay, startOfWeek } from 'date-fns'
import { Link } from 'react-router-dom'
import { Calendar, ChevronRight, Clock } from 'lucide-react'
import { useHousehold } from '@/contexts/HouseholdContext'
import {
  useChildActivities,
  useNannies,
  usePendingTimeOff,
  useScheduleBlocks,
  useScheduleTemplates,
} from '@/hooks/useHouseholdData'
import { nannyDisplayName } from '@/lib/nanny'
import {
  blockHasLateReport,
  payableShiftMinutes,
  payableShiftsInPeriod,
} from '@/lib/schedule-hours'
import { isTemplateOccurrence, mergeScheduleWithTemplates } from '@/lib/schedule'
import type { TemplateOccurrence } from '@/lib/schedule'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import type { ScheduleBlock } from '@/types/database'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatHours } from '@/lib/utils'

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

export function ParentDashboard() {
  const { activeHousehold } = useHousehold()
  const todayKey = format(new Date(), 'yyyy-MM-dd')
  const today = useMemo(() => startOfDay(new Date()), [todayKey])
  const weekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today])
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const weekQueryTo = useMemo(() => endOfWeek(today, { weekStartsOn: 1 }), [today])
  const upcomingEnd = useMemo(() => addDays(today, 14), [today])

  const scheduleFrom = today.toISOString()
  const scheduleTo = upcomingEnd.toISOString()

  const { data: nannies } = useNannies()
  const nannyIds = useMemo(() => nannies?.map((n) => n.id) ?? [], [nannies])

  const { data: upcomingBlocks } = useScheduleBlocks(scheduleFrom, scheduleTo)
  const { data: weekBlocks } = useScheduleBlocks(weekStart.toISOString(), weekQueryTo.toISOString())
  const { data: templates } = useScheduleTemplates()
  const { data: pending } = usePendingTimeOff()
  const { data: activities } = useChildActivities()

  const weekMinutes = useMemo(() => {
    if (!weekBlocks || !nannyIds.length) return 0
    const tpl = (templates ?? []) as NannyScheduleTemplate[]
    return nannyIds.reduce((total, nannyId) => {
      const shifts = payableShiftsInPeriod(weekBlocks, tpl, nannyId, weekStart, weekEnd)
      return total + shifts.reduce((s, sh) => s + payableShiftMinutes(sh), 0)
    }, 0)
  }, [weekBlocks, templates, nannyIds, weekStart, weekEnd])

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

  const myUpcoming = useMemo(() => {
    const now = new Date()
    return mergedUpcoming.filter((item) => isAfter(shiftStartAt(item), now)).slice(0, 5)
  }, [mergedUpcoming])

  const nannyNameById = useMemo(
    () => Object.fromEntries((nannies ?? []).map((n) => [n.id, nannyDisplayName(n)])),
    [nannies],
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={activeHousehold?.name} />

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
          {!myUpcoming.length ? (
            <p className="py-4 text-center text-sm text-[var(--color-muted-foreground)]">
              No upcoming shifts in the next 14 days.
            </p>
          ) : (
            <ul className="divide-y">
              {myUpcoming.map((s) => {
                const start = shiftStartAt(s)
                const end = shiftEndAt(s)
                const nannyId = s.household_nanny_id
                const nannyLabel = nannyId ? nannyNameById[nannyId] : undefined
                return (
                  <li
                    key={s.id}
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
                        {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
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
          <CardTitle className="text-base">Kids&apos; plans</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/activities" className="flex items-center gap-1 text-sm">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!activities?.length ? (
            <div className="py-4 text-center">
              <p className="text-sm text-[var(--color-muted-foreground)]">Nothing scheduled yet.</p>
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <Link to="/activities">Schedule a plan</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y">
              {activities.slice(0, 5).map((a) => (
                <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{a.title}</p>
                    {a.children?.name && (
                      <span className="shrink-0 text-sm text-[var(--color-muted-foreground)]">
                        {a.children.name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    {format(parseISO(a.occurred_at), 'MMM d, h:mm a')}
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
