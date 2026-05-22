import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useMembers, useNannies } from '@/hooks/useHouseholdData'
import { useFeedPosts } from '@/hooks/useExtendedFeatures'
import { formatMentionDisplay, parseMentions } from '@/lib/notifications'
import { nannyDisplayName } from '@/lib/nanny'
import { householdMemberDisplayName } from '@/lib/member-display'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'

export function FeedPage() {
  const { user, profile } = useAuth()
  const { activeHousehold } = useHousehold()
  const { data: posts } = useFeedPosts()
  const { data: members } = useMembers()
  const { data: nannies } = useNannies()
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [mentionId, setMentionId] = useState('')

  const mentionable = [
    ...(members?.map((m) => ({
      id: m.user_id,
      name: householdMemberDisplayName(m, {
        currentUserId: user?.id,
        currentUserEmail: user?.email,
      }),
    })) ?? []),
    ...(nannies
      ?.filter((n) => n.user_id)
      .map((n) => ({ id: n.user_id!, name: nannyDisplayName(n) })) ?? []),
  ]

  const addMention = () => {
    if (!mentionId) return
    const person = mentionable.find((p) => p.id === mentionId)
    if (!person) return
    setBody((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}${formatMentionDisplay(person.name, person.id)} `)
    setMentionId('')
  }

  const createPost = useMutation({
    mutationFn: async () => {
      const { data: post, error } = await supabase
        .from('feed_posts')
        .insert({
          household_id: activeHousehold!.id,
          author_id: user!.id,
          body: body.trim(),
          is_urgent: urgent,
        })
        .select('id')
        .single()
      if (error) throw error

      const mentioned = [...new Set(parseMentions(body))]
      if (mentioned.length) {
        await supabase.from('feed_mentions').insert(
          mentioned.map((uid) => ({ post_id: post.id, mentioned_user_id: uid })),
        )
      }
    },
    onSuccess: () => {
      setBody('')
      setUrgent(false)
      qc.invalidateQueries({ queryKey: ['feed'] })
      toast.success('Posted')
    },
    onError: () => toast.error('Failed to post'),
  })

  function renderBody(text: string) {
    return text.split(/(@\[[^\]]+\]\([a-f0-9-]{36}\))/g).map((part, i) => {
      const m = part.match(/@\[([^\]]+)\]\(([a-f0-9-]{36})\)/)
      if (m) return <strong key={i} className="text-[var(--color-primary)]">@{m[1]}</strong>
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Household feed"
        subtitle="Updates for the whole household. Use @mentions to notify someone."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New post</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share an update… Use the mention picker for @mentions."
            rows={4}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded border px-2 py-1 text-sm"
              value={mentionId}
              onChange={(e) => setMentionId(e.target.value)}
            >
              <option value="">Mention someone…</option>
              {mentionable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" onClick={addMention}>
              Add @mention
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
              Urgent
            </label>
          </div>
          <Button onClick={() => createPost.mutate()} disabled={!body.trim() || createPost.isPending}>
            {createPost.isPending ? 'Posting...' : 'Post'}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {posts?.map((p) => (
          <Card key={p.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">
                  {p.author?.display_name ??
                    (p.author_id === user?.id
                      ? profile?.display_name?.trim() ||
                        user?.email?.split('@')[0] ||
                        'You'
                      : 'Someone')}
                </p>
                <div className="flex gap-2">
                  {p.is_urgent && <Badge variant="warning">Urgent</Badge>}
                  <span className="text-xs text-[var(--color-muted-foreground)]">
                    {format(parseISO(p.created_at), 'MMM d, h:mm a')}
                  </span>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{renderBody(p.body)}</p>
              {p.mentions && p.mentions.length > 0 && (
                <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                  Mentioned:{' '}
                  {p.mentions
                    .map((m) => m.display_name ?? 'Member')
                    .join(', ')}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
        {!posts?.length && (
          <p className="text-center text-sm text-[var(--color-muted-foreground)]">No posts yet.</p>
        )}
      </div>
    </div>
  )
}
