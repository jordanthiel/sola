import { useMemo, useState } from 'react'
import { startOfMonth, subYears } from 'date-fns'
import type { DayPickerProps } from 'react-day-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { PickerTrigger } from '@/components/ui/picker-trigger'
import { dateToValue, formatDateDisplay, parseDateValue } from '@/lib/datetime-picker'
import { cn } from '@/lib/utils'

export type DatePickerProps = {
  value: string
  onChange: (value: string) => void
  id?: string
  disabled?: boolean
  className?: string
  placeholder?: string
  min?: string
  max?: string
  /** Month/year dropdowns for quick navigation. Default: dropdown. */
  captionLayout?: DayPickerProps['captionLayout']
  reverseYears?: boolean
  /** Years before max when no min is set. Default: 100. */
  yearRange?: number
}

function usesDropdownCaption(layout: DayPickerProps['captionLayout'] | undefined): boolean {
  return layout === 'dropdown' || layout === 'dropdown-months' || layout === 'dropdown-years'
}

function monthForPicker(value: string, min?: string, max?: string): Date {
  const selected = value ? parseDateValue(value) : undefined
  const minDate = min ? parseDateValue(min) : undefined
  const maxDate = max ? parseDateValue(max) : undefined
  return selected ?? maxDate ?? minDate ?? new Date()
}

export function DatePicker({
  value,
  onChange,
  id,
  disabled,
  className,
  placeholder = 'Pick a date',
  min,
  max,
  captionLayout = 'dropdown',
  reverseYears,
  yearRange = 100,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? parseDateValue(value) : undefined
  const minDate = min ? parseDateValue(min) : undefined
  const maxDate = max ? parseDateValue(max) : undefined
  const label = formatDateDisplay(value)
  const dropdownCaption = usesDropdownCaption(captionLayout)

  const endMonth = useMemo(() => {
    if (maxDate) return startOfMonth(maxDate)
    return startOfMonth(new Date())
  }, [max])

  const startMonth = useMemo(() => {
    if (minDate) return startOfMonth(minDate)
    return subYears(endMonth, yearRange)
  }, [min, yearRange, endMonth])

  const [month, setMonth] = useState<Date>(() => monthForPicker(value, min, max))

  function handleOpenChange(next: boolean) {
    if (next) {
      setMonth(monthForPicker(value, min, max))
    }
    setOpen(next)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <PickerTrigger
          id={id}
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
          onSelect={(date) => {
            if (!date) return
            onChange(dateToValue(date))
            setOpen(false)
          }}
          disabled={(date) => {
            if (minDate && date < minDate) return true
            if (maxDate && date > maxDate) return true
            return false
          }}
          captionLayout={captionLayout}
          reverseYears={reverseYears}
          startMonth={startMonth}
          endMonth={endMonth}
          month={month}
          onMonthChange={setMonth}
          hideNavigation={dropdownCaption}
        />
      </PopoverContent>
    </Popover>
  )
}
