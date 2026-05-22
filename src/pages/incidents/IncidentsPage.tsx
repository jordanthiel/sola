import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useChildren } from '@/hooks/useHouseholdData'
import { useIncidents } from '@/hooks/useExtendedFeatures'
import type { IncidentSeverity } from '@/types/features'
import { Button } from '@/components/ui/button'
import { DateTimePicker } from '@/components/ui/datetime-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { selectCn } from '@/lib/utils'

const SEVERITIES: { value: IncidentSeverity; label: string }[] = [
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'serious', label: 'Serious' },
]

export function IncidentsPage() {
  const { user } = useAuth()
  const { activeHousehold } = useHousehold()
  const { data: incidents } = useIncidents()
  const { data: children } = useChildren()
  const qc = useQueryClient()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<IncidentSeverity>('minor')
  const [childId, setChildId] = useState('')
  const [occurredAt, setOccurredAt] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"))
  const [followUp, setFollowUp] = useState('')

  const report = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('incidents').insert({
        household_id: activeHousehold!.id,
        child_id: childId || null,
        reported_by: user!.id,
        occurred_at: new Date(occurredAt).toISOString(),
        severity,
        title,
        description,
        follow_up: followUp || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
      setTitle('')
      setDescription('')
      setFollowUp('')
      toast.success('Incident reported')
    },
    onError: () => toast.error('Failed to report'),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incident log"
        subtitle="Record injuries, accidents, or concerns. Household members are notified automatically."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Report incident</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Severity</Label>
              <select
                className={selectCn}
                value={severity}
                onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
              >
                {SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Child (optional)</Label>
              <select className={selectCn} value={childId} onChange={(e) => setChildId(e.target.value)}>
                <option value="">Household / general</option>
                {children?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>When</Label>
              <DateTimePicker value={occurredAt} onChange={setOccurredAt} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>What happened</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </div>
          <div className="space-y-2">
            <Label>Follow-up (optional)</Label>
            <Textarea value={followUp} onChange={(e) => setFollowUp(e.target.value)} rows={2} />
          </div>
          <Button
            onClick={() => report.mutate()}
            disabled={!title || !description || report.isPending}
          >
            {report.isPending ? 'Saving...' : 'Report incident'}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {incidents?.map((inc) => (
          <Card key={inc.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <p className="font-medium">{inc.title}</p>
                <Badge
                  variant={inc.severity === 'serious' ? 'destructive' : inc.severity === 'moderate' ? 'warning' : 'secondary'}
                >
                  {inc.severity}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                {format(parseISO(inc.occurred_at), 'MMM d, yyyy h:mm a')}
              </p>
              <p className="mt-2 text-sm">{inc.description}</p>
              {inc.follow_up && (
                <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                  Follow-up: {inc.follow_up}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
        {!incidents?.length && (
          <p className="text-sm text-[var(--color-muted-foreground)]">No incidents recorded.</p>
        )}
      </div>
    </div>
  )
}
