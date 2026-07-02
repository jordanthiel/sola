import { addDays, format, isBefore, parseISO, startOfDay } from 'date-fns'
import type { AdvanceRepaymentMode, EmploymentSetting, PayPeriodType, ScheduleBlock } from '@/types/database'
import type { PaymentAdvance } from '@/types/database'
import type { NannyScheduleTemplate } from '@/types/schedule-template'
import { calculateAdvanceDeductions, estimateAdvancePayoff, type AdvancePayoffEstimate } from '@/lib/advances'
import { getPayPeriodBounds } from '@/lib/payroll'
import { type PayableShift, payableShiftMinutes, payableShiftsInPeriod } from '@/lib/schedule-hours'

export interface PayPeriodOption {
  periodStart: Date
  periodEnd: Date
  label: string
  suggestedCents: number
}

export function completedPayPeriods(
  payPeriod: PayPeriodType,
  issuedOn: string,
  through: Date = new Date(),
): { start: Date; end: Date }[] {
  const endBound = startOfDay(through)
  let anchor = parseISO(issuedOn)
  const out: { start: Date; end: Date }[] = []
  let guard = 0

  while (guard < 120) {
    const { start, end } = getPayPeriodBounds(payPeriod, anchor)
    if (isBefore(endBound, start)) break
    if (end < startOfDay(anchor)) {
      anchor = addDays(end, 1)
      guard++
      continue
    }
    if (end < endBound) {
      out.push({ start, end })
    }
    anchor = addDays(end, 1)
    guard++
  }

  return out
}

export function suggestPerPaycheckBackfill(
  issuedOn: string,
  perPaycheckCents: number,
  totalCents: number,
  payPeriod: PayPeriodType,
): { suggestedCents: number; periodCount: number } {
  const periods = completedPayPeriods(payPeriod, issuedOn)
  const suggestedCents = Math.min(totalCents, periods.length * perPaycheckCents)
  return { suggestedCents, periodCount: periods.length }
}

export interface ScheduleBackfillInput {
  blocks: ScheduleBlock[]
  templates: NannyScheduleTemplate[]
  householdNannyId: string
  payStartDate?: string | null
}

function shiftsForPeriod(
  schedule: ScheduleBackfillInput,
  periodStart: Date,
  periodEnd: Date,
): PayableShift[] {
  return payableShiftsInPeriod(
    schedule.blocks,
    schedule.templates,
    schedule.householdNannyId,
    periodStart,
    periodEnd,
    schedule.payStartDate,
  )
}

export function hasUsualSchedule(schedule: ScheduleBackfillInput): boolean {
  return (
    schedule.templates.some(
      (t) => t.household_nanny_id === schedule.householdNannyId && t.enabled,
    ) || schedule.blocks.some((b) => b.household_nanny_id === schedule.householdNannyId)
  )
}

function payrollAmountsForPeriod(
  shifts: PayableShift[],
  settings: EmploymentSetting,
  _periodStart: Date,
  _periodEnd: Date,
): { grossPayCents: number; overtimePayCents: number; overtimeMinutes: number } {
  const totalMinutes = shifts.reduce((sum, s) => sum + payableShiftMinutes(s), 0)
  const weeks =
    settings.pay_period === 'monthly' ? 4.33 : settings.pay_period === 'biweekly' ? 2 : 1
  const thresholdMinutes = Math.round(Number(settings.standard_hours_per_week) * 60 * weeks)
  const regularMinutes = Math.min(totalMinutes, thresholdMinutes)
  const overtimeMinutes = Math.max(0, totalMinutes - thresholdMinutes)
  const hourly = settings.hourly_rate_cents
  const otRate = hourly * Number(settings.overtime_multiplier)
  const regularPayCents = Math.round((regularMinutes / 60) * hourly)
  const overtimePayCents = Math.round((overtimeMinutes / 60) * otRate)
  return { grossPayCents: regularPayCents + overtimePayCents, overtimePayCents, overtimeMinutes }
}

