import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useEmploymentSettings } from '@/hooks/useHouseholdData'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { selectCn } from '@/lib/utils'
import { payReportingModeLabel } from '@/lib/pay-reporting'
import type { PayPeriodType, PayReportingMode } from '@/types/database'

export function NannyEmploymentSettings({ householdNannyId }: { householdNannyId: string }) {
  const { activeHousehold } = useHousehold()
  const qc = useQueryClient()
  const { data: employment } = useEmploymentSettings(householdNannyId)

  const [hourlyRate, setHourlyRate] = useState('')
  const [otMultiplier, setOtMultiplier] = useState('1.5')
  const [standardHours, setStandardHours] = useState('40')
  const [payPeriod, setPayPeriod] = useState<PayPeriodType>('biweekly')
  const [employmentType, setEmploymentType] = useState('household')
  const [taxNotes, setTaxNotes] = useState('')
  const [payReportingMode, setPayReportingMode] = useState<PayReportingMode>('all_over')
  const [overTablePercent, setOverTablePercent] = useState('100')
  const [autoRecordAdvanceRepayments, setAutoRecordAdvanceRepayments] = useState(false)

  const current = employment?.[0]

  useEffect(() => {
    if (!current) return
    setHourlyRate((current.hourly_rate_cents / 100).toFixed(2))
    setOtMultiplier(String(current.overtime_multiplier))
    setStandardHours(String(current.standard_hours_per_week))
    setPayPeriod(current.pay_period)
    setEmploymentType(current.employment_type ?? 'household')
    setTaxNotes(current.tax_withholding_notes ?? '')
    setPayReportingMode(current.pay_reporting_mode ?? 'all_over')
    setOverTablePercent(String(current.over_table_percent ?? 100))
    setAutoRecordAdvanceRepayments(current.auto_record_advance_repayments ?? false)
  }, [
    current?.id,
    current?.hourly_rate_cents,
    current?.overtime_multiplier,
    current?.standard_hours_per_week,
    current?.pay_period,
    current?.employment_type,
    current?.tax_withholding_notes,
    current?.pay_reporting_mode,
    current?.over_table_percent,
    current?.auto_record_advance_repayments,
    householdNannyId,
  ])

  const saveEmployment = useMutation({
    mutationFn: async () => {
      const cents = Math.round(parseFloat(hourlyRate) * 100)
      const pct = Math.min(100, Math.max(0, parseFloat(overTablePercent) || 0))
      const effectiveFrom = new Date().toISOString().split('T')[0]
      const payload = {
        hourly_rate_cents: cents,
        overtime_multiplier: parseFloat(otMultiplier),
        standard_hours_per_week: parseFloat(standardHours),
        pay_period: payPeriod,
        employment_type: employmentType,
        tax_withholding_notes: taxNotes || null,
        pay_reporting_mode: payReportingMode,
        over_table_percent:
          payReportingMode === 'split'
            ? pct
            : payReportingMode === 'all_under'
              ? 0
              : 100,
        auto_record_advance_repayments: autoRecordAdvanceRepayments,
      }

      const existingToday = employment?.find((e) => e.effective_from === effectiveFrom)
      if (existingToday) {
        const { error } = await supabase
          .from('employment_settings')
          .update(payload)
          .eq('id', existingToday.id)
        if (error) throw error
        return
      }

      const { error } = await supabase.from('employment_settings').insert({
        household_id: activeHousehold!.id,
        household_nanny_id: householdNannyId,
        effective_from: effectiveFrom,
        ...payload,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['employment'] })
    },
  })

  const reportingSummary = current
    ? current.pay_reporting_mode === 'split'
      ? `${payReportingModeLabel(current.pay_reporting_mode)} (${current.over_table_percent}% on the books)`
      : payReportingModeLabel(current.pay_reporting_mode)
    : null

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="hourly-rate">Hourly rate ($)</Label>
          <Input
            id="hourly-rate"
            type="number"
            step="0.01"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ot-multiplier">OT multiplier</Label>
          <Input
            id="ot-multiplier"
            value={otMultiplier}
            onChange={(e) => setOtMultiplier(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="standard-hours">Standard hrs/week</Label>
          <Input
            id="standard-hours"
            value={standardHours}
            onChange={(e) => setStandardHours(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pay-period">Pay period</Label>
          <select
            id="pay-period"
            className={selectCn}
            value={payPeriod}
            onChange={(e) => setPayPeriod(e.target.value as PayPeriodType)}
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="employment-type">Employment type</Label>
          <select
            id="employment-type"
            className={selectCn}
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)}
          >
            <option value="household">Household employee (W-2)</option>
            <option value="contractor">Independent contractor (1099)</option>
            <option value="casual">Casual / informal</option>
          </select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="tax-notes">Tax / withholding notes</Label>
          <Input
            id="tax-notes"
            value={taxNotes}
            onChange={(e) => setTaxNotes(e.target.value)}
            placeholder="e.g. Federal withholding, state notes, accountant contact"
          />
        </div>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <div>
          <h4 className="font-medium">How pay is reported</h4>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Choose whether wages are paid on the books (reported for taxes) or off the books (cash /
            informal). Earnings preview will split amounts accordingly.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pay-reporting-mode">Reporting arrangement</Label>
          <select
            id="pay-reporting-mode"
            className={selectCn}
            value={payReportingMode}
            onChange={(e) => setPayReportingMode(e.target.value as PayReportingMode)}
          >
            <option value="all_over">All pay on the books</option>
            <option value="all_under">All pay off the books</option>
            <option value="split">Split — percentage on vs off the books</option>
            <option value="regular_over_ot_under">
              Regular wages on the books, overtime off the books
            </option>
          </select>
        </div>
        {payReportingMode === 'split' && (
          <div className="space-y-2">
            <Label htmlFor="over-table-percent">Percent on the books (%)</Label>
            <Input
              id="over-table-percent"
              type="number"
              min={0}
              max={100}
              step={1}
              value={overTablePercent}
              onChange={(e) => setOverTablePercent(e.target.value)}
            />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Applies to regular pay, overtime, and bonuses/mileage for this period. The remainder is
              off the books.
            </p>
          </div>
        )}
        {payReportingMode === 'regular_over_ot_under' && (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Regular hours are counted on the books; overtime and the OT rate portion are off the
            books. Bonuses and mileage follow regular pay (on the books).
          </p>
        )}
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={autoRecordAdvanceRepayments}
            onChange={(e) => setAutoRecordAdvanceRepayments(e.target.checked)}
          />
          <span>
            <span className="font-medium">Auto-record advance repayments</span>
            <p className="mt-1 text-sm font-normal text-[var(--color-muted-foreground)]">
              When you finalize a pay period on Earnings, suggested repayments (from overtime or
              per-paycheck rules) are saved to the advance ledger automatically.
            </p>
          </span>
        </label>
      </div>

      {current && (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Current: ${(current.hourly_rate_cents / 100).toFixed(2)}/hr ·{' '}
          {current.standard_hours_per_week}h standard · {current.pay_period} pay ·{' '}
          {current.overtime_multiplier}× OT
          {reportingSummary && <> · {reportingSummary}</>}
        </p>
      )}
      <Button
        onClick={() => saveEmployment.mutate()}
        disabled={!hourlyRate || saveEmployment.isPending}
      >
        {saveEmployment.isPending ? 'Saving...' : 'Save pay settings'}
      </Button>
    </div>
  )
}
