import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useMyHouseholdNanny } from '@/hooks/useHouseholdData'
import { invalidateTimeOffQueries } from '@/lib/invalidate-time-off'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { selectCn } from '@/lib/utils'
import type { TimeOffType } from '@/types/database'

export function RequestTimeOffForm({ onSuccess }: { onSuccess?: () => void }) {
  const { activeHousehold } = useHousehold()
  const { data: myNanny } = useMyHouseholdNanny()
  const qc = useQueryClient()

  const [type, setType] = useState<TimeOffType>('sick')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [hours, setHours] = useState('8')
  const [notes, setNotes] = useState('')

  const createRequest = useMutation({
    mutationFn: async () => {
      if (!myNanny) throw new Error('Your profile is not linked yet')
      const { error } = await supabase.from('time_off_requests').insert({
        household_id: activeHousehold!.id,
        household_nanny_id: myNanny.id,
        type,
        starts_on: startsOn,
        ends_on: endsOn,
        hours: parseFloat(hours),
        notes: notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void invalidateTimeOffQueries(qc)
      setNotes('')
      toast.success('Time off request submitted')
      onSuccess?.()
    },
    onError: () => toast.error('Failed to submit request'),
  })

  if (!myNanny?.user_id) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Claim your nanny profile before submitting time off requests.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Type</Label>
        <select
          className={selectCn}
          value={type}
          onChange={(e) => setType(e.target.value as TimeOffType)}
        >
          <option value="sick">Sick</option>
          <option value="pto">PTO</option>
          <option value="unpaid">Unpaid</option>
        </select>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Start date</Label>
          <DatePicker value={startsOn} onChange={setStartsOn} />
        </div>
        <div className="space-y-2">
          <Label>End date</Label>
          <DatePicker value={endsOn} onChange={setEndsOn} min={startsOn || undefined} />
        </div>
        <div className="space-y-2">
          <Label>Hours</Label>
          <Input type="number" value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button
        onClick={() => createRequest.mutate()}
        disabled={!startsOn || !endsOn || createRequest.isPending}
      >
        {createRequest.isPending ? 'Submitting...' : 'Submit request'}
      </Button>
    </div>
  )
}
