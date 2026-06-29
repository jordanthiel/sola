import { differenceInMinutes, parseISO } from 'date-fns'
import type { EmploymentSetting, PaymentAdvance, ScheduleBlock, TimeEntry, TimeOffRequest } from '@/types/database'
import type { HoursBasis, PayrollLineItem, PayrollSnapshot } from '@/types/features'
import { getPayReportingFromSettings, splitPayByReporting, type PayReportingSplit } from '@/lib/pay-reporting'
import {
  calculatePayroll,
  getPayPeriodBounds,
  type PayrollSummary,
} from '@/lib/payroll'
import { payableShiftMinutes, payableShiftsInPeriod, type PayableShift } from '@/lib/schedule-hours'
export function timeEntriesToPayableShifts(
  entries: TimeEntry[],
  scheduleBlocks: ScheduleBlock[] = [],
): PayableShift[] {
  const blockById = new Map(scheduleBlocks.map((block) => [block.id, block]))
  return entries
    .filter((e) => e.clock_out)
    .map((e) => {
      const block = e.schedule_block_id ? blockById.get(e.schedule_block_id) : null
      return {
        id: e.id,
        household_nanny_id: e.household_nanny_id!,
        starts_at: e.clock_in,
        ends_at: e.clock_out!,
        actual_ends_at: null,
        break_minutes: e.break_minutes ?? 0,
        isFromTemplate: false,
        schedule_block_id: e.schedule_block_id,
        is_overnight: block?.is_overnight ?? false,
        overnight_rate_cents: block?.overnight_rate_cents ?? null,
        overnight_start_time: block?.overnight_start_time ?? null,
        overnight_end_time: block?.overnight_end_time ?? null,
      }
    })
}

export function entryWorkedMinutes(entry: TimeEntry): number {
  if (!entry.clock_out) return 0
  const total = differenceInMinutes(parseISO(entry.clock_out), parseISO(entry.clock_in))
  return Math.max(0, total - (entry.break_minutes ?? 0))
}

export function lineItemsTotalCents(items: PayrollLineItem[]): number {
  return items.reduce((sum, item) => {
    if (item.item_type === 'mileage' && item.miles && item.rate_per_mile_cents) {
      return sum + Math.round(Number(item.miles) * item.rate_per_mile_cents)
    }
    return sum + item.amount_cents
  }, 0)
}

export interface ExtendedPayrollSummary extends PayrollSummary {
  lineItemsTotalCents: number
  lineItems: PayrollLineItem[]
}

export function calculateExtendedPayroll(
  shifts: PayableShift[],
  settings: EmploymentSetting,
  periodStart: Date,
  periodEnd: Date,
  advances: PaymentAdvance[],
  lineItems: PayrollLineItem[],
  vacationRequests: TimeOffRequest[] = [],
): ExtendedPayrollSummary {
  const base = calculatePayroll(shifts, settings, periodStart, periodEnd, advances, vacationRequests)
  const lineTotal = lineItemsTotalCents(lineItems)
  const reporting = splitPayByReporting(
    base.regularPayCents + base.overnightPayCents + base.vacationPayCents,
    base.overtimePayCents,
    lineTotal,
    getPayReportingFromSettings(settings),
  )
  return {
    ...base,
    grossPayCents: base.grossPayCents + lineTotal,
    netPayCents: base.netPayCents + lineTotal,
    lineItemsTotalCents: lineTotal,
    lineItems,
    reporting,
  }
}

const EMPTY_REPORTING: PayReportingSplit = {
  totalOverCents: 0,
  totalUnderCents: 0,
  regularOverCents: 0,
  regularUnderCents: 0,
  overtimeOverCents: 0,
  overtimeUnderCents: 0,
  lineItemsOverCents: 0,
  lineItemsUnderCents: 0,
}

