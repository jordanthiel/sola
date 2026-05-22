import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Plus } from 'lucide-react'
import { useHousehold } from '@/contexts/HouseholdContext'
import {
  useMyHouseholdNanny,
  useNannies,
  usePtoBalances,
  useTimeOffRequests,
} from '@/hooks/useHouseholdData'
import { nannyDisplayName } from '@/lib/nanny'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatPtoHours, ptoRemaining } from '@/lib/pto'
import { LogTimeOffForm } from '@/components/time-off/LogTimeOffForNanny'
import { PendingTimeOffApprovals } from '@/components/time-off/PendingTimeOffApprovals'
import { RequestTimeOffForm } from '@/components/time-off/RequestTimeOffForm'
import { timeOffTypeLabel } from '@/components/time-off/time-off-labels'
import { TimeOffReviewNotesDisplay } from '@/components/time-off/time-off-notes'

export function TimeOffPage() {
  const { isParent } = useHousehold()
  const { data: myNanny } = useMyHouseholdNanny()
  const { data: requests, isLoading } = useTimeOffRequests()
  const { data: balances } = usePtoBalances()
  const { data: nannies } = useNannies()
  const [addOpen, setAddOpen] = useState(false)

  const nannyName = (householdNannyId: string | null) => {
    if (!householdNannyId) return 'Nanny'
    const n = nannies?.find((x) => x.id === householdNannyId)
    return n ? nannyDisplayName(n) : 'Nanny'
  }

  const pendingRequests = useMemo(
    () => requests?.filter((r) => r.status === 'pending') ?? [],
    [requests],
  )

  const myBalance = balances?.find((b) => b.household_nanny_id === myNanny?.id)

  return (
    <div className="space-y-6">
      <PageHeader title="Time off" subtitle="Sick days, PTO, and requests" />

      {myBalance && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your balances</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-[var(--color-muted-foreground)]">Sick (remaining)</p>
              <p className="text-xl font-semibold">
                {formatPtoHours(ptoRemaining(myBalance, 'sick'))}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {formatPtoHours(myBalance.sick_hours_used)} used of{' '}
                {formatPtoHours(myBalance.sick_hours_accrued)} allocated
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--color-muted-foreground)]">PTO (remaining)</p>
              <p className="text-xl font-semibold">
                {formatPtoHours(ptoRemaining(myBalance, 'pto'))}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {formatPtoHours(myBalance.pto_hours_used)} used of{' '}
                {formatPtoHours(myBalance.pto_hours_accrued)} allocated
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isParent && (
        <PendingTimeOffApprovals requests={pendingRequests} nannyName={nannyName} />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-lg">Time off</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 size-4" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading...</p>
          ) : !requests?.length ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">No time off recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0"
                >
                  <div>
                    <p className="font-medium">
                      {nannyName(r.household_nanny_id)} · {timeOffTypeLabel(r.type)}
                    </p>
                    <p className="text-sm">
                      {format(parseISO(r.starts_on + 'T12:00:00'), 'MMM d')} –{' '}
                      {format(parseISO(r.ends_on + 'T12:00:00'), 'MMM d, yyyy')} · {r.hours}h
                    </p>
                    {r.notes && (
                      <p className="text-sm text-[var(--color-muted-foreground)]">
                        <span className="font-medium text-[var(--color-foreground)]">Request:</span>{' '}
                        {r.notes}
                      </p>
                    )}
                    <TimeOffReviewNotesDisplay notes={r.review_notes} />
                  </div>
                  <Badge
                    variant={
                      r.status === 'approved'
                        ? 'success'
                        : r.status === 'denied'
                          ? 'destructive'
                          : 'warning'
                    }
                  >
                    {r.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isParent ? 'Log time off' : 'Request time off'}</DialogTitle>
            <DialogDescription>
              {isParent
                ? 'Record sick or PTO for a nanny. It will be saved as approved.'
                : 'Submit a time off request for your household to review.'}
            </DialogDescription>
          </DialogHeader>
          {isParent ? (
            <LogTimeOffForm onSuccess={() => setAddOpen(false)} />
          ) : (
            <RequestTimeOffForm onSuccess={() => setAddOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
