import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatSupabaseError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ScheduleDayTarget } from '@/types/schedule-day'

interface EditDayDialogProps {
  target: ScheduleDayTarget | null
  onClose: () => void
}

export function EditDayDialog({ target, onClose }: EditDayDialogProps) {
  const { activeHousehold } = useHousehold()
  const qc = useQueryClient()
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!target) return
    setStartTime(format(target.startsAt, 'HH:mm'))
    setEndTime(format(target.endsAt, 'HH:mm'))
    setNotes(target.notes ?? '')
    setError('')
  }, [target])

  const save = useMutation({
    mutationFn: async () => {
      if (!target || !activeHousehold) return
      const workDate = format(target.day, 'yyyy-MM-dd')
      const [sh, sm] = startTime.split(':').map(Number)
      const [eh, em] = endTime.split(':').map(Number)
      const startsAt = new Date(target.day)
      startsAt.setHours(sh, sm, 0, 0)
      let endsAt = new Date(target.day)
      endsAt.setHours(eh, em, 0, 0)
      if (endsAt <= startsAt) {
        endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000)
      }

      const { error: rpcError } = await supabase.rpc('upsert_schedule_day', {
        p_household_id: activeHousehold.id,
        p_household_nanny_id: target.householdNannyId,
        p_work_date: workDate,
        p_starts_at: startsAt.toISOString(),
        p_ends_at: endsAt.toISOString(),
        p_notes: notes.trim() || null,
      })
      if (rpcError) throw rpcError
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      onClose()
    },
    onError: (err) => setError(formatSupabaseError(err)),
  })

  if (!target) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motionDiv className="w-full max-w-md rounded-lg border bg-[var(--color-card)] p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Change times for {format(target.day, 'EEEE, MMM d')}</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Override the usual schedule for this day only.
        </p>
        <div className="mt-4 space-y-4">
          <motionDiv className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </motionDiv>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <motionDiv className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Saving...' : 'Save'}
            </Button>
          </motionDiv>
        </div>
      </motionDiv>
    </motionDiv>
  )
}

function motionDiv({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <motionDiv className={className}>{children}</motionDiv>
}
