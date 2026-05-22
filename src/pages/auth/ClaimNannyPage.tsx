import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useNannyClaim } from '@/hooks/useNannyClaim'
import { authRedirectQuery } from '@/lib/auth-redirect'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function claimUrl(token: string) {
  return token ? `/claim?token=${encodeURIComponent(token)}` : '/claim'
}

export function ClaimNannyPage() {
  const [searchParams] = useSearchParams()
  const token = (searchParams.get('token') ?? '').trim()
  const { user } = useAuth()
  const { error, claiming, tryClaim, authLoading } = useNannyClaim(token)
  const authQuery = authRedirectQuery(claimUrl(token))

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-[var(--color-muted-foreground)]">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Claim your nanny profile</CardTitle>
            <CardDescription>
              Sign in or create an account with the same email your family used for this nanny profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full">
              <Link to={`/login?${authQuery}`}>Sign in</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to={`/signup?${authQuery}`}>Sign up</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Claim your nanny profile</CardTitle>
          <CardDescription>
            {claiming
              ? 'Linking your account...'
              : token
                ? 'Connecting you to your household.'
                : 'Use the invite link from your email (it includes a token in the URL).'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!claiming && token && error && (
            <Button className="w-full" onClick={() => void tryClaim(token)}>
              Try again
            </Button>
          )}
          {!claiming && !error && token && (
            <Button className="w-full" onClick={() => void tryClaim(token)}>
              Link my profile
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
