import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import {
  recordedRepaymentCentsByAdvance,
  repaymentsForPayPeriod,
} from '@/lib/advances'
import { dueAutoFinalizePeriods } from '@/lib/auto-finalize'
import { platformPayrollStartDate } from '@/lib/advance-backfill'
import { nannyDisplayName } from '@/lib/nanny'
import {
  getPayReportingFromSettings,
  payReportingModeLabel,
} from '@/lib/pay-reporting'
import {
  buildPayrollSnapshot,
  calculateExtendedPayroll,
  filterPayableShiftsByStartDate,
  payableShiftsInPeriod,
  timeEntriesToPayableShifts,
} from '@/lib/payroll-extended'
import { advanceRepaymentPayload } from '@/lib/record-advance-repayments'
import type { AdvanceRepayment } from '@/types/advance-repayment'
import type {
  EmploymentSetting,
  HouseholdHoliday,
  Json,
  PaymentAdvance,
  ScheduleBlock,
  TimeEntry,
  TimeOffRequest,
} from '@/types/database'
import type { HoursBasis, PayrollLineItem } from '@/types/features'
import type { HouseholdNanny } from '@/types/household-nanny'
import type { NannyScheduleTemplate } from '@/types/schedule-template'

function latestSettingsByNanny(rows: EmploymentSetting[]): Map<string, EmploymentSetting> {
  const map = new Map<string, EmploymentSetting>()
  for (const row of rows) {
    if (!row.household_nanny_id) continue
    if (!map.has(row.household_nanny_id)) map.set(row.household_nanny_id, row)
  }
  return map
}

async function closeDuePeriod(input: {
  householdId: string
  householdName?: string | null
  nanny: HouseholdNanny
  settings: EmploymentSetting
  periodStart: Date
  periodEnd: Date
}): Promise<boolean> {
  const { householdId, householdName, nanny, settings, periodStart, periodEnd } = input
  const periodStartStr = format(periodStart, 'yyyy-MM-dd')
  const periodEndStr = format(periodEnd, 'yyyy-MM-dd')
  const hoursBasis = (settings.payroll_hours_basis ?? 'scheduled') as HoursBasis

  const from = periodStart.toISOString()
  const to = periodEnd.toISOString()

  const [
    blocksRes,
    templatesRes,
    advancesRes,
    timeEntriesRes,
    timeOffRes,
    holidaysRes,
    lineItemsRes,
  ] = await Promise.all([
    supabase
      .from('schedule_blocks')
      .select('*')
      .eq('household_id', householdId)
      .eq('household_nanny_id', nanny.id)
      .gte('starts_at', from)
      .lte('starts_at', to),
    supabase
      .from('nanny_schedule_templates')
      .select('*')
      .eq('household_id', householdId)
      .eq('household_nanny_id', nanny.id),
    supabase
      .from('payment_advances')
      .select('*')
      .eq('household_id', householdId)
      .eq('household_nanny_id', nanny.id),
    supabase
      .from('time_entries')
      .select('*')
      .eq('household_id', householdId)
      .eq('household_nanny_id', nanny.id)
      .gte('clock_in', from)
      .lte('clock_in', to),
    supabase.from('time_off_requests').select('*').eq('household_id', householdId),
    supabase.from('household_holidays').select('holiday_key, enabled').eq('household_id', householdId),
    supabase
      .from('payroll_line_items')
      .select('*')
      .eq('household_id', householdId)
      .eq('household_nanny_id', nanny.id)
      .eq('pay_period_start', periodStartStr),
  ])

  const firstError =
    blocksRes.error ||
    templatesRes.error ||
    advancesRes.error ||
    timeEntriesRes.error ||
    timeOffRes.error ||
    holidaysRes.error ||
    lineItemsRes.error
  if (firstError) throw firstError

  const advances = (advancesRes.data ?? []) as PaymentAdvance[]
  let repayments: AdvanceRepayment[] = []
  if (advances.length) {
    const { data, error } = await supabase
      .from('advance_repayments')
      .select('*')
      .in(
        'payment_advance_id',
        advances.map((a) => a.id),
      )
    if (error) throw error
    repayments = (data ?? []) as AdvanceRepayment[]
  }

  const blocks = (blocksRes.data ?? []) as ScheduleBlock[]
  const templates = (templatesRes.data ?? []) as NannyScheduleTemplate[]
  const timeEntries = (timeEntriesRes.data ?? []) as TimeEntry[]
  const trackingStart = platformPayrollStartDate(nanny.start_date, nanny.created_at)
  const scheduledShifts = payableShiftsInPeriod(
    blocks,
    templates,
    nanny.id,
    periodStart,
    periodEnd,
    trackingStart,
  )
  const actualShifts = timeEntries.length
    ? filterPayableShiftsByStartDate(timeEntriesToPayableShifts(timeEntries, blocks), trackingStart)
    : scheduledShifts
  const shifts = hoursBasis === 'actual' ? actualShifts : scheduledShifts

  const periodRepayments = repaymentsForPayPeriod(repayments, periodStartStr, periodEndStr)
  const summary = calculateExtendedPayroll(
    shifts,
    settings,
    periodStart,
    periodEnd,
    advances,
    (lineItemsRes.data ?? []) as PayrollLineItem[],
    (timeOffRes.data ?? []) as TimeOffRequest[],
    (holidaysRes.data ?? []) as Pick<HouseholdHoliday, 'holiday_key' | 'enabled'>[],
    recordedRepaymentCentsByAdvance(periodRepayments),
  )

  const { mode, overTablePercent } = getPayReportingFromSettings(settings)
  const payReportingLabel =
    mode === 'split'
      ? `${payReportingModeLabel(mode)} (${overTablePercent}% on the books)`
      : payReportingModeLabel(mode)

  const snapshot = buildPayrollSnapshot(summary, hoursBasis, {
    householdName: householdName ?? undefined,
    nannyName: nannyDisplayName(nanny),
    periodLabel: `${format(periodStart, 'MMM d')} – ${format(periodEnd, 'MMM d, yyyy')}`,
    taxWithholdingNotes: settings.tax_withholding_notes ?? null,
    employmentType: settings.employment_type ?? null,
    payReportingMode: mode,
    payReportingLabel,
  })

  const repaymentsPayload =
    settings.auto_record_advance_repayments && summary.advanceDeductions.length
      ? advanceRepaymentPayload(summary.advanceDeductions)
      : []

  const { data, error } = await supabase.rpc('auto_finalize_pay_period', {
    p_household_id: householdId,
    p_household_nanny_id: nanny.id,
    p_period_start: periodStartStr,
    p_period_end: periodEndStr,
    p_hours_basis: hoursBasis,
    p_snapshot: snapshot as unknown as Json,
    p_repayments: repaymentsPayload,
  })
  if (error) throw error
  return typeof data === 'number' ? data > 0 : !!data
}

