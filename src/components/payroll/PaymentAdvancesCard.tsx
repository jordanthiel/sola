import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import {
  useAdvanceRepayments,
  useEmploymentSettings,
  usePaymentAdvances,
  useScheduleBlocks,
  useScheduleTemplates,
} from '@/hooks/useHouseholdData'
import {
  buildPeriodBackfillOptions,
  hasUsualSchedule,
  isIssuedInPast,
  suggestOvertimeBackfill,
  suggestPerPaycheckBackfill,
  type PayPeriodOption,
} from '@/lib/advance-backfill'
import { repaymentModeLabel } from '@/lib/advances'
import { formatSupabaseError } from '@/lib/errors'
import { invalidateAdvanceQueries } from '@/lib/invalidate-advances'
import type { AdvanceRepaymentMode } from '@/types/database'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import {
  repaymentSourceLabel,
  type AdvanceRepayment,
  type AdvanceRepaymentSource,
} from '@/types/advance-repayment'
import { formatCurrency, formatHours } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface PaymentAdvancesCardProps {
  householdNannyId: string | undefined
  templates: NannyScheduleTemplate[] | undefined
}

export function PaymentAdvancesCard({ householdNannyId, templates }: PaymentAdvancesCardProps) {
  const { activeHousehold } = useHousehold()
  const qc = useQueryClient()
  const { data: advances } = usePaymentAdvances(householdNannyId)
  const { data: repayments } = useAdvanceRepayments(householdNannyId)
  const { data: settingsList } = useEmploymentSettings(householdNannyId)
  const settings = settingsList?.[0]

  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceIssuedOn, setAdvanceIssuedOn] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [advanceReason, setAdvanceReason] = useState('')
  const [repaymentMode, setRepaymentMode] = useState<AdvanceRepaymentMode>('per_paycheck')
  const [repaymentPerPaycheck, setRepaymentPerPaycheck] = useState('')
  const [trackPastPayments, setTrackPastPayments] = useState(false)
  const [backfillByPeriod, setBackfillByPeriod] = useState(true)
  const [alreadyRepaid, setAlreadyRepaid] = useState('')
  const [selectedPeriodKeys, setSelectedPeriodKeys] = useState<Set<string>>(new Set())

  const [manualAdvanceId, setManualAdvanceId] = useState<string | null>(null)
  const [manualAmount, setManualAmount] = useState('')
  const [manualDate, setManualDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [manualNotes, setManualNotes] = useState('')
  const [expandedAdvanceId, setExpandedAdvanceId] = useState<string | null>(null)

  const backfillFrom = advanceIssuedOn
  const { data: backfillBlocks } = useScheduleBlocks(
    backfillFrom ? new Date(backfillFrom).toISOString() : undefined,
    new Date().toISOString(),
  )
  const { data: templatesFromHook } = useScheduleTemplates(householdNannyId)
  const scheduleTemplates = templates ?? templatesFromHook ?? []

  const scheduleInput = useMemo(() => {
    if (!householdNannyId) return null
    return {
      blocks: backfillBlocks ?? [],
      templates: scheduleTemplates,
      householdNannyId,
    }
  }, [backfillBlocks, scheduleTemplates, householdNannyId])

  const amountCents = Math.round(parseFloat(advanceAmount || '0') * 100)
  const perPaycheckCents =
    repaymentMode === 'per_paycheck' ? Math.round(parseFloat(repaymentPerPaycheck || '0') * 100) : null

  const pastIssued = isIssuedInPast(advanceIssuedOn)

  const periodOptions: PayPeriodOption[] = useMemo(() => {
    if (!pastIssued || !settings || !scheduleInput || !amountCents) return []
    return buildPeriodBackfillOptions(
      advanceIssuedOn,
      amountCents,
      repaymentMode,
      perPaycheckCents,
      settings,
      scheduleInput,
    )
  }, [
    pastIssued,
    settings,
    scheduleInput,
    amountCents,
    advanceIssuedOn,
    repaymentMode,
    perPaycheckCents,
  ])

  const perPaycheckSuggestion = useMemo(() => {
    if (!pastIssued || !settings || !amountCents || !perPaycheckCents) return null
    return suggestPerPaycheckBackfill(advanceIssuedOn, perPaycheckCents, amountCents, settings.pay_period)
  }, [pastIssued, settings, amountCents, advanceIssuedOn, perPaycheckCents])

  const overtimeSuggestion = useMemo(() => {
    if (!pastIssued || !settings || !amountCents || !scheduleInput) return null
    if (repaymentMode !== 'overtime_only') return null
    return suggestOvertimeBackfill(advanceIssuedOn, amountCents, settings, scheduleInput)
  }, [pastIssued, settings, amountCents, advanceIssuedOn, repaymentMode, scheduleInput])

  const suggestion =
    repaymentMode === 'overtime_only' ? overtimeSuggestion : perPaycheckSuggestion

  const usualScheduleReady = scheduleInput ? hasUsualSchedule(scheduleInput) : false

  useEffect(() => {
    if (!trackPastPayments || !suggestion) return
    if (backfillByPeriod && periodOptions.length) {
      const keys = new Set(periodOptions.map((p) => p.periodStart.toISOString()))
      setSelectedPeriodKeys(keys)
      const total = periodOptions.reduce((s, p) => s + p.suggestedCents, 0)
      setAlreadyRepaid((total / 100).toFixed(2))
    } else if (suggestion.suggestedCents > 0) {
      setAlreadyRepaid((suggestion.suggestedCents / 100).toFixed(2))
    }
  }, [trackPastPayments, backfillByPeriod, periodOptions, suggestion])

  const repaymentsByAdvance = useMemo(() => {
    const map: Record<string, AdvanceRepayment[]> = {}
    for (const r of repayments ?? []) {
      if (!map[r.payment_advance_id]) map[r.payment_advance_id] = []
      map[r.payment_advance_id].push(r)
    }
    return map
  }, [repayments])

  const createAdvance = useMutation({
    mutationFn: async () => {
      const cents = amountCents
      if (repaymentMode === 'per_paycheck' && (!perPaycheckCents || perPaycheckCents <= 0)) {
        throw new Error('Enter how much to withhold each paycheck')
      }
      if (repaymentMode === 'per_paycheck' && perPaycheckCents! > cents) {
        throw new Error('Per-paycheck amount cannot exceed the advance total')
      }

      const { data: row, error } = await supabase
        .from('payment_advances')
        .insert({
          household_id: activeHousehold!.id,
          household_nanny_id: householdNannyId!,
          amount_cents: cents,
          balance_cents: cents,
          issued_on: advanceIssuedOn,
          reason: advanceReason || null,
          repayment_mode: repaymentMode,
          repayment_per_paycheck_cents: perPaycheckCents,
        })
        .select('id')
        .single()
      if (error) throw error

      if (trackPastPayments && pastIssued) {
        if (backfillByPeriod && selectedPeriodKeys.size > 0) {
          for (const opt of periodOptions) {
            if (!selectedPeriodKeys.has(opt.periodStart.toISOString()) || opt.suggestedCents <= 0) {
              continue
            }
            const { error: payErr } = await supabase.rpc('apply_advance_payment', {
              p_advance_id: row.id,
              p_amount_cents: opt.suggestedCents,
              p_paid_on: format(opt.periodEnd, 'yyyy-MM-dd'),
              p_source: 'backfill' as AdvanceRepaymentSource,
              p_pay_period_start: format(opt.periodStart, 'yyyy-MM-dd'),
              p_notes: 'Repayment before tracking in app',
            })
            if (payErr) throw payErr
          }
        } else {
          const repaidCents = Math.round(parseFloat(alreadyRepaid || '0') * 100)
          if (repaidCents > 0) {
            const { error: payErr } = await supabase.rpc('apply_advance_payment', {
              p_advance_id: row.id,
              p_amount_cents: repaidCents,
              p_paid_on: advanceIssuedOn,
              p_source: 'backfill',
              p_notes: 'Payments made before tracking in app',
            })
            if (payErr) throw payErr
          }
        }
      }
    },
    onSuccess: async () => {
      await invalidateAdvanceQueries(qc)
      resetForm()
    },
  })

  const applyManualPayment = useMutation({
    mutationFn: async () => {
      const cents = Math.round(parseFloat(manualAmount) * 100)
      const { error } = await supabase.rpc('apply_advance_payment', {
        p_advance_id: manualAdvanceId!,
        p_amount_cents: cents,
        p_paid_on: manualDate,
        p_source: 'manual',
        p_notes: manualNotes.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidateAdvanceQueries(qc)
      setManualAdvanceId(null)
      setManualAmount('')
      setManualNotes('')
    },
  })

  function resetForm() {
    setAdvanceAmount('')
    setAdvanceReason('')
    setRepaymentPerPaycheck('')
    setAdvanceIssuedOn(format(new Date(), 'yyyy-MM-dd'))
    setTrackPastPayments(false)
    setAlreadyRepaid('')
    setSelectedPeriodKeys(new Set())
  }

  function togglePeriod(key: string) {
    setSelectedPeriodKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectedPeriodTotalCents = periodOptions
    .filter((p) => selectedPeriodKeys.has(p.periodStart.toISOString()))
    .reduce((s, p) => s + p.suggestedCents, 0)

  const canIssueAdvance =
    !!advanceAmount &&
    !!householdNannyId &&
    (repaymentMode === 'overtime_only' || !!repaymentPerPaycheck) &&
    (!trackPastPayments ||
      !pastIssued ||
      (backfillByPeriod ? selectedPeriodTotalCents <= amountCents : parseFloat(alreadyRepaid || '0') * 100 <= amountCents))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Payment advances</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Amount ($)</Label>
            <Input
              type="number"
              step="0.01"
              value={advanceAmount}
              onChange={(e) => setAdvanceAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Date granted</Label>
            <DatePicker
              value={advanceIssuedOn}
              onChange={(v) => {
                setAdvanceIssuedOn(v)
                setTrackPastPayments(isIssuedInPast(v))
              }}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Reason (optional)</Label>
            <Input value={advanceReason} onChange={(e) => setAdvanceReason(e.target.value)} />
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Repayment</legend>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="repayment-mode"
              checked={repaymentMode === 'per_paycheck'}
              onChange={() => setRepaymentMode('per_paycheck')}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Fixed amount each paycheck</span>
            </span>
          </label>
          {repaymentMode === 'per_paycheck' && (
            <div className="ml-6 max-w-xs space-y-2">
              <Label>Amount per paycheck ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={repaymentPerPaycheck}
                onChange={(e) => setRepaymentPerPaycheck(e.target.value)}
              />
            </div>
          )}
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="repayment-mode"
              checked={repaymentMode === 'overtime_only'}
              onChange={() => setRepaymentMode('overtime_only')}
              className="mt-1"
            />
            <span>
              <span className="font-medium">Overtime earnings only</span>
            </span>
          </label>
        </fieldset>

        {pastIssued && (
          <div className="rounded-lg border bg-[var(--color-muted)]/40 p-4 space-y-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={trackPastPayments}
                onChange={(e) => setTrackPastPayments(e.target.checked)}
              />
              Payments were already made toward this advance
            </label>

            {trackPastPayments && (
              <>
                {suggestion && suggestion.suggestedCents > 0 && (
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    {overtimeSuggestion ? (
                      <>
                        Estimated from the usual weekly schedule across {overtimeSuggestion.periodCount}{' '}
                        completed pay period{overtimeSuggestion.periodCount === 1 ? '' : 's'} (
                        {formatHours(overtimeSuggestion.totalOvertimeMinutes)} OT):{' '}
                      </>
                    ) : (
                      <>
                        Estimated from {suggestion.periodCount} completed pay period
                        {suggestion.periodCount === 1 ? '' : 's'} and your repayment settings:{' '}
                      </>
                    )}
                    <strong>{formatCurrency(suggestion.suggestedCents)}</strong>
                  </p>
                )}
                {repaymentMode === 'overtime_only' && overtimeSuggestion?.suggestedCents === 0 && (
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    {!usualScheduleReady
                      ? 'Set the default weekly schedule in Settings first so we can estimate overtime from usual hours.'
                      : overtimeSuggestion.totalOvertimeMinutes === 0
                        ? `Based on the usual weekly schedule, no overtime hours fall in the past ${overtimeSuggestion.periodCount} pay period${overtimeSuggestion.periodCount === 1 ? '' : 's'} (hours are at or below the regular-time threshold). Enter repayments manually if some were made another way.`
                        : 'Enter repayments manually below if payments were already made.'}
                  </p>
                )}

                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={backfillByPeriod}
                    onChange={() => setBackfillByPeriod(true)}
                  />
                  Select by pay period
                </label>
                {backfillByPeriod && periodOptions.length > 0 && (
                  <ul className="ml-4 max-h-48 space-y-2 overflow-y-auto text-sm">
                    {periodOptions.map((p) => {
                      const key = p.periodStart.toISOString()
                      return (
                        <li key={key} className="flex items-center justify-between gap-2">
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedPeriodKeys.has(key)}
                              onChange={() => togglePeriod(key)}
                            />
                            {p.label}
                          </label>
                          <span className="text-[var(--color-muted-foreground)]">
                            {formatCurrency(p.suggestedCents)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {backfillByPeriod && (
                  <p className="text-sm font-medium">
                    Selected total: {formatCurrency(selectedPeriodTotalCents)}
                  </p>
                )}

                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={!backfillByPeriod}
                    onChange={() => setBackfillByPeriod(false)}
                  />
                  Enter total already repaid
                </label>
                {!backfillByPeriod && (
                  <div className="ml-4 max-w-xs space-y-2">
                    <Label>Amount already repaid ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={alreadyRepaid}
                      onChange={(e) => setAlreadyRepaid(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {createAdvance.isError && (
          <p className="text-sm text-red-600">{formatSupabaseError(createAdvance.error)}</p>
        )}

        <Button onClick={() => createAdvance.mutate()} disabled={!canIssueAdvance || createAdvance.isPending}>
          Issue advance
        </Button>

        <ul className="space-y-3 border-t pt-4">
          {advances?.map((a) => {
            const paid = a.amount_cents - a.balance_cents
            const history = repaymentsByAdvance[a.id] ?? []
            const expanded = expandedAdvanceId === a.id

            return (
              <li key={a.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{formatCurrency(a.amount_cents)}</p>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      Granted {a.issued_on}
                      {a.reason && ` · ${a.reason}`}
                    </p>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      {repaymentModeLabel(a.repayment_mode)}
                      {a.repayment_mode === 'per_paycheck' &&
                        a.repayment_per_paycheck_cents &&
                        ` · ${formatCurrency(a.repayment_per_paycheck_cents)}/paycheck`}
                    </p>
                    <p className="text-sm">
                      Repaid {formatCurrency(paid)} · Balance {formatCurrency(a.balance_cents)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={a.status === 'open' ? 'warning' : 'success'}>{a.status}</Badge>
                    {a.status === 'open' && (
                      <Button size="sm" variant="outline" onClick={() => setManualAdvanceId(a.id)}>
                        Add payment
                      </Button>
                    )}
                    {history.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedAdvanceId(expanded ? null : a.id)}
                      >
                        {expanded ? 'Hide' : 'History'}
                      </Button>
                    )}
                  </div>
                </div>
                {expanded && history.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t pt-2 text-sm">
                    {history.map((r) => (
                      <li key={r.id} className="flex justify-between gap-2">
                        <span>
                          {r.paid_on} · {repaymentSourceLabel(r.source)}
                          {r.notes && ` · ${r.notes}`}
                        </span>
                        <span className="font-medium">{formatCurrency(r.amount_cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
          {!advances?.length && (
            <p className="text-sm text-[var(--color-muted-foreground)]">No advances recorded.</p>
          )}
        </ul>

        {manualAdvanceId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-lg border bg-[var(--color-card)] p-6 shadow-lg">
              <h3 className="text-lg font-semibold">Payment outside payroll</h3>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                Cash, Venmo, or any repayment not taken through a pay period.
              </p>
              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label>Amount ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date paid</Label>
                  <DatePicker value={manualDate} onChange={setManualDate} />
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Input value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} />
                </div>
                {applyManualPayment.isError && (
                  <p className="text-sm text-red-600">{formatSupabaseError(applyManualPayment.error)}</p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setManualAdvanceId(null)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => applyManualPayment.mutate()}
                    disabled={!manualAmount || applyManualPayment.isPending}
                  >
                    Save payment
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
