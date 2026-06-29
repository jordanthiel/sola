import { format, parseISO } from 'date-fns'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { TimeOffRequest } from '@/types/database'
import { timeOffTypeLabel } from '@/components/time-off/time-off-labels'
import { TimeOffReviewActions } from '@/components/time-off/TimeOffReviewActions'

export function PendingTimeOffApprovals({
  requests,
  nannyName,
}: {
  requests: TimeOffRequest[]
  nannyName: (householdNannyId: string | null) => string
}) {
  if (!requests.length) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Awaiting approval</CardTitle>
        <CardDescription>Review and approve or deny pending time off requests.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {requests.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-4 rounded-lg border border-[var(--color-border)] p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="font-medium">
                  {nannyName(r.household_nanny_id)} · {timeOffTypeLabel(r.type)}
                </p>
                <p className="text-sm">
                  {format(parseISO(r.starts_on + 'T12:00:00'), 'MMM d')} –{' '}
                  {format(parseISO(r.ends_on + 'T12:00:00'), 'MMM d, yyyy')} · {r.hours}h
                </p>
                {r.type === 'vacation' && r.nanny_joins_vacation && (
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Nanny joins
                    {r.vacation_daily_rate_cents
                      ? ` · $${(r.vacation_daily_rate_cents / 100).toFixed(2)}/day`
                      : ' · default vacation rate'}
                  </p>
                )}
                {r.notes && (
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    <span className="font-medium text-[var(--color-foreground)]">Request note:</span>{' '}
                    {r.notes}
                  </p>
                )}
              </div>
              <TimeOffReviewActions requestId={r.id} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
