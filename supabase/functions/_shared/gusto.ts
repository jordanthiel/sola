/** Gusto Embedded API helpers for Edge Functions */

export type GustoEnv = 'demo' | 'production'

export function gustoApiBase(env: GustoEnv): string {
  return env === 'production' ? 'https://api.gusto.com' : 'https://api.gusto-demo.com'
}

export function getGustoEnv(): GustoEnv {
  const env = Deno.env.get('GUSTO_ENV') ?? Deno.env.get('GUST_ENV')
  if (!Deno.env.get('GUSTO_ENV') && Deno.env.get('GUST_ENV')) {
    console.warn('gusto: GUST_ENV is set but GUSTO_ENV is not — use GUSTO_ENV=demo in supabase/functions/.env')
  }
  return env === 'production' ? 'production' : 'demo'
}

/** Must be >= your Gusto Embedded application's minimum API version (dev portal). */
export function getGustoApiVersion(): string {
  return Deno.env.get('GUSTO_API_VERSION') ?? '2026-02-01'
}

export function getGustoCredentials() {
  const clientId = Deno.env.get('GUSTO_CLIENT_ID') ?? ''
  const clientSecret = Deno.env.get('GUSTO_CLIENT_SECRET') ?? ''
  if (!clientId || !clientSecret) {
    throw new Error(
      'Gusto not configured: set GUSTO_CLIENT_ID and GUSTO_CLIENT_SECRET in supabase/functions/.env',
    )
  }
  return { clientId, clientSecret }
}

export async function gustoFetch(
  path: string,
  options: {
    method?: string
    token: string
    body?: unknown
    apiVersion?: string
  },
): Promise<Response> {
  const base = gustoApiBase(getGustoEnv())
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.token}`,
    Accept: 'application/json',
  }
  headers['X-Gusto-API-Version'] = options.apiVersion ?? getGustoApiVersion()
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  return fetch(`${base}${path}`, {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
}

export async function parseGustoJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Gusto returned non-JSON (${res.status}): ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    const err = data as {
      error?: string
      message?: string
      errors?: Array<{ message?: string; category?: string }>
    }
    const firstError = Array.isArray(err?.errors) ? err.errors[0]?.message : undefined
    const msg =
      firstError ??
      err?.message ??
      err?.error ??
      (typeof err?.errors === 'string' ? err.errors : JSON.stringify(data))
    console.error('gusto API error response', {
      status: res.status,
      statusText: res.statusText,
      apiVersion: getGustoApiVersion(),
      body: text.slice(0, 2000),
    })
    throw new Error(`Gusto API ${res.status}: ${msg}`)
  }
  return data as T
}

export interface SystemTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export async function getSystemAccessToken(): Promise<string> {
  const { clientId, clientSecret } = getGustoCredentials()
  const base = gustoApiBase(getGustoEnv())
  const res = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'system_access',
    }),
  })
  const data = await parseGustoJson<SystemTokenResponse>(res)
  return data.access_token
}

export interface RefreshTokenResponse {
  access_token: string
  refresh_token: string
}

export async function refreshCompanyAccessToken(refreshToken: string): Promise<RefreshTokenResponse> {
  const { clientId, clientSecret } = getGustoCredentials()
  const base = gustoApiBase(getGustoEnv())
  const res = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  return parseGustoJson<RefreshTokenResponse>(res)
}

export interface PartnerManagedCompanyResponse {
  company_uuid: string
  access_token: string
  refresh_token: string
}

export interface OnboardingStatusResponse {
  onboarding_steps: Record<string, { completed?: boolean; title?: string }>
}

export function mapGustoOnboardingToStatus(
  steps: OnboardingStatusResponse['onboarding_steps'],
  approvedAt: string | null,
): 'pending' | 'terms_required' | 'setup_in_progress' | 'awaiting_approval' | 'approved' | 'rejected' {
  if (approvedAt) return 'approved'
  const values = Object.values(steps ?? {})
  if (values.length === 0) return 'pending'
  const allComplete = values.every((s) => s.completed === true)
  if (allComplete) return 'awaiting_approval'
  return 'setup_in_progress'
}
