import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { invalidateTimeOffQueries } from '@/lib/invalidate-time-off'
import { invalidateCalendarQueries } from '@/lib/invalidate-calendar'

export type ReviewTimeOffInput = {
  id: string
  status: 'approved' | 'denied'
  reviewNotes?: string
}

export function useReviewTimeOff(options?: { invalidateCalendar?: boolean }) {
  const { user } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status, reviewNotes }: ReviewTimeOffInput) => {
      const trimmed = reviewNotes?.trim()
      const { error } = await supabase
        .from('time_off_requests')
        .update({
          status,
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          review_notes: trimmed || null,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, { status }) => {
      void invalidateTimeOffQueries(qc)
      if (options?.invalidateCalendar) {
        invalidateCalendarQueries(qc)
      }
      toast.success(status === 'approved' ? 'Request approved' : 'Request denied')
    },
    onError: () => toast.error('Failed to update request'),
  })
}
