import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  accountKindFromRedirect,
  authRedirectQuery,
  getPostAuthRedirect,
  postAuthDestination,
} from '@/lib/auth-redirect'
import { claimPathWithToken, getPersistedClaimToken } from '@/lib/claim-link'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export function LoginPage() {
  const { signIn, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const stateFrom = (location.state as { from?: { pathname: string; search?: string } })?.from
  const statePath = stateFrom
    ? `${stateFrom.pathname}${stateFrom.search ?? ''}`
    : null
  const redirectPath = getPostAuthRedirect(searchParams)
  const loginHint = accountKindFromRedirect(redirectPath ?? statePath)
  const afterAuth = postAuthDestination(
    searchParams,
    loginHint === 'nanny' ? claimPathWithToken(getPersistedClaimToken()) : statePath ?? '/',
  )
  const redirectQuery = redirectPath ? `?${authRedirectQuery(redirectPath)}` : ''

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to={afterAuth} replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate(afterAuth, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to manage your nanny household">
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-[var(--color-muted-foreground)]">
            No account?{' '}
            <Link
              to={`/signup${redirectQuery}`}
              className="font-semibold text-[var(--color-primary)] hover:underline"
            >
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
