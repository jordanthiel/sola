import { useState } from 'react'
import {
  CHILD_COLOR_KEYS,
  CHILD_COLOR_LABELS,
  childColorClasses,
  isChildColorKey,
  type ChildColorKey,
} from '@/lib/child-colors'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function ChildColorPicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string
  onChange: (colorKey: ChildColorKey) => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = isChildColorKey(value) ? value : 'green'
  const dotColors = childColorClasses(selected)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Calendar color: ${CHILD_COLOR_LABELS[selected]}. Click to change.`}
          className={cn(
            'shrink-0 rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
            disabled && 'cursor-not-allowed opacity-50',
            className,
          )}
        >
          <span
            className={cn('block size-3 rounded-full border-2', dotColors.border, dotColors.bg)}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <p className="mb-2 px-0.5 text-xs font-medium text-[var(--color-muted-foreground)]">
          Calendar color
        </p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Calendar color">
          {CHILD_COLOR_KEYS.map((key) => {
            const colors = childColorClasses(key)
            const isSelected = selected === key
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={CHILD_COLOR_LABELS[key]}
                title={CHILD_COLOR_LABELS[key]}
                onClick={() => {
                  onChange(key)
                  setOpen(false)
                }}
                className={cn(
                  'size-7 rounded-full border-2 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
                  colors.border,
                  colors.bg,
                  isSelected && 'ring-2 ring-[var(--color-ring)] ring-offset-1',
                )}
              />
            )
          })}
        </div>
        <p className="mt-2 max-w-[12rem] px-0.5 text-[10px] leading-snug text-[var(--color-muted-foreground)]">
          Blue matches nanny shifts on the schedule.
        </p>
      </PopoverContent>
    </Popover>
  )
}
