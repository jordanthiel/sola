import { supabase } from '@/lib/supabase'
import { fetchMyHouseholds } from '@/lib/household-membership'
import { formatSupabaseError, isAlreadyLinkedClaimError } from '@/lib/errors'

/** True when list_my_households returns a nanny household (active or deactivated). */
export async function nannyHasAppAccess(userId: string): Promise<boolean> {
  try {
    const { households, memberships } = await fetchMyHouseholds(userId)
    return households.length > 0 && memberships.some((m) => m.role === 'nanny')
  } catch (err) {
    console.warn('nannyHasAppAccess:', err)
    return false
  }
}

export type NannyClaimResult =
  | { status: 'linked'; householdId: string }
  | { status: 'needs_token' }
  | { status: 'error'; message: string }

/**
 * Claim invite token, then confirm the app can load the nanny household.
 * Does not clear persisted token — caller does that after a verified redirect.
 */
export async function runNannyClaim(userId: string, token: string): Promise<NannyClaimResult> {
  const trimmed = token.trim()
  if (!trimmed) return { status: 'needs_token' }

  if (await nannyHasAppAccess(userId)) {
    const { households } = await fetchMyHouseholds(userId)
    return { status: 'linked', householdId: households[0]!.id }
  }

  try {
    const { data: householdId, error } = await supabase.rpc('claim_nanny_profile', {
      p_claim_token: trimmed,
    })
    if (error) throw error

    if (await nannyHasAppAccess(userId)) {
      return { status: 'linked', householdId: (householdId as string) ?? '' }
    }

    return {
      status: 'error',
      message:
        'Your profile was updated but the app still cannot load your household. Sign out, open the invite link again, and ensure you sign in with the email on the nanny profile.',
    }
  } catch (err) {
    if (isAlreadyLinkedClaimError(err)) {
      if (await nannyHasAppAccess(userId)) {
        const { households } = await fetchMyHouseholds(userId)
        return { status: 'linked', householdId: households[0]!.id }
      }
      // RPC may have partially applied before a unique constraint; retry once
      try {
        const { data: householdId, error: retryError } = await supabase.rpc('claim_nanny_profile', {
          p_claim_token: trimmed,
        })
        if (!retryError && (await nannyHasAppAccess(userId))) {
          const { households } = await fetchMyHouseholds(userId)
          return {
            status: 'linked',
            householdId: (householdId as string) || households[0]!.id,
          }
        }
      } catch {
        // fall through to friendly message
      }
      if (await nannyHasAppAccess(userId)) {
        const { households } = await fetchMyHouseholds(userId)
        return { status: 'linked', householdId: households[0]!.id }
      }
      return {
        status: 'error',
        message:
          'This profile is already linked, but the app cannot load your household yet. Sign out, open the invite link again, and use the same email as on your nanny profile.',
      }
    }
    return { status: 'error', message: formatSupabaseError(err) }
  }
}
