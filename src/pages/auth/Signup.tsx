import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
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

export function SignupPage() {
  const { signUp, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectPath = getPostAuthRedirect(searchParams)
  const signupAccountKind = accountKindFromRedirect(redirectPath)
  const afterAuth =
    signupAccountKind === 'nanny'
      ? redirectPath ?? claimPathWithToken(getPersistedClaimToken())
      : postAuthDestination(searchParams, '/onboarding')
  const redirectQuery = redirectPath ? `?${authRedirectQuery(redirectPath)}` : ''

  const [displayName, setDisplayName] = useState('')
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
      await signUp(email, password, displayName, signupAccountKind)
      navigate(afterAuth, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle={
        redirectPath
          ? 'Create an account to accept your invitation'
          : 'Start managing your nanny household in minutes'
      }
    >
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
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
                minLength={6}
                required
              />
            </div>
            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Creating...' : redirectPath ? 'Create account & continue' : 'Get started'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-[var(--color-muted-foreground)]">
            Already have an account?{' '}
            <Link
              to={`/login${redirectQuery}`}
              className="font-semibold text-[var(--color-primary)] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
