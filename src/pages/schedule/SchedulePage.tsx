import { useMemo, useState } from 'react'
import { format, parseISO, addDays, startOfDay } from 'date-fns'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useNannies, useScheduleBlocks, useScheduleTemplates } from '@/hooks/useHouseholdData'
import { nannyDisplayName } from '@/lib/nanny'
import { isTemplateOccurrence, mergeScheduleWithTemplates, type TemplateOccurrence } from '@/lib/schedule'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import type { ScheduleBlock } from '@/types/database'

type ScheduleItem = ScheduleBlock | TemplateOccurrence

const SCHEDULE_RANGE = {
  from: addDays(startOfDay(new Date()), -30).toISOString(),
  to: addDays(startOfDay(new Date()), 60).toISOString(),
}

export function SchedulePage() {
  const { activeHousehold, isParent } = useHousehold()
  const rangeTo = useMemo(() => new Date(SCHEDULE_RANGE.to), [])
  const { data: blocks, isLoading, isError, error } = useScheduleBlocks(
    SCHEDULE_RANGE.from,
    SCHEDULE_RANGE.to,
  )
  const { data: templates, isLoading: templatesLoading } = useScheduleTemplates()
  const { data: nannies } = useNannies()
  const qc = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [nannyId, setNannyId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [notes, setNotes] = useState('')

  const nannyIds = useMemo(() => {
    if (!nannies?.length) return []
    return nannies.map((n) => n.id)
  }, [nannies])

  const merged = useMemo(() => {
    if (!blocks) return []
    const tpl = (templates ?? []) as NannyScheduleTemplate[]
    return mergeScheduleWithTemplates(blocks, tpl, new Date(), rangeTo, nannyIds)
  }, [blocks, templates, nannyIds, rangeTo])

  const pageLoading = isLoading || templatesLoading

  const nannyName = (householdNannyId: string | null) => {
    if (!householdNannyId) return 'Nanny'
    const n = nannies?.find((x) => x.id === householdNannyId)
    return n ? nannyDisplayName(n) : 'Nanny'
  }

  const createBlock = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('schedule_blocks').insert({
        household_id: activeHousehold!.id,
        household_nanny_id: nannyId,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        notes: notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      setShowForm(false)
      setNotes('')
    },
  })

  const materializeTemplate = useMutation({
    mutationFn: async (occ: TemplateOccurrence) => {
      const { error } = await supabase.from('schedule_blocks').insert({
        household_id: activeHousehold!.id,
        household_nanny_id: occ.household_nanny_id,
        starts_at: occ.starts_at.toISOString(),
        ends_at: occ.ends_at.toISOString(),
        notes: occ.notes,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  })

  const cancelBlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('schedule_blocks').update({ status: 'cancelled' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  })

  const upcoming = merged.filter((item) => {
    const start = isTemplateOccurrence(item) ? item.starts_at : parseISO(item.starts_at)
    return start >= new Date()
  })

  const past =
    blocks?.filter((b) => parseISO(b.starts_at) < new Date()) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="text-[var(--color-muted-foreground)]">
            Upcoming shifts include your default weekly schedule
          </p>
        </div>
        {isParent && (
          <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : 'Add shift'}</Button>
        )}
      </div>

      {showForm && isParent && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New shift</CardTitle>
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
                <Label>Starts</Label>
                <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Ends</Label>
                <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button onClick={() => createBlock.mutate()} disabled={!nannyId || !startsAt || !endsAt || createBlock.isPending}>
              Save shift
            </Button>
          </CardContent>
        </Card>
      )}

      {isError ? (
        <p className="text-sm text-red-600">
          Could not load schedule: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      ) : pageLoading ? (
        <p>Loading...</p>
      ) : (
        <>
          <ScheduleList
            title="Upcoming"
            items={upcoming}
            nannyName={nannyName}
            isParent={isParent}
            onCancel={(id) => cancelBlock.mutate(id)}
            onConfirmTemplate={(occ) => materializeTemplate.mutate(occ)}
            confirmPending={materializeTemplate.isPending}
          />
          <ScheduleList title="Past" items={past} nannyName={nannyName} isParent={false} />
        </>
      )}
    </div>
  )
}

function ScheduleList({
  title,
  items,
  nannyName,
  isParent,
  onCancel,
  onConfirmTemplate,
  confirmPending,
}: {
  title: string
  items: ScheduleItem[]
  nannyName: (id: string | null) => string
  isParent: boolean
  onCancel?: (id: string) => void
  onConfirmTemplate?: (occ: TemplateOccurrence) => void
  confirmPending?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!items.length ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">No shifts.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((s) => {
              const isTpl = isTemplateOccurrence(s)
              const start = isTpl ? s.starts_at : parseISO(s.starts_at)
              const end = isTpl ? s.ends_at : parseISO(s.ends_at)
              const nannyId = s.household_nanny_id
              const key = isTpl ? s.id : s.id

              return (
                <li key={key} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0">
                  <div>
                    <p className="font-medium">{nannyName(nannyId)}</p>
                    <p className="text-sm">
                      {format(start, 'MMM d, yyyy h:mm a')} – {format(end, 'h:mm a')}
                    </p>
                    {!isTpl && s.notes && (
                      <p className="text-sm text-[var(--color-muted-foreground)]">{s.notes}</p>
                    )}
                    {isTpl && s.notes && (
                      <p className="text-sm text-[var(--color-muted-foreground)]">{s.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isTpl ? (
                      <>
                        <Badge variant="outline">Default</Badge>
                        {isParent && onConfirmTemplate && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={confirmPending}
                            onClick={() => onConfirmTemplate(s)}
                          >
                            Save as shift
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Badge variant={s.status === 'scheduled' ? 'secondary' : 'outline'}>{s.status}</Badge>
                        {isParent && s.status === 'scheduled' && onCancel && (
                          <Button size="sm" variant="outline" onClick={() => onCancel(s.id)}>
                            Cancel
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
