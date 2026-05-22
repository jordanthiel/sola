import { useEffect, useState } from 'react'
import { parseISO, subYears } from 'date-fns'
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
  /** Month/year dropdowns — use for dates of birth and other far-past dates. */
  captionLayout?: DayPickerProps['captionLayout']
  reverseYears?: boolean
}

function usesDropdownCaption(layout: DayPickerProps['captionLayout'] | undefined): boolean {
  return layout === 'dropdown' || layout === 'dropdown-months' || layout === 'dropdown-years'
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
  captionLayout = 'label',
  reverseYears,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = parseDateValue(value)
  const minDate = min ? parseDateValue(min) : undefined
  const maxDate = max ? parseDateValue(max) : undefined
  const label = formatDateDisplay(value)
  const dropdownCaption = usesDropdownCaption(captionLayout)
  const endMonth = maxDate ?? new Date()
  const startMonth = minDate ?? (dropdownCaption ? subYears(endMonth, 30) : undefined)

  const [month, setMonth] = useState<Date>(
    () => selected ?? maxDate ?? minDate ?? new Date(),
  )

  useEffect(() => {
    if (selected) setMonth(selected)
  }, [value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          startMonth={dropdownCaption ? startMonth : undefined}
          endMonth={dropdownCaption ? endMonth : undefined}
          month={dropdownCaption ? month : undefined}
          onMonthChange={dropdownCaption ? setMonth : undefined}
          defaultMonth={
            dropdownCaption
              ? undefined
              : selected ?? (min ? parseISO(`${min}T12:00:00`) : undefined)
          }
        />
      </PopoverContent>
    </Popover>
  )
}