/** Rebuild payroll summary UI state from a closed-period snapshot. */
export function extendedSummaryFromSnapshot(snapshot: PayrollSnapshot): ExtendedPayrollSummary {
  const reporting = snapshot.reporting ?? EMPTY_REPORTING
  const grossPayCents = snapshot.grossPayCents
  const netPayCents = snapshot.netPayCents
  return {
    totalMinutes: snapshot.totalMinutes,
    regularMinutes: snapshot.regularMinutes,
    overtimeMinutes: snapshot.overtimeMinutes,
    overnightMinutes: snapshot.overnightMinutes ?? 0,
    regularPayCents: snapshot.regularPayCents,
    overtimePayCents: snapshot.overtimePayCents,
    overnightPayCents: snapshot.overnightPayCents ?? 0,
    vacationDays: snapshot.vacationDays ?? 0,
    vacationPayCents: snapshot.vacationPayCents ?? 0,
    vacationPayItems: [],
    grossPayCents,
    advanceBalanceCents: 0,
    advanceDeductionCents: snapshot.advanceDeductionCents,
    advanceDeductions: [],
    netPayCents,
    lineItemsTotalCents: snapshot.lineItemsTotalCents,
    lineItems: [],
    reporting,
  }
}

export function buildPayrollSnapshot(
  summary: ExtendedPayrollSummary,
  hoursBasis: HoursBasis,
  extras?: Partial<PayrollSnapshot>,
): PayrollSnapshot {
  return {
    totalMinutes: summary.totalMinutes,
    regularMinutes: summary.regularMinutes,
    overtimeMinutes: summary.overtimeMinutes,
    overnightMinutes: summary.overnightMinutes,
    regularPayCents: summary.regularPayCents,
    overtimePayCents: summary.overtimePayCents,
    overnightPayCents: summary.overnightPayCents,
    vacationDays: summary.vacationDays,
    vacationPayCents: summary.vacationPayCents,
    grossPayCents: summary.grossPayCents,
    lineItemsTotalCents: summary.lineItemsTotalCents,
    advanceDeductionCents: summary.advanceDeductionCents,
    netPayCents: summary.netPayCents,
    hoursBasis,
    ...extras,
    reporting: summary.reporting,
  }
}

export { getPayPeriodBounds, payableShiftsInPeriod, payableShiftMinutes }

export function exportPayrollCsvFromSnapshot(
  snapshot: PayrollSnapshot,
  nannyName: string,
  periodLabel: string,
): string {
  return exportPayrollCsv(extendedSummaryFromSnapshot(snapshot), [], nannyName, periodLabel)
}

export function exportPayrollCsv(
  summary: ExtendedPayrollSummary,
  lineItems: PayrollLineItem[],
  nannyName: string,
  periodLabel: string,
): string {
  const rows = [
    ['Pay Period', periodLabel],
    ['Nanny', nannyName],
    ['Total Hours', (summary.totalMinutes / 60).toFixed(2)],
    ['Regular Hours', (summary.regularMinutes / 60).toFixed(2)],
    ['Overtime Hours', (summary.overtimeMinutes / 60).toFixed(2)],
    ['Overnight Hours', (summary.overnightMinutes / 60).toFixed(2)],
    ['Regular Pay', (summary.regularPayCents / 100).toFixed(2)],
    ['Overtime Pay', (summary.overtimePayCents / 100).toFixed(2)],
    ['Overnight Premium', (summary.overnightPayCents / 100).toFixed(2)],
    ['Vacation Days', summary.vacationDays.toFixed(0)],
    ['Vacation Pay', (summary.vacationPayCents / 100).toFixed(2)],
    ['Line Items', (summary.lineItemsTotalCents / 100).toFixed(2)],
    ['Advance Deduction', (summary.advanceDeductionCents / 100).toFixed(2)],
    ['Net Pay', (summary.netPayCents / 100).toFixed(2)],
    ['On the books', (summary.reporting.totalOverCents / 100).toFixed(2)],
    ['Off the books', (summary.reporting.totalUnderCents / 100).toFixed(2)],
    [],
    ['Line Item Type', 'Description', 'Amount', 'Miles', 'Rate/Mile'],
    ...lineItems.map((li) => [
      li.item_type,
      li.description ?? '',
      (li.item_type === 'mileage' && li.miles && li.rate_per_mile_cents
        ? (Number(li.miles) * li.rate_per_mile_cents) / 100
        : li.amount_cents / 100
      ).toFixed(2),
      li.miles?.toString() ?? '',
      li.rate_per_mile_cents ? (li.rate_per_mile_cents / 100).toFixed(2) : '',
    ]),
  ]
  return rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
