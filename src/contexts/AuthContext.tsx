import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { clearLocalAuthSession, resolveValidSession } from '@/lib/auth-session'
import { clearPersistedClaimToken } from '@/lib/claim-link'
import { supabase } from '@/lib/supabase'
import { fetchMySessionContext } from '@/lib/session-context'
import { effectiveAccountKind, type AccountKind, type SessionContext } from '@/types/account'
import type { Profile } from '@/types/database'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  accountKind: AccountKind
  sessionContext: SessionContext | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string, accountKind?: AccountKind) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const EMPTY_SESSION: SessionContext = {
  account_kind: 'unset',
  household_id: null,
  household_name: null,
  member_role: null,
  has_household_access: false,
}

function displayNameFromUser(user: User): string {
  const meta = user.user_metadata?.display_name
  if (typeof meta === 'string' && meta.trim()) return meta.trim()
  return user.email?.split('@')[0] ?? 'User'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sessionContext, setSessionContext] = useState<SessionContext | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    const uid = session?.user?.id
    const user = session?.user
    if (!uid || !user) {
      setProfile(null)
      return
    }

    const { data: existing, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle()

    if (error) {
      console.warn('Failed to load profile:', error.message)
      setProfile(null)
      return
    }

    if (existing) {
      setProfile(existing)
      return
    }

    const metaKind = user.user_metadata?.account_kind
    const accountKind =
      metaKind === 'nanny' || metaKind === 'family' ? (metaKind as AccountKind) : 'unset'

    const { data: created, error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: uid,
        display_name: displayNameFromUser(user),
        account_kind: accountKind,
      })
      .select()
      .maybeSingle()

    if (insertError) {
      console.warn('Failed to create profile:', insertError.message)
      if (insertError.code === '23503') {
        await clearLocalAuthSession()
        setProfile(null)
        setSession(null)
        setSessionContext(null)
      }
      return
    }

    setProfile(created)
  }, [session?.user])

  const refreshSession = useCallback(async () => {
    if (!session?.user) {
      setSessionContext(null)
      return
    }

    try {
      const ctx = await fetchMySessionContext(session.user.id)
      setSessionContext(ctx)
    } catch (err) {
      console.warn('Failed to load session context:', err)
      setSessionContext(EMPTY_SESSION)
    }
  }, [session?.user])

  const refreshAll = useCallback(async () => {
    await refreshProfile()
    await refreshSession()
  }, [refreshProfile, refreshSession])

  useEffect(() => {
    let mounted = true

    void resolveValidSession().then((validSession) => {
      if (!mounted) return
      setSession(validSession)
      setLoading(false)
    })

    // Do not call getUser() inside this handler — it can deadlock with the auth client.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return
      if (event === 'SIGNED_OUT' || !s) {
        setSession(null)
        setProfile(null)
        setSessionContext(null)
        return
      }
      setSession(s)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      setSessionContext(null)
      return
    }

    void refreshAll()
  }, [session?.user?.id, refreshAll])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUp = useCallback(
    async (email: string, password: string, displayName: string, accountKind: AccountKind = 'unset') => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            display_name: displayName,
            account_kind: accountKind,
          },
        },
      })
      if (error) {
        if (error.message.toLowerCase().includes('already registered')) {
          throw new Error('An account with this email already exists. Sign in instead.')
        }
        throw error
      }
      if (!data.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        })
        if (signInError) {
          throw new Error(
            'Account created. Check your email to confirm, or sign in if you already have an account.',
          )
        }
      }
    },
    [],
  )

  const signOut = useCallback(async () => {
    clearPersistedClaimToken()
    await clearLocalAuthSession()
    setSession(null)
    setProfile(null)
    setSessionContext(null)
  }, [])

  const accountKind = effectiveAccountKind(profile?.account_kind, sessionContext)

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      accountKind,
      sessionContext,
      loading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      refreshSession: refreshAll,
    }),
    [
      session,
      profile,
      accountKind,
      sessionContext,
      loading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      refreshAll,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
