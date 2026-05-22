import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useNannyClaim } from '@/hooks/useNannyClaim'
import { claimPathWithToken, getPersistedClaimToken } from '@/lib/claim-link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/** Nanny is signed in but has no household in the app yet — complete claim here (no redirect loop). */
export function NannyClaimRequired() {
  const { signOut } = useAuth()
  const storedToken = getPersistedClaimToken()
  const { error, claiming, tryClaim } = useNannyClaim(storedToken)
  const claimHref = claimPathWithToken(storedToken)

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Finish joining your household</CardTitle>
          <CardDescription>
            {storedToken
              ? 'We saved your invite — tap below to link this account to your family.'
              : 'Open the invite link from your email to connect this account to your household.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {storedToken ? (
            <>
              <Button
                className="w-full"
                disabled={claiming}
                onClick={() => void tryClaim(storedToken)}
              >
                {claiming ? 'Linking account...' : 'Link my nanny profile'}
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to={claimHref}>Open invite page</Link>
              </Button>
            </>
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              The link looks like: <span className="font-mono text-xs">/claim?token=...</span>
            </p>
          )}
          <Button variant="outline" className="w-full" onClick={() => signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
