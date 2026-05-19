import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import {
  useEmploymentSettings,
  useMyHouseholdNanny,
  useNannies,
  usePaymentAdvances,
  useScheduleBlocks,
  useScheduleTemplates,
} from '@/hooks/useHouseholdData'
import { nannyDisplayName } from '@/lib/nanny'
import { calculatePayroll, getPayPeriodBounds } from '@/lib/payroll'
import { payableShiftsInPeriod } from '@/lib/schedule-hours'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import { formatCurrency, formatHours } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function PayrollPage() {
  const { activeHousehold, isParent, isNanny } = useHousehold()
  const { data: myNanny } = useMyHouseholdNanny()
  const [selectedNanny, setSelectedNanny] = useState('')
  const [periodAnchor, setPeriodAnchor] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceReason, setAdvanceReason] = useState('')

  const { data: nannies } = useNannies()
  const householdNannyId = isNanny ? myNanny?.id : selectedNanny || nannies?.[0]?.id

  const { data: settingsList } = useEmploymentSettings(householdNannyId)
  const settings = settingsList?.[0]
  const period = settings
    ? getPayPeriodBounds(settings.pay_period, new Date(periodAnchor))
    : null

  const from = period?.start.toISOString()
  const to = period?.end.toISOString()

  const { data: blocks } = useScheduleBlocks(from, to)
  const { data: templates } = useScheduleTemplates(householdNannyId)
  const { data: advances } = usePaymentAdvances(householdNannyId)
  const qc = useQueryClient()

  const selectedNannyProfile = nannies?.find((n) => n.id === householdNannyId)

  const openAdvancesCents =
    advances?.filter((a) => a.status === 'open').reduce((s, a) => s + a.amount_cents, 0) ?? 0

  const summary = useMemo(() => {
    if (!settings || !blocks || !period || !householdNannyId) return null
    const shifts = payableShiftsInPeriod(
      blocks,
      (templates ?? []) as NannyScheduleTemplate[],
      householdNannyId,
      period.start,
      period.end,
    )
    return calculatePayroll(shifts, settings, period.start, period.end, openAdvancesCents)
  }, [settings, blocks, templates, period, householdNannyId, openAdvancesCents])

  const createAdvance = useMutation({
    mutationFn: async () => {
      const cents = Math.round(parseFloat(advanceAmount) * 100)
      const { error } = await supabase.from('payment_advances').insert({
        household_id: activeHousehold!.id,
        household_nanny_id: householdNannyId!,
        amount_cents: cents,
        reason: advanceReason || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['advances'] })
      setAdvanceAmount('')
      setAdvanceReason('')
    },
  })

  const applyAdvance = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payment_advances')
        .update({
          status: 'applied',
          applied_pay_period_start: period?.start.toISOString().split('T')[0],
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['advances'] }),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payroll</h1>
        <p className="text-[var(--color-muted-foreground)]">
          Based on scheduled hours and any late-day adjustments from the schedule
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-4 pt-6">
          {isParent && (
            <div className="space-y-2">
              <Label>Nanny</Label>
              <select
                className="flex h-10 rounded-md border px-3 text-sm"
                value={selectedNanny || (nannies?.[0]?.id ?? '')}
                onChange={(e) => setSelectedNanny(e.target.value)}
              >
                {nannies?.map((n) => (
                  <option key={n.id} value={n.id}>
                    {nannyDisplayName(n)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Pay period anchor</Label>
            <Input type="date" value={periodAnchor} onChange={(e) => setPeriodAnchor(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {!settings ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          No employment settings found. {isParent ? 'Add rates in Settings.' : 'Ask your employer to set up payroll.'}
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedNannyProfile ? nannyDisplayName(selectedNannyProfile) : 'Nanny'} —{' '}
              {period && `${format(period.start, 'MMM d')} – ${format(period.end, 'MMM d, yyyy')}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Stat label="Total hours" value={summary ? formatHours(summary.totalMinutes) : '—'} />
            <Stat label="Regular hours" value={summary ? formatHours(summary.regularMinutes) : '—'} />
            <Stat label="Overtime hours" value={summary ? formatHours(summary.overtimeMinutes) : '—'} />
            <Stat label="Gross pay" value={summary ? formatCurrency(summary.grossPayCents) : '—'} />
            <Stat label="Open advances" value={formatCurrency(openAdvancesCents)} />
            <Stat label="Net pay" value={summary ? formatCurrency(summary.netPayCents) : '—'} highlight />
          </CardContent>
        </Card>
      )}

      {isParent && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment advances</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Input
                type="number"
                step="0.01"
                placeholder="Amount ($)"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                className="max-w-[140px]"
              />
              <Input
                placeholder="Reason"
                value={advanceReason}
                onChange={(e) => setAdvanceReason(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={() => createAdvance.mutate()}
                disabled={!advanceAmount || !householdNannyId || createAdvance.isPending}
              >
                Issue advance
              </Button>
            </div>
            <ul className="space-y-2">
              {advances?.map((a) => (
                <li key={a.id} className="flex items-center justify-between border-b py-2 last:border-0">
                  <div>
                    <p className="font-medium">{formatCurrency(a.amount_cents)}</p>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      {a.issued_on} {a.reason && `· ${a.reason}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={a.status === 'open' ? 'warning' : 'success'}>{a.status}</Badge>
                    {a.status === 'open' && (
                      <Button size="sm" variant="outline" onClick={() => applyAdvance.mutate(a.id)}>
                        Apply to period
                      </Button>
                    )}
                  </div>
                </li>
              ))}
              {!advances?.length && (
                <p className="text-sm text-[var(--color-muted-foreground)]">No advances recorded.</p>
              )}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? 'border-[var(--color-primary)] bg-[var(--color-accent)]' : ''}`}>
      <p className="text-sm text-[var(--color-muted-foreground)]">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  )
}
