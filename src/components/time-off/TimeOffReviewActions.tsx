import { useState } from 'react'
import { useReviewTimeOff } from '@/hooks/useReviewTimeOff'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function TimeOffReviewActions({
  requestId,
  onComplete,
  invalidateCalendar,
}: {
  requestId: string
  onComplete?: () => void
  invalidateCalendar?: boolean
}) {
  const [reviewNotes, setReviewNotes] = useState('')
  const review = useReviewTimeOff({ invalidateCalendar })

  const submit = (status: 'approved' | 'denied') => {
    review.mutate(
      { id: requestId, status, reviewNotes },
      {
        onSuccess: () => {
          setReviewNotes('')
          onComplete?.()
        },
      },
    )
  }

  return (
    <div className="flex w-full min-w-[12rem] flex-col gap-3 sm:max-w-xs">
      <div className="space-y-2">
        <Label htmlFor={`review-note-${requestId}`} className="text-xs text-[var(--color-muted-foreground)]">
          Note to nanny (optional)
        </Label>
        <Textarea
          id={`review-note-${requestId}`}
          value={reviewNotes}
          onChange={(e) => setReviewNotes(e.target.value)}
          rows={2}
          placeholder="Reason or details for your decision..."
          disabled={review.isPending}
        />
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" onClick={() => submit('approved')} disabled={review.isPending}>
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => submit('denied')} disabled={review.isPending}>
          Deny
        </Button>
      </div>
    </div>
  )
}
