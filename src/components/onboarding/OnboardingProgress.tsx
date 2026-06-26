import { cn } from '@/lib/utils'
import { ONBOARDING_STEPS, type OnboardingStepId } from '@/lib/onboarding'

export function OnboardingProgress({
  currentStep,
  className,
}: {
  currentStep: OnboardingStepId
  className?: string
}) {
  const currentIndex = ONBOARDING_STEPS.findIndex((s) => s.id === currentStep)

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        {ONBOARDING_STEPS.map((step, index) => {
          const done = index < currentIndex
          const active = index === currentIndex
          return (
            <div key={step.id} className="flex min-w-0 flex-1 items-center gap-2">
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  done && 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]',
                  active && 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] ring-4 ring-[var(--color-primary)]/20',
                  !done && !active && 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
                )}
              >
                {done ? '✓' : index + 1}
              </div>
              {index < ONBOARDING_STEPS.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 flex-1 rounded-full',
                    index < currentIndex ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
      <p className="text-center text-sm text-[var(--color-muted-foreground)]">
        Step {currentIndex + 1} of {ONBOARDING_STEPS.length}:{' '}
        <span className="font-medium text-[var(--color-foreground)]">
          {ONBOARDING_STEPS[currentIndex]?.label}
        </span>
      </p>
    </div>
  )
}
