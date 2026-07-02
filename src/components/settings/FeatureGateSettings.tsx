import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatSupabaseError } from '@/lib/errors'
import type { FeatureGateAdminRow, FeatureGateUser } from '@/lib/feature-gates'
import { FEATURE_KEYS } from '@/lib/feature-gates'
import { AutoSaveStatus } from '@/components/settings/AutoSaveStatus'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type GateDraft = {
  openToAll: boolean
  userIds: string[]
}

function FeatureGateEditor({
  gate,
  usersById,
  onSaved,
}: {
  gate: FeatureGateAdminRow
  usersById: Record<string, FeatureGateUser>
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<GateDraft>(() => ({
    openToAll: gate.open_to_all,
    userIds: gate.allowlist_user_ids ?? [],
  }))
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<FeatureGateUser[]>([])
  const [searchError, setSearchError] = useState('')
  const [localUsersById, setLocalUsersById] = useState<Record<string, FeatureGateUser>>({})

  useEffect(() => {
    setDraft({
      openToAll: gate.open_to_all,
      userIds: gate.allowlist_user_ids ?? [],
    })
    setLocalUsersById({})
  }, [gate.open_to_all, gate.allowlist_user_ids, gate.feature_key])

  const saveGate = useMutation({
    mutationFn: async (next: GateDraft) => {
      const { error } = await supabase.rpc('update_feature_gate', {
        p_feature_key: gate.feature_key,
        p_open_to_all: next.openToAll,
        p_user_ids: next.openToAll ? [] : next.userIds,
      })
      if (error) throw error
    },
    onSuccess: () => {
      onSaved()
    },
  })

  const persistDraft = (next: GateDraft) => {
    setDraft(next)
    saveGate.mutate(next)
  }

  useEffect(() => {
    const q = search.trim()
    if (q.length < 2) {
      setSearchResults([])
      setSearchError('')
      return
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setSearchError('')
          const { data, error } = await supabase.rpc('search_users_for_feature_gate', {
            p_query: q,
            p_limit: 20,
          })
          if (error) throw error
          setSearchResults((data ?? []) as FeatureGateUser[])
        } catch (err) {
          setSearchResults([])
          setSearchError(formatSupabaseError(err))
        }
      })()
    }, 300)

    return () => window.clearTimeout(timer)
  }, [search])

  const displayUsersById = useMemo(
    () => ({ ...usersById, ...localUsersById }),
    [usersById, localUsersById],
  )

  const selectedUsers = draft.userIds
    .map((id) => displayUsersById[id])
    .filter(Boolean) as FeatureGateUser[]

  const addUser = (user: FeatureGateUser) => {
    if (draft.userIds.includes(user.user_id)) return
    setLocalUsersById((prev) => ({ ...prev, [user.user_id]: user }))
    persistDraft({ ...draft, userIds: [...draft.userIds, user.user_id] })
    setSearch('')
    setSearchResults([])
  }

  const removeUser = (userId: string) => {
    persistDraft({ ...draft, userIds: draft.userIds.filter((id) => id !== userId) })
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{gate.label}</p>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {gate.description ?? gate.feature_key}
          </p>
        </div>
        <AutoSaveStatus isPending={saveGate.isPending} isError={saveGate.isError} />
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={draft.openToAll}
          onChange={(e) => persistDraft({ ...draft, openToAll: e.target.checked })}
        />
        <span className="text-sm">
          <span className="font-medium">Open to all users</span>
          <span className="mt-0.5 block text-[var(--color-muted-foreground)]">
            When off, only selected users can access this feature.
          </span>
        </span>
      </label>

      {!draft.openToAll && (
        <div className="space-y-3 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor={`gate-search-${gate.feature_key}`}>Allowlisted users</Label>
            <Input
              id={`gate-search-${gate.feature_key}`}
              placeholder="Search by email or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {searchError && <p className="text-sm text-red-600">{searchError}</p>}
            {searchResults.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-md border">
                {searchResults.map((user) => (
                  <li key={user.user_id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)]"
                      onClick={() => addUser(user)}
                      disabled={draft.userIds.includes(user.user_id)}
                    >
                      <span>
                        {user.display_name}{' '}
                        <span className="text-[var(--color-muted-foreground)]">({user.email})</span>
                      </span>
                      {draft.userIds.includes(user.user_id) && (
                        <Badge variant="secondary">Added</Badge>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selectedUsers.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {selectedUsers.map((user) => (
                <li
                  key={user.user_id}
                  className="flex items-center gap-2 rounded-full border bg-[var(--color-muted)]/40 px-3 py-1 text-sm"
                >
                  <span>{user.display_name}</span>
                  <button
                    type="button"
                    className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                    onClick={() => removeUser(user.user_id)}
                    aria-label={`Remove ${user.display_name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">No users selected yet.</p>
          )}
        </div>
      )}

      {saveGate.isError && (
        <p className="text-sm text-red-600">{formatSupabaseError(saveGate.error)}</p>
      )}
    </div>
  )
}
export function FeatureGateSettings() {
  const qc = useQueryClient()

  const { data: gates, isLoading, error } = useQuery({
    queryKey: ['feature_gates_admin'],
    queryFn: async () => {
      const { data, error: rpcError } = await supabase.rpc('list_feature_gates_admin')
      if (rpcError) throw rpcError
      return (data ?? []) as FeatureGateAdminRow[]
    },
  })

  const allUserIds = useMemo(
    () => [...new Set((gates ?? []).flatMap((g) => g.allowlist_user_ids ?? []))],
    [gates],
  )

  const { data: allowlistUsers } = useQuery({
    queryKey: ['feature_gate_users', allUserIds],
    enabled: allUserIds.length > 0,
    queryFn: async () => {
      const { data, error: rpcError } = await supabase.rpc('get_feature_gate_users', {
        p_user_ids: allUserIds,
      })
      if (rpcError) throw rpcError
      return (data ?? []) as FeatureGateUser[]
    },
  })

  const usersById = useMemo(() => {
    const map: Record<string, FeatureGateUser> = {}
    for (const user of allowlistUsers ?? []) {
      map[user.user_id] = user
    }
    return map
  }, [allowlistUsers])

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['feature_gates_admin'] })
    void qc.invalidateQueries({ queryKey: ['feature_gate_users'] })
    void qc.invalidateQueries({ queryKey: ['feature_access'] })
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-[var(--color-muted-foreground)]">Loading…</CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-red-600">{formatSupabaseError(error)}</CardContent>
      </Card>
    )
  }

  const sortedGates = [...(gates ?? [])].sort((a, b) => {
    if (a.feature_key === FEATURE_KEYS.featureGateAdmin) return -1
    if (b.feature_key === FEATURE_KEYS.featureGateAdmin) return 1
    return a.label.localeCompare(b.label)
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Feature access</CardTitle>
        <CardDescription>
          Control which features are open to everyone or limited to specific users. Changes save
          automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedGates.map((gate) => (
          <FeatureGateEditor key={gate.feature_key} gate={gate} usersById={usersById} onSaved={invalidate} />
        ))}
      </CardContent>
    </Card>
  )
}
