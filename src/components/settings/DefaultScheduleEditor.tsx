import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useScheduleTemplates } from '@/hooks/useHouseholdData'
import { formatSupabaseError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  WEEKDAYS,
  draftFromTemplates,
  emptyWeekDraft,
  type DayScheduleDraft,
} from '@/types/schedule-template'

interface DefaultScheduleEditorProps {
  householdNannyId: string
}

export function DefaultScheduleEditor({ householdNannyId }: DefaultScheduleEditorProps) {
  const { activeHousehold } = useHousehold()
  const qc = useQueryClient()
  const { data: templates, isLoading } = useScheduleTemplates(householdNannyId)
  const [draft, setDraft] = useState<DayScheduleDraft[]>(emptyWeekDraft)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (templates) {
      setDraft(draftFromTemplates(templates))
    } else {
      setDraft(emptyWeekDraft())
    }
  }, [templates, householdNannyId])

  const saveTemplates = useMutation({
    mutationFn: async () => {
      const rows = draft.map((d) => ({
        household_id: activeHousehold!.id,
        household_nanny_id: householdNannyId,
        day_of_week: d.day_of_week,
        start_time: d.start_time,
        end_time: d.end_time,
        enabled: d.enabled,
        updated_at: new Date().toISOString(),
      }))
      const { error: upsertError } = await supabase
        .from('nanny_schedule_templates')
        .upsert(rows, { onConflict: 'household_id,household_nanny_id,day_of_week' })
      if (upsertError) throw upsertError
    },
    onSuccess: () => {
      setError('')
      setMessage('Default schedule saved.')
      qc.invalidateQueries({ queryKey: ['schedule_templates'] })
    },
    onError: (err) => {
      setMessage('')
      setError(formatSupabaseError(err))
    },
  })

  const syncToCalendar = useMutation({
    mutationFn: async () => {
      const { data, error: rpcError } = await supabase.rpc('ensure_schedule_from_templates', {
        p_household_id: activeHousehold!.id,
        p_household_nanny_id: householdNannyId,
        p_weeks: 8,
      })
      if (rpcError) throw rpcError
      return data as number
    },
    onSuccess: (count) => {
      setError('')
      setMessage(`Added ${count} shift${count === 1 ? '' : 's'} to the calendar for the next 8 weeks.`)
      qc.invalidateQueries({ queryKey: ['schedule'] })
    },
    onError: (err) => {
      setMessage('')
      setError(formatSupabaseError(err))
    },
  })

  const updateDay = (dow: number, patch: Partial<DayScheduleDraft>) => {
    setDraft((prev) => prev.map((d) => (d.day_of_week === dow ? { ...d, ...patch } : d)))
  }

  const applyWeekdays = () => {
    const mon = draft.find((d) => d.day_of_week === 1)
    if (!mon) return
    setDraft((prev) =>
      prev.map((d) =>
        d.day_of_week >= 1 && d.day_of_week <= 5
          ? { ...d, enabled: mon.enabled, start_time: mon.start_time, end_time: mon.end_time }
          : d,
      ),
    )
  }

  if (isLoading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Loading default schedule...</p>
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-[var(--color-muted-foreground)]">
              <th className="pb-2 pr-2 font-medium">Day</th>
              <th className="pb-2 pr-2 font-medium">On</th>
              <th className="pb-2 pr-2 font-medium">Start</th>
              <th className="pb-2 font-medium">End</th>
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map(({ dow, label }) => {
              const day = draft.find((d) => d.day_of_week === dow)!
              return (
                <tr key={dow} className="border-b last:border-0">
                  <td className="py-2 pr-2">{label}</td>
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={day.enabled}
                      onChange={(e) => updateDay(dow, { enabled: e.target.checked })}
                      aria-label={`${label} enabled`}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      type="time"
                      value={day.start_time}
                      disabled={!day.enabled}
                      onChange={(e) => updateDay(dow, { start_time: e.target.value })}
                      className="h-9"
                    />
                  </td>
                  <td className="py-2">
                    <Input
                      type="time"
                      value={day.end_time}
                      disabled={!day.enabled}
                      onChange={(e) => updateDay(dow, { end_time: e.target.value })}
                      className="h-9"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={applyWeekdays}>
          Copy Monday to weekdays
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => saveTemplates.mutate()} disabled={saveTemplates.isPending}>
          {saveTemplates.isPending ? 'Saving...' : 'Save default schedule'}
        </Button>
        <Button
          variant="outline"
          onClick={() => syncToCalendar.mutate()}
          disabled={syncToCalendar.isPending}
        >
          {syncToCalendar.isPending ? 'Syncing...' : 'Apply to calendar (8 weeks)'}
        </Button>
      </div>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        The schedule page always shows this weekly pattern. Use &quot;Apply to calendar&quot; to create
        concrete shifts, or add one-off changes on the Schedule page.
      </p>
    </div>
  )
}
