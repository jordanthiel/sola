import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { NannyClaimRequired } from '@/components/routes/NannyClaimRequired'
import { isNannyAccount } from '@/types/account'

export function RequireHousehold() {
  const { accountKind, sessionContext, loading: authLoading } = useAuth()
  const { activeHousehold, hasHouseholdAccess, loading: householdLoading } = useHousehold()

  const loading = authLoading || householdLoading
  const hasHousehold =
    hasHouseholdAccess || sessionContext?.has_household_access === true || !!activeHousehold

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--color-muted-foreground)]">Loading household...</p>
      </div>
    )
  }

  if (!hasHousehold) {
    if (isNannyAccount(accountKind)) {
      return <NannyClaimRequired />
    }
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}
