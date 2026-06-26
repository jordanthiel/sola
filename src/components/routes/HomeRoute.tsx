import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { LandingPage } from '@/pages/landing/LandingPage'

export function HomeRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--color-muted-foreground)]">Loading...</p>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  return <LandingPage />
}
