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

export async function requireNannyForHousehold(
  authHeader: string,
  householdId: string,
  householdNannyId?: string,
): Promise<{ userId: string; householdNannyId: string }> {
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

  if (memberError || !member || member.role !== 'nanny') {
    throw new Error('Forbidden: nanny access required')
  }

  const admin = getServiceSupabase()
  const { data: nanny, error: nannyError } = await admin
    .from('household_nannies')
    .select('id, user_id, deactivated_at')
    .eq('household_id', householdId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (nannyError || !nanny || nanny.deactivated_at) {
    throw new Error('Forbidden: nanny profile not found for this household')
  }

  if (householdNannyId && nanny.id !== householdNannyId) {
    throw new Error('Forbidden: nanny profile mismatch')
  }

  return { userId: user.id, householdNannyId: nanny.id }
}
