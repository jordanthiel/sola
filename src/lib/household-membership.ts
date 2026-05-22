import { supabase } from '@/lib/supabase'
import type { Household, HouseholdMember, MemberRole } from '@/types/database'

export type MyHouseholdRow = {
  id: string
  name: string
  timezone: string
  created_by: string | null
  created_at: string
  updated_at: string
  member_role: MemberRole
}

export function membershipFromHouseholdRow(row: MyHouseholdRow, userId: string): HouseholdMember {
  return {
    id: `member-${row.id}`,
    household_id: row.id,
    user_id: userId,
    role: row.member_role,
    status: 'active',
    created_at: row.created_at,
  }
}

export function householdFromRow(row: MyHouseholdRow): Household {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

type ClaimedNannyProfileRow = {
  household_id: string
  deactivated_at: string | null
}

/** Direct read of claimed nanny profiles (includes deactivated). */
export async function fetchClaimedNannyHouseholdAccess(userId: string): Promise<{
  households: Household[]
  memberships: HouseholdMember[]
}> {
  const { data: profiles, error: profileError } = await supabase
    .from('household_nannies')
    .select('household_id, deactivated_at')
    .eq('user_id', userId)
    .not('claimed_at', 'is', null)

  if (profileError) throw profileError

  const rows = (profiles ?? []) as ClaimedNannyProfileRow[]
  if (!rows.length) return { households: [], memberships: [] }

  const householdIds = [...new Set(rows.map((r) => r.household_id))]
  const { data: householdRows, error: householdError } = await supabase
    .from('households')
    .select('id, name, timezone, created_by, created_at, updated_at')
    .in('id', householdIds)

  if (householdError) {
    console.warn('fetchClaimedNannyHouseholdAccess households:', householdError.message)
  }

  const householdById = Object.fromEntries(
    ((householdRows ?? []) as Household[]).map((h) => [h.id, h]),
  )

  const households: Household[] = []
  const memberships: HouseholdMember[] = []

  for (const row of rows) {
    const household: Household = householdById[row.household_id] ?? {
      id: row.household_id,
      name: 'Household',
      timezone: 'America/New_York',
      created_by: null,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    }

    if (!households.some((h) => h.id === household.id)) {
      households.push(household)
    }

    memberships.push({
      ...membershipFromHouseholdRow(
        {
          id: household.id,
          name: household.name,
          timezone: household.timezone,
          created_by: household.created_by,
          created_at: household.created_at,
          updated_at: household.updated_at,
          member_role: 'nanny',
        },
        userId,
      ),
      status: row.deactivated_at ? 'inactive' : 'active',
    })
  }

  return { households, memberships }
}

/** Primary source: SECURITY DEFINER RPC; falls back to claimed nanny rows (incl. deactivated). */
export async function fetchMyHouseholds(userId: string): Promise<{
  households: Household[]
  memberships: HouseholdMember[]
}> {
  const { data, error } = await supabase.rpc('list_my_households')

  if (!error) {
    const rows = (data ?? []) as MyHouseholdRow[]
    if (rows.length > 0) {
      return {
        households: rows.map(householdFromRow),
        memberships: rows.map((row) => membershipFromHouseholdRow(row, userId)),
      }
    }
  } else {
    console.warn('list_my_households failed, using claimed-nanny fallback:', error.message)
  }

  return fetchClaimedNannyHouseholdAccess(userId)
}

/** Active membership or claimed nanny profile — household id if already linked. */
export async function resolveLinkedHouseholdForUser(userId: string): Promise<string | null> {
  try {
    const { households } = await fetchMyHouseholds(userId)
    if (households[0]?.id) return households[0].id
  } catch (err) {
    console.warn('fetchMyHouseholds failed, falling back:', err)
  }

  const { data: members, error: membersError } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)

  if (membersError) {
    console.warn('resolveLinkedHouseholdForUser memberships:', membersError.message)
  }
  if (members?.[0]?.household_id) {
    return members[0].household_id
  }

  const nannyHouseholdIds = await fetchClaimedNannyHouseholdIds(userId)
  return nannyHouseholdIds[0] ?? null
}

/** Nanny claim flow only — ignores owner/parent households on the same login. */
export async function resolveNannyLinkedHouseholdForUser(userId: string): Promise<string | null> {
  const claimedIds = await fetchClaimedNannyHouseholdIds(userId)
  if (claimedIds[0]) return claimedIds[0]

  try {
    const { memberships } = await fetchMyHouseholds(userId)
    const nannyMember = memberships.find((m) => m.role === 'nanny')
    if (nannyMember) return nannyMember.household_id
  } catch (err) {
    console.warn('resolveNannyLinkedHouseholdForUser list:', err)
  }

  const { data: members, error } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('role', 'nanny')
    .limit(1)

  if (error) {
    console.warn('resolveNannyLinkedHouseholdForUser members:', error.message)
  }
  return members?.[0]?.household_id ?? null
}

export async function fetchClaimedNannyHouseholdIds(
  userId: string,
  options?: { activeOnly?: boolean },
): Promise<string[]> {
  let query = supabase
    .from('household_nannies')
    .select('household_id')
    .eq('user_id', userId)
    .not('claimed_at', 'is', null)

  if (options?.activeOnly) {
    query = query.is('deactivated_at', null)
  }

  const { data, error } = await query
  if (error) throw error
  return [...new Set((data ?? []).map((row) => row.household_id))]
}

export function syntheticNannyMembership(
  householdId: string,
  userId: string,
): HouseholdMember {
  return {
    id: `nanny-${householdId}`,
    household_id: householdId,
    user_id: userId,
    role: 'nanny' as MemberRole,
    status: 'active',
    created_at: new Date(0).toISOString(),
  }
}