export function suggestOvertimeBackfill(
  issuedOn: string,
  totalCents: number,
  settings: EmploymentSetting,
  schedule: ScheduleBackfillInput,
): { suggestedCents: number; periodCount: number; totalOvertimeMinutes: number } {
  const periods = completedPayPeriods(settings.pay_period, issuedOn)
  let balance = totalCents
  let repaid = 0
  let totalOvertimeMinutes = 0

  for (const { start, end } of periods) {
    if (balance <= 0) break
    const periodShifts = shiftsForPeriod(schedule, start, end)
    const { grossPayCents, overtimePayCents, overtimeMinutes } = payrollAmountsForPeriod(
      periodShifts,
      settings,
      start,
      end,
    )
    totalOvertimeMinutes += overtimeMinutes
    const fakeAdvance: PaymentAdvance = {
      id: 'preview',
      household_id: '',
      household_nanny_id: schedule.householdNannyId,
      nanny_user_id: null,
      amount_cents: balance,
      balance_cents: balance,
      issued_on: issuedOn,
      reason: null,
      repayment_mode: 'overtime_only',
      repayment_per_paycheck_cents: null,
      status: 'open',
      applied_pay_period_start: null,
      created_at: '',
      updated_at: '',
    }
    const { totalDeductionCents } = calculateAdvanceDeductions(
      [fakeAdvance],
      overtimePayCents,
      grossPayCents,
    )
    repaid += totalDeductionCents
    balance -= totalDeductionCents
  }

  return {
    suggestedCents: Math.min(totalCents, repaid),
    periodCount: periods.length,
    totalOvertimeMinutes,
  }
}

export function buildPeriodBackfillOptions(
  issuedOn: string,
  amountCents: number,
  repaymentMode: AdvanceRepaymentMode,
  perPaycheckCents: number | null,
  settings: EmploymentSetting,
  schedule: ScheduleBackfillInput,
): PayPeriodOption[] {
  const periods = completedPayPeriods(settings.pay_period, issuedOn)
  let balance = amountCents
  const options: PayPeriodOption[] = []

  for (const { start, end } of periods) {
    if (balance <= 0) {
      options.push({
        periodStart: start,
        periodEnd: end,
        label: `${formatRange(start, end)}`,
        suggestedCents: 0,
      })
      continue
    }

    let suggested = 0
    if (repaymentMode === 'per_paycheck' && perPaycheckCents) {
      suggested = Math.min(balance, perPaycheckCents)
    } else if (repaymentMode === 'overtime_only') {
      const periodShifts = shiftsForPeriod(schedule, start, end)
      const { grossPayCents, overtimePayCents } = payrollAmountsForPeriod(
        periodShifts,
        settings,
        start,
        end,
      )
      const fakeAdvance: PaymentAdvance = {
        id: 'preview',
        household_id: '',
        household_nanny_id: schedule.householdNannyId,
        nanny_user_id: null,
        amount_cents: balance,
        balance_cents: balance,
        issued_on: issuedOn,
        reason: null,
        repayment_mode: 'overtime_only',
        repayment_per_paycheck_cents: null,
        status: 'open',
        applied_pay_period_start: null,
        created_at: '',
        updated_at: '',
      }
      suggested = calculateAdvanceDeductions([fakeAdvance], overtimePayCents, grossPayCents)
        .totalDeductionCents
    }

    options.push({
      periodStart: start,
      periodEnd: end,
      label: formatRange(start, end),
      suggestedCents: suggested,
    })
    balance -= suggested
  }

  return options.filter((o) => o.suggestedCents > 0)
}

function formatRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`
}

export function isIssuedInPast(issuedOn: string): boolean {
  return parseISO(issuedOn) < startOfDay(new Date())
}

/** Pay periods from anchor forward (first period contains anchor). */
export function upcomingPayPeriods(
  payPeriod: PayPeriodType,
  anchor: Date = new Date(),
  maxPeriods = 120,
): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = []
  let periodAnchor = anchor
  for (let i = 0; i < maxPeriods; i++) {
    const { start, end } = getPayPeriodBounds(payPeriod, periodAnchor)
    out.push({ start, end })
    periodAnchor = addDays(end, 1)
  }
  return out
}

function fakeOvertimeAdvance(balance: number, schedule: ScheduleBackfillInput, issuedOn: string): PaymentAdvance {
  return {
    id: 'preview',
    household_id: '',
    household_nanny_id: schedule.householdNannyId,
    nanny_user_id: null,
    amount_cents: balance,
    balance_cents: balance,
    issued_on: issuedOn,
    reason: null,
    repayment_mode: 'overtime_only',
    repayment_per_paycheck_cents: null,
    status: 'open',
    applied_pay_period_start: null,
    created_at: '',
    updated_at: '',
  }
}

/** Project payoff using the default weekly schedule (templates only, no one-off blocks). */
export function estimateOvertimePayoffFromSchedule(
  balanceCents: number,
  settings: EmploymentSetting,
  schedule: ScheduleBackfillInput,
  anchor: Date = new Date(),
): {
  estimatedPayoffDate: Date
  paychecksRemaining: number
  typicalOvertimeMinutesPerPeriod: number
  typicalRepaymentPerPeriodCents: number
} | null {
  if (balanceCents <= 0 || !hasUsualSchedule(schedule)) return null

  const templateSchedule: ScheduleBackfillInput = { ...schedule, blocks: [] }
  let balance = balanceCents
  let periods = 0
  let firstPeriodOtMinutes = 0
  let firstPeriodRepayment = 0

  for (const { start, end } of upcomingPayPeriods(settings.pay_period, anchor)) {
    periods++
    const periodShifts = shiftsForPeriod(templateSchedule, start, end)
    const { grossPayCents, overtimePayCents, overtimeMinutes } = payrollAmountsForPeriod(
      periodShifts,
      settings,
      start,
      end,
    )
    const { totalDeductionCents } = calculateAdvanceDeductions(
      [fakeOvertimeAdvance(balance, schedule, format(start, 'yyyy-MM-dd'))],
      overtimePayCents,
      grossPayCents,
    )

    if (periods === 1) {
      firstPeriodOtMinutes = overtimeMinutes
      firstPeriodRepayment = totalDeductionCents
      if (totalDeductionCents <= 0) return null
    }

    balance -= totalDeductionCents
    if (balance <= 0) {
      return {
        estimatedPayoffDate: end,
        paychecksRemaining: periods,
        typicalOvertimeMinutesPerPeriod: firstPeriodOtMinutes,
        typicalRepaymentPerPeriodCents: firstPeriodRepayment,
      }
    }
  }

  return null
}

export function buildAdvancePayoffEstimate(
  advance: PaymentAdvance,
  settings: EmploymentSetting,
  schedule?: ScheduleBackfillInput,
  anchor: Date = new Date(),
): AdvancePayoffEstimate {
  const base = estimateAdvancePayoff(advance, settings.pay_period, anchor)

  if (advance.repayment_mode !== 'overtime_only' || advance.balance_cents <= 0) {
    return base
  }

  if (!schedule) {
    return base
  }

  const projection = estimateOvertimePayoffFromSchedule(
    advance.balance_cents,
    settings,
    schedule,
    anchor,
  )

  if (!projection) {
    return {
      ...base,
      estimatedPayoffLabel: !hasUsualSchedule(schedule)
        ? 'Set your usual weekly schedule to estimate payoff'
        : 'Depends on overtime hours each pay period',
    }
  }

  return {
    ...base,
    estimatedPayoffDate: projection.estimatedPayoffDate,
    estimatedPayoffLabel: `${projection.paychecksRemaining} paycheck${projection.paychecksRemaining === 1 ? '' : 's'} at usual overtime`,
    paychecksRemaining: projection.paychecksRemaining,
    estimatedPayoffApproximate: true,
  }
}
