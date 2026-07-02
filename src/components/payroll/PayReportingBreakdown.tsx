import type { PayReportingSplit } from '@/lib/pay-reporting'
import { formatCurrency } from '@/lib/utils'

export function PayReportingBreakdown({
  reporting,
  regularPayCents,
  overtimePayCents,
  lineItemsTotalCents,
  arrangementLabel,
}: {
  reporting: PayReportingSplit
  regularPayCents: number
  overtimePayCents: number
  lineItemsTotalCents: number
  arrangementLabel?: string
}) {
  const showDetail =
    reporting.totalOverCents > 0 &&
    reporting.totalUnderCents > 0

  return (
    <div className="rounded-lg border bg-[var(--color-muted)]/30 p-4 text-sm space-y-3">
      <div>
        <p className="font-medium">Pay reporting</p>
        {arrangementLabel && (
          <p className="mt-0.5 text-[var(--color-muted-foreground)]">{arrangementLabel}</p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ReportingColumn
          title="On the books"
          total={reporting.totalOverCents}
          variant="over"
        />
        <ReportingColumn
          title="Off the books"
          total={reporting.totalUnderCents}
          variant="under"
        />
      </div>
      {showDetail && (
        <dl className="grid gap-2 border-t pt-3 text-[var(--color-muted-foreground)] sm:grid-cols-2">
          {regularPayCents > 0 && (
            <ReportingDetailRow
              label="Regular / special pay"
              over={reporting.regularOverCents}
              under={reporting.regularUnderCents}
            />
          )}
          {overtimePayCents > 0 && (
            <ReportingDetailRow
              label="Overtime pay"
              over={reporting.overtimeOverCents}
              under={reporting.overtimeUnderCents}
            />
          )}
          {lineItemsTotalCents > 0 && (
            <ReportingDetailRow
              label="Bonuses / mileage"
              over={reporting.lineItemsOverCents}
              under={reporting.lineItemsUnderCents}
            />
          )}
        </dl>
      )}
    </div>
  )
}

function ReportingColumn({
  title,
  total,
  variant,
}: {
  title: string
  total: number
  variant: 'over' | 'under'
}) {
  return (
    <div
      className={
        variant === 'over'
          ? 'rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3'
          : 'rounded-md border border-amber-500/20 bg-amber-500/5 p-3'
      }
    >
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {title}
      </p>
      <p className="mt-1 text-xl font-semibold">{formatCurrency(total)}</p>
    </div>
  )
}

function ReportingDetailRow({
  label,
  over,
  under,
}: {
  label: string
  over: number
  under: number
}) {
  if (over === 0 && under === 0) return null
  return (
    <div>
      <dt className="font-medium text-[var(--color-foreground)]">{label}</dt>
      <dd className="mt-0.5">
        {over > 0 && <span>On books {formatCurrency(over)}</span>}
        {over > 0 && under > 0 && ' · '}
        {under > 0 && <span>Off books {formatCurrency(under)}</span>}
      </dd>
    </div>
  )
}
