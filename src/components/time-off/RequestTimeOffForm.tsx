import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useMyHouseholdNanny } from '@/hooks/useHouseholdData'
import { useHouseholdHolidays } from '@/hooks/useHouseholdHolidays'
import { invalidateCalendarQueries } from '@/lib/invalidate-calendar'
import { Button } from '@/components/ui/button'
import { TimeOffHoursFields } from '@/components/time-off/TimeOffHoursFields'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DEFAULT_PTO_HOURS_PER_DAY,
  calculatedTimeOffHours,
  hoursPerDayFromTotal,
  parseHoursPerDay,
} from '@/lib/pto'
import { selectCn } from '@/lib/utils'
import type { TimeOffRequest, TimeOffType } from '@/types/database'

export function RequestTimeOffForm({
  onSuccess,
  existing,
}: {
  onSuccess?: () => void
  existing?: TimeOffRequest
}) {
  const { activeHousehold } = useHousehold()
  const { data: myNanny } = useMyHouseholdNanny()
  const { data: holidayOverrides } = useHouseholdHolidays()
  const qc = useQueryClient()
  const isEdit = !!existing
  const holidays = holidayOverrides ?? []

  const [type, setType] = useState<TimeOffType>(existing?.type ?? 'sick')
  const [startsOn, setStartsOn] = useState(existing?.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(existing?.ends_on ?? '')
  const [hoursPerDay, setHoursPerDay] = useState(
    existing
      ? hoursPerDayFromTotal(existing.hours, existing.starts_on, existing.ends_on, holidays)
      : String(DEFAULT_PTO_HOURS_PER_DAY),
  )
  const [notes, setNotes] = useState(existing?.notes ?? '')

  const parsedHoursPerDay = parseHoursPerDay(hoursPerDay)
  const totalHours =
    parsedHoursPerDay == null
      ? 0
      : calculatedTimeOffHours(startsOn, endsOn, parsedHoursPerDay, holidays)

  const saveRequest = useMutation({
    mutationFn: async () => {
      if (!myNanny) throw new Error('Your profile is not linked yet')
      if (totalHours <= 0) throw new Error('Choose a date range with at least one working day')
      const payload = {
        type,
        starts_on: startsOn,
        ends_on: endsOn,
        hours: totalHours,
        notes: notes.trim() || null,
      }
      if (existing) {
        const { error } = await supabase.from('time_off_requests').update(payload).eq('id', existing.id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('time_off_requests').insert({
        household_id: activeHousehold!.id,
        household_nanny_id: myNanny.id,
        ...payload,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void invalidateCalendarQueries(qc)
      setNotes('')
      toast.success(isEdit ? 'Time off request updated' : 'Time off request submitted')
      onSuccess?.()
    },
    onError: () => toast.error(isEdit ? 'Failed to update request' : 'Failed to submit request'),
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
          {(existing?.type === 'vacation' || type === 'vacation') && (
            <option value="vacation">Vacation</option>
          )}
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
        <TimeOffHoursFields
          startsOn={startsOn}
          endsOn={endsOn}
          hoursPerDay={hoursPerDay}
          onHoursPerDayChange={setHoursPerDay}
          holidayOverrides={holidays}
        />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button
        onClick={() => saveRequest.mutate()}
        disabled={!startsOn || !endsOn || totalHours <= 0 || saveRequest.isPending}
      >
        {saveRequest.isPending
          ? isEdit
            ? 'Saving...'
            : 'Submitting...'
          : isEdit
            ? 'Save changes'
            : 'Submit request'}
      </Button>
    </div>
  )
}
