import { childColorClasses, isChildColorKey } from '@/lib/child-colors'
import { cn } from '@/lib/utils'

export function ChildColorDot({
  colorKey,
  className,
}: {
  colorKey: string
  className?: string
}) {
  const colors = childColorClasses(isChildColorKey(colorKey) ? colorKey : undefined)
  return (
    <span
      className={cn('inline-block size-3 shrink-0 rounded-full border-2', colors.border, colors.bg, className)}
      aria-hidden
    />
  )
}
