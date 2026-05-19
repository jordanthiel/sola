import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useEmploymentSettings, useHouseholdNannies, useMembers } from '@/hooks/useHouseholdData'
import { formatSupabaseError } from '@/lib/errors'
import { isNannyClaimed, nannyDisplayName } from '@/lib/nanny'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import type { PayPeriodType } from '@/types/database'
import { DefaultScheduleEditor } from '@/components/settings/DefaultScheduleEditor'

export function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth()
  const { activeHousehold, isParent } = useHousehold()
  const { data: nannies, refetch: refetchNannies } = useHouseholdNannies()
  const { data: members } = useMembers()
  const qc = useQueryClient()

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [claimLinks, setClaimLinks] = useState<Record<string, string>>({})

  const [nannyId, setNannyId] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [otMultiplier, setOtMultiplier] = useState('1.5')
  const [standardHours, setStandardHours] = useState('40')
  const [payPeriod, setPayPeriod] = useState<PayPeriodType>('biweekly')

  const { data: employment } = useEmploymentSettings(nannyId || undefined)

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => refreshProfile(),
  })

  const addNanny = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('create_household_nanny', {
        p_household_id: activeHousehold!.id,
        p_first_name: firstName.trim(),
        p_last_name: lastName.trim(),
        p_email: email.trim().toLowerCase(),
        p_phone: phone.trim() || undefined,
        p_notes: notes.trim() || undefined,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setFormSuccess(`${firstName} ${lastName} was added. Send them a claim link when they are ready to log in.`)
      setFormError('')
      setFirstName('')
      setLastName('')
      setEmail('')
      setPhone('')
      setNotes('')
      await refetchNannies()
      qc.invalidateQueries({ queryKey: ['household_nannies', 'nannies', 'pto_balances'] })
    },
    onError: (err) => {
      setFormSuccess('')
      setFormError(formatSupabaseError(err))
    },
  })

  const sendClaimLink = useMutation({
    mutationFn: async (householdNannyId: string) => {
      const { data: token, error } = await supabase.rpc('create_nanny_claim_link', {
        p_household_nanny_id: householdNannyId,
      })
      if (error) throw error
      return `${window.location.origin}/claim?token=${token}`
    },
    onSuccess: (link, householdNannyId) => {
      setClaimLinks((prev) => ({ ...prev, [householdNannyId]: link }))
    },
    onError: (err) => {
      setFormError(formatSupabaseError(err))
    },
  })

  const saveEmployment = useMutation({
    mutationFn: async () => {
      const cents = Math.round(parseFloat(hourlyRate) * 100)
      const { error } = await supabase.from('employment_settings').insert({
        household_id: activeHousehold!.id,
        household_nanny_id: nannyId,
        hourly_rate_cents: cents,
        overtime_multiplier: parseFloat(otMultiplier),
        standard_hours_per_week: parseFloat(standardHours),
        pay_period: payPeriod,
        effective_from: new Date().toISOString().split('T')[0],
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employment'] })
    },
  })

  const parentMembers = members?.filter((m) => m.role === 'owner' || m.role === 'parent') ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-[var(--color-muted-foreground)]">
          {isParent ? 'Household and employment' : 'Your profile'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
            Save profile
          </Button>
        </CardContent>
      </Card>

      {isParent && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add a nanny</CardTitle>
              <CardDescription>
                Enter their information to start scheduling and payroll. They do not need an account yet — send a
                claim link later when they are ready to log in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first-name">First name</Label>
                  <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last-name">Last name</Label>
                  <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nanny-email">Email</Label>
                  <Input
                    id="nanny-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nanny-phone">Phone (optional)</Label>
                  <Input id="nanny-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nanny-notes">Notes (optional)</Label>
                <Textarea id="nanny-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              {formSuccess && <p className="text-sm text-emerald-700">{formSuccess}</p>}
              <Button
                onClick={() => addNanny.mutate()}
                disabled={!firstName || !lastName || !email || addNanny.isPending}
              >
                {addNanny.isPending ? 'Adding...' : 'Add nanny'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your nannies</CardTitle>
              <CardDescription>Manage profiles and send claim links</CardDescription>
            </CardHeader>
            <CardContent>
              {!nannies?.length ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">No nannies added yet.</p>
              ) : (
                <ul className="space-y-4">
                  {nannies.map((n) => (
                    <li key={n.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{nannyDisplayName(n)}</p>
                          <p className="text-sm text-[var(--color-muted-foreground)]">{n.email}</p>
                          {n.phone && (
                            <p className="text-sm text-[var(--color-muted-foreground)]">{n.phone}</p>
                          )}
                          {n.notes && <p className="mt-1 text-sm">{n.notes}</p>}
                        </div>
                        <Badge variant={isNannyClaimed(n) ? 'success' : 'warning'}>
                          {isNannyClaimed(n) ? 'Account linked' : 'Awaiting claim'}
                        </Badge>
                      </div>
                      {!isNannyClaimed(n) && (
                        <div className="mt-3 space-y-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => sendClaimLink.mutate(n.id)}
                            disabled={sendClaimLink.isPending}
                          >
                            {sendClaimLink.isPending ? 'Generating...' : 'Generate claim link'}
                          </Button>
                          {claimLinks[n.id] && (
                            <p className="break-all rounded-md border bg-[var(--color-muted)] p-2 text-xs">
                              {claimLinks[n.id]}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Household members</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-sm font-medium text-[var(--color-muted-foreground)]">Parents</p>
              <ul className="mb-4 space-y-2">
                {parentMembers.map((m) => (
                  <li key={m.id} className="flex justify-between text-sm">
                    <span>{m.profiles?.display_name ?? m.user_id}</span>
                    <span className="capitalize text-[var(--color-muted-foreground)]">{m.role}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Default weekly schedule</CardTitle>
              <CardDescription>
                Set recurring days and hours for each nanny. The schedule page shows this pattern and you can
                override individual days.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nanny</Label>
                <select
                  className="flex h-10 w-full rounded-md border px-3 text-sm"
                  value={nannyId}
                  onChange={(e) => setNannyId(e.target.value)}
                >
                  <option value="">Select nanny</option>
                  {nannies?.map((n) => (
                    <option key={n.id} value={n.id}>
                      {nannyDisplayName(n)}
                    </option>
                  ))}
                </select>
              </div>
              {nannyId ? (
                <DefaultScheduleEditor householdNannyId={nannyId} />
              ) : (
                <p className="text-sm text-[var(--color-muted-foreground)]">Select a nanny to edit their default schedule.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Employment settings</CardTitle>
              <CardDescription>Pay rates and overtime rules per nanny</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nanny</Label>
                <select
                  className="flex h-10 w-full rounded-md border px-3 text-sm"
                  value={nannyId}
                  onChange={(e) => setNannyId(e.target.value)}
                >
                  <option value="">Select nanny</option>
                  {nannies?.map((n) => (
                    <option key={n.id} value={n.id}>
                      {nannyDisplayName(n)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Hourly rate ($)</Label>
                  <Input type="number" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>OT multiplier</Label>
                  <Input value={otMultiplier} onChange={(e) => setOtMultiplier(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Standard hrs/week</Label>
                  <Input value={standardHours} onChange={(e) => setStandardHours(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Pay period</Label>
                  <select
                    className="flex h-10 w-full rounded-md border px-3 text-sm"
                    value={payPeriod}
                    onChange={(e) => setPayPeriod(e.target.value as PayPeriodType)}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
              {employment && employment.length > 0 && (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Current rate: ${(employment[0].hourly_rate_cents / 100).toFixed(2)}/hr ·{' '}
                  {employment[0].pay_period} pay period
                </p>
              )}
              <Button
                onClick={() => saveEmployment.mutate()}
                disabled={!nannyId || !hourlyRate || saveEmployment.isPending}
              >
                Save employment settings
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

