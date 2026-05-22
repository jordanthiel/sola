import type { PostgrestError } from '@supabase/supabase-js'

export function formatSupabaseError(err: unknown): string {
  if (!err || typeof err !== 'object') {
    return 'Something went wrong. Please try again.'
  }

  const e = err as PostgrestError & { message?: string }
  const message = e.message ?? 'Something went wrong. Please try again.'

  if (e.code === '23505' || (e as { status?: number }).status === 409) {
    return 'Your nanny profile is already linked to this household. Refresh the page or open your invite link again.'
  }

  if (message.includes('Not authenticated')) {
    return 'Your session expired. Please sign in again.'
  }

  if (e.code === 'PGRST202') {
    return 'The claim-link feature is not available on this database. Run: npx supabase migration up'
  }

  if (e.details) {
    return `${message} (${e.details})`
  }

  return message
}

/** Claim RPC or unique constraint when the nanny is already linked to a household. */
export function isAlreadyLinkedClaimError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as PostgrestError & { status?: number; statusCode?: number }
  if (e.code === '23505') return true
  const httpStatus = e.status ?? e.statusCode
  if (httpStatus === 409) return true
  const message = (e.message ?? '').toLowerCase()
  return (
    message.includes('already claimed') ||
    message.includes('already linked') ||
    message.includes('duplicate key') ||
    message.includes('conflict')
  )
}
