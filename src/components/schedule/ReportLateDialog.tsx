import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ReportLateTarget } from '@/types/schedule-day'

interface ReportLateDialogProps {
  target: ReportLateTarget | null
  onClose: () => void
}

export function ReportLateDialog({ target, onClose }: ReportLateDialogProps) {
  const qc = useQueryClient()
  const [endTime, setEndTime] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!target) return
    const initial = target.actualEndsAt
      ? format(new Date(target.actualEndsAt), 'HH:mm')
      : format(target.scheduledEnd, 'HH:mm')
    setEndTime(initial)
    setNotes(target.notes ?? '')
    setError('')
  }, [target])

  const save = useMutation({
    mutationFn: async () => {
      if (!target) return
      const [h, m] = endTime.split(':').map(Number)
      const actualEnd = new Date(target.day)
      actualEnd.setHours(h, m, 0, 0)
      if (actualEnd < target.scheduledEnd) {
        throw new Error('End time must be at or after the scheduled end')
      }

      const { error: rpcError } = await supabase.rpc('report_shift_late', {
        p_schedule_block_id: target.scheduleBlockId,
        p_actual_ends_at: actualEnd.toISOString(),
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
      <div className="w-full max-w-md rounded-lg border bg-[var(--color-card)] p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Worked late on {format(target.day, 'EEEE, MMM d')}</h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Scheduled end: {format(target.scheduledEnd, 'h:mm a')}. Enter when you actually finished.
        </p>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>Actual end time</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
