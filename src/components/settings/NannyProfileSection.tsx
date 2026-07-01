import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useHouseholdNannies } from '@/hooks/useHouseholdData'
import { useDebouncedAutoSave } from '@/hooks/useDebouncedAutoSave'
import { formatSupabaseError } from '@/lib/errors'
import { AutoSaveStatus } from '@/components/settings/AutoSaveStatus'
import {
  getNannyInviteStatus,
  isNannyActive,
  isNannyClaimed,
  nannyInviteStatusLabel,
  nannyInviteStatusVariant,
} from '@/lib/nanny'
import type { HouseholdNanny } from '@/types/household-nanny'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { APP_NAME } from '@/lib/app'
import { sendInviteEmail } from '@/lib/notifications'

function ProfileField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-sm text-[var(--color-muted-foreground)]">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  )
}

export function NannyProfileSection({ nanny }: { nanny: HouseholdNanny }) {
  const qc = useQueryClient()
  const { activeHousehold } = useHousehold()
  const { refetch: refetchNannies } = useHouseholdNannies({ includeDeactivated: true })
  const active = isNannyActive(nanny)
  const claimed = isNannyClaimed(nanny)
  const inviteStatus = getNannyInviteStatus(nanny)
  const canSendInvite = active && inviteStatus !== 'linked'
  const canEditEmail = active && !claimed

  const [editing, setEditing] = useState(false)
  const [firstName, setFirstName] = useState(nanny.first_name)
  const [lastName, setLastName] = useState(nanny.last_name)
  const [email, setEmail] = useState(nanny.email)
  const [phone, setPhone] = useState(nanny.phone ?? '')
  const [notes, setNotes] = useState(nanny.notes ?? '')

  const resetForm = () => {
    setFirstName(nanny.first_name)
    setLastName(nanny.last_name)
    setEmail(nanny.email)
    setPhone(nanny.phone ?? '')
    setNotes(nanny.notes ?? '')
  }

  useEffect(() => {
    if (!editing) resetForm()
  }, [nanny, editing])

  const normalizedEmail = email.trim().toLowerCase()
  const emailChanged = canEditEmail && normalizedEmail !== nanny.email
  const hadInvite = inviteStatus === 'pending' || inviteStatus === 'expired'
  const profileDirty =
    firstName.trim() !== nanny.first_name ||
    lastName.trim() !== nanny.last_name ||
    (phone.trim() || null) !== (nanny.phone?.trim() || null) ||
    (notes.trim() || null) !== (nanny.notes?.trim() || null) ||
    emailChanged
  const profileInvalid =
    !firstName.trim() || !lastName.trim() || !normalizedEmail || !normalizedEmail.includes('@')

  const canAutoSave = useMemo(
    () => editing && profileDirty && !profileInvalid,
    [editing, profileDirty, profileInvalid],
  )

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (emailChanged) {
        const { error } = await supabase.rpc('update_unclaimed_nanny_email', {
          p_household_nanny_id: nanny.id,
          p_email: normalizedEmail,
        })
        if (error) throw error
      }

      const { error } = await supabase
        .from('household_nannies')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
          notes: notes.trim() || null,
        })
        .eq('id', nanny.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await refetchNannies()
      void qc.invalidateQueries({ queryKey: ['household_nannies'] })
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  useDebouncedAutoSave(
    () => {
      if (!canAutoSave || saveProfile.isPending) return
      saveProfile.mutate()
    },
    [canAutoSave, firstName, lastName, email, phone, notes],
    { ready: editing, enabled: canAutoSave },
  )

  const sendNannyInvite = useMutation({
    mutationFn: async () => {
      if (!nanny.email) {
        throw new Error('This nanny profile has no email address')
      }
      const { data: token, error } = await supabase.rpc('create_nanny_claim_link', {
        p_household_nanny_id: nanny.id,
      })
      if (error) throw error
      const link = `${window.location.origin}/claim?token=${token}`
      await sendInviteEmail({
        to: nanny.email,
        subject: `Join ${activeHousehold?.name ?? 'household'} on ${APP_NAME}`,
        inviteUrl: link,
        householdName: activeHousehold?.name ?? 'your household',
        inviteType: 'nanny',
      })
      const { error: recordError } = await supabase.rpc('record_nanny_claim_invite_sent', {
        p_household_nanny_id: nanny.id,
      })
      if (recordError) throw recordError
    },
    onSuccess: async () => {
      await refetchNannies()
      toast.success('Invite email sent')
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const cancelEdit = () => {
    resetForm()
    setEditing(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Profile & invite</CardTitle>
            <CardDescription>Contact details and platform access</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={active ? nannyInviteStatusVariant(inviteStatus) : 'secondary'}>
              {active ? nannyInviteStatusLabel(inviteStatus) : 'Deactivated'}
            </Badge>
            {active && !editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit profile
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`nanny-first-${nanny.id}`}>First name</Label>
                <Input
                  id={`nanny-first-${nanny.id}`}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`nanny-last-${nanny.id}`}>Last name</Label>
                <Input
                  id={`nanny-last-${nanny.id}`}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`nanny-email-${nanny.id}`}>Email</Label>
              <Input
                id={`nanny-email-${nanny.id}`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!canEditEmail}
              />
              {claimed && (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Email cannot be changed after the nanny has joined.
                </p>
              )}
              {emailChanged && hadInvite && (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Saving a new email clears the pending invite. Send a new invite after saving.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`nanny-phone-${nanny.id}`}>Phone (optional)</Label>
              <Input
                id={`nanny-phone-${nanny.id}`}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`nanny-notes-${nanny.id}`}>Notes (optional)</Label>
              <Textarea
                id={`nanny-notes-${nanny.id}`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AutoSaveStatus isPending={saveProfile.isPending} isError={saveProfile.isError} />
              <Button variant="outline" onClick={cancelEdit} disabled={saveProfile.isPending}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <ProfileField label="Email" value={nanny.email} />
            <ProfileField label="Phone" value={nanny.phone} />
            <ProfileField label="Notes" value={nanny.notes} />
          </div>
        )}

        {!editing && inviteStatus === 'pending' && nanny.claim_invite_sent_at && (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Invite sent {format(new Date(nanny.claim_invite_sent_at), 'MMM d, yyyy')}
            {nanny.claim_token_expires_at &&
              ` · expires ${format(new Date(nanny.claim_token_expires_at), 'MMM d, yyyy')}`}
          </p>
        )}
        {!editing && inviteStatus === 'expired' && nanny.claim_invite_sent_at && (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Last invite sent {format(new Date(nanny.claim_invite_sent_at), 'MMM d, yyyy')}
          </p>
        )}
        {!editing && canSendInvite && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => sendNannyInvite.mutate()}
            disabled={sendNannyInvite.isPending}
          >
            {sendNannyInvite.isPending
              ? 'Sending...'
              : inviteStatus === 'not_invited'
                ? 'Send invite email'
                : 'Resend invite email'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
