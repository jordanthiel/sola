import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { isFamilyAccount, isNannyAccount } from '@/types/account'

/**
 * Routes family vs nanny accounts. Claim is handled only at /claim (not redirected here).
 */
export function RequireAccountSetup() {
  const { accountKind, sessionContext, loading: authLoading } = useAuth()
  const { hasHouseholdAccess, loading: householdLoading } = useHousehold()
  const location = useLocation()

  const loading = authLoading || householdLoading

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--color-muted-foreground)]">Loading your account...</p>
      </div>
    )
  }

  const hasHousehold =
    hasHouseholdAccess ||
    sessionContext?.has_household_access === true
  const onOnboarding = location.pathname === '/onboarding'

  if (isNannyAccount(accountKind)) {
    if (onOnboarding) return <Navigate to="/" replace />
    return <Outlet />
  }

  if (isFamilyAccount(accountKind)) {
    if (!hasHousehold && !onOnboarding) {
      return <Navigate to="/onboarding" replace />
    }
    if (hasHousehold && onOnboarding) {
      return <Navigate to="/" replace />
    }
    return <Outlet />
  }

  if (hasHousehold) {
    if (onOnboarding) return <Navigate to="/" replace />
    return <Outlet />
  }

  if (!onOnboarding) {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}
