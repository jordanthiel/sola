import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { householdNeedsOnboarding } from '@/lib/onboarding'
import { isFamilyAccount, isNannyAccount } from '@/types/account'

/**
 * Routes family vs nanny accounts. Claim is handled only at /claim (not redirected here).
 */
export function RequireAccountSetup() {
  const { accountKind, sessionContext, loading: authLoading } = useAuth()
  const { hasHouseholdAccess, loading: householdLoading, activeHousehold, isParent } = useHousehold()
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
  const onSetup = location.pathname === '/onboarding/setup'
  const needsSetup = isParent && householdNeedsOnboarding(activeHousehold)

  if (isNannyAccount(accountKind)) {
    if (onOnboarding || onSetup) return <Navigate to="/" replace />
    return <Outlet />
  }

  if (isFamilyAccount(accountKind)) {
    if (!hasHousehold && !onOnboarding) {
      return <Navigate to="/onboarding" replace />
    }
    if (hasHousehold && onOnboarding) {
      return <Navigate to={needsSetup ? '/onboarding/setup' : '/'} replace />
    }
    if (hasHousehold && needsSetup && !onSetup) {
      return <Navigate to="/onboarding/setup" replace />
    }
    if (hasHousehold && !needsSetup && onSetup) {
      return <Navigate to="/dashboard" replace />
    }
    return <Outlet />
  }

  if (hasHousehold) {
    if (onOnboarding) return <Navigate to={needsSetup ? '/onboarding/setup' : '/'} replace />
    if (needsSetup && !onSetup) {
      return <Navigate to="/onboarding/setup" replace />
    }
    if (!needsSetup && onSetup) {
      return <Navigate to="/dashboard" replace />
    }
    return <Outlet />
  }

  if (!onOnboarding) {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}
