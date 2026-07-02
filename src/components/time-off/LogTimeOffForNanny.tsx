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

const PARENT_TIME_OFF_TYPES: TimeOffType[] = ['sick', 'pto', 'vacation']

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
  const [nannyJoinsVacation, setNannyJoinsVacation] = useState(false)
  const [vacationDailyRate, setVacationDailyRate] = useState('')
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
      const vacationRate = vacationDailyRate.trim() === '' ? null : parseFloat(vacationDailyRate)
      const { error: insertError } = await supabase.from('time_off_requests').insert({
        household_id: activeHousehold!.id,
        household_nanny_id: nannyId,
        type,
        starts_on: startsOn,
        ends_on: endsOn,
        hours: parsedHours,
        notes: notes.trim() || null,
        nanny_joins_vacation: type === 'vacation' ? nannyJoinsVacation : false,
        vacation_daily_rate_cents:
          type === 'vacation' && vacationRate !== null && Number.isFinite(vacationRate)
            ? Math.round(vacationRate * 100)
            : null,
        status: 'approved',
        reviewed_by: user!.id,
        reviewed_at: new Date().toISOString(),
      })
      if (insertError) throw insertError
    },
    onSuccess: () => {
      setError('')
      setNotes('')
      setNannyJoinsVacation(false)
      setVacationDailyRate('')
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
        Record sick time, PTO, or a family vacation day for a nanny on their behalf. Sick and PTO
        deduct from their balance; vacation pay applies only when the nanny joins.
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
              {t === 'sick' ? 'Sick' : t === 'pto' ? 'PTO' : 'Vacation'}
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
          <Label htmlFor="log-time-off-hours">
            {type === 'vacation' ? 'Hours (for records)' : 'Hours'}
          </Label>
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

      {type === 'vacation' && (
        <div className="space-y-3 rounded-md border p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={nannyJoinsVacation}
              onChange={(e) => setNannyJoinsVacation(e.target.checked)}
            />
            <span>
              <span className="font-medium">Nanny joins this vacation</span>
              <span className="mt-0.5 block text-sm text-[var(--color-muted-foreground)]">
                When checked, this approved vacation day can be included in Earnings.
              </span>
            </span>
          </label>
          {nannyJoinsVacation && (
            <div className="space-y-2">
              <Label htmlFor="log-vacation-rate">Vacation rate ($/day)</Label>
              <Input
                id="log-vacation-rate"
                type="number"
                step="0.01"
                value={vacationDailyRate}
                onChange={(e) => setVacationDailyRate(e.target.value)}
                placeholder="Use nanny default"
              />
            </div>
          )}
        </div>
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