/** Close due pay periods for nannies with auto-finalize enabled. Returns how many periods closed. */
export async function runDueAutoFinalizations(input: {
  householdId: string
  householdName?: string | null
  nannies: HouseholdNanny[]
  settings: EmploymentSetting[]
}): Promise<number> {
  const settingsByNanny = latestSettingsByNanny(input.settings)
  const { data: closes, error: closesError } = await supabase
    .from('pay_period_closes')
    .select('household_nanny_id, period_start')
    .eq('household_id', input.householdId)
  if (closesError) throw closesError

  const closedKeys = new Set(
    (closes ?? []).map((c) => `${c.household_nanny_id}:${c.period_start}`),
  )

  let closedCount = 0
  for (const nanny of input.nannies) {
    if (nanny.deactivated_at) continue
    const settings = settingsByNanny.get(nanny.id)
    if (!settings?.auto_finalize_pay_periods) continue

    const due = dueAutoFinalizePeriods(settings.pay_period, settings.auto_finalize_grace_days)
    const trackingStart = platformPayrollStartDate(nanny.start_date, nanny.created_at)
    for (const period of due) {
      if (trackingStart && format(period.end, 'yyyy-MM-dd') < trackingStart) continue
      const key = `${nanny.id}:${format(period.start, 'yyyy-MM-dd')}`
      if (closedKeys.has(key)) continue
      const didClose = await closeDuePeriod({
        householdId: input.householdId,
        householdName: input.householdName,
        nanny,
        settings,
        periodStart: period.start,
        periodEnd: period.end,
      })
      if (didClose) {
        closedKeys.add(key)
        closedCount++
      }
    }
  }

  return closedCount
}
