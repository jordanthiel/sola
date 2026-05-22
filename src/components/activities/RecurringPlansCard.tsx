import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useRecurringPlans } from '@/hooks/useExtendedFeatures'
import { trimRecurringPlanAfterEnd } from '@/lib/recurring-plans'
import { formatSupabaseError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatRepeatEnd(date: string | null): string {
  if (!date) return 'No end date'
  return format(parseISO(date), 'MMM d, yyyy')
}

/** Lists active repeating rules and generates calendar instances. */
export function RecurringPlansCard() {
  const { activeHousehold } = useHousehold()
  const { data: plans } = useRecurringPlans()
  const qc = useQueryClient()
  const [endDates, setEndDates] = useState<Record<string, string>>({})

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('generate_recurring_child_plans', {
        p_household_id: activeHousehold!.id,
      })
      if (error) throw error
      return data as number
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['activities'] })
      qc.invalidateQueries({ queryKey: ['schedule'] })
      toast.success(`Generated ${count ?? 0} plan(s)`)
    },
    onError: () => toast.error('Generation failed'),
  })

  const toggleEnabled = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('recurring_child_plans')
        .update({ enabled })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring_plans'] }),
  })

  const saveEndDate = useMutation({
    mutationFn: async ({ id, repeatEndsOn }: { id: string; repeatEndsOn: string | null }) => {
      const { error } = await supabase
        .from('recurring_child_plans')
        .update({ repeat_ends_on: repeatEndsOn })
        .eq('id', id)
      if (error) throw error
      await trimRecurringPlanAfterEnd(id, repeatEndsOn)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['recurring_plans'] })
      await qc.invalidateQueries({ queryKey: ['activities'] })
      await qc.invalidateQueries({ queryKey: ['schedule'] })
      toast.success('Repeat end date updated')
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  if (!plans?.length) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Repeating plans</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
        >
          {generate.isPending ? 'Generating...' : 'Fill in next 8 weeks'}
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {plans.map((p) => {
            const minEnd = p.repeat_starts_on ?? undefined
            const endValue = endDates[p.id] ?? p.repeat_ends_on ?? ''
            return (
              <li key={p.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span>
                    {p.title} — {DAYS[p.day_of_week]} {p.start_time.slice(0, 5)} ({p.child_ids.length}{' '}
                    kid{p.child_ids.length !== 1 ? 's' : ''})
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleEnabled.mutate({ id: p.id, enabled: !p.enabled })}
                  >
                    {p.enabled ? 'Pause' : 'Resume'}
                  </Button>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor={`repeat-end-${p.id}`} className="text-xs text-[var(--color-muted-foreground)]">
                      Repeat until
                    </Label>
                    <DatePicker
                      id={`repeat-end-${p.id}`}
                      className="h-9 w-auto min-w-[11rem]"
                      min={minEnd}
                      value={endValue}
                      onChange={(v) =>
                        setEndDates((prev) => ({
                          ...prev,
                          [p.id]: v,
                        }))
                      }
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saveEndDate.isPending}
                    onClick={() =>
                      saveEndDate.mutate({
                        id: p.id,
                        repeatEndsOn: endValue.trim() || null,
                      })
                    }
                  >
                    Save end date
                  </Button>
                  <span className="pb-2 text-xs text-[var(--color-muted-foreground)]">
                    Current: {formatRepeatEnd(p.repeat_ends_on)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
