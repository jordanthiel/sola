const STORAGE_KEY = 'nanny_claim_token'

/** Save token so login/signup redirect can return to /claim?token=... */
export function persistClaimToken(token: string) {
  const trimmed = token.trim()
  if (trimmed) sessionStorage.setItem(STORAGE_KEY, trimmed)
}

export function getPersistedClaimToken(): string {
  return sessionStorage.getItem(STORAGE_KEY) ?? ''
}

export function clearPersistedClaimToken() {
  sessionStorage.removeItem(STORAGE_KEY)
}

export function claimPathWithToken(token?: string | null): string {
  const t = (token ?? getPersistedClaimToken()).trim()
  return t ? `/claim?token=${encodeURIComponent(t)}` : '/claim'
}
