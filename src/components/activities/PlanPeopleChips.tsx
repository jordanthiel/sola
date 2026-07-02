import { childColorClasses, type ChildColorKey } from '@/lib/child-colors'
import { cn } from '@/lib/utils'

export type PlanChildAttendee = {
  id?: string
  name: string
  colorKey?: ChildColorKey
}

function avatarInitial(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase()
  }
  return trimmed.charAt(0).toUpperCase()
}

export function ChildAvatarChip({
  name,
  colorKey,
  size = 'md',
  className,
}: {
  name: string
  colorKey?: ChildColorKey
  size?: 'sm' | 'md'
  className?: string
}) {
  const colors = childColorClasses(colorKey)
  return (
    <span
      title={name}
      aria-label={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border-2 font-semibold leading-none',
        colors.bg,
        colors.border,
        colors.text,
        size === 'sm' ? 'size-5 text-[9px]' : 'size-6 text-[10px]',
        className,
      )}
    >
      {avatarInitial(name)}
    </span>
  )
}

export function AttendeeAvatarChip({
  label,
  size = 'md',
  className,
}: {
  label: string
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <span
      title={`${label} going`}
      aria-label={`${label} going`}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border-2 border-[var(--color-border)] bg-[var(--color-muted)] font-semibold leading-none text-[var(--color-foreground)]',
        size === 'sm' ? 'size-5 text-[9px]' : 'size-6 text-[10px]',
        className,
      )}
    >
      {avatarInitial(label)}
    </span>
  )
}

export function PlanPeopleChips({
  children,
  attendeeLabel,
  size = 'md',
  className,
}: {
  children?: PlanChildAttendee[]
  attendeeLabel?: string | null
  size?: 'sm' | 'md'
  className?: string
}) {
  const hasChildren = (children?.length ?? 0) > 0
  if (!hasChildren && !attendeeLabel) return null

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-0.5', className)}>
      {children?.map((child) => (
        <ChildAvatarChip
          key={child.id ?? child.name}
          name={child.name}
          colorKey={child.colorKey}
          size={size}
        />
      ))}
      {attendeeLabel && (
        <AttendeeAvatarChip label={attendeeLabel} size={size} className={hasChildren ? '-ml-1' : undefined} />
      )}
    </span>
  )
}
