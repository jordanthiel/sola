import { useMemo, useState } from 'react'
import { format, parseISO, addDays, startOfDay } from 'date-fns'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useNannies, useScheduleBlocks, useScheduleTemplates } from '@/hooks/useHouseholdData'
import { nannyDisplayName } from '@/lib/nanny'
import {
  isTemplateOccurrence,
  mergeScheduleWithTemplates,
  type TemplateOccurrence,
} from '@/lib/schedule'
import { blockHasLateReport, effectiveEndIso } from '@/lib/schedule-hours'
import { EditDayDialog } from '@/components/schedule/EditDayDialog'
import { ReportLateDialog } from '@/components/schedule/ReportLateDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import type { ScheduleBlock } from '@/types/database'
import type { ReportLateTarget, ScheduleDayTarget } from '@/types/schedule-day'

type ScheduleItem = ScheduleBlock | TemplateOccurrence

const SCHEDULE_RANGE = {
  from: addDays(startOfDay(new Date()), -14).toISOString(),
  to: addDays(startOfDay(new Date()), 42).toISOString(),
}

export function SchedulePage() {
  const { activeHousehold, isParent, isNanny } = useHousehold()
  const rangeTo = useMemo(() => new Date(SCHEDULE_RANGE.to), [])
  const { data: blocks, isLoading, isError, error } = useScheduleBlocks(
    SCHEDULE_RANGE.from,
    SCHEDULE_RANGE.to,
  )
  const { data: templates, isLoading: templatesLoading } = useScheduleTemplates()
  const { data: nannies } = useNannies()
  const qc = useQueryClient()

  const [editTarget, setEditTarget] = useState<ScheduleDayTarget | null>(null)
  const [lateTarget, setLateTarget] = useState<ReportLateTarget | null>(null)
  const [materializingId, setMaterializingId] = useState<string | null>(null)

  const nannyIds = useMemo(() => nannies?.map((n) => n.id) ?? [], [nannies])

  const merged = useMemo(() => {
    if (!blocks) return []
    const tpl = (templates ?? []) as NannyScheduleTemplate[]
    return mergeScheduleWithTemplates(blocks, tpl, startOfDay(new Date()), rangeTo, nannyIds)
  }, [blocks, templates, nannyIds, rangeTo])

  const pageLoading = isLoading || templatesLoading

  const nannyName = (householdNannyId: string | null) => {
    if (!householdNannyId) return 'Nanny'
    const n = nannies?.find((x) => x.id === householdNannyId)
    return n ? nannyDisplayName(n) : 'Nanny'
  }

  const materializeForLate = useMutation({
    mutationFn: async (occ: TemplateOccurrence) => {
      const { data, error: insertError } = await supabase
        .from('schedule_blocks')
        .insert({
          household_id: activeHousehold!.id,
          household_nanny_id: occ.household_nanny_id,
          starts_at: occ.starts_at.toISOString(),
          ends_at: occ.ends_at.toISOString(),
          notes: occ.notes,
        })
        .select('id, ends_at')
        .single()
      if (insertError) throw insertError
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  })

  const cancelBlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('schedule_blocks')
        .update({ status: 'cancelled' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  })

  const upcoming = merged.filter((item) => {
    const start = isTemplateOccurrence(item) ? item.starts_at : parseISO(item.starts_at)
    return start >= startOfDay(new Date())
  })

  const past = merged.filter((item) => {
    const start = isTemplateOccurrence(item) ? item.starts_at : parseISO(item.starts_at)
    return start < startOfDay(new Date())
  })

  async function openReportLate(item: ScheduleItem) {
    if (isTemplateOccurrence(item)) {
      setMaterializingId(item.id)
      try {
        const block = await materializeForLate.mutateAsync(item)
        setLateTarget({
          scheduleBlockId: block.id,
          day: item.starts_at,
          scheduledEnd: parseISO(block.ends_at),
          actualEndsAt: null,
          notes: null,
        })
      } finally {
        setMaterializingId(null)
      }
      return
    }
    setLateTarget({
      scheduleBlockId: item.id,
      day: parseISO(item.starts_at),
      scheduledEnd: parseISO(item.ends_at),
      actualEndsAt: item.actual_ends_at,
      notes: item.actual_notes,
    })
  }

  function openEditDay(item: ScheduleItem) {
    const start = isTemplateOccurrence(item) ? item.starts_at : parseISO(item.starts_at)
    const end = isTemplateOccurrence(item) ? item.ends_at : parseISO(item.ends_at)
    setEditTarget({
      householdNannyId: item.household_nanny_id!,
      day: startOfDay(start),
      startsAt: start,
      endsAt: end,
      notes: isTemplateOccurrence(item) ? item.notes : item.notes,
      scheduleBlockId: isTemplateOccurrence(item) ? null : item.id,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Schedule</h1>
        <p className="text-[var(--color-muted-foreground)]">
          {isParent
            ? 'Set the usual week in Settings, then change individual days here when times differ.'
            : 'Your scheduled days. Tap “Worked late” if you stayed past the scheduled end.'}
        </p>
      </div>

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
            isNanny={isNanny}
            onEditDay={isParent ? openEditDay : undefined}
            onReportLate={isNanny ? openReportLate : undefined}
            onCancel={(id) => cancelBlock.mutate(id)}
            materializingId={materializingId}
          />
          <ScheduleList
            title="Past"
            items={past}
            nannyName={nannyName}
            isParent={isParent}
            isNanny={isNanny}
            onEditDay={isParent ? openEditDay : undefined}
            onReportLate={isNanny ? openReportLate : undefined}
            materializingId={materializingId}
          />
        </>
      )}

      <EditDayDialog target={editTarget} onClose={() => setEditTarget(null)} />
      <ReportLateDialog target={lateTarget} onClose={() => setLateTarget(null)} />
    </div>
  )
}

function ScheduleList({
  title,
  items,
  nannyName,
  isParent,
  isNanny,
  onEditDay,
  onReportLate,
  onCancel,
  materializingId,
}: {
  title: string
  items: ScheduleItem[]
  nannyName: (id: string | null) => string
  isParent: boolean
  isNanny: boolean
  onEditDay?: (item: ScheduleItem) => void
  onReportLate?: (item: ScheduleItem) => void
  onCancel?: (id: string) => void
  materializingId: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!items.length ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">No shifts on the calendar.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((s) => {
              const isTpl = isTemplateOccurrence(s)
              const start = isTpl ? s.starts_at : parseISO(s.starts_at)
              const scheduledEnd = isTpl ? s.ends_at : parseISO(s.ends_at)
              const nannyId = s.household_nanny_id
              const key = s.id
              const block = isTpl ? null : s
              const hasLate = block ? blockHasLateReport(block) : false
              const displayEnd = block
                ? parseISO(effectiveEndIso(block))
                : scheduledEnd

              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0"
                >
                  <div>
                    <p className="font-medium">{nannyName(nannyId)}</p>
                    <p className="text-sm">
                      {format(start, 'EEE, MMM d · h:mm a')} – {format(displayEnd, 'h:mm a')}
                    </p>
                    {hasLate && block && (
                      <p className="text-sm text-amber-700">
                        Scheduled until {format(parseISO(block.ends_at), 'h:mm a')}
                        {block.actual_notes ? ` · ${block.actual_notes}` : ''}
                      </p>
                    )}
                    {!isTpl && s.notes && (
                      <p className="text-sm text-[var(--color-muted-foreground)]">{s.notes}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isTpl ? (
                      <Badge variant="outline">Usual day</Badge>
                    ) : (
                      hasLate && <Badge variant="warning">Worked late</Badge>
                    )}
                    {isParent && onEditDay && (
                      <Button size="sm" variant="outline" onClick={() => onEditDay(s)}>
                        Change times
                      </Button>
                    )}
                    {isNanny && onReportLate && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={materializingId === s.id}
                        onClick={() => onReportLate(s)}
                      >
                        {materializingId === s.id ? 'Loading...' : 'Worked late'}
                      </Button>
                    )}
                    {isParent && !isTpl && s.status === 'scheduled' && onCancel && (
                      <Button size="sm" variant="ghost" onClick={() => onCancel(s.id)}>
                        Cancel day
                      </Button>
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
