import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useHousehold } from '@/contexts/HouseholdContext'
import {
  useAdvanceRepayments,
  useEmploymentSettings,
  useMyHouseholdNanny,
  usePaymentAdvances,
} from '@/hooks/useHouseholdData'
import { AdvanceRepaymentHistory } from '@/components/advances/NannyAdvanceDashboardCard'
import { estimateAdvancePayoff, repaymentModeLabel } from '@/lib/advances'
import { formatCurrency } from '@/lib/utils'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function AdvanceDetailPage() {
  const { advanceId } = useParams<{ advanceId: string }>()
  const { isNanny } = useHousehold()
  const { data: myNanny } = useMyHouseholdNanny()
  const { data: advances, isLoading } = usePaymentAdvances(myNanny?.id)
  const { data: repayments } = useAdvanceRepayments(myNanny?.id)
  const { data: settingsList } = useEmploymentSettings(myNanny?.id)
  const settings = settingsList?.[0]

  const advance = advances?.find((a) => a.id === advanceId)

  const advanceRepayments = useMemo(
    () => (repayments ?? []).filter((r) => r.payment_advance_id === advanceId),
    [repayments, advanceId],
  )

  if (!isNanny) {
    return <Navigate to="/payroll" replace />
  }

  if (isLoading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>
  }

  if (!advance || advance.household_nanny_id !== myNanny?.id) {
    return <Navigate to="/" replace />
  }

  const estimate = settings
    ? estimateAdvancePayoff(advance, settings.pay_period)
    : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment advance"
        subtitle={`Granted ${format(parseISO(advance.issued_on), 'MMM d, yyyy')}`}
        action={
          <Button variant="outline" size="sm" asChild>
            <Link to="/">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Dashboard
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-2xl">{formatCurrency(advance.amount_cents)}</CardTitle>
            {advance.reason && (
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{advance.reason}</p>
            )}
          </div>
          <Badge variant={advance.status === 'open' ? 'warning' : 'success'}>{advance.status}</Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          {estimate && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-sm text-[var(--color-muted-foreground)]">Remaining balance</p>
                  <p className="text-3xl font-bold">{formatCurrency(estimate.balanceCents)}</p>
                </div>
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  {formatCurrency(estimate.paidCents)} repaid ({estimate.percentPaid}%)
                </p>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
                <div
                  className={cn('h-full rounded-full bg-amber-500 transition-all')}
                  style={{ width: `${estimate.percentPaid}%` }}
                />
              </div>
            </div>
          )}

          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Repayment plan
              </dt>
              <dd className="mt-1 font-medium">
                {repaymentModeLabel(advance.repayment_mode)}
                {advance.repayment_mode === 'per_paycheck' && advance.repayment_per_paycheck_cents
                  ? ` · ${formatCurrency(advance.repayment_per_paycheck_cents)} per paycheck`
                  : ''}
              </dd>
            </div>
            <div className="rounded-lg border p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Estimated payoff
              </dt>
              <dd className="mt-1 font-medium">
                {estimate?.estimatedPayoffDate
                  ? format(estimate.estimatedPayoffDate, 'MMMM d, yyyy')
                  : estimate?.estimatedPayoffLabel ?? '—'}
              </dd>
              {estimate?.paychecksRemaining != null && estimate.paychecksRemaining > 0 && (
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  {estimate.estimatedPayoffLabel}
                </p>
              )}
            </div>
          </dl>

          {advance.repayment_mode === 'overtime_only' && (
            <p className="rounded-lg border bg-[var(--color-muted)]/30 px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
              This advance is repaid from overtime earnings only. The payoff date depends on how many
              overtime hours you work each pay period.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Repayment history</CardTitle>
        </CardHeader>
        <CardContent>
          <AdvanceRepaymentHistory repayments={advanceRepayments} issuedOn={advance.issued_on} />
        </CardContent>
      </Card>

      <Button variant="outline" asChild>
        <Link to="/payroll">View payroll</Link>
      </Button>
    </div>
  )
}
