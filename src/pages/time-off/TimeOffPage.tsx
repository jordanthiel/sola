import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import {
  useMyHouseholdNanny,
  useNannies,
  usePtoBalances,
  useTimeOffRequests,
} from '@/hooks/useHouseholdData'
import { nannyDisplayName } from '@/lib/nanny'
import { formatSupabaseError } from '@/lib/errors'
import { invalidateCalendarQueries } from '@/lib/invalidate-calendar'
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
import type { TimeOffRequest } from '@/types/database'

export function TimeOffPage() {
  const { isParent } = useHousehold()
  const { data: myNanny } = useMyHouseholdNanny()
  const { data: requests, isLoading } = useTimeOffRequests()
  const { data: balances } = usePtoBalances()
  const { data: nannies } = useNannies()
  const qc = useQueryClient()
  const [dialog, setDialog] = useState<'add' | TimeOffRequest | null>(null)

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
  const editing = dialog && dialog !== 'add' ? dialog : undefined

  const deleteRequest = useMutation({
    mutationFn: async (r: TimeOffRequest) => {
      const { error } = await supabase.from('time_off_requests').delete().eq('id', r.id)
      if (error) throw error
    },
    onSuccess: () => {
      void invalidateCalendarQueries(qc)
      toast.success('Time off deleted')
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  function confirmDelete(r: TimeOffRequest) {
    const balanceNote =
      r.status === 'approved' && (r.type === 'sick' || r.type === 'pto')
        ? isParent
          ? ' Hours will be returned to their balance.'
          : ' Hours will be returned to your balance.'
        : ''
    if (!confirm(`Delete this ${timeOffTypeLabel(r.type)} time off?${balanceNote}`)) return
    deleteRequest.mutate(r)
  }

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
          <Button size="sm" variant="outline" onClick={() => setDialog('add')}>
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
                        <span className="font-medium text-[var(--color-foreground)]">Request:</span>{' '}
                        {r.notes}
                      </p>
                    )}
                    <TimeOffReviewNotesDisplay notes={r.review_notes} />
                  </div>
                  <div className="flex flex-col items-end gap-2">
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
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDialog(r)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        disabled={deleteRequest.isPending}
                        onClick={() => confirmDelete(r)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? 'Edit time off'
                : isParent
                  ? 'Log time off'
                  : 'Request time off'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Change dates, hours, or type. Approved sick and PTO hours update the balance.'
                : isParent
                  ? 'Record sick or PTO for a nanny. It will be saved as approved.'
                  : 'Submit a time off request for your household to review.'}
            </DialogDescription>
          </DialogHeader>
          {isParent ? (
            <LogTimeOffForm
              key={editing?.id ?? 'new'}
              existing={editing}
              onSuccess={() => setDialog(null)}
            />
          ) : (
            <RequestTimeOffForm
              key={editing?.id ?? 'new'}
              existing={editing}
              onSuccess={() => setDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
