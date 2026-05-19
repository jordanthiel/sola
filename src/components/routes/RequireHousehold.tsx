import { Navigate, Outlet } from 'react-router-dom'
import { useHousehold } from '@/contexts/HouseholdContext'

export function RequireHousehold() {
  const { activeHousehold, loading } = useHousehold()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--color-muted-foreground)]">Loading household...</p>
      </div>
    )
  }

  if (!activeHousehold) {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}
