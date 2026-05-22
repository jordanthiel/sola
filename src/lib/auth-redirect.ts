import type { AccountKind } from '@/types/account'

/** Safe in-app path from ?redirect= (avoids open redirects). */
export function getPostAuthRedirect(searchParams: URLSearchParams): string | null {
  const redirect = searchParams.get('redirect')
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) {
    return null
  }
  return redirect
}

export function postAuthDestination(
  searchParams: URLSearchParams,
  fallback: string,
): string {
  return getPostAuthRedirect(searchParams) ?? fallback
}

export function authRedirectQuery(redirectPath: string): string {
  return `redirect=${encodeURIComponent(redirectPath)}`
}

/** Infer intended account type from post-auth redirect path. */
export function accountKindFromRedirect(redirectPath: string | null): AccountKind {
  if (!redirectPath) return 'unset'
  if (redirectPath.startsWith('/claim')) return 'nanny'
  if (redirectPath.startsWith('/invite')) return 'family'
  return 'unset'
}
