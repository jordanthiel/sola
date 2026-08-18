import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { Link } from 'react-router-dom'
import { ChevronRight, HandCoins } from 'lucide-react'
import {
  useEmploymentSettings,
  useMyHouseholdNanny,
  usePaymentAdvances,
  useScheduleTemplates,
} from '@/hooks/useHouseholdData'
import { buildAdvancePayoffEstimate, type ScheduleBackfillInput } from '@/lib/advance-backfill'
import {
  dedupeAdvanceRepayments,
  openAdvances,
  repaymentModeLabel,
  repaymentPeriodLabel,
  totalAdvanceBalance,
} from '@/lib/advances'
import { EstimatedPayoffDisplay, EstimatedPayoffFootnote } from '@/components/advances/EstimatedPayoffDisplay'
import { repaymentSourceLabel, type AdvanceRepayment } from '@/types/advance-repayment'
import type { EmploymentSetting, PayPeriodType, PaymentAdvance } from '@/types/database'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface NannyAdvanceDashboardCardProps {
  householdNannyId?: string
  className?: string
}

function visibleAdvances(advances: PaymentAdvance[]): PaymentAdvance[] {
  const open = openAdvances(advances)
  if (open.length) return open
  return advances.filter((a) => a.status !== 'void')
}

export function NannyAdvanceDashboardCard({
  householdNannyId,
  className,
}: NannyAdvanceDashboardCardProps) {
  const { data: myNanny } = useMyHouseholdNanny()
  const nannyId = householdNannyId ?? myNanny?.id
  const { data: advances, isLoading, isError } = usePaymentAdvances(nannyId)
  const { data: settingsList } = useEmploymentSettings(nannyId)
  const { data: templates } = useScheduleTemplates(nannyId)
  const settings = settingsList?.[0]

  const scheduleInput = useMemo((): ScheduleBackfillInput | undefined => {
    if (!nannyId) return undefined
    return {
      blocks: [],
      templates: (templates ?? []) as NannyScheduleTemplate[],
      householdNannyId: nannyId,
      payStartDate: myNanny?.start_date,
      platformStartDate: myNanny?.created_at?.slice(0, 10) ?? null,
    }
  }, [nannyId, templates, myNanny?.start_date, myNanny?.created_at])

  const visible = useMemo(() => visibleAdvances(advances ?? []), [advances])
  const outstanding = useMemo(() => openAdvances(visible), [visible])
  const totalBalance = useMemo(() => totalAdvanceBalance(visible), [visible])

  if (isLoading) {
    return (
      <Card className={cn('stat-card stat-card-highlight border-l-4 border-l-amber-500', className)}>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1.5">
            <HandCoins className="h-3.5 w-3.5" />
            Payment advance
          </CardDescription>
          <CardTitle className="text-3xl font-bold">…</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--color-muted-foreground)]">Loading advance status…</p>
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card className={cn('stat-card border-l-4 border-l-amber-500', className)}>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1.5">
            <HandCoins className="h-3.5 w-3.5" />
            Payment advance
          </CardDescription>
          <CardTitle className="text-xl font-bold">Couldn’t load advance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Refresh the page, or open Earnings to see your advance details.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!visible.length) {
    return (
      <Card className={cn('stat-card stat-card-highlight border-l-4 border-l-amber-500', className)}>
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1.5">
            <HandCoins className="h-3.5 w-3.5" />
            Payment advance
          </CardDescription>
          <CardTitle className="text-3xl font-bold">None on file</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            When your family issues an advance, the remaining balance and repayment plan will show
            here.
          </p>
        </CardContent>
      </Card>
    )
  }

  const paidInFull = outstanding.length === 0
  const primary = outstanding[0] ?? visible[0]!

  return (
    <Card className={cn('stat-card stat-card-highlight border-l-4 border-l-amber-500', className)}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">
          <HandCoins className="h-3.5 w-3.5" />
          Payment advance
        </CardDescription>
        <CardTitle className="text-3xl font-bold">
          {paidInFull ? 'Paid in full' : `${formatCurrency(totalBalance)} remaining`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {visible.length === 1 && settings ? (
          <AdvanceDashboardSummary
            advance={primary}
            settings={settings}
            scheduleInput={scheduleInput}
            detailTo={`/payroll/advances/${primary.id}`}
          />
        ) : visible.length === 1 ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {formatCurrency(primary.amount_cents - primary.balance_cents)} repaid of{' '}
              {formatCurrency(primary.amount_cents)}
              {primary.reason ? ` · ${primary.reason}` : ''}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/payroll/advances/${primary.id}`}>
                View details <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y rounded-lg border bg-[var(--color-card)]">
            {visible.map((advance) => {
              const estimate = settings
                ? buildAdvancePayoffEstimate(advance, settings, scheduleInput)
                : null
              return (
                <li key={advance.id}>
                  <Link
                    to={`/payroll/advances/${advance.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-accent)]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {advance.balance_cents > 0
                          ? `${formatCurrency(advance.balance_cents)} left`
                          : 'Paid in full'}
                      </p>
                      <p className="text-sm text-[var(--color-muted-foreground)]">
                        {formatCurrency(estimate?.paidCents ?? advance.amount_cents - advance.balance_cents)} repaid of{' '}
                        {formatCurrency(advance.amount_cents)}
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
        {!(visible.length === 1 && !settings) && (
          <Button variant="link" className="h-auto px-0 py-0 text-xs" asChild>
            <Link to={visible.length === 1 ? `/payroll/advances/${primary.id}` : '/payroll'}>
              {visible.length === 1 ? 'View advance details' : 'Open earnings'} →
            </Link>
          </Button>
        )}
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
            style={{ width: `${Math.min(100, estimate.percentPaid)}%` }}
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
  payPeriod,
}: {
  repayments: AdvanceRepayment[]
  issuedOn: string
  payPeriod?: PayPeriodType | null
}) {
  const sorted = useMemo(
    () =>
      [...dedupeAdvanceRepayments(repayments)].sort((a, b) => {
        const aKey = a.pay_period_start ?? a.paid_on
        const bKey = b.pay_period_start ?? b.paid_on
        return bKey.localeCompare(aKey) || b.paid_on.localeCompare(a.paid_on)
      }),
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
            <p className="font-medium">{repaymentPeriodLabel(r, payPeriod)}</p>
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
