import { useMemo, useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import { Download, FileText, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useMyNannyAccess } from '@/hooks/useMyNannyAccess'
import { useHouseholdHolidays } from '@/hooks/useHouseholdHolidays'
import {
  useEmploymentSettings,
  useNannies,
  useAdvanceRepayments,
  usePaymentAdvances,
  useScheduleBlocks,
  useScheduleTemplates,
  useTimeEntries,
  useTimeOffRequests,
} from '@/hooks/useHouseholdData'
import {
  usePayPeriodClose,
  usePayPeriodCloses,
  usePayrollLineItems,
} from '@/hooks/useExtendedFeatures'
import { AdvanceRepaymentsPeriodCard } from '@/components/payroll/AdvanceRepaymentsPeriodCard'
import { PayPeriodHistoryCard } from '@/components/payroll/PayPeriodHistoryCard'
import { PayrollHoursBreakdownDialog } from '@/components/payroll/PayrollHoursBreakdownDialog'
import { PayReportingBreakdown } from '@/components/payroll/PayReportingBreakdown'
import { PaymentAdvancesCard } from '@/components/payroll/PaymentAdvancesCard'
import {
  buildPayPeriodHistoryRows,
  payrollRepaymentsFullyRecorded,
  repaymentsForPayPeriod,
  summarizeAppliedRepaymentsByPayPeriod,
  totalRepaymentCents,
} from '@/lib/advances'
import { PayrollLineItemsCard } from '@/components/payroll/PayrollLineItemsCard'
import { nannyDisplayName } from '@/lib/nanny'
import { exportShiftsCsv } from '@/lib/payroll'
import {
  buildPayrollSnapshot,
  calculateExtendedPayroll,
  downloadCsv,
  exportPayrollCsv,
  exportPayrollCsvFromSnapshot,
  extendedSummaryFromSnapshot,
  getPayPeriodBounds,
  payableShiftsInPeriod,
  timeEntriesToPayableShifts,
  filterPayableShiftsByStartDate,
} from '@/lib/payroll-extended'
import { downloadPayStubPdf } from '@/lib/pay-stub-pdf'
import {
  getPayReportingFromSettings,
  payReportingModeLabel,
} from '@/lib/pay-reporting'
import type { HoursBasis, PayrollSnapshot } from '@/types/features'
import type { Json } from '@/types/database'
import { invalidateAdvanceQueries } from '@/lib/invalidate-advances'
import { recordAdvanceRepaymentsForPeriod } from '@/lib/record-advance-repayments'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import { formatCurrency, formatHours, selectCn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { GustoPayrollActions } from '@/components/payroll/GustoPayrollActions'
import { GustoNannyPayrollSetup } from '@/components/payroll/GustoNannyPayrollSetup'

export function PayrollPage() {
  const { user } = useAuth()
  const { activeHousehold, isParent, isNanny } = useHousehold()
  const { isDeactivated, myNanny } = useMyNannyAccess()
  const [selectedNanny, setSelectedNanny] = useState('')
  const [periodAnchor, setPeriodAnchor] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [hoursBasis, setHoursBasis] = useState<HoursBasis>(() =>
    (localStorage.getItem('nanny_payroll_hours_basis') as HoursBasis) || 'scheduled',
  )

  const { data: nannies } = useNannies()
  const householdNannyId = isNanny ? myNanny?.id : selectedNanny || nannies?.[0]?.id

  const { data: settingsList } = useEmploymentSettings(householdNannyId)
  const settings = settingsList?.[0]
  const period = settings
    ? getPayPeriodBounds(settings.pay_period, new Date(periodAnchor))
    : null

  const from = period?.start.toISOString()
  const to = period?.end.toISOString()
  const periodStartStr = period ? format(period.start, 'yyyy-MM-dd') : undefined

  const scheduleQueriesEnabled = !isDeactivated
  const { data: blocks } = useScheduleBlocks(from, to, { enabled: scheduleQueriesEnabled })
  const { data: templates } = useScheduleTemplates(householdNannyId, {
    enabled: scheduleQueriesEnabled,
  })
  const { data: advances } = usePaymentAdvances(householdNannyId)
  const { data: advanceRepayments } = useAdvanceRepayments(householdNannyId)
  const { data: timeEntries } = useTimeEntries(from, to, householdNannyId)
  const { data: timeOffRequests } = useTimeOffRequests()
  const { data: holidayOverrides } = useHouseholdHolidays()
  const { data: lineItems } = usePayrollLineItems(householdNannyId, periodStartStr)
  const { data: periodClose } = usePayPeriodClose(householdNannyId, periodStartStr)
  const { data: closes } = usePayPeriodCloses(householdNannyId)
  const qc = useQueryClient()

  const selectedNannyProfile =
    (isNanny ? myNanny : nannies?.find((n) => n.id === householdNannyId)) ?? undefined

  const payReportingExtras = useMemo(() => {
    if (!settings) return {}
    const { mode, overTablePercent } = getPayReportingFromSettings(settings)
    const label =
      mode === 'split'
        ? `${payReportingModeLabel(mode)} (${overTablePercent}% on the books)`
        : payReportingModeLabel(mode)
    return { payReportingMode: mode, payReportingLabel: label }
  }, [settings])

  const payStartDate = selectedNannyProfile?.start_date

  const payableShifts = useMemo(() => {
    if (!period || !householdNannyId) return []

    const scheduledShifts =
      blocks && templates
        ? payableShiftsInPeriod(
            blocks,
            (templates ?? []) as NannyScheduleTemplate[],
            householdNannyId,
            period.start,
            period.end,
            payStartDate,
          )
        : []

    const actualShifts = timeEntries?.length
      ? filterPayableShiftsByStartDate(
          timeEntriesToPayableShifts(timeEntries, blocks ?? []),
          payStartDate,
        )
      : scheduledShifts

    return hoursBasis === 'actual' ? actualShifts : scheduledShifts
  }, [blocks, templates, period, householdNannyId, hoursBasis, timeEntries, payStartDate])

  const summary = useMemo(() => {
    if (!settings || !period || !householdNannyId) return null

    return calculateExtendedPayroll(
      payableShifts,
      settings,
      period.start,
      period.end,
      advances ?? [],
      lineItems ?? [],
      timeOffRequests ?? [],
      holidayOverrides ?? [],
    )
  }, [
    settings,
    period,
    householdNannyId,
    advances,
    lineItems,
    payableShifts,
    timeOffRequests,
    holidayOverrides,
  ])

  const displaySummary = useMemo(() => {
    if (isDeactivated && periodClose?.snapshot) {
      return extendedSummaryFromSnapshot(periodClose.snapshot as PayrollSnapshot)
    }
    return summary
  }, [isDeactivated, periodClose, summary])

  const periodLabel =
    period ? `${format(period.start, 'MMM d')} – ${format(period.end, 'MMM d, yyyy')}` : ''

  const periodRepayments = useMemo(() => {
    if (!period || !advanceRepayments) return []
    return repaymentsForPayPeriod(
      advanceRepayments,
      format(period.start, 'yyyy-MM-dd'),
      format(period.end, 'yyyy-MM-dd'),
    )
  }, [advanceRepayments, period])

  const appliedToAdvancesCents = useMemo(
    () => totalRepaymentCents(periodRepayments),
    [periodRepayments],
  )

  const payrollRepaymentsRecorded = useMemo(() => {
    if (!period || !summary) return false
    return payrollRepaymentsFullyRecorded(
      advanceRepayments ?? [],
      format(period.start, 'yyyy-MM-dd'),
      summary.advanceDeductions,
    )
  }, [advanceRepayments, period, summary])

  const payPeriodHistory = useMemo(() => {
    if (!settings) return []
    const summaries = summarizeAppliedRepaymentsByPayPeriod(
      advanceRepayments ?? [],
      settings.pay_period,
    )
    return buildPayPeriodHistoryRows(closes, summaries)
  }, [advanceRepayments, closes, settings])

  const recordRepayments = useMutation({
    mutationFn: async () => {
      if (!summary?.advanceDeductions.length || !period) return
      await recordAdvanceRepaymentsForPeriod(
        activeHousehold!.id,
        format(period.start, 'yyyy-MM-dd'),
        summary.advanceDeductions,
      )
    },
    onSuccess: () => {
      invalidateAdvanceQueries(qc)
      toast.success('Repayments recorded')
    },
    onError: () => toast.error('Failed to record repayments'),
  })

  const saveAutoRecordPreference = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!settings) return
      const { error } = await supabase
        .from('employment_settings')
        .update({ auto_record_advance_repayments: enabled })
        .eq('id', settings.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employment'] }),
    onError: () => toast.error('Failed to save payroll preference'),
  })

  const closePeriod = useMutation({
    mutationFn: async (): Promise<{ recordedRepayments: boolean }> => {
      if (!summary || !period || !settings) return { recordedRepayments: false }
      const periodStart = format(period.start, 'yyyy-MM-dd')
      const shouldAutoRecord =
        settings.auto_record_advance_repayments &&
        summary.advanceDeductions.length > 0 &&
        !payrollRepaymentsFullyRecorded(
          advanceRepayments ?? [],
          periodStart,
          summary.advanceDeductions,
        )

      if (shouldAutoRecord) {
        await recordAdvanceRepaymentsForPeriod(
          activeHousehold!.id,
          periodStart,
          summary.advanceDeductions,
        )
      }

      const snapshot = buildPayrollSnapshot(summary, hoursBasis, {
        householdName: activeHousehold?.name,
        nannyName: selectedNannyProfile ? nannyDisplayName(selectedNannyProfile) : undefined,
        periodLabel: `${format(period.start, 'MMM d')} – ${format(period.end, 'MMM d, yyyy')}`,
        taxWithholdingNotes: settings.tax_withholding_notes ?? null,
        employmentType: settings.employment_type ?? null,
        ...payReportingExtras,
      })
      const { error } = await supabase.from('pay_period_closes').upsert(
        {
          household_id: activeHousehold!.id,
          household_nanny_id: householdNannyId!,
          period_start: format(period.start, 'yyyy-MM-dd'),
          period_end: format(period.end, 'yyyy-MM-dd'),
          hours_basis: hoursBasis,
          closed_by: user!.id,
          snapshot: snapshot as unknown as Json,
        },
        { onConflict: 'household_id,household_nanny_id,period_start' },
      )
      if (error) throw error
      return { recordedRepayments: shouldAutoRecord }
    },
    onSuccess: ({ recordedRepayments }) => {
      invalidateAdvanceQueries(qc)
      qc.invalidateQueries({ queryKey: ['pay_period_close'] })
      qc.invalidateQueries({ queryKey: ['pay_period_closes'] })
      toast.success(
        recordedRepayments
          ? 'Period finalized and advance repayments recorded'
          : 'Pay period finalized',
      )
    },
    onError: () => toast.error('Failed to finalize period'),
  })

  function handleHoursBasisChange(v: HoursBasis) {
    setHoursBasis(v)
    localStorage.setItem('nanny_payroll_hours_basis', v)
  }

  function exportShiftCsv() {
    if (!blocks || !templates || !period || !householdNannyId) return
    const shifts = payableShiftsInPeriod(
      blocks,
      templates as NannyScheduleTemplate[],
      householdNannyId,
      period.start,
      period.end,
      payStartDate,
    )
    const names: Record<string, string> = {
      [householdNannyId]: selectedNannyProfile ? nannyDisplayName(selectedNannyProfile) : 'Nanny',
    }
    downloadCsv(
      `shifts-${periodStartStr}.csv`,
      exportShiftsCsv(shifts, names),
    )
  }

  function exportPayrollSummaryCsv() {
    if (!selectedNannyProfile || !period) return
    const periodLabel = `${format(period.start, 'MMM d')} – ${format(period.end, 'MMM d, yyyy')}`
    const nannyName = nannyDisplayName(selectedNannyProfile)

    if (isDeactivated && periodClose?.snapshot) {
      downloadCsv(
        `payroll-${periodStartStr}.csv`,
        exportPayrollCsvFromSnapshot(periodClose.snapshot as PayrollSnapshot, nannyName, periodLabel),
      )
      return
    }

    if (!summary) return
    downloadCsv(
      `payroll-${periodStartStr}.csv`,
      exportPayrollCsv(summary, lineItems ?? [], nannyName, periodLabel),
    )
  }

  function downloadStub() {
    const snap =
      periodClose?.snapshot ??
      (displaySummary && period
      ? buildPayrollSnapshot(displaySummary, hoursBasis, {
          householdName: activeHousehold?.name,
          nannyName: selectedNannyProfile ? nannyDisplayName(selectedNannyProfile) : undefined,
          periodLabel: `${format(period.start, 'MMM d')} – ${format(period.end, 'MMM d, yyyy')}`,
          taxWithholdingNotes: settings?.tax_withholding_notes,
          employmentType: settings?.employment_type,
          ...payReportingExtras,
        })
      : null)
    if (!snap) return
    downloadPayStubPdf(snap, `pay-stub-${periodStartStr}.pdf`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Earnings"
        subtitle={
          isDeactivated
            ? 'Historical pay periods and exports for your time with this family'
            : 'Track what your nanny earned from hours, bonuses, mileage, and advances — payments handled separately'
        }
      />

      {isDeactivated && (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
          Choose a pay period below. Closed periods show saved totals; use the exports to download CSV or a pay
          stub PDF.
        </p>
      )}

      {isNanny && !isDeactivated && <GustoNannyPayrollSetup />}

      <Card>
        <CardContent className="flex flex-wrap gap-4 pt-6">
          {isParent && (
            <div className="space-y-2">
              <Label>Nanny</Label>
              <select
                className={selectCn}
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
            <DatePicker value={periodAnchor} onChange={setPeriodAnchor} />
          </div>
          {!isDeactivated && (
            <div className="space-y-2">
              <Label>Hours basis</Label>
              <select
                className={selectCn}
                value={hoursBasis}
                onChange={(e) => handleHoursBasisChange(e.target.value as HoursBasis)}
              >
                <option value="scheduled">Scheduled (shifts + templates)</option>
                <option value="actual">Actual (time entries)</option>
              </select>
            </div>
          )}
          {isParent && settings && (
            <label className="flex max-w-md cursor-pointer items-start gap-3 pt-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings.auto_record_advance_repayments}
                disabled={saveAutoRecordPreference.isPending}
                onChange={(e) => saveAutoRecordPreference.mutate(e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium">Auto-record advance repayments</span>
                <span className="mt-0.5 block text-[var(--color-muted-foreground)]">
                  When you finalize this pay period, save suggested repayments to the advance ledger
                  automatically.
                </span>
              </span>
            </label>
          )}
        </CardContent>
      </Card>

      {!settings ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          No employment settings found. {isParent ? 'Add rates in Settings.' : 'Ask your employer to set up pay rates.'}
        </p>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">
                {selectedNannyProfile ? nannyDisplayName(selectedNannyProfile) : 'Nanny'} —{' '}
                {period && `${format(period.start, 'MMM d')} – ${format(period.end, 'MMM d, yyyy')}`}
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                {periodClose && <Badge>Closed</Badge>}
                <Badge variant="secondary">{hoursBasis}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Stat
                  label="Total hours"
                  value={displaySummary ? formatHours(displaySummary.totalMinutes) : '—'}
                  info={
                    displaySummary && settings && !isDeactivated ? (
                      <PayrollHoursBreakdownDialog
                        variant="total"
                        shifts={payableShifts}
                        settings={settings}
                        totalMinutes={displaySummary.totalMinutes}
                        regularMinutes={displaySummary.regularMinutes}
                        overtimeMinutes={displaySummary.overtimeMinutes}
                        holidayItems={displaySummary.holidayPayItems}
                        hoursBasis={hoursBasis}
                        periodLabel={periodLabel}
                      />
                    ) : undefined
                  }
                />
                <Stat
                  label="Regular hours"
                  value={displaySummary ? formatHours(displaySummary.regularMinutes) : '—'}
                  info={
                    displaySummary && settings && !isDeactivated ? (
                      <PayrollHoursBreakdownDialog
                        variant="regular"
                        shifts={payableShifts}
                        settings={settings}
                        totalMinutes={displaySummary.totalMinutes}
                        regularMinutes={displaySummary.regularMinutes}
                        overtimeMinutes={displaySummary.overtimeMinutes}
                        holidayItems={displaySummary.holidayPayItems}
                        hoursBasis={hoursBasis}
                        periodLabel={periodLabel}
                      />
                    ) : undefined
                  }
                />
                <Stat
                  label="Overtime hours"
                  value={displaySummary ? formatHours(displaySummary.overtimeMinutes) : '—'}
                  info={
                    displaySummary && settings && !isDeactivated ? (
                      <PayrollHoursBreakdownDialog
                        variant="overtime"
                        shifts={payableShifts}
                        settings={settings}
                        totalMinutes={displaySummary.totalMinutes}
                        regularMinutes={displaySummary.regularMinutes}
                        overtimeMinutes={displaySummary.overtimeMinutes}
                        holidayItems={displaySummary.holidayPayItems}
                        hoursBasis={hoursBasis}
                        periodLabel={periodLabel}
                      />
                    ) : undefined
                  }
                />
                <Stat
                  label="Holiday hours"
                  value={displaySummary ? formatHours(displaySummary.holidayMinutes) : '—'}
                />
                <Stat
                  label="Worked holiday hours"
                  value={displaySummary ? formatHours(displaySummary.holidayWorkedMinutes) : '—'}
                />
                <Stat
                  label="Overnight premium"
                  value={displaySummary ? formatCurrency(displaySummary.overnightPayCents) : '—'}
                />
                <Stat
                  label="Vacation pay"
                  value={displaySummary ? formatCurrency(displaySummary.vacationPayCents) : '—'}
                />
                <Stat label="Gross pay" value={displaySummary ? formatCurrency(displaySummary.grossPayCents) : '—'} />
                <Stat
                  label="Line items"
                  value={displaySummary ? formatCurrency(displaySummary.lineItemsTotalCents) : '—'}
                />
                {!isDeactivated && (
                  <Stat
                    label="Advance balance"
                    value={displaySummary ? formatCurrency(displaySummary.advanceBalanceCents) : '—'}
                  />
                )}
                {!isDeactivated && (
                  <Stat
                    label="Suggested repayment"
                    value={displaySummary ? formatCurrency(displaySummary.advanceDeductionCents) : '—'}
                  />
                )}
                <Stat
                  label="Applied to advances"
                  value={displaySummary ? formatCurrency(appliedToAdvancesCents) : '—'}
                />
                <Stat
                  label="Net pay"
                  value={displaySummary ? formatCurrency(displaySummary.netPayCents) : '—'}
                  highlight
                />
                {displaySummary && displaySummary.reporting.totalOverCents > 0 && (
                  <Stat
                    label="On the books"
                    value={formatCurrency(displaySummary.reporting.totalOverCents)}
                  />
                )}
                {displaySummary && displaySummary.reporting.totalUnderCents > 0 && (
                  <Stat
                    label="Off the books"
                    value={formatCurrency(displaySummary.reporting.totalUnderCents)}
                  />
                )}
              </div>

              {period && (
                <AdvanceRepaymentsPeriodCard
                  repayments={periodRepayments}
                  advances={advances}
                  periodLabel={`${format(period.start, 'MMM d')} – ${format(period.end, 'MMM d, yyyy')}`}
                />
              )}

              {displaySummary && (
                <PayReportingBreakdown
                  reporting={displaySummary.reporting}
                  regularPayCents={
                    displaySummary.regularPayCents +
                    displaySummary.overnightPayCents +
                    displaySummary.vacationPayCents
                  }
                  overtimePayCents={displaySummary.overtimePayCents}
                  lineItemsTotalCents={displaySummary.lineItemsTotalCents}
                  arrangementLabel={payReportingExtras.payReportingLabel}
                />
              )}

              {isDeactivated && !periodClose && (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  This pay period has not been closed yet. Select another date or ask the family for a closed-period
                  export.
                </p>
              )}

              {settings.tax_withholding_notes && (
                <div className="rounded-lg border bg-[var(--color-muted)]/30 p-3 text-sm">
                  <p className="font-medium">Tax / withholding notes</p>
                  <p className="mt-1 text-[var(--color-muted-foreground)]">
                    {settings.employment_type && (
                      <span className="capitalize">{settings.employment_type} · </span>
                    )}
                    {settings.tax_withholding_notes}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t pt-4">
                {!isDeactivated && (
                  <Button variant="outline" size="sm" onClick={exportShiftCsv}>
                    <Download className="mr-2 h-4 w-4" />
                    Export shifts CSV
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportPayrollSummaryCsv}
                  disabled={!displaySummary && !periodClose}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export earnings CSV
                </Button>
                <Button variant="outline" size="sm" onClick={downloadStub} disabled={!displaySummary && !periodClose}>
                  <FileText className="mr-2 h-4 w-4" />
                  Download earnings summary PDF
                </Button>
                {isParent && !periodClose && (
                  <Button
                    size="sm"
                    onClick={() => closePeriod.mutate()}
                    disabled={closePeriod.isPending || !summary}
                  >
                    <Lock className="mr-2 h-4 w-4" />
                    {closePeriod.isPending ? 'Finalizing...' : 'Finalize period'}
                  </Button>
                )}
              </div>

              {isParent && summary && summary.advanceDeductions.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                  {payrollRepaymentsRecorded ? (
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      Payroll repayments for this period are recorded
                      {appliedToAdvancesCents > 0 && ` (${formatCurrency(appliedToAdvancesCents)} applied)`}.
                    </p>
                  ) : settings.auto_record_advance_repayments ? (
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      Suggested repayments ({formatCurrency(summary.advanceDeductionCents)}) will be
                      recorded automatically when you finalize this pay period. You can still record them
                      now if needed.
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-2"
                        onClick={() => recordRepayments.mutate()}
                        disabled={recordRepayments.isPending}
                      >
                        {recordRepayments.isPending ? 'Recording...' : 'Record now'}
                      </Button>
                    </p>
                  ) : (
                    <Button
                      onClick={() => recordRepayments.mutate()}
                      disabled={recordRepayments.isPending}
                    >
                      {recordRepayments.isPending ? 'Recording...' : 'Record repayments for this period'}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {isParent && householdNannyId && periodStartStr && (
            <PayrollLineItemsCard
              householdNannyId={householdNannyId}
              periodStart={periodStartStr}
              disabled={!!periodClose}
            />
          )}

          {isParent && householdNannyId && period && (
            <GustoPayrollActions
              householdNannyId={householdNannyId}
              payPeriodCloseId={periodClose?.id}
              periodLabel={`${format(period.start, 'MMM d')} – ${format(period.end, 'MMM d, yyyy')}`}
            />
          )}

          <PayPeriodHistoryCard rows={payPeriodHistory} />
        </>
      )}

      {isParent && (
        <PaymentAdvancesCard
          householdNannyId={householdNannyId}
          payStartDate={payStartDate}
          templates={templates as NannyScheduleTemplate[] | undefined}
        />
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  highlight,
  info,
}: {
  label: string
  value: string
  highlight?: boolean
  info?: ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-shadow',
        highlight ? 'stat-card-highlight border-[var(--color-primary)]/25' : 'bg-[var(--color-card)] shadow-sm',
      )}
    >
      <div className="flex items-center gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
          {label}
        </p>
        {info}
      </div>
      <p className={`mt-1 text-2xl font-bold ${highlight ? 'text-[var(--color-primary)]' : ''}`}>
        {value}
      </p>
    </div>
  )
}
