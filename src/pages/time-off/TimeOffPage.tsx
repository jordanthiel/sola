import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import {
  useMyHouseholdNanny,
  useNannies,
  usePtoBalances,
  useTimeOffRequests,
} from '@/hooks/useHouseholdData'
import { nannyDisplayName } from '@/lib/nanny'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { TimeOffType } from '@/types/database'

export function TimeOffPage() {
  const { user } = useAuth()
  const { activeHousehold, isParent } = useHousehold()
  const { data: myNanny } = useMyHouseholdNanny()
  const { data: requests, isLoading } = useTimeOffRequests()
  const { data: balances } = usePtoBalances()
  const { data: nannies } = useNannies()
  const qc = useQueryClient()

  const [type, setType] = useState<TimeOffType>('sick')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [hours, setHours] = useState('8')
  const [notes, setNotes] = useState('')

  const nannyName = (householdNannyId: string | null) => {
    if (!householdNannyId) return 'Nanny'
    const n = nannies?.find((x) => x.id === householdNannyId)
    return n ? nannyDisplayName(n) : 'Nanny'
  }

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
      qc.invalidateQueries({ queryKey: ['time_off'] })
      setNotes('')
    },
  })

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'denied' }) => {
      const { error } = await supabase
        .from('time_off_requests')
        .update({ status, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time_off', 'pending_time_off'] }),
  })

  const myBalance = balances?.find((b) => b.household_nanny_id === myNanny?.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Time off</h1>
        <p className="text-[var(--color-muted-foreground)]">Sick days, PTO, and requests</p>
      </div>

      {myBalance && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your balances</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-[var(--color-muted-foreground)]">Sick (remaining)</p>
              <p className="text-xl font-semibold">
                {(myBalance.sick_hours_accrued - myBalance.sick_hours_used).toFixed(1)}h
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--color-muted-foreground)]">PTO (remaining)</p>
              <p className="text-xl font-semibold">
                {(myBalance.pto_hours_accrued - myBalance.pto_hours_used).toFixed(1)}h
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isParent && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Request time off</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!myNanny?.user_id ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Claim your nanny profile before submitting time off requests.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <select
                    className="flex h-10 w-full rounded-md border px-3 text-sm"
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
                    <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>End date</Label>
                    <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
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
                  Submit request
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading...</p>
          ) : !requests?.length ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">No requests.</p>
          ) : (
            <ul className="space-y-3">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0">
                  <div>
                    <p className="font-medium">
                      {nannyName(r.household_nanny_id)} · {r.type}
                    </p>
                    <p className="text-sm">
                      {r.starts_on} – {r.ends_on} ({r.hours}h)
                    </p>
                    {r.notes && <p className="text-sm text-[var(--color-muted-foreground)]">{r.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        r.status === 'approved' ? 'success' : r.status === 'denied' ? 'destructive' : 'warning'
                      }
                    >
                      {r.status}
                    </Badge>
                    {isParent && r.status === 'pending' && (
                      <>
                        <Button size="sm" onClick={() => review.mutate({ id: r.id, status: 'approved' })}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => review.mutate({ id: r.id, status: 'denied' })}>
                          Deny
                        </Button>
                      </>
                    )}
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
