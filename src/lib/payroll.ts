import { addDays, differenceInCalendarDays, max, min, parseISO, startOfDay } from 'date-fns'
import type { EmploymentSetting, PaymentAdvance, TimeOffRequest } from '@/types/database'
export { getPayPeriodBounds } from '@/lib/pay-period'
import { calculateAdvanceDeductions, totalAdvanceBalance, type AdvanceDeductionLine } from '@/lib/advances'
import {
  getPayReportingFromSettings,
  splitPayByReporting,
  type PayReportingSplit,
} from '@/lib/pay-reporting'
import {
  type PayableShift,
  payableShiftMinutes,
  payableShiftOvernightMinutes,
  payableShiftOvernightPremiumCents,
} from '@/lib/schedule-hours'

export interface VacationPayItem {
  id: string
  startsOn: string
  endsOn: string
  days: number
  dailyRateCents: number
  payCents: number
}

export interface PayrollSummary {
  totalMinutes: number
  regularMinutes: number
  overtimeMinutes: number
  overnightMinutes: number
  regularPayCents: number
  overtimePayCents: number
  overnightPayCents: number
  vacationDays: number
  vacationPayCents: number
  vacationPayItems: VacationPayItem[]
  grossPayCents: number
  advanceBalanceCents: number
  advanceDeductionCents: number
  advanceDeductions: AdvanceDeductionLine[]
  netPayCents: number
  reporting: PayReportingSplit
}

export function calculatePayroll(
  shifts: PayableShift[],
  settings: EmploymentSetting,
  _periodStart: Date,
  _periodEnd: Date,
  advances: PaymentAdvance[],
  vacationRequests: TimeOffRequest[] = [],
): PayrollSummary {
  const totalMinutes = shifts.reduce((sum, s) => sum + payableShiftMinutes(s), 0)
  const overnightMinutes = shifts.reduce(
    (sum, s) => sum + payableShiftOvernightMinutes(s, settings),
    0,
  )

  const weeks =
    settings.pay_period === 'monthly'
      ? 4.33
      : settings.pay_period === 'biweekly'
        ? 2
        : 1

  const thresholdMinutes = Math.round(Number(settings.standard_hours_per_week) * 60 * weeks)
  const regularMinutes = Math.min(totalMinutes, thresholdMinutes)
  const overtimeMinutes = Math.max(0, totalMinutes - thresholdMinutes)

  const hourly = settings.hourly_rate_cents
  const otRate = hourly * Number(settings.overtime_multiplier)

  const regularPayCents = Math.round((regularMinutes / 60) * hourly)
  const overtimePayCents = Math.round((overtimeMinutes / 60) * otRate)
  const overnightPayCents = shifts.reduce(
    (sum, s) => sum + payableShiftOvernightPremiumCents(s, settings),
    0,
  )
  const vacationPayItems = vacationPayItemsInPeriod(vacationRequests, settings, _periodStart, _periodEnd)
  const vacationPayCents = vacationPayItems.reduce((sum, item) => sum + item.payCents, 0)
  const vacationDays = vacationPayItems.reduce((sum, item) => sum + item.days, 0)
  const grossPayCents = regularPayCents + overtimePayCents + overnightPayCents + vacationPayCents

  const advanceBalanceCents = totalAdvanceBalance(advances)
  const { totalDeductionCents, lines } = calculateAdvanceDeductions(
    advances,
    overtimePayCents,
    grossPayCents,
  )
  const netPayCents = Math.max(0, grossPayCents - totalDeductionCents)
  const reporting = splitPayByReporting(
    regularPayCents + overnightPayCents + vacationPayCents,
    overtimePayCents,
    0,
    getPayReportingFromSettings(settings),
  )

  return {
    totalMinutes,
    regularMinutes,
    overtimeMinutes,
    overnightMinutes,
    regularPayCents,
    overtimePayCents,
    overnightPayCents,
    vacationDays,
    vacationPayCents,
    vacationPayItems,
    grossPayCents,
    advanceBalanceCents,
    advanceDeductionCents: totalDeductionCents,
    advanceDeductions: lines,
    netPayCents,
    reporting,
  }
}

export function vacationPayItemsInPeriod(
  requests: TimeOffRequest[],
  settings: EmploymentSetting,
  periodStart: Date,
  periodEnd: Date,
): VacationPayItem[] {
  const periodStartDay = startOfDay(periodStart)
  const periodEndDay = startOfDay(periodEnd)
  const householdNannyId = settings.household_nanny_id

  return requests
    .filter(
      (req) =>
        req.type === 'vacation' &&
        req.status === 'approved' &&
        req.nanny_joins_vacation &&
        (!householdNannyId || req.household_nanny_id === householdNannyId),
    )
    .map((req) => {
      const reqStart = startOfDay(parseISO(req.starts_on))
      const reqEnd = startOfDay(parseISO(req.ends_on))
      const overlapStart = max([reqStart, periodStartDay])
      const overlapEnd = min([reqEnd, periodEndDay])
      if (overlapEnd < overlapStart) return null
      const dailyRateCents = req.vacation_daily_rate_cents ?? settings.vacation_daily_rate_cents ?? 0
      if (dailyRateCents <= 0) return null
      const days = differenceInCalendarDays(addDays(overlapEnd, 1), overlapStart)
      return {
        id: req.id,
        startsOn: req.starts_on,
        endsOn: req.ends_on,
        days,
        dailyRateCents,
        payCents: days * dailyRateCents,
      }
    })
    .filter((item): item is VacationPayItem => item !== null)
}

export function exportShiftsCsv(
  shifts: PayableShift[],
  profiles: Record<string, string>,
): string {
  const header =
    'Date,Start,Scheduled End,Actual End,Break (min),Worked (min),Nanny,Overnight,Overnight Rate'
  const rows = shifts.map((s) => {
    const worked = payableShiftMinutes(s)
    const date = s.starts_at.split('T')[0]
    return [
      date,
      s.starts_at,
      s.ends_at,
      s.actual_ends_at ?? '',
      s.break_minutes,
      worked,
      profiles[s.household_nanny_id] ?? s.household_nanny_id,
      s.is_overnight ? 'yes' : 'no',
      s.overnight_rate_cents ? (s.overnight_rate_cents / 100).toFixed(2) : '',
    ]
      .map((v) => `"${v}"`)
      .join(',')
  })
  return [header, ...rows].join('\n')
}
