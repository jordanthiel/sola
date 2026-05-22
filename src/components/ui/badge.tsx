import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[var(--color-primary)]/12 text-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/20',
        secondary:
          'border-transparent bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]',
        outline: 'border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]',
        success: 'border-transparent bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20',
        warning: 'border-transparent bg-amber-500/12 text-amber-800 ring-1 ring-amber-500/20',
        destructive: 'border-transparent bg-red-500/12 text-red-700 ring-1 ring-red-500/20',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
