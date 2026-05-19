import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function AcceptInvitePage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { user } = useAuth()
  const { refreshHouseholds } = useHousehold()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function accept() {
    if (!token) {
      setError('Missing invite token')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data, error: fnError } = await supabase.rpc('accept_household_invite', {
        invite_token: token,
      })
      if (fnError) throw fnError
      await refreshHouseholds()
      navigate('/', { replace: true })
      void data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept invite')
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Household invite</CardTitle>
            <CardDescription>Sign in or create an account to accept this invite.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full">
              <Link to={`/login?redirect=/invite?token=${token}`}>Sign in</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to={`/signup`}>Sign up</Link>
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
          <CardTitle>Join household</CardTitle>
          <CardDescription>Accept your invitation to join as nanny.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button className="w-full" onClick={accept} disabled={loading || !token}>
            {loading ? 'Joining...' : 'Accept invite'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
