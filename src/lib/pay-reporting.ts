import type { EmploymentSetting } from '@/types/database'

export type PayReportingMode = 'all_over' | 'all_under' | 'split' | 'regular_over_ot_under'

export interface PayReportingConfig {
  mode: PayReportingMode
  overTablePercent: number
}

export interface PayReportingSplit {
  regularOverCents: number
  regularUnderCents: number
  overtimeOverCents: number
  overtimeUnderCents: number
  lineItemsOverCents: number
  lineItemsUnderCents: number
  totalOverCents: number
  totalUnderCents: number
}

export function getPayReportingFromSettings(settings: EmploymentSetting): PayReportingConfig {
  const row = settings as EmploymentSetting & {
    pay_reporting_mode?: PayReportingMode
    over_table_percent?: number
  }
  return {
    mode: row.pay_reporting_mode ?? 'all_over',
    overTablePercent: Number(row.over_table_percent ?? 100),
  }
}

function allocateByPercent(totalCents: number, overPercent: number): { over: number; under: number } {
  if (totalCents <= 0) return { over: 0, under: 0 }
  const pct = Math.min(100, Math.max(0, overPercent))
  const over = Math.round((totalCents * pct) / 100)
  return { over, under: totalCents - over }
}

export function splitPayByReporting(
  regularPayCents: number,
  overtimePayCents: number,
  lineItemsTotalCents: number,
  config: PayReportingConfig,
): PayReportingSplit {
  const { mode, overTablePercent } = config

  if (mode === 'all_over') {
    const total = regularPayCents + overtimePayCents + lineItemsTotalCents
    return {
      regularOverCents: regularPayCents,
      regularUnderCents: 0,
      overtimeOverCents: overtimePayCents,
      overtimeUnderCents: 0,
      lineItemsOverCents: lineItemsTotalCents,
      lineItemsUnderCents: 0,
      totalOverCents: total,
      totalUnderCents: 0,
    }
  }

  if (mode === 'all_under') {
    const total = regularPayCents + overtimePayCents + lineItemsTotalCents
    return {
      regularOverCents: 0,
      regularUnderCents: regularPayCents,
      overtimeOverCents: 0,
      overtimeUnderCents: overtimePayCents,
      lineItemsOverCents: 0,
      lineItemsUnderCents: lineItemsTotalCents,
      totalOverCents: 0,
      totalUnderCents: total,
    }
  }

  if (mode === 'regular_over_ot_under') {
    const totalOver = regularPayCents + lineItemsTotalCents
    const totalUnder = overtimePayCents
    return {
      regularOverCents: regularPayCents,
      regularUnderCents: 0,
      overtimeOverCents: 0,
      overtimeUnderCents: overtimePayCents,
      lineItemsOverCents: lineItemsTotalCents,
      lineItemsUnderCents: 0,
      totalOverCents: totalOver,
      totalUnderCents: totalUnder,
    }
  }

  const reg = allocateByPercent(regularPayCents, overTablePercent)
  const ot = allocateByPercent(overtimePayCents, overTablePercent)
  const li = allocateByPercent(lineItemsTotalCents, overTablePercent)
  return {
    regularOverCents: reg.over,
    regularUnderCents: reg.under,
    overtimeOverCents: ot.over,
    overtimeUnderCents: ot.under,
    lineItemsOverCents: li.over,
    lineItemsUnderCents: li.under,
    totalOverCents: reg.over + ot.over + li.over,
    totalUnderCents: reg.under + ot.under + li.under,
  }
}

export function payReportingModeLabel(mode: PayReportingMode): string {
  switch (mode) {
    case 'all_over':
      return 'All pay on the books'
    case 'all_under':
      return 'All pay off the books'
    case 'split':
      return 'Split by percentage'
    case 'regular_over_ot_under':
      return 'Regular on the books, overtime off the books'
  }
}

export function payReportingModeShortLabel(mode: PayReportingMode): string {
  switch (mode) {
    case 'all_over':
      return 'All on the books'
    case 'all_under':
      return 'All off the books'
    case 'split':
      return 'Percentage split'
    case 'regular_over_ot_under':
      return 'Regular on books / OT off books'
  }
}
