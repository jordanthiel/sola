import { supabase } from '@/lib/supabase'
import type { AdvanceDeductionLine } from '@/lib/advances'

export function advanceRepaymentPayload(lines: AdvanceDeductionLine[]) {
  return lines.map((line) => ({
    advance_id: line.advanceId,
    amount_cents: line.deductedCents,
  }))
}

export async function recordAdvanceRepaymentsForPeriod(
  householdId: string,
  periodStart: string,
  lines: AdvanceDeductionLine[],
): Promise<number> {
  if (!lines.length) return 0
  const { data, error } = await supabase.rpc('record_advance_repayments', {
    p_household_id: householdId,
    p_period_start: periodStart,
    p_repayments: advanceRepaymentPayload(lines),
  })
  if (error) throw error
  return typeof data === 'number' ? data : 0
}
