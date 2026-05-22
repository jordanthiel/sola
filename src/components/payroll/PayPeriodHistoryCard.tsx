import type { PayPeriodHistoryRow } from '@/lib/advances'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function PayPeriodHistoryCard({ rows }: { rows: PayPeriodHistoryRow[] }) {
  if (!rows.length) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Pay periods</CardTitle>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Advance repayments recorded for each pay period
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {rows.map((row) => (
            <li key={row.periodStart} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
              <span>
                {row.periodStart} – {row.periodEnd}
                {row.hoursBasis ? ` (${row.hoursBasis})` : ''}
                {row.isClosed ? '' : ' · open'}
              </span>
              <span className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 tabular-nums">
                <span>
                  <span className="text-[var(--color-muted-foreground)]">Applied to advances </span>
                  <span className="font-medium">{formatCurrency(row.appliedCents)}</span>
                </span>
                {row.netPayCents != null && (
                  <span>
                    <span className="text-[var(--color-muted-foreground)]">Net pay </span>
                    <span className="font-medium">{formatCurrency(row.netPayCents)}</span>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
