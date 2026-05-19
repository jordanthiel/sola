import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatSupabaseError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
]

export function CreateHouseholdPage() {
  const { user } = useAuth()
  const { refreshHouseholds, activeHousehold, households, loading: householdLoading, setActiveHouseholdId } =
    useHousehold()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    refreshHouseholds()
  }, [refreshHouseholds])

  useEffect(() => {
    if (!householdLoading && activeHousehold) {
      navigate('/', { replace: true })
    }
  }, [activeHousehold, householdLoading, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || loading) return

    setLoading(true)
    setError('')

    try {
      // If context already has households (e.g. after a successful create), go home
      if (households.length > 0) {
        setActiveHouseholdId(households[0].id)
        navigate('/', { replace: true })
        return
      }

      const { data: householdId, error: rpcError } = await supabase.rpc('create_household_with_owner', {
        p_name: name.trim(),
        p_timezone: timezone,
      })

      if (rpcError) throw rpcError

      if (householdId) {
        setActiveHouseholdId(householdId)
      }

      await refreshHouseholds()
      navigate('/', { replace: true })
    } catch (err) {
      console.error('create_household_with_owner failed:', err)
      setError(formatSupabaseError(err))
    } finally {
      setLoading(false)
    }
  }

  if (householdLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--color-muted-foreground)]">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set up your household</CardTitle>
          <CardDescription>Create a space to manage schedules, hours, and payroll.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Household name</Label>
              <Input
                id="name"
                placeholder="The Smith Family"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tz">Timezone</Label>
              <select
                id="tz"
                className="flex h-10 w-full rounded-md border px-3 text-sm"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating...' : 'Create household'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
