import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { clearProductTour, shouldShowProductTour } from '@/lib/onboarding'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type TourStep = {
  target: string
  title: string
  body: string
  path?: string
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="nav-dashboard"]',
    title: 'Dashboard',
    body: 'Your home base — see this week\'s hours, upcoming shifts, and anything that needs attention.',
    path: '/dashboard',
  },
  {
    target: '[data-tour="nav-schedule"]',
    title: 'Schedule',
    body: 'The shared calendar for nanny shifts, time off, kids\' plans, and holidays. Tap any slot to add or edit.',
    path: '/schedule',
  },
  {
    target: '[data-tour="nav-payroll"]',
    title: 'Earnings',
    body: 'Hours from the schedule flow into pay periods here. Review what you owe and track advances.',
    path: '/payroll',
  },
  {
    target: '[data-tour="nav-activities"]',
    title: "Kids' plans",
    body: 'Plan classes, appointments, and activities. Assign who\'s taking the kids so everyone stays aligned.',
    path: '/activities',
  },
  {
    target: '[data-tour="nav-feed"]',
    title: 'Feed',
    body: 'Share updates and notes with your nanny and co-parents throughout the day.',
    path: '/feed',
  },
  {
    target: '[data-tour="nav-settings"]',
    title: 'Settings',
    body: 'Manage nannies, invite them to log in, add household members, and fine-tune pay & time off.',
    path: '/settings',
  },
]

type Rect = { top: number; left: number; width: number; height: number }

function measureTarget(selector: string): Rect | null {
  const el = document.querySelector(selector)
  if (!el) return null
  const box = el.getBoundingClientRect()
  return { top: box.top, left: box.left, width: box.width, height: box.height }
}

export function ProductTour() {
  const navigate = useNavigate()
  const [active, setActive] = useState(() => shouldShowProductTour())
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  const step = TOUR_STEPS[stepIndex]
  const isLast = stepIndex >= TOUR_STEPS.length - 1

  const dismiss = useCallback(() => {
    clearProductTour()
    setActive(false)
  }, [])

  const updateRect = useCallback(() => {
    if (!step) return
    setRect(measureTarget(step.target))
  }, [step])

  useEffect(() => {
    if (!active || !step) return

    if (step.path && window.location.pathname !== step.path) {
      navigate(step.path)
    }

    const timer = window.setTimeout(updateRect, 120)
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [active, step, stepIndex, navigate, updateRect])

  if (!active || !step) return null

  const padding = 8
  const spotlight = rect
    ? {
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      }
    : null

  const tooltipTop = spotlight
    ? Math.min(spotlight.top + spotlight.height + 16, window.innerHeight - 220)
    : window.innerHeight / 2 - 100
  const tooltipLeft = spotlight
    ? Math.min(Math.max(16, spotlight.left), window.innerWidth - 336)
    : window.innerWidth / 2 - 160

  return createPortal(
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label="Product tour">
      <div className="absolute inset-0 bg-black/50" onClick={dismiss} aria-hidden />

      {spotlight && (
        <div
          className="pointer-events-none absolute rounded-xl ring-4 ring-[var(--color-primary)] ring-offset-2 ring-offset-transparent transition-all duration-300"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
          }}
        />
      )}

      <div
        className={cn(
          'absolute z-10 w-[min(320px,calc(100vw-2rem))] rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-2xl',
        )}
        style={{ top: tooltipTop, left: tooltipLeft }}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
              {stepIndex + 1} of {TOUR_STEPS.length}
            </p>
            <h3 className="text-lg font-semibold">{step.title}</h3>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
            aria-label="Close tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-[var(--color-muted-foreground)]">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStepIndex((i) => i - 1)}>
                Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                if (isLast) dismiss()
                else setStepIndex((i) => i + 1)
              }}
            >
              {isLast ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
