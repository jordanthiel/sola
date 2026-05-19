import { useMemo } from 'react'
import { addDays, format, parseISO, startOfDay, startOfWeek } from 'date-fns'
import { Link } from 'react-router-dom'
import { useHousehold } from '@/contexts/HouseholdContext'
import {
  useChildActivities,
  useMyHouseholdNanny,
  usePendingTimeOff,
  useScheduleBlocks,
  useScheduleTemplates,
} from '@/hooks/useHouseholdData'
import { payableShiftsInPeriod, payableShiftMinutes } from '@/lib/schedule-hours'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatHours } from '@/lib/utils'
import { blockHasLateReport, effectiveEndIso } from '@/lib/schedule-hours'

const scheduleFrom = startOfDay(new Date()).toISOString()
const scheduleTo = addDays(startOfDay(new Date()), 14).toISOString()

export function DashboardPage() {
  const { isParent, activeHousehold } = useHousehold()
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = addDays(weekStart, 7)
  const { data: myNanny } = useMyHouseholdNanny()

  const { data: upcoming } = useScheduleBlocks(scheduleFrom, scheduleTo)
  const { data: weekBlocks } = useScheduleBlocks(weekStart.toISOString(), weekEnd.toISOString())
  const { data: templates } = useScheduleTemplates(myNanny?.id)
  const { data: pending } = usePendingTimeOff()
  const { data: activities } = useChildActivities()

  const weekMinutes = useMemo(() => {
    if (!weekBlocks || !myNanny?.id) return 0
    const shifts = payableShiftsInPeriod(
      weekBlocks,
      (templates ?? []) as NannyScheduleTemplate[],
      myNanny.id,
      weekStart,
      weekEnd,
    )
    return shifts.reduce((s, sh) => s + payableShiftMinutes(sh), 0)
  }, [weekBlocks, templates, myNanny?.id, weekStart, weekEnd])

  const myUpcoming = upcoming?.slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-[var(--color-muted-foreground)]">{activeHousehold?.name}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">This week</CardTitle>
            <CardDescription>Scheduled hours (including late adjustments)</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{formatHours(weekMinutes)}</p>
            <Button variant="link" className="mt-2 px-0" asChild>
              <Link to="/schedule">View schedule</Link>
            </Button>
          </CardContent>
        </Card>

        {isParent && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pending approvals</CardTitle>
              <CardDescription>Time off requests</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{pending?.length ?? 0}</p>
              <Button variant="link" className="mt-2 px-0" asChild>
                <Link to="/time-off">Review requests</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upcoming schedule</CardTitle>
        </CardHeader>
        <CardContent>
          {!myUpcoming?.length ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">No upcoming shifts scheduled.</p>
          ) : (
            <ul className="space-y-3">
              {myUpcoming.map((s) => (
                <li key={s.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium">{format(parseISO(s.starts_at), 'EEE, MMM d')}</p>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      {format(parseISO(s.starts_at), 'h:mm a')} –{' '}
                      {format(parseISO(effectiveEndIso(s)), 'h:mm a')}
                    </p>
                  </div>
                  {blockHasLateReport(s) && <Badge variant="warning">Late</Badge>}
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" className="mt-4" asChild>
            <Link to="/schedule">View schedule</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent activities</CardTitle>
        </CardHeader>
        <CardContent>
          {!activities?.length ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">No activities logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {activities.slice(0, 5).map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="font-medium">{a.title}</span>
                  {a.children?.name && (
                    <span className="text-[var(--color-muted-foreground)]"> · {a.children.name}</span>
                  )}
                  <span className="block text-[var(--color-muted-foreground)]">
                    {format(parseISO(a.occurred_at), 'MMM d, h:mm a')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" className="mt-4" asChild>
            <Link to="/activities">Log activity</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
