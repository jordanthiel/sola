import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useChildActivities, useChildren } from '@/hooks/useHouseholdData'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import type { ActivityType, MoodType } from '@/types/database'

const ACTIVITY_TYPES: ActivityType[] = ['meal', 'nap', 'outdoor', 'learning', 'appointment', 'other']
const MOODS: MoodType[] = ['happy', 'calm', 'fussy', 'tired', 'sick']

export function ActivitiesPage() {
  const { user } = useAuth()
  const { activeHousehold } = useHousehold()
  const { data: children } = useChildren()
  const [childFilter, setChildFilter] = useState('')
  const { data: activities, isLoading } = useChildActivities(childFilter || undefined)
  const qc = useQueryClient()

  const [childId, setChildId] = useState('')
  const [activityType, setActivityType] = useState<ActivityType>('other')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [duration, setDuration] = useState('')
  const [mood, setMood] = useState<MoodType | ''>('')

  const logActivity = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('child_activities').insert({
        household_id: activeHousehold!.id,
        child_id: childId,
        logged_by: user!.id,
        activity_type: activityType,
        title,
        description: description || null,
        occurred_at: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
        duration_minutes: duration ? parseInt(duration, 10) : null,
        mood: mood || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities'] })
      setTitle('')
      setDescription('')
      setDuration('')
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activities</h1>
        <p className="text-[var(--color-muted-foreground)]">Log what the kids did today</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Child</Label>
              <select
                className="flex h-10 w-full rounded-md border px-3 text-sm"
                value={childId}
                onChange={(e) => setChildId(e.target.value)}
              >
                <option value="">Select child</option>
                {children?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <select
                className="flex h-10 w-full rounded-md border px-3 text-sm"
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as ActivityType)}
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Park visit, lunch, nap..." />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>When</Label>
              <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Duration (min)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Mood</Label>
              <select
                className="flex h-10 w-full rounded-md border px-3 text-sm"
                value={mood}
                onChange={(e) => setMood(e.target.value as MoodType | '')}
              >
                <option value="">—</option>
                {MOODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button onClick={() => logActivity.mutate()} disabled={!childId || !title || logActivity.isPending}>
            Log activity
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Activity feed</CardTitle>
          <select
            className="rounded-md border px-2 py-1 text-sm"
            value={childFilter}
            onChange={(e) => setChildFilter(e.target.value)}
          >
            <option value="">All children</option>
            {children?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading...</p>
          ) : !activities?.length ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">No activities yet.</p>
          ) : (
            <ul className="space-y-3">
              {activities.map((a) => (
                <li key={a.id} className="border-b pb-3 last:border-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{a.title}</p>
                    <Badge variant="outline">{a.activity_type}</Badge>
                    {a.mood && <Badge variant="secondary">{a.mood}</Badge>}
                  </div>
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    {a.children?.name} · {format(parseISO(a.occurred_at), 'MMM d, h:mm a')}
                    {a.duration_minutes && ` · ${a.duration_minutes} min`}
                  </p>
                  {a.description && <p className="mt-1 text-sm">{a.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
