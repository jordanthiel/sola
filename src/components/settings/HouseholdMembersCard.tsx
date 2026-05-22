import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useMembers } from '@/hooks/useHouseholdData'
import { householdMemberDisplayName } from '@/lib/member-display'
import { formatSupabaseError } from '@/lib/errors'
import { APP_NAME } from '@/lib/app'
import { sendInviteEmail } from '@/lib/notifications'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function HouseholdMembersCard() {
  const { user } = useAuth()
  const { activeHousehold } = useHousehold()
  const householdName = activeHousehold?.name ?? 'your household'
  const { data: members } = useMembers()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [inviteLink, setInviteLink] = useState('')

  const { data: pendingInvites } = useQuery({
    queryKey: ['household_invites', activeHousehold?.id],
    enabled: !!activeHousehold,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('household_invites')
        .select('id, email, role, expires_at, created_at')
        .eq('household_id', activeHousehold!.id)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
      if (queryError) throw queryError
      return data
    },
  })

  const createInvite = useMutation({
    mutationFn: async () => {
      const inviteEmail = email.trim().toLowerCase()
      const { data: token, error: rpcError } = await supabase.rpc('create_household_member_invite', {
        p_household_id: activeHousehold!.id,
        p_email: inviteEmail,
        p_role: 'parent',
      })
      if (rpcError) throw rpcError
      const link = `${window.location.origin}/invite?token=${token}`
      try {
        await sendInviteEmail({
          to: inviteEmail,
          subject: `Invitation to join ${householdName} on ${APP_NAME}`,
          inviteUrl: link,
          householdName,
          inviteType: 'parent',
        })
      } catch {
        /* email optional if Resend not configured */
      }
      return link
    },
    onSuccess: (link) => {
      setError('')
      setInviteLink(link)
      setEmail('')
      void qc.invalidateQueries({ queryKey: ['household_invites'] })
    },
    onError: (err) => {
      setInviteLink('')
      setError(formatSupabaseError(err))
    },
  })

  const parentMembers = members?.filter((m) => m.role === 'owner' || m.role === 'parent') ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Household members</CardTitle>
        <CardDescription>
          Parents and owners in your household. Invite another parent or guardian by email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-medium text-[var(--color-muted-foreground)]">Members</p>
          {!parentMembers.length ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">No members yet.</p>
          ) : (
            <ul className="space-y-2">
              {parentMembers.map((m) => (
                <li key={m.id} className="flex justify-between text-sm">
                  <span>
                    {householdMemberDisplayName(m, {
                      currentUserId: user?.id,
                      currentUserEmail: user?.email,
                    })}
                  </span>
                  <span className="capitalize text-[var(--color-muted-foreground)]">{m.role}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Invite a family member</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            They will join as a parent with full access to schedule, payroll, and settings.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1 space-y-2">
              <Label htmlFor="member-invite-email">Email</Label>
              <Input
                id="member-invite-email"
                type="email"
                placeholder="parent@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button
              onClick={() => createInvite.mutate()}
              disabled={!email.trim() || createInvite.isPending}
            >
              {createInvite.isPending ? 'Creating...' : 'Create invite link'}
            </Button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {inviteLink && (
            <p className="break-all rounded-md border bg-[var(--color-muted)] p-2 text-xs">{inviteLink}</p>
          )}
        </div>

        {pendingInvites && pendingInvites.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium text-[var(--color-muted-foreground)]">Pending invites</p>
            <ul className="space-y-2">
              {pendingInvites.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{inv.email}</span>
                  <Badge variant="warning">Pending</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
