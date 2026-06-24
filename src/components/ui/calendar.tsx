import type { ComponentProps } from 'react'
import { useMemo } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker, getDefaultClassNames, type DayPickerProps } from 'react-day-picker'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

export type CalendarProps = DayPickerProps

function usesDropdownCaption(layout: DayPickerProps['captionLayout'] | undefined): boolean {
  return layout === 'dropdown' || layout === 'dropdown-months' || layout === 'dropdown-years'
}

function CalendarChevron({
  className,
  orientation,
  ...props
}: ComponentProps<'svg'> & { orientation?: 'left' | 'right' | 'down' | 'up' }) {
  if (orientation === 'down') {
    return <ChevronDown className={cn('size-3.5', className)} {...props} />
  }
  if (orientation === 'left') {
    return <ChevronLeft className={cn('size-4', className)} {...props} />
  }
  return <ChevronRight className={cn('size-4', className)} {...props} />
}

function CalendarPreviousMonthButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'size-8', className)}
      {...props}
    />
  )
}

function CalendarNextMonthButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'size-8', className)}
      {...props}
    />
  )
}

const calendarComponents = {
  Chevron: CalendarChevron,
  PreviousMonthButton: CalendarPreviousMonthButton,
  NextMonthButton: CalendarNextMonthButton,
}

const defaultFormatters: DayPickerProps['formatters'] = {
  formatMonthDropdown: (date) => date.toLocaleString('default', { month: 'short' }),
}

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  formatters,
  ...props
}: CalendarProps) {
  const defaults = getDefaultClassNames()
  const dropdownCaption = usesDropdownCaption(captionLayout)

  const mergedFormatters = useMemo(
    () => ({ ...defaultFormatters, ...formatters }),
    [formatters],
  )

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      formatters={mergedFormatters}
      className={cn('p-3', className)}
      classNames={{
        root: cn('w-fit', defaults.root),
        months: cn('relative flex flex-col gap-4', defaults.months),
        month: cn('flex w-full flex-col gap-3', defaults.month),
        month_caption: cn(
          'relative flex h-9 w-full items-center justify-center gap-2',
          dropdownCaption ? 'px-1' : 'px-9',
          defaults.month_caption,
        ),
        caption_label: cn(
          dropdownCaption
            ? 'pointer-events-none flex h-8 items-center gap-1 text-sm font-medium [&>svg]:size-3.5 [&>svg]:opacity-60'
            : 'text-sm font-semibold',
          defaults.caption_label,
        ),
        dropdowns: cn('flex items-center justify-center gap-2', defaults.dropdowns),
        dropdown_root: cn(
          'relative inline-flex h-8 min-w-[4.75rem] items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-2 text-sm font-medium shadow-sm',
          'has-[select:focus]:ring-2 has-[select:focus]:ring-[var(--color-ring)]/35',
          defaults.dropdown_root,
        ),
        dropdown: cn('absolute inset-0 z-[1] w-full cursor-pointer opacity-0', defaults.dropdown),
        months_dropdown: defaults.months_dropdown,
        years_dropdown: defaults.years_dropdown,
        chevron: cn('opacity-60', defaults.chevron),
        nav: cn(
          'absolute inset-x-0 top-0 flex items-center justify-between',
          dropdownCaption && 'hidden',
          defaults.nav,
        ),
        button_previous: cn(defaults.button_previous),
        button_next: cn(defaults.button_next),
        month_grid: cn('w-full border-collapse', defaults.month_grid),
        weekdays: cn('flex', defaults.weekdays),
        weekday: cn(
          'w-9 text-center text-[0.7rem] font-medium text-[var(--color-muted-foreground)]',
          defaults.weekday,
        ),
        week: cn('mt-1 flex w-full', defaults.week),
        day: cn('relative p-0 text-center', defaults.day),
        day_button: cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-normal transition-colors hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]/35 disabled:pointer-events-none disabled:opacity-40',
          defaults.day_button,
        ),
        selected: cn(
          '[&>button]:bg-[var(--color-primary)] [&>button]:text-[var(--color-primary-foreground)] [&>button]:hover:bg-[var(--color-primary)]',
          defaults.selected,
        ),
        today: cn('[&>button]:font-semibold [&>button]:text-[var(--color-primary)]', defaults.today),
        outside: cn('text-[var(--color-muted-foreground)] opacity-45', defaults.outside),
        disabled: cn('opacity-35', defaults.disabled),
        hidden: cn('invisible', defaults.hidden),
        ...classNames,
      }}
      components={calendarComponents}
      {...props}
    />
  )
}
