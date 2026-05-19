import type { PostgrestError } from '@supabase/supabase-js'

export function formatSupabaseError(err: unknown): string {
  if (!err || typeof err !== 'object') {
    return 'Something went wrong. Please try again.'
  }

  const e = err as PostgrestError & { message?: string }
  const message = e.message ?? 'Something went wrong. Please try again.'

  if (e.code === '23505') {
    return 'This record already exists. Try signing in or refresh the page.'
  }

  if (message.includes('Not authenticated')) {
    return 'Your session expired. Please sign in again.'
  }

  if (e.details) {
    return `${message} (${e.details})`
  }

  return message
}
