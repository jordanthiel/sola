import * as React from 'react'
import { Calendar, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type PickerTriggerProps = React.ComponentPropsWithoutRef<typeof Button> & {
  kind?: 'date' | 'time' | 'datetime'
  empty?: boolean
}

export const PickerTrigger = React.forwardRef<HTMLButtonElement, PickerTriggerProps>(
  ({ kind = 'date', empty, className, children, ...props }, ref) => {
    const Icon = kind === 'time' ? Clock : Calendar
    return (
      <Button
        ref={ref}
        type="button"
        variant="outline"
        className={cn(
          'h-10 w-full justify-start gap-2 px-3 font-normal shadow-sm',
          empty && 'text-[var(--color-muted-foreground)]',
          className,
        )}
        {...props}
      >
        <Icon className="size-4 shrink-0 opacity-60" aria-hidden />
        <span className="truncate">{children}</span>
      </Button>
    )
  },
)
PickerTrigger.displayName = 'PickerTrigger'
