import {
  addDays,
  addMonths,
  addWeeks,
  format,
  isSameDay,
  isSameMonth,
  isSameWeek,
  startOfWeek,
} from 'date-fns'
import type { ScheduleViewMode } from '@/components/schedule/ScheduleViewToggle'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ScheduleDateNav({
  viewMode,
  focusDate,
  onFocusDateChange,
}: {
  viewMode: ScheduleViewMode
  focusDate: Date
  onFocusDateChange: (date: Date) => void
}) {
  const stepBack = () => {
    if (viewMode === 'month') return addMonths(focusDate, -1)
    if (viewMode === 'week') return addWeeks(focusDate, -1)
    return addDays(focusDate, -1)
  }

  const stepForward = () => {
    if (viewMode === 'month') return addMonths(focusDate, 1)
    if (viewMode === 'week') return addWeeks(focusDate, 1)
    return addDays(focusDate, 1)
  }

  const label = format(focusDate, 'MMMM yyyy')

  const sublabel =
    viewMode === 'month'
      ? 'Month view'
      : viewMode === 'week'
        ? `${format(startOfWeek(focusDate, { weekStartsOn: 1 }), 'MMM d')} – ${format(
            addDays(startOfWeek(focusDate, { weekStartsOn: 1 }), 6),
            'MMM d',
          )}`
        : format(focusDate, 'EEEE')

  return (
    <header className="flex flex-wrap items-center gap-3">
      <section className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-8"
          aria-label="Previous"
          onClick={() => onFocusDateChange(stepBack())}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-8"
          aria-label="Next"
          onClick={() => onFocusDateChange(stepForward())}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-1"
          onClick={() => onFocusDateChange(new Date())}
          disabled={
            viewMode === 'day'
              ? isSameDay(focusDate, new Date())
              : viewMode === 'month'
                ? isSameMonth(focusDate, new Date())
                : isSameWeek(focusDate, new Date(), { weekStartsOn: 1 })
          }
        >
          Today
        </Button>
      </section>
      <section className="min-w-0 flex-1 text-center sm:text-left">
        <h2 className="text-xl font-normal tracking-tight">{label}</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">{sublabel}</p>
      </section>
    </header>
  )
}
