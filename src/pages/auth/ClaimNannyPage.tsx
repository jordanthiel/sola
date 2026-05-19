import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatSupabaseError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ClaimNannyPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { user } = useAuth()
  const { refreshHouseholds } = useHousehold()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function claim() {
    if (!token) {
      setError('Missing claim link')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { error: fnError } = await supabase.rpc('claim_nanny_profile', {
        p_claim_token: token,
      })
      if (fnError) throw fnError
      await refreshHouseholds()
      navigate('/', { replace: true })
    } catch (err) {
      setError(formatSupabaseError(err))
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Claim your nanny profile</CardTitle>
            <CardDescription>
              Sign in or create an account using the email your family has on file, then return to this link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full">
              <Link to={`/login?redirect=/claim?token=${encodeURIComponent(token)}`}>Sign in</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to={`/signup?redirect=/claim?token=${encodeURIComponent(token)}`}>Sign up</Link>
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
            Link this account to your household so you can view schedules, log hours, and record activities.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button className="w-full" onClick={claim} disabled={loading || !token}>
            {loading ? 'Claiming...' : 'Claim profile'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

