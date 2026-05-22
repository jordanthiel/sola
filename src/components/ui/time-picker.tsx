import { useMemo } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PickerTrigger } from '@/components/ui/picker-trigger'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  formatTimeDisplay,
  minuteOptions,
  parseTimeValue,
  timeToValue,
} from '@/lib/datetime-picker'
import { cn } from '@/lib/utils'

export type TimePickerProps = {
  value: string
  onChange: (value: string) => void
  id?: string
  disabled?: boolean
  className?: string
  placeholder?: string
  minuteStep?: number
}

function to12Hour(hours24: number): { hour12: number; period: 'AM' | 'PM' } {
  const period = hours24 >= 12 ? 'PM' : 'AM'
  const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  return { hour12, period }
}

function to24Hour(hour12: number, period: 'AM' | 'PM'): number {
  if (period === 'AM') return hour12 === 12 ? 0 : hour12
  return hour12 === 12 ? 12 : hour12 + 12
}

export function TimePicker({
  value,
  onChange,
  id,
  disabled,
  className,
  placeholder = 'Pick a time',
  minuteStep = 5,
}: TimePickerProps) {
  const parsed = parseTimeValue(value)
  const { hour12, period } = parsed
    ? to12Hour(parsed.hours)
    : { hour12: 9, period: 'AM' as const }
  const minutes = parsed?.minutes ?? 0

  const minuteChoices = useMemo(
    () => minuteOptions(minuteStep, parsed?.minutes),
    [minuteStep, parsed?.minutes],
  )
  const label = formatTimeDisplay(value)

  const update = (nextHour12: number, nextPeriod: 'AM' | 'PM', nextMinute: number) => {
    onChange(timeToValue(to24Hour(nextHour12, nextPeriod), nextMinute))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <PickerTrigger
          id={id}
          kind="time"
          disabled={disabled}
          empty={!label}
          className={cn(className)}
          aria-label={label || placeholder}
        >
          {label || placeholder}
        </PickerTrigger>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <p className="mb-2 text-xs font-medium text-[var(--color-muted-foreground)]">Time</p>
        <div className="flex gap-2">
          <Select
            value={String(hour12)}
            onValueChange={(v) => update(Number(v), period, minutes)}
            disabled={disabled}
          >
            <SelectTrigger className="w-[4.5rem]" aria-label="Hour">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(minutes)}
            onValueChange={(v) => update(hour12, period, Number(v))}
            disabled={disabled}
          >
            <SelectTrigger className="w-[4.5rem]" aria-label="Minute">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {minuteChoices.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {String(m).padStart(2, '0')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={period}
            onValueChange={(v) => update(hour12, v as 'AM' | 'PM', minutes)}
            disabled={disabled}
          >
            <SelectTrigger className="w-[4.5rem]" aria-label="AM or PM">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AM">AM</SelectItem>
              <SelectItem value="PM">PM</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  )
}
