import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { clearPersistedClaimToken, persistClaimToken } from '@/lib/claim-link'
import { formatSupabaseError } from '@/lib/errors'
import { nannyHasAppAccess, runNannyClaim } from '@/lib/nanny-claim'

export function useNannyClaim(token: string) {
  const { user, loading: authLoading } = useAuth()
  const [error, setError] = useState('')
  const [claiming, setClaiming] = useState(false)
  const started = useRef(false)

  const finishToApp = useCallback(() => {
    clearPersistedClaimToken()
    window.location.replace('/')
  }, [])

  const tryClaim = useCallback(
    async (claimToken: string) => {
      if (!user) return
      setClaiming(true)
      setError('')
      try {
        const result = await runNannyClaim(user.id, claimToken)
        if (result.status === 'linked') {
          finishToApp()
          return
        }
        if (result.status === 'needs_token') {
          setError('Your invite link is missing the token. Open the full link from your email.')
          return
        }
        setError(result.message)
      } catch (err) {
        setError(formatSupabaseError(err))
      } finally {
        setClaiming(false)
        started.current = false
      }
    },
    [user, finishToApp],
  )

  useEffect(() => {
    if (token) persistClaimToken(token)
  }, [token])

  useEffect(() => {
    if (authLoading || !user || started.current) return
    started.current = true

    void (async () => {
      try {
        if (await nannyHasAppAccess(user.id)) {
          finishToApp()
          return
        }

        if (!token.trim()) {
          started.current = false
          return
        }

        await tryClaim(token)
      } catch (err) {
        setError(formatSupabaseError(err))
        setClaiming(false)
        started.current = false
      }
    })()
  }, [authLoading, user, token, tryClaim, finishToApp])

  return { error, claiming, tryClaim, authLoading }
}
