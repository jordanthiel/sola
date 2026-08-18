import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useHouseholdNannies, usePtoBalances } from '@/hooks/useHouseholdData'
import { useHouseholdHolidays } from '@/hooks/useHouseholdHolidays'
import { formatSupabaseError } from '@/lib/errors'
import { TimeOffHoursFields } from '@/components/time-off/TimeOffHoursFields'
import { invalidateCalendarQueries } from '@/lib/invalidate-calendar'
import {
  DEFAULT_PTO_HOURS_PER_DAY,
  calculatedTimeOffHours,
  formatPtoHours,
  hoursPerDayFromTotal,
  parseHoursPerDay,
  ptoRemaining,
} from '@/lib/pto'
import { nannyDisplayName } from '@/lib/nanny'
import type { TimeOffRequest, TimeOffType } from '@/types/database'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { selectCn } from '@/lib/utils'

const PARENT_TIME_OFF_TYPES: TimeOffType[] = ['sick', 'pto', 'unpaid', 'vacation']

export function LogTimeOffForm({
  onSuccess,
  existing,
}: {
  onSuccess?: () => void
  existing?: TimeOffRequest
}) {
  const { user } = useAuth()
  const { activeHousehold } = useHousehold()
  const { data: nannies } = useHouseholdNannies()
  const { data: balances } = usePtoBalances()
  const { data: holidayOverrides } = useHouseholdHolidays()
  const qc = useQueryClient()
  const isEdit = !!existing
  const holidays = holidayOverrides ?? []

  const [nannyId, setNannyId] = useState(existing?.household_nanny_id ?? '')
  const [type, setType] = useState<TimeOffType>(existing?.type ?? 'sick')
  const [startsOn, setStartsOn] = useState(existing?.starts_on ?? '')
  const [endsOn, setEndsOn] = useState(existing?.ends_on ?? '')
  const [hoursPerDay, setHoursPerDay] = useState(
    existing
      ? hoursPerDayFromTotal(existing.hours, existing.starts_on, existing.ends_on, holidays)
      : String(DEFAULT_PTO_HOURS_PER_DAY),
  )
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [nannyJoinsVacation, setNannyJoinsVacation] = useState(existing?.nanny_joins_vacation ?? false)
  const [vacationDailyRate, setVacationDailyRate] = useState(
    existing?.vacation_daily_rate_cents != null
      ? (existing.vacation_daily_rate_cents / 100).toFixed(2)
      : '',
  )
  const [error, setError] = useState('')

  useEffect(() => {
    if (!nannyId && nannies?.length && !isEdit) {
      setNannyId(nannies[0].id)
    }
  }, [nannies, nannyId, isEdit])

  const balance = balances?.find((b) => b.household_nanny_id === nannyId)
  const parsedHoursPerDay = parseHoursPerDay(hoursPerDay)
  const totalHours =
    parsedHoursPerDay == null
      ? 0
      : calculatedTimeOffHours(startsOn, endsOn, parsedHoursPerDay, holidays)

  const logTimeOff = useMutation({
    mutationFn: async () => {
      if (totalHours <= 0) {
        throw new Error('Choose a date range with at least one working day')
      }
      const vacationRate = vacationDailyRate.trim() === '' ? null : parseFloat(vacationDailyRate)
      const payload = {
        type,
        starts_on: startsOn,
        ends_on: endsOn,
        hours: totalHours,
        notes: notes.trim() || null,
        nanny_joins_vacation: type === 'vacation' ? nannyJoinsVacation : false,
        vacation_daily_rate_cents:
          type === 'vacation' && vacationRate !== null && Number.isFinite(vacationRate)
            ? Math.round(vacationRate * 100)
            : null,
      }
      if (existing) {
        const { error: updateError } = await supabase
          .from('time_off_requests')
          .update(payload)
          .eq('id', existing.id)
        if (updateError) throw updateError
        return
      }
      const { error: insertError } = await supabase.from('time_off_requests').insert({
        household_id: activeHousehold!.id,
        household_nanny_id: nannyId,
        ...payload,
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
      void invalidateCalendarQueries(qc)
      toast.success(isEdit ? 'Time off updated' : 'Time off logged')
      onSuccess?.()
    },
    onError: (err) => setError(formatSupabaseError(err)),
  })

  const remaining =
    balance && (type === 'sick' || type === 'pto') ? ptoRemaining(balance, type) : null
  const remainingForWarning =
    remaining == null
      ? null
      : existing &&
          existing.status === 'approved' &&
          (existing.type === 'sick' || existing.type === 'pto') &&
          existing.type === type
        ? remaining + Number(existing.hours)
        : remaining

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
        {isEdit
          ? 'Update dates, hours, or type. Sick and PTO balances adjust automatically.'
          : 'Record sick time, PTO, or a family vacation day for a nanny on their behalf. Sick and PTO deduct from their balance; vacation pay applies only when the nanny joins.'}
      </p>

      <div className="space-y-2">
        <Label htmlFor="log-time-off-nanny">Nanny</Label>
        <select
          id="log-time-off-nanny"
          className={selectCn}
          value={nannyId}
          onChange={(e) => setNannyId(e.target.value)}
          disabled={isEdit}
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
              {t === 'pto' ? 'PTO' : t.charAt(0).toUpperCase() + t.slice(1)}
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
        <TimeOffHoursFields
          id="log-time-off-hours-per-day"
          startsOn={startsOn}
          endsOn={endsOn}
          hoursPerDay={hoursPerDay}
          onHoursPerDayChange={setHoursPerDay}
          holidayOverrides={holidays}
          hoursLabel={type === 'vacation' ? 'Hours per day (for records)' : 'Hours per day'}
        />
      </div>

      {remainingForWarning !== null && totalHours > remainingForWarning && (
        <p className="text-sm text-amber-700">
          This exceeds remaining {type === 'sick' ? 'sick' : 'PTO'} balance ({formatPtoHours(remainingForWarning)}).
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
        disabled={!nannyId || !startsOn || !endsOn || totalHours <= 0 || logTimeOff.isPending}
      >
        {logTimeOff.isPending ? 'Saving...' : isEdit ? 'Save changes' : 'Log time off'}
      </Button>
    </div>
  )
}
