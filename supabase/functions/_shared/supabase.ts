import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function getServiceSupabase() {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    ''
  if (!url || !key) throw new Error('Missing Supabase service credentials')
  return createClient(url, key)
}

export function getUserSupabase(authHeader: string) {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key =
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
    Deno.env.get('SUPABASE_ANON_KEY') ??
    ''
  if (!url || !key) throw new Error('Missing Supabase publishable credentials')
  return createClient(url, key, {
    global: { headers: { Authorization: authHeader } },
  })
}

export async function requireParentForHousehold(
  authHeader: string,
  householdId: string,
): Promise<{ userId: string }> {
  const supabase = getUserSupabase(authHeader)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')

  const { data: member, error: memberError } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', householdId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (memberError || !member || !['owner', 'parent'].includes(member.role)) {
    throw new Error('Forbidden: parent access required')
  }

  return { userId: user.id }
}

export async function getCompanyTokens(householdId: string) {
  const admin = getServiceSupabase()
  const { data, error } = await admin
    .from('gusto_companies')
    .select('*')
    .eq('household_id', householdId)
    .maybeSingle()
  if (error) {
    console.error('getCompanyTokens failed', {
      householdId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })
    throw error
  }
  if (!data) return null
  return data as {
    id: string
    company_uuid: string
    access_token: string
    refresh_token: string
    approved_at: string | null
  }
}

export async function withFreshCompanyToken(
  householdId: string,
  fn: (token: string, companyUuid: string) => Promise<unknown>,
) {
  const admin = getServiceSupabase()
  const row = await getCompanyTokens(householdId)
  if (!row) throw new Error('Gusto payroll not set up for this household')

  let accessToken = row.access_token
  let refreshToken = row.refresh_token

  try {
    return await fn(accessToken, row.company_uuid)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('401') && !msg.includes('Unauthorized')) throw e
  }

  const { refreshCompanyAccessToken } = await import('./gusto.ts')
  const refreshed = await refreshCompanyAccessToken(refreshToken)
  accessToken = refreshed.access_token
  refreshToken = refreshed.refresh_token

  await admin
    .from('gusto_companies')
    .update({
      access_token: accessToken,
      refresh_token: refreshToken,
      updated_at: new Date().toISOString(),
    })
    .eq('household_id', householdId)

  return fn(accessToken, row.company_uuid)
}
