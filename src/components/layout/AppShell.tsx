import { useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import {
  Baby,
  Calendar,
  FileText,
  FolderOpen,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  Wallet,
  Palmtree,
  Sparkles,
  AlertTriangle,
  X,
  ChevronDown,
} from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { NannyPreviewBanner, NannyPreviewSwitcher } from '@/components/layout/NannyPreviewControls'
import { useNotificationDelivery } from '@/hooks/useNotificationDelivery'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { accountKindLabel, isFamilyAccount } from '@/types/account'
import { Button } from '@/components/ui/button'
import { APP_NAME } from '@/lib/app'
import { isDeactivatedNannyAllowedPath } from '@/lib/deactivated-nanny-access'
import { useMyNannyAccess } from '@/hooks/useMyNannyAccess'
import { ProductTour } from '@/components/onboarding/ProductTour'
import { cn } from '@/lib/utils'

const TOUR_TARGETS: Record<string, string> = {
  '/dashboard': 'nav-dashboard',
  '/schedule': 'nav-schedule',
  '/payroll': 'nav-payroll',
  '/activities': 'nav-activities',
  '/feed': 'nav-feed',
  '/settings': 'nav-settings',
}

type NavItem = { to: string; label: string; icon: typeof Home }
type NavGroup = { label: string; items: NavItem[] }

const parentNavGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: Home },
      { to: '/schedule', label: 'Schedule', icon: Calendar },
      { to: '/payroll', label: 'Earnings', icon: Wallet },
      { to: '/time-off', label: 'Time off', icon: Palmtree },
    ],
  },
  {
    label: 'Family',
    items: [
      { to: '/children', label: 'Children', icon: Baby },
      { to: '/activities', label: "Kids' plans", icon: Sparkles },
      { to: '/feed', label: 'Feed', icon: MessageSquare },
      { to: '/incidents', label: 'Incidents', icon: AlertTriangle },
    ],
  },
  {
    label: 'Household',
    items: [
      { to: '/documents', label: 'Documents', icon: FolderOpen },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const nannyNavGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: Home },
      { to: '/schedule', label: 'Schedule', icon: Calendar },
      { to: '/payroll', label: 'Earnings', icon: Wallet },
      { to: '/time-off', label: 'Time off', icon: Palmtree },
    ],
  },
  {
    label: 'Family',
    items: [
      { to: '/children', label: 'Children', icon: Baby },
      { to: '/activities', label: "Kids' plans", icon: Sparkles },
      { to: '/feed', label: 'Feed', icon: MessageSquare },
      { to: '/incidents', label: 'Incidents', icon: AlertTriangle },
    ],
  },
  {
    label: 'More',
    items: [
      { to: '/documents', label: 'Documents', icon: FileText },
      { to: '/settings', label: 'Profile', icon: Settings },
    ],
  },
]

const deactivatedNannyNavGroups: NavGroup[] = [
  {
    label: 'Records',
    items: [
      { to: '/payroll', label: 'Earnings history', icon: Wallet },
      { to: '/settings', label: 'Profile', icon: Settings },
    ],
  },
]

