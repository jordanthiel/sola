import type { PtoBalance } from '@/types/database'

export function ptoRemaining(balance: PtoBalance, kind: 'sick' | 'pto'): number {
  const accrued = kind === 'sick' ? balance.sick_hours_accrued : balance.pto_hours_accrued
  const used = kind === 'sick' ? balance.sick_hours_used : balance.pto_hours_used
  return accrued - used
}

export function formatPtoHours(hours: number): string {
  return `${hours.toFixed(1)}h`
}
