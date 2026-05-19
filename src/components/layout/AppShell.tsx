import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  Baby,
  Calendar,
  Home,
  LogOut,
  Settings,
  Wallet,
  Palmtree,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const parentNav = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/schedule', label: 'Schedule', icon: Calendar },
  { to: '/payroll', label: 'Payroll', icon: Wallet },
  { to: '/time-off', label: 'Time off', icon: Palmtree },
  { to: '/children', label: 'Children', icon: Baby },
  { to: '/activities', label: 'Activities', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const nannyNav = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/schedule', label: 'Schedule', icon: Calendar },
  { to: '/payroll', label: 'Payroll', icon: Wallet },
  { to: '/time-off', label: 'Time off', icon: Palmtree },
  { to: '/activities', label: 'Activities', icon: Sparkles },
  { to: '/settings', label: 'Profile', icon: Settings },
]

export function AppShell() {
  const { profile, signOut } = useAuth()
  const { activeHousehold, households, isParent, setActiveHouseholdId } = useHousehold()
  const nav = isParent ? parentNav : nannyNav

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 flex-shrink-0 border-r bg-[var(--color-card)] md:flex md:flex-col">
        <div className="border-b p-4">
          <Link to="/" className="text-lg font-semibold text-[var(--color-primary)]">
            NannyCare
          </Link>
          {activeHousehold && (
            <p className="mt-1 truncate text-sm text-[var(--color-muted-foreground)]">
              {activeHousehold.name}
            </p>
          )}
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-[var(--color-accent)] font-medium text-[var(--color-accent-foreground)]'
                    : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-3">
          <p className="truncate px-3 text-sm font-medium">{profile?.display_name}</p>
          <Button variant="ghost" className="mt-1 w-full justify-start" onClick={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3 md:hidden">
          <span className="font-semibold">NannyCare</span>
          {households.length > 1 && (
            <select
              className="rounded border px-2 py-1 text-sm"
              value={activeHousehold?.id ?? ''}
              onChange={(e) => setActiveHouseholdId(e.target.value)}
            >
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          )}
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {households.length > 1 && (
            <div className="mb-4 hidden md:block">
              <label className="mr-2 text-sm text-[var(--color-muted-foreground)]">Household</label>
              <select
                className="rounded-md border px-3 py-1.5 text-sm"
                value={activeHousehold?.id ?? ''}
                onChange={(e) => setActiveHouseholdId(e.target.value)}
              >
                {households.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
