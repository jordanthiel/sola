import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/** Clear cached credentials (works when auth.users row was deleted after db reset). */
export async function clearLocalAuthSession(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // User may already be gone on the server
  }
}

/**
 * getSession() alone can be stale after `supabase db reset`.
 * Confirm the JWT with the auth server before treating the user as signed in.
 */
export async function resolveValidSession(): Promise<Session | null> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData.session) {
    return null
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    await clearLocalAuthSession()
    return null
  }

  return sessionData.session
}
