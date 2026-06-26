import { Link } from 'react-router-dom'
import {
  Baby,
  Calendar,
  CheckCircle2,
  FolderOpen,
  MessageSquare,
  Palmtree,
  Sparkles,
  Wallet,
  ArrowRight,
} from 'lucide-react'
import { APP_NAME } from '@/lib/app'
import { Button } from '@/components/ui/button'

const features = [
  {
    icon: Calendar,
    title: 'Schedule that stays in sync',
    description:
      'Plan shifts ahead, compare scheduled vs actual hours, and keep everyone aligned on who is on duty.',
  },
  {
    icon: Wallet,
    title: 'Earnings without the spreadsheet',
    description:
      'See what your nanny earned each period — hours, bonuses, mileage, and advances — with exports when you need them.',
  },
  {
    icon: Palmtree,
    title: 'Time off, handled',
    description:
      'Sick days and PTO balances in one place. Nannies request; parents approve — no more text-thread confusion.',
  },
  {
    icon: Baby,
    title: 'Care sheets that travel with you',
    description:
      'Allergies, medications, routines, and emergency contacts — always up to date when your nanny needs them.',
  },
  {
    icon: Sparkles,
    title: "Kids' plans, day to day",
    description:
      'One-off outings and recurring activities across multiple children, so nothing falls through the cracks.',
  },
  {
    icon: MessageSquare,
    title: 'A household feed',
    description:
      'Share updates and @mention the right person. Parents and nannies stay connected without another group chat.',
  },
  {
    icon: FolderOpen,
    title: 'Documents in one hub',
    description: 'Contracts, tax forms, and household files — organized and accessible when you need them.',
  },
  {
    icon: CheckCircle2,
    title: 'Built for real households',
    description:
      'Multi-household support, role-based access, and notifications tuned to how families actually work.',
  },
]

