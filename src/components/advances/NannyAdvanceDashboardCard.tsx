import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { Link } from 'react-router-dom'
import { ChevronRight, HandCoins } from 'lucide-react'
import {
  useEmploymentSettings,
  usePaymentAdvances,
  useScheduleTemplates,
} from '@/hooks/useHouseholdData'
import { buildAdvancePayoffEstimate, type ScheduleBackfillInput } from '@/lib/advance-backfill'
import {
  openAdvances,
  repaymentModeLabel,
  totalAdvanceBalance,
} from '@/lib/advances'
import { EstimatedPayoffDisplay, EstimatedPayoffFootnote } from '@/components/advances/EstimatedPayoffDisplay'
import { repaymentSourceLabel, type AdvanceRepayment } from '@/types/advance-repayment'
import type { EmploymentSetting, PaymentAdvance } from '@/types/database'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface NannyAdvanceDashboardCardProps {
  householdNannyId: string | undefined
}

export function NannyAdvanceDashboardCard({ householdNannyId }: NannyAdvanceDashboardCardProps) {
  const { data: advances } = usePaymentAdvances(householdNannyId)
  const { data: settingsList } = useEmploymentSettings(householdNannyId)
  const { data: templates } = useScheduleTemplates(householdNannyId)
  const settings = settingsList?.[0]

  const scheduleInput = useMemo((): ScheduleBackfillInput | undefined => {
    if (!householdNannyId) return undefined
    return {
      blocks: [],
      templates: (templates ?? []) as NannyScheduleTemplate[],
      householdNannyId,
    }
  }, [householdNannyId, templates])

  const outstanding = useMemo(() => openAdvances(advances ?? []), [advances])
  const totalBalance = useMemo(() => totalAdvanceBalance(outstanding), [outstanding])

  if (!outstanding.length || !settings) return null

  return (
    <Card className="border-l-4 border-l-amber-500">
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          <HandCoins className="h-3.5 w-3.5" />
          Payment advance
        </CardDescription>
        <CardTitle className="text-2xl font-bold">{formatCurrency(totalBalance)} remaining</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {outstanding.length === 1 ? (
          <AdvanceDashboardSummary
            advance={outstanding[0]!}
            settings={settings}
            scheduleInput={scheduleInput}
            detailTo={`/payroll/advances/${outstanding[0]!.id}`}
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {outstanding.map((advance) => {
              const estimate = buildAdvancePayoffEstimate(advance, settings, scheduleInput)
              return (
                <li key={advance.id}>
                  <Link
                    to={`/payroll/advances/${advance.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-accent)]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{formatCurrency(advance.balance_cents)} left</p>
                      <p className="text-sm text-[var(--color-muted-foreground)]">
                        {formatCurrency(estimate.paidCents)} repaid of {formatCurrency(advance.amount_cents)}
                        {advance.reason ? ` · ${advance.reason}` : ''}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        <Button variant="link" className="h-auto px-0 py-0 text-xs" asChild>
          <Link to={outstanding.length === 1 ? `/payroll/advances/${outstanding[0]!.id}` : '/payroll'}>
            {outstanding.length === 1 ? 'View advance details' : 'Open payroll'} →
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function AdvanceDashboardSummary({
  advance,
  settings,
  scheduleInput,
  detailTo,
}: {
  advance: PaymentAdvance
  settings: EmploymentSetting
  scheduleInput: ScheduleBackfillInput | undefined
  detailTo: string
}) {
  const estimate = buildAdvancePayoffEstimate(advance, settings, scheduleInput)

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-muted-foreground)]">Repaid</span>
          <span className="font-medium">
            {formatCurrency(estimate.paidCents)} of {formatCurrency(estimate.totalCents)}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--color-muted)]">
          <div
            className={cn('h-full rounded-full bg-amber-500 transition-all')}
            style={{ width: `${estimate.percentPaid}%` }}
          />
        </div>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--color-muted-foreground)]">Repayment plan</dt>
          <dd className="font-medium">
            {repaymentModeLabel(advance.repayment_mode)}
            {advance.repayment_mode === 'per_paycheck' && advance.repayment_per_paycheck_cents
              ? ` · ${formatCurrency(advance.repayment_per_paycheck_cents)}/paycheck`
              : ''}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted-foreground)]">Estimated payoff</dt>
          <dd className="font-medium">
            <EstimatedPayoffDisplay estimate={estimate} />
          </dd>
          <EstimatedPayoffFootnote estimate={estimate} />
        </div>
      </dl>
      {advance.reason && (
        <p className="text-sm text-[var(--color-muted-foreground)]">{advance.reason}</p>
      )}
      <Button variant="outline" size="sm" asChild>
        <Link to={detailTo}>
          View details <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  )
}

export function AdvanceRepaymentHistory({
  repayments,
  issuedOn,
}: {
  repayments: AdvanceRepayment[]
  issuedOn: string
}) {
  const sorted = useMemo(
    () => [...repayments].sort((a, b) => b.paid_on.localeCompare(a.paid_on)),
    [repayments],
  )

  if (!sorted.length) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        No repayments recorded yet since {format(parseISO(issuedOn), 'MMM d, yyyy')}.
      </p>
    )
  }

  return (
    <ul className="divide-y rounded-lg border">
      {sorted.map((r) => (
        <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{format(parseISO(r.paid_on), 'MMM d, yyyy')}</p>
            <p className="text-[var(--color-muted-foreground)]">
              {repaymentSourceLabel(r.source)}
              {r.notes ? ` · ${r.notes}` : ''}
            </p>
          </div>
          <span className="shrink-0 font-medium tabular-nums">{formatCurrency(r.amount_cents)}</span>
        </li>
      ))}
    </ul>
  )
}
