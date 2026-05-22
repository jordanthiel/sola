import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker, getDefaultClassNames, type DayPickerProps } from 'react-day-picker'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type CalendarProps = DayPickerProps

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const defaults = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        root: cn('w-fit', defaults.root),
        months: cn('relative flex flex-col gap-4', defaults.months),
        month: cn('flex w-full flex-col gap-3', defaults.month),
        month_caption: cn(
          'flex h-9 items-center justify-center gap-2 px-2',
          defaults.month_caption,
        ),
        caption_label: cn('text-sm font-semibold', defaults.caption_label),
        dropdowns: cn('flex items-center justify-center gap-2', defaults.dropdowns),
        dropdown: cn(
          'h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-2 text-sm',
          defaults.dropdown,
        ),
        dropdown_root: cn('relative inline-flex', defaults.dropdown_root),
        months_dropdown: defaults.months_dropdown,
        years_dropdown: defaults.years_dropdown,
        nav: cn('absolute inset-x-0 top-0 flex items-center justify-between', defaults.nav),
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
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          ),
        PreviousMonthButton: ({ className: btnClass, ...btnProps }) => (
          <Button variant="outline" size="icon" className={cn('size-8', btnClass)} {...btnProps} />
        ),
        NextMonthButton: ({ className: btnClass, ...btnProps }) => (
          <Button variant="outline" size="icon" className={cn('size-8', btnClass)} {...btnProps} />
        ),
      }}
      {...props}
    />
  )
}
