import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Eye, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useHouseholdNannies } from '@/hooks/useHouseholdData'
import { formatSupabaseError } from '@/lib/errors'
import {
  getNannyInviteStatus,
  isNannyActive,
  nannyDisplayName,
  nannyInviteStatusLabel,
  nannyInviteStatusVariant,
} from '@/lib/nanny'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader } from '@/components/layout/PageHeader'
import { HouseholdHolidaySettings } from '@/components/settings/HouseholdHolidaySettings'
import { HouseholdMembersCard } from '@/components/settings/HouseholdMembersCard'
import { NotificationSettingsCard } from '@/components/settings/NotificationSettingsCard'
import { GustoPayrollSetupCard } from '@/components/settings/GustoPayrollSetupCard'
import { useStartNannyPreview } from '@/components/layout/NannyPreviewControls'

export function SettingsPage() {
  const navigate = useNavigate()
  const { user, profile, refreshProfile } = useAuth()
  const { activeHousehold, isParent } = useHousehold()
  const startNannyPreview = useStartNannyPreview()
  const { data: nannies, refetch: refetchNannies } = useHouseholdNannies({ includeDeactivated: true })
  const qc = useQueryClient()

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')

  useEffect(() => {
    if (profile?.display_name != null) {
      setDisplayName(profile.display_name)
    }
  }, [profile?.display_name])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  const resetAddForm = () => {
    setFirstName('')
    setLastName('')
    setEmail('')
    setPhone('')
    setNotes('')
    setFormError('')
  }

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      refreshProfile()
      toast.success('Profile saved')
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const addNanny = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_household_nanny', {
        p_household_id: activeHousehold!.id,
        p_first_name: firstName.trim(),
        p_last_name: lastName.trim(),
        p_email: email.trim().toLowerCase(),
        p_phone: phone.trim() || undefined,
        p_notes: notes.trim() || undefined,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: async (nannyId) => {
      setShowAddForm(false)
      resetAddForm()
      await refetchNannies()
      void qc.invalidateQueries({ queryKey: ['household_nannies', 'nannies', 'pto_balances'] })
      toast.success('Nanny added')
      navigate(`/settings/nannies/${nannyId}`)
    },
    onError: (err) => setFormError(formatSupabaseError(err)),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle={isParent ? 'Household, nannies, and your profile' : 'Your profile'}
      />

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
              <CardTitle className="text-lg">Your nannies</CardTitle>
              <CardDescription>
                Open a nanny to manage their profile, schedule, pay, and time off. Use{' '}
                <span className="font-medium">View as nanny</span> to see their dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!!nannies?.length && (
                <ul className="divide-y rounded-lg border">
                  {nannies.map((n) => {
                    const active = isNannyActive(n)
                    const inviteStatus = getNannyInviteStatus(n)
                    return (
                      <li key={n.id} className={!active ? 'opacity-70' : undefined}>
                        <div className="flex items-center gap-2 px-4 py-3">
                          <Link
                            to={`/settings/nannies/${n.id}`}
                            className="flex min-w-0 flex-1 items-center justify-between gap-3 transition-colors hover:opacity-80"
                          >
                            <div className="min-w-0">
                              <p className="font-medium">{nannyDisplayName(n)}</p>
                              <p className="truncate text-sm text-[var(--color-muted-foreground)]">{n.email}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {!active ? (
                                <Badge variant="secondary">Deactivated</Badge>
                              ) : (
                                <Badge variant={nannyInviteStatusVariant(inviteStatus)}>
                                  {nannyInviteStatusLabel(inviteStatus)}
                                </Badge>
                              )}
                              <ChevronRight className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                            </div>
                          </Link>
                          {active && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => startNannyPreview(n.id)}
                            >
                              <Eye className="mr-1.5 h-4 w-4" />
                              View as nanny
                            </Button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}

              {!nannies?.length && !showAddForm && (
                <p className="text-sm text-[var(--color-muted-foreground)]">No nannies added yet.</p>
              )}

              <div className={nannies?.length ? 'border-t pt-4' : undefined}>
                {showAddForm ? (
                  <div className="space-y-4">
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      They do not need an account yet — send an invite from their page when they are ready to log in.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="first-name">First name</Label>
                        <Input
                          id="first-name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="last-name">Last name</Label>
                        <Input
                          id="last-name"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          required
                        />
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
                        <Input
                          id="nanny-phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nanny-notes">Notes (optional)</Label>
                      <Textarea
                        id="nanny-notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                      />
                    </div>
                    {formError && <p className="text-sm text-red-600">{formError}</p>}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => addNanny.mutate()}
                        disabled={!firstName || !lastName || !email || addNanny.isPending}
                      >
                        {addNanny.isPending ? 'Adding...' : 'Add nanny'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowAddForm(false)
                          resetAddForm()
                        }}
                        disabled={addNanny.isPending}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add nanny
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <HouseholdHolidaySettings />

          <GustoPayrollSetupCard />

          <HouseholdMembersCard />

          <NotificationSettingsCard />
        </>
      )}

      {!isParent && <NotificationSettingsCard />}
    </div>
  )
}