const steps = [
  {
    step: '1',
    title: 'Set up your household',
    description: 'Create your family workspace and add your children, pay settings, and care details.',
  },
  {
    step: '2',
    title: 'Invite your nanny',
    description: 'Send a secure invite link. Your nanny joins with the right access from day one.',
  },
  {
    step: '3',
    title: 'Run the week with confidence',
    description: 'Schedules, hours, time off, and daily plans — all in one calm, organized place.',
  },
]

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-32 top-0 h-[480px] w-[480px] rounded-full bg-[oklch(0.92_0.04_175/0.5)] blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-[400px] w-[400px] rounded-full bg-[oklch(0.94_0.03_85/0.6)] blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 border-b border-[var(--color-border)]/80 bg-[var(--color-background)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5 font-bold tracking-tight text-[var(--color-foreground)]">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent)]">
              <Baby className="h-5 w-5 text-[var(--color-primary)]" strokeWidth={2.25} />
            </span>
            {APP_NAME}
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1 text-xs font-medium text-[var(--color-muted-foreground)] shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
                Schedules, earnings, and care — unified
              </div>
              <div className="space-y-5">
                <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-[var(--color-foreground)] sm:text-5xl lg:text-[3.25rem]">
                  Household care,{' '}
                  <span className="text-[var(--color-primary)]">simplified</span>
                </h1>
                <p className="max-w-lg text-lg leading-relaxed text-[var(--color-muted-foreground)]">
                  {APP_NAME} brings families and nannies together around schedules, earnings, time off,
                  and daily child care — so you spend less time coordinating and more quality time with your kids.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button size="lg" asChild className="h-12 px-8 text-base">
                  <Link to="/signup">
                    Create your household
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base">
                  <Link to="/login">I already have an account</Link>
                </Button>
              </div>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Free to set up · Built for parents and nannies · Your data stays private
              </p>
            </div>

            <div className="relative">
              <div className="auth-gradient absolute -inset-4 rounded-[2rem] opacity-20 blur-2xl" />
              <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-elevated)]">
                <div className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/50 px-5 py-4">
                  <p className="text-sm font-semibold text-[var(--color-foreground)]">This week at a glance</p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">The Martinez household</p>
                </div>
                <div className="space-y-3 p-5">
                  {[
                    { label: 'Mon–Wed', value: '9:00 – 5:00', tag: 'Scheduled' },
                    { label: 'Hours logged', value: '24.5 hrs', tag: 'On track' },
                    { label: 'PTO balance', value: '3 days left', tag: 'Updated' },
                    { label: "Today's plan", value: 'Park + nap at 1pm', tag: 'Kids' },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3"
                    >
                      <div>
                        <p className="text-xs text-[var(--color-muted-foreground)]">{row.label}</p>
                        <p className="text-sm font-medium text-[var(--color-foreground)]">{row.value}</p>
                      </div>
                      <span className="rounded-full bg-[var(--color-accent)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent-foreground)]">
                        {row.tag}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--color-border)] bg-[var(--color-card)]/60 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-[var(--color-foreground)] sm:text-4xl">
                Everything your household needs
              </h2>
              <p className="mt-4 text-[var(--color-muted-foreground)]">
                Replace scattered texts, spreadsheets, and sticky notes with one purpose-built workspace.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map(({ icon: Icon, title, description }) => (
                <article
                  key={title}
                  className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-[var(--shadow-card)] transition-all duration-200 hover:border-[oklch(0.85_0.06_175)] hover:shadow-[var(--shadow-elevated)]"
                >
                  <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent)] text-[var(--color-primary)] transition-transform duration-200 group-hover:scale-105">
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <h3 className="font-semibold text-[var(--color-foreground)]">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[oklch(0.98_0.02_175)] to-[var(--color-card)] p-8 shadow-[var(--shadow-card)]">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
                  For parents
                </p>
                <h3 className="mt-3 text-2xl font-bold tracking-tight text-[var(--color-foreground)]">
                  Run your home team with clarity
                </h3>
                <ul className="mt-6 space-y-3">
                  {[
                    'Invite co-parents and nannies with the right permissions',
                    'Close pay periods and export earnings summaries',
                    'Review time-off requests and incident logs in one place',
                    'Keep care instructions and documents always accessible',
                  ].map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-[var(--color-muted-foreground)]">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 shadow-[var(--shadow-card)]">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
                  For nannies
                </p>
                <h3 className="mt-3 text-2xl font-bold tracking-tight text-[var(--color-foreground)]">
                  One dashboard, every household
                </h3>
                <ul className="mt-6 space-y-3">
                  {[
                    'Log hours and request time off from your phone',
                    'See schedules and kids\' plans before you arrive',
                    'Preview earnings and track advance repayments',
                    'Work across multiple families without juggling apps',
                  ].map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-[var(--color-muted-foreground)]">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--color-border)] bg-[var(--color-muted)]/40 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-[var(--color-foreground)]">
                Up and running in minutes
              </h2>
              <p className="mt-4 text-[var(--color-muted-foreground)]">
                No complicated setup. Just create your household and invite the people who matter.
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {steps.map(({ step, title, description }) => (
                <div key={step} className="relative text-center md:text-left">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-bold text-[var(--color-primary-foreground)]">
                    {step}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-[var(--color-foreground)]">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="auth-gradient relative overflow-hidden rounded-3xl px-8 py-14 text-center text-white sm:px-16">
              <div className="relative z-10 mx-auto max-w-2xl space-y-6">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Ready to bring calm to your household?
                </h2>
                <p className="text-lg text-white/80">
                  Join families who manage schedules, earnings, and daily care in one organized place.
                </p>
                <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button
                    size="lg"
                    asChild
                    className="h-12 bg-white px-8 text-base text-[oklch(0.35_0.08_175)] hover:bg-white/90"
                  >
                    <Link to="/signup">Get started free</Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="h-12 border-white/30 bg-white/10 px-8 text-base text-white hover:bg-white/20 hover:text-white"
                  >
                    <Link to="/login">Sign in</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-muted-foreground)]">
            <Baby className="h-4 w-4 text-[var(--color-primary)]" />
            {APP_NAME}
          </div>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Built for families managing home childcare.
          </p>
        </div>
      </footer>
    </div>
  )
}
