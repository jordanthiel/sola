import { Info } from 'lucide-react'
import type { EmploymentSetting } from '@/types/database'
import type { HoursBasis } from '@/types/features'
import type { HolidayPayItem } from '@/lib/payroll'
import {
  buildDailyHoursBreakdown,
  payPeriodWeeksLabel,
  periodThresholdMinutes,
  type DailyHoursRow,
} from '@/lib/payroll-hours-breakdown'
import { formatHours } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import type { PayableShift } from '@/lib/schedule-hours'

export type PayrollHoursBreakdownVariant = 'total' | 'regular' | 'overtime'

const titles: Record<PayrollHoursBreakdownVariant, string> = {
  total: 'Total hours',
  regular: 'Regular hours',
  overtime: 'Overtime hours',
}

export function PayrollHoursBreakdownDialog({
  variant,
  shifts,
  settings,
  totalMinutes,
  regularMinutes,
  overtimeMinutes,
  holidayItems = [],
  hoursBasis,
  periodLabel,
}: {
  variant: PayrollHoursBreakdownVariant
  shifts: PayableShift[]
  settings: EmploymentSetting
  totalMinutes: number
  regularMinutes: number
  overtimeMinutes: number
  holidayItems?: HolidayPayItem[]
  hoursBasis: HoursBasis
  periodLabel: string
}) {
  const holidayDates = new Set(holidayItems.map((item) => item.date))
  const countedShifts = shifts.filter((shift) => {
    const date = shift.starts_at.split('T')[0]
    return !holidayDates.has(date) || shift.holiday_worked
  })
  const days = buildDailyHoursBreakdown(countedShifts)
  const thresholdMinutes = periodThresholdMinutes(settings)
  const holidayMinutes = holidayItems.reduce((sum, item) => sum + item.minutes, 0)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          aria-label={`${titles[variant]} breakdown`}
        >
          <Info className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titles[variant]}</DialogTitle>
          <DialogDescription>
            {periodLabel} · {hoursBasis === 'actual' ? 'Actual time entries' : 'Scheduled shifts & templates'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {days.length === 0 && holidayItems.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              No payable shifts in this pay period for the selected hours basis.
            </p>
          ) : days.length > 0 ? (
            <ul className="divide-y rounded-lg border">
              {days.map((day) => (
                <DayBreakdown key={day.date} day={day} />
              ))}
            </ul>
          ) : null}

          {holidayItems.length > 0 && (
            <div className="rounded-lg border bg-[var(--color-muted)]/30 p-3">
              <p className="text-sm font-medium">Paid holidays</p>
              <ul className="mt-2 space-y-1.5">
                {holidayItems.map((holiday) => (
                  <li
                    key={holiday.id}
                    className="flex items-center justify-between gap-2 text-sm text-[var(--color-muted-foreground)]"
                  >
                    <span>{holiday.name}</span>
                    <span className="shrink-0 tabular-nums">{formatHours(holiday.minutes)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg bg-[var(--color-muted)]/40 px-3 py-2 text-sm">
            <div className="flex justify-between font-medium">
              <span>Period total</span>
              <span>{formatHours(totalMinutes)}</span>
            </div>
            {variant === 'regular' && (
              <p className="mt-2 text-[var(--color-muted-foreground)]">
                Regular time is capped at {formatHours(thresholdMinutes)} for this period (
                {settings.standard_hours_per_week} hrs/week × {payPeriodWeeksLabel(settings)}). Of{' '}
                {formatHours(totalMinutes)} payable, {formatHours(regularMinutes)} count as regular
                {overtimeMinutes > 0 && ` and ${formatHours(overtimeMinutes)} as overtime`}.
              </p>
            )}
            {variant === 'overtime' && (
              <p className="mt-2 text-[var(--color-muted-foreground)]">
                {overtimeMinutes > 0 ? (
                  <>
                    Overtime is {formatHours(overtimeMinutes)} — hours beyond the{' '}
                    {formatHours(thresholdMinutes)} regular cap ({settings.standard_hours_per_week}{' '}
                    hrs/week × {payPeriodWeeksLabel(settings)}).
                  </>
                ) : (
                  <>
                    No overtime this period. Total hours ({formatHours(totalMinutes)}) are at or below
                    the {formatHours(thresholdMinutes)} regular cap.
                  </>
                )}
              </p>
            )}
            {variant === 'total' && days.length > 0 && (
              <p className="mt-2 text-[var(--color-muted-foreground)]">
                Sum of {days.length} day{days.length === 1 ? '' : 's'} with recorded work
                {holidayMinutes > 0 && ` plus ${formatHours(holidayMinutes)} of paid holidays`}.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DayBreakdown({ day }: { day: DailyHoursRow }) {
  return (
    <li className="px-3 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{day.dayLabel}</span>
        <span className="tabular-nums text-sm font-semibold">{formatHours(day.minutes)}</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {day.shifts.map((shift) => (
          <li
            key={shift.id}
            className="flex items-center justify-between gap-2 text-sm text-[var(--color-muted-foreground)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{shift.timeRange}</span>
              {shift.isFromTemplate && (
                <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
                  Template
                </Badge>
              )}
              {shift.isOvernight && (
                <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
                  Overnight
                </Badge>
              )}
            </span>
            <span className="shrink-0 tabular-nums">{formatHours(shift.minutes)}</span>
          </li>
        ))}
      </ul>
    </li>
  )
}
