import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type ScheduleViewMode = 'day' | 'week' | 'month' | 'list'

const MODES: { value: ScheduleViewMode; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'list', label: 'List' },
]

export function ScheduleViewToggle({
  value,
  onChange,
}: {
  value: ScheduleViewMode
  onChange: (mode: ScheduleViewMode) => void
}) {
  return (
    <div className="inline-flex rounded-lg border p-1" role="group" aria-label="Schedule view">
      {MODES.map((mode) => (
        <Button
          key={mode.value}
          type="button"
          size="sm"
          variant={value === mode.value ? 'default' : 'ghost'}
          className={cn('min-w-[4.5rem]', value !== mode.value && 'text-[var(--color-muted-foreground)]')}
          onClick={() => onChange(mode.value)}
        >
          {mode.label}
        </Button>
      ))}
    </div>
  )
}
