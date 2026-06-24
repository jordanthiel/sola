import { useMemo, useState } from 'react'
import { addYears, startOfMonth, subYears } from 'date-fns'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { PickerTrigger } from '@/components/ui/picker-trigger'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  combineDatetimeLocal,
  dateToValue,
  formatDatetimeDisplay,
  minuteOptions,
  parseDateValue,
  parseDatetimeLocalValue,
  parseTimeValue,
  timeToValue,
} from '@/lib/datetime-picker'
import { cn } from '@/lib/utils'

export type DateTimePickerProps = {
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

export function DateTimePicker({
  value,
  onChange,
  id,
  disabled,
  className,
  placeholder = 'Pick date and time',
  minuteStep = 5,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const { date, time } = parseDatetimeLocalValue(value)
  const selected = date ? parseDateValue(date) : undefined
  const parsedTime = parseTimeValue(time)
  const { hour12, period } = parsedTime
    ? to12Hour(parsedTime.hours)
    : { hour12: 9, period: 'AM' as const }
  const minutes = parsedTime?.minutes ?? 0
  const minuteChoices = minuteOptions(minuteStep, parsedTime?.minutes)
  const label = formatDatetimeDisplay(value)

  const startMonth = useMemo(() => startOfMonth(subYears(new Date(), 1)), [])
  const endMonth = useMemo(() => startOfMonth(addYears(new Date(), 2)), [])

  const [month, setMonth] = useState<Date>(() => selected ?? new Date())

  function handleOpenChange(next: boolean) {
    if (next && selected) {
      setMonth(selected)
    }
    setOpen(next)
  }

  const setDate = (nextDate: string) => {
    onChange(combineDatetimeLocal(nextDate, time || '09:00'))
  }

  const setTime = (nextHour12: number, nextPeriod: 'AM' | 'PM', nextMinute: number) => {
    const nextTime = timeToValue(to24Hour(nextHour12, nextPeriod), nextMinute)
    onChange(combineDatetimeLocal(date || dateToValue(new Date()), nextTime))
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <PickerTrigger
          id={id}
          kind="datetime"
          disabled={disabled}
          empty={!label}
          className={cn(className)}
          aria-label={label || placeholder}
        >
          {label || placeholder}
        </PickerTrigger>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (!d) return
            setDate(dateToValue(d))
          }}
          captionLayout="dropdown"
          startMonth={startMonth}
          endMonth={endMonth}
          month={month}
          onMonthChange={setMonth}
          hideNavigation
        />
        <div className="border-t border-[var(--color-border)] p-3">
          <p className="mb-2 text-xs font-medium text-[var(--color-muted-foreground)]">Time</p>
          <div className="flex gap-2">
            <Select
              value={String(hour12)}
              onValueChange={(v) => setTime(Number(v), period, minutes)}
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
              onValueChange={(v) => setTime(hour12, period, Number(v))}
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
              onValueChange={(v) => setTime(hour12, v as 'AM' | 'PM', minutes)}
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
          <button
            type="button"
            className="mt-3 w-full rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-50"
            disabled={!date}
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
