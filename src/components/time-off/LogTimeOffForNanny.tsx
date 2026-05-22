import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useHouseholdNannies, usePtoBalances } from '@/hooks/useHouseholdData'
import { formatSupabaseError } from '@/lib/errors'
import { invalidateTimeOffQueries } from '@/lib/invalidate-time-off'
import { formatPtoHours, ptoRemaining } from '@/lib/pto'
import { nannyDisplayName } from '@/lib/nanny'
import type { TimeOffType } from '@/types/database'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { selectCn } from '@/lib/utils'

const PARENT_TIME_OFF_TYPES: TimeOffType[] = ['sick', 'pto']

export function LogTimeOffForm({ onSuccess }: { onSuccess?: () => void }) {
  const { user } = useAuth()
  const { activeHousehold } = useHousehold()
  const { data: nannies } = useHouseholdNannies()
  const { data: balances } = usePtoBalances()
  const qc = useQueryClient()

  const [nannyId, setNannyId] = useState('')
  const [type, setType] = useState<TimeOffType>('sick')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [hours, setHours] = useState('8')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!nannyId && nannies?.length) {
      setNannyId(nannies[0].id)
    }
  }, [nannies, nannyId])

  const balance = balances?.find((b) => b.household_nanny_id === nannyId)

  const logTimeOff = useMutation({
    mutationFn: async () => {
      const parsedHours = parseFloat(hours)
      if (Number.isNaN(parsedHours) || parsedHours <= 0) {
        throw new Error('Enter a valid number of hours')
      }
      const { error: insertError } = await supabase.from('time_off_requests').insert({
        household_id: activeHousehold!.id,
        household_nanny_id: nannyId,
        type,
        starts_on: startsOn,
        ends_on: endsOn,
        hours: parsedHours,
        notes: notes.trim() || null,
        status: 'approved',
        reviewed_by: user!.id,
        reviewed_at: new Date().toISOString(),
      })
      if (insertError) throw insertError
    },
    onSuccess: () => {
      setError('')
      setNotes('')
      void invalidateTimeOffQueries(qc)
      toast.success('Time off logged')
      onSuccess?.()
    },
    onError: (err) => setError(formatSupabaseError(err)),
  })

  const remaining =
    balance && (type === 'sick' || type === 'pto') ? ptoRemaining(balance, type) : null

  if (!nannies?.length) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Add a nanny in Settings before logging time off.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Record sick or PTO for a nanny on their behalf. This is saved as approved and deducts from
        their balance.
      </p>

      <div className="space-y-2">
        <Label htmlFor="log-time-off-nanny">Nanny</Label>
        <select
          id="log-time-off-nanny"
          className={selectCn}
          value={nannyId}
          onChange={(e) => setNannyId(e.target.value)}
        >
          <option value="">Select nanny</option>
          {nannies.map((n) => (
            <option key={n.id} value={n.id}>
              {nannyDisplayName(n)}
            </option>
          ))}
        </select>
      </div>

      {balance && nannyId && (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Sick remaining: {formatPtoHours(ptoRemaining(balance, 'sick'))} · PTO remaining:{' '}
          {formatPtoHours(ptoRemaining(balance, 'pto'))}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="log-time-off-type">Type</Label>
        <select
          id="log-time-off-type"
          className={selectCn}
          value={type}
          onChange={(e) => setType(e.target.value as TimeOffType)}
        >
          {PARENT_TIME_OFF_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'sick' ? 'Sick' : 'PTO'}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="log-time-off-start">Start date</Label>
          <DatePicker id="log-time-off-start" value={startsOn} onChange={setStartsOn} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="log-time-off-end">End date</Label>
          <DatePicker
            id="log-time-off-end"
            value={endsOn}
            onChange={setEndsOn}
            min={startsOn || undefined}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="log-time-off-hours">Hours</Label>
          <Input
            id="log-time-off-hours"
            type="number"
            min="0.5"
            step="0.5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
      </div>

      {remaining !== null && parseFloat(hours) > remaining && (
        <p className="text-sm text-amber-700">
          This exceeds remaining {type === 'sick' ? 'sick' : 'PTO'} balance ({formatPtoHours(remaining)}).
          You can still log it if needed.
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="log-time-off-notes">Notes (optional)</Label>
        <Input id="log-time-off-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        onClick={() => logTimeOff.mutate()}
        disabled={!nannyId || !startsOn || !endsOn || logTimeOff.isPending}
      >
        {logTimeOff.isPending ? 'Saving...' : 'Log time off'}
      </Button>
    </div>
  )
}