function NavItems({
  groups,
  onNavigate,
}: {
  groups: NavGroup[]
  onNavigate?: () => void
}) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/dashboard'}
                data-tour={TOUR_TARGETS[to]}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm'
                      : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]',
                  )
                }
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-105',
                  )}
                  strokeWidth={2}
                />
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function HouseholdSelect({
  className,
  compact,
}: {
  className?: string
  compact?: boolean
}) {
  const { activeHousehold, households, setActiveHouseholdId } = useHousehold()
  if (households.length <= 1 && activeHousehold) {
    return (
      <p
        className={cn(
          'truncate text-sm font-medium text-[var(--color-foreground)]',
          compact && 'max-w-[140px] text-xs',
          className,
        )}
      >
        {activeHousehold.name}
      </p>
    )
  }
  return (
    <div className={cn('relative', className)}>
      <select
        className={cn(
          'w-full cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] py-2 pl-3 pr-8 text-sm font-medium shadow-sm transition-colors hover:border-[var(--color-primary)]/30 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]/40',
          compact ? 'max-w-[180px] py-1.5 text-xs' : '',
        )}
        value={activeHousehold?.id ?? ''}
        onChange={(e) => setActiveHouseholdId(e.target.value)}
      >
        {households.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
    </div>
  )
}

export function AppShell() {
  useNotificationDelivery()
  const { profile, signOut, accountKind } = useAuth()
  const { isParent, isNanny, isNannyPreview, activeHousehold } = useHousehold()
  const { isDeactivated, isLoading: nannyAccessLoading } = useMyNannyAccess()
  const location = useLocation()
  const navGroups =
    isDeactivated
      ? deactivatedNannyNavGroups
      : isParent && !isNanny
        ? parentNavGroups
        : nannyNavGroups
  const roleLabel = isDeactivated
    ? 'Former nanny'
    : isNannyPreview
      ? 'Previewing nanny view'
      : isNanny
        ? 'Nanny'
        : isFamilyAccount(accountKind)
          ? 'Family'
          : accountKindLabel(accountKind)
  const [mobileOpen, setMobileOpen] = useState(false)

  if (isDeactivated && !isDeactivatedNannyAllowedPath(location.pathname)) {
    return <Navigate to="/payroll" replace />
  }

  const initials = profile?.display_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '?'

  return (
    <div className="flex min-h-screen">
      <ProductTour />
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen max-h-screen w-[260px] shrink-0 flex-col border-r border-[var(--color-sidebar-border)] bg-[var(--color-sidebar)] md:flex">
        <div className="shrink-0 border-b border-[var(--color-sidebar-border)] px-5 py-5">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm">
              <Baby className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <span className="text-lg font-bold tracking-tight text-[var(--color-foreground)]">
              {APP_NAME}
            </span>
          </Link>
          <div className="mt-4">
            <HouseholdSelect />
          </div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <NavItems groups={navGroups} />
        </nav>
        <div className="shrink-0 border-t border-[var(--color-sidebar-border)] px-4 py-3">
          <NannyPreviewSwitcher />
        </div>
        <div className="mt-auto shrink-0 border-t border-[var(--color-sidebar-border)] p-4">
          <div className="flex items-center gap-3 rounded-xl bg-[var(--color-muted)]/60 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-[var(--color-primary-foreground)]">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{profile?.display_name}</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {roleLabel}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="mt-2 w-full justify-start text-[var(--color-muted-foreground)]"
            onClick={() => signOut()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute bottom-0 left-0 top-0 flex h-full max-w-[300px] flex-col bg-[var(--color-sidebar)] shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-4">
              <Link
                to="/dashboard"
                className="flex items-center gap-2 font-bold"
                onClick={() => setMobileOpen(false)}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white">
                  <Baby className="h-4 w-4" />
                </span>
                {APP_NAME}
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 hover:bg-[var(--color-accent)]"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b px-4 py-3">
              <HouseholdSelect />
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              <NavItems groups={navGroups} onNavigate={() => setMobileOpen(false)} />
            </nav>
            <div className="shrink-0 border-t px-4 py-3">
              <NannyPreviewSwitcher compact />
            </div>
            <div className="mt-auto shrink-0 border-t p-4">
              <div className="mb-2 flex items-center gap-3 rounded-xl bg-[var(--color-muted)]/60 px-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-[var(--color-primary-foreground)]">
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{profile?.display_name}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">{roleLabel}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  signOut()
                  setMobileOpen(false)
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <NannyPreviewBanner />
        {isDeactivated && !nannyAccessLoading && (
          <div className="border-b border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 md:px-6">
            You were deactivated from <strong>{activeHousehold?.name}</strong>. You can review historical pay
            periods and download exports only — schedule and family areas are no longer available.
          </div>
        )}
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-card)]/80 px-4 py-3 backdrop-blur-md md:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 hover:bg-[var(--color-accent)]"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link to="/dashboard" className="font-bold text-[var(--color-primary)] md:hidden">
              {APP_NAME}
            </Link>
          </div>
          <div className="hidden md:block">
            <HouseholdSelect compact />
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <div className="hidden items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-muted)]/50 py-1 pl-1 pr-3 sm:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] font-bold text-white">
                {initials}
              </span>
              <span className="max-w-[120px] truncate text-sm font-medium">
                {profile?.display_name}
              </span>
            </div>
          </div>
        </header>

        <main className="app-canvas flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-6xl p-4 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
