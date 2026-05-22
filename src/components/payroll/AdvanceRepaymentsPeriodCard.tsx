import { format, parseISO } from 'date-fns'
import type { PaymentAdvance } from '@/types/database'
import { repaymentSourceLabel, type AdvanceRepayment } from '@/types/advance-repayment'
import { formatCurrency } from '@/lib/utils'

export function AdvanceRepaymentsPeriodCard({
  repayments,
  advances,
  periodLabel,
}: {
  repayments: AdvanceRepayment[]
  advances: PaymentAdvance[] | undefined
  periodLabel: string
}) {
  if (!repayments.length) return null

  const advanceById = Object.fromEntries((advances ?? []).map((a) => [a.id, a]))
  const total = repayments.reduce((sum, r) => sum + r.amount_cents, 0)

  return (
    <section className="space-y-3 rounded-lg border bg-[var(--color-muted)]/20 p-4">
      <div>
        <h4 className="font-medium">Applied to advances</h4>
        <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
          {formatCurrency(total)} applied during {periodLabel}
        </p>
      </div>
      <ul className="divide-y text-sm">
        {repayments.map((r) => {
          const advance = advanceById[r.payment_advance_id]
          const label = advance?.reason?.trim() || `Advance from ${advance?.issued_on ?? '—'}`
          return (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="font-medium">{label}</p>
                <p className="text-[var(--color-muted-foreground)]">
                  {format(parseISO(r.paid_on), 'MMM d, yyyy')} · {repaymentSourceLabel(r.source)}
                  {r.notes ? ` · ${r.notes}` : ''}
                </p>
              </div>
              <span className="shrink-0 font-medium tabular-nums">{formatCurrency(r.amount_cents)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
