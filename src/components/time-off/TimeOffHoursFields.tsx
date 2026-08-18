import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  calculatedTimeOffHours,
  formatPtoHours,
  parseHoursPerDay,
  workingDaysInRange,
  type HolidayOverride,
} from '@/lib/pto'

export function TimeOffHoursFields({
  startsOn,
  endsOn,
  hoursPerDay,
  onHoursPerDayChange,
  holidayOverrides = [],
  id,
  hoursLabel = 'Hours per day',
}: {
  startsOn: string
  endsOn: string
  hoursPerDay: string
  onHoursPerDayChange: (value: string) => void
  holidayOverrides?: HolidayOverride[]
  id?: string
  hoursLabel?: string
}) {
  const parsed = parseHoursPerDay(hoursPerDay)
  const days = workingDaysInRange(startsOn, endsOn, holidayOverrides)
  const total = parsed == null ? 0 : calculatedTimeOffHours(startsOn, endsOn, parsed, holidayOverrides)
  const hasRange = Boolean(startsOn && endsOn)

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{hoursLabel}</Label>
      <Input
        id={id}
        type="number"
        min="0.5"
        step="0.5"
        value={hoursPerDay}
        onChange={(e) => onHoursPerDayChange(e.target.value)}
      />
      <p className="text-sm text-[var(--color-muted-foreground)]">
        {hasRange && days === 0
          ? 'No working days in this range. Weekends and paid holidays are not counted.'
          : days > 0 && parsed != null
            ? `${formatPtoHours(total)} total (${days} working day${days === 1 ? '' : 's'} × ${formatPtoHours(parsed)}/day)`
            : 'Total hours use weekdays only. Weekends and paid holidays are skipped.'}
      </p>
    </div>
  )
}
