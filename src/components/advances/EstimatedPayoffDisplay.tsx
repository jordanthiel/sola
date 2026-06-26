import { format } from 'date-fns'
import type { AdvancePayoffEstimate } from '@/lib/advances'

export function EstimatedPayoffDisplay({
  estimate,
  dateFormat = 'MMM d, yyyy',
  className,
}: {
  estimate: AdvancePayoffEstimate
  dateFormat?: string
  className?: string
}) {
  if (estimate.estimatedPayoffDate) {
    return (
      <span className={className}>
        {format(estimate.estimatedPayoffDate, dateFormat)}
        {estimate.estimatedPayoffApproximate && (
          <span className="text-[var(--color-muted-foreground)]">*</span>
        )}
      </span>
    )
  }

  return <span className={className}>{estimate.estimatedPayoffLabel}</span>
}

export function EstimatedPayoffFootnote({ estimate }: { estimate: AdvancePayoffEstimate }) {
  if (!estimate.estimatedPayoffApproximate) return null

  return (
    <p className="text-xs text-[var(--color-muted-foreground)]">
      * Based on your usual weekly schedule; actual payoff could change if hours vary.
    </p>
  )
}
