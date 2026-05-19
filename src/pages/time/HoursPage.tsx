import { useState } from 'react'
import { format, parseISO, addDays } from 'date-fns'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import {
  useActiveClockEntry,
  useMyHouseholdNanny,
  useNannies,
  useTimeEntries,
} from '@/hooks/useHouseholdData'
import { nannyDisplayName } from '@/lib/nanny'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatHours } from '@/lib/utils'
import { entryWorkedMinutes, exportTimeEntriesCsv } from '@/lib/payroll'

export function HoursPage() {
  const { activeHousehold, isParent, isNanny } = useHousehold()
  const { data: myNanny } = useMyHouseholdNanny()
  const [nannyFilter, setNannyFilter] = useState('')
  const from = addDays(new Date(), -30).toISOString()
  const to = addDays(new Date(), 1).toISOString()

  const { data: entries, isLoading } = useTimeEntries(from, to, nannyFilter || undefined)
  const { data: activeClock } = useActiveClockEntry()
  const { data: nannies } = useNannies()
  const qc = useQueryClient()

  const [clockIn, setClockIn] = useState('')
  const [clockOut, setClockOut] = useState('')
  const [breakMin, setBreakMin] = useState('0')
  const [notes, setNotes] = useState('')

  const nannyNameMap = Object.fromEntries((nannies ?? []).map((n) => [n.id, nannyDisplayName(n)]))

  const clockInMutation = useMutation({
    mutationFn: async () => {
      if (!myNanny) throw new Error('Your profile is not linked yet')
      const { error } = await supabase.from('time_entries').insert({
        household_id: activeHousehold!.id,
        household_nanny_id: myNanny.id,
        clock_in: new Date().toISOString(),
        source: 'clock',
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time_entries', 'active_clock'] }),
  })

  const clockOutMutation = useMutation({
    mutationFn: async () => {
      if (!activeClock) return
      const { error } = await supabase
        .from('time_entries')
        .update({ clock_out: new Date().toISOString() })
        .eq('id', activeClock.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time_entries', 'active_clock'] }),
  })

  const manualEntry = useMutation({
    mutationFn: async () => {
      const targetNannyId = isNanny ? myNanny?.id : nannyFilter
      if (!targetNannyId) throw new Error('Select a nanny')
      const { error } = await supabase.from('time_entries').insert({
        household_id: activeHousehold!.id,
        household_nanny_id: targetNannyId,
        clock_in: new Date(clockIn).toISOString(),
        clock_out: clockOut ? new Date(clockOut).toISOString() : null,
        break_minutes: parseInt(breakMin, 10) || 0,
        notes: notes || null,
        source: 'manual',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time_entries'] })
      setClockIn('')
      setClockOut('')
      setNotes('')
    },
  })

  function downloadCsv() {
    if (!entries?.length) return
    const csv = exportTimeEntriesCsv(entries, nannyNameMap)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `time-entries-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Hours</h1>
          <p className="text-[var(--color-muted-foreground)]">Track worked time</p>
        </div>
        {entries && entries.length > 0 && (
          <Button variant="outline" onClick={downloadCsv}>
            Export CSV
          </Button>
        )}
      </div>

      {isNanny && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Time clock</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!myNanny?.user_id ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Ask your family to send you a claim link before you can clock in.
              </p>
            ) : activeClock ? (
              <>
                <p className="text-sm">
                  Clocked in since {format(parseISO(activeClock.clock_in), 'h:mm a')}
                </p>
                <Button onClick={() => clockOutMutation.mutate()} disabled={clockOutMutation.isPending}>
                  Clock out
                </Button>
              </>
            ) : (
              <Button onClick={() => clockInMutation.mutate()} disabled={clockInMutation.isPending}>
                Clock in
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Log hours manually</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isParent && (
            <div className="space-y-2">
              <Label>Nanny</Label>
              <select
                className="flex h-10 w-full rounded-md border px-3 text-sm"
                value={nannyFilter}
                onChange={(e) => setNannyFilter(e.target.value)}
              >
                <option value="">Select nanny</option>
                {nannies?.map((n) => (
                  <option key={n.id} value={n.id}>
                    {nannyDisplayName(n)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Clock in</Label>
              <Input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Clock out</Label>
              <Input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Break (min)</Label>
              <Input type="number" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button onClick={() => manualEntry.mutate()} disabled={!clockIn || manualEntry.isPending}>
            Save entry
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent entries</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading...</p>
          ) : !entries?.length ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">No entries yet.</p>
          ) : (
            <ul className="space-y-3">
              {entries.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b pb-3 last:border-0">
                  <div>
                    <p className="font-medium">
                      {e.household_nanny_id ? nannyNameMap[e.household_nanny_id] : 'Nanny'}
                    </p>
                    <p className="text-sm">
                      {format(parseISO(e.clock_in), 'MMM d, h:mm a')}
                      {e.clock_out && ` – ${format(parseISO(e.clock_out), 'h:mm a')}`}
                    </p>
                    {e.notes && <p className="text-sm text-[var(--color-muted-foreground)]">{e.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatHours(entryWorkedMinutes(e))}</p>
                    <Badge variant="outline">{e.source}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
