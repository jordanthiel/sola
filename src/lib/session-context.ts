import { supabase } from '@/lib/supabase'
import { fetchMyHouseholds } from '@/lib/household-membership'
import type { AccountKind, SessionContext } from '@/types/account'

const EMPTY_SESSION: SessionContext = {
  account_kind: 'unset',
  household_id: null,
  household_name: null,
  member_role: null,
  has_household_access: false,
}

function roleRank(role: SessionContext['member_role']): number {
  if (role === 'owner') return 0
  if (role === 'parent') return 1
  return 2
}

function sessionFromHouseholdList(
  accountKind: AccountKind,
  rows: Awaited<ReturnType<typeof fetchMyHouseholds>>,
): SessionContext {
  const { households, memberships } = rows
  if (households.length === 0) {
    return { ...EMPTY_SESSION, account_kind: accountKind }
  }

  let bestIdx = 0
  for (let i = 1; i < households.length; i++) {
    const a = memberships[i]?.role ?? 'nanny'
    const b = memberships[bestIdx]?.role ?? 'nanny'
    if (roleRank(a) < roleRank(b)) bestIdx = i
  }

  const household = households[bestIdx]
  const membership = memberships[bestIdx]
  return {
    account_kind: accountKind,
    household_id: household.id,
    household_name: household.name,
    member_role: membership?.role ?? null,
    has_household_access: true,
  }
}

export async function fetchMySessionContext(userId?: string): Promise<SessionContext> {
  const { data, error } = await supabase.rpc('get_my_session_context')

  if (!error) {
    const row = Array.isArray(data) ? data[0] : data
    if (row?.has_household_access === true) {
      return {
        account_kind: row.account_kind ?? 'unset',
        household_id: row.household_id ?? null,
        household_name: row.household_name ?? null,
        member_role: row.member_role ?? null,
        has_household_access: true,
      }
    }
  } else {
    console.warn('get_my_session_context failed, using household list fallback:', error.message)
  }

  if (!userId) return EMPTY_SESSION

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_kind')
    .eq('id', userId)
    .maybeSingle()

  const accountKind = (profile?.account_kind as AccountKind | undefined) ?? 'unset'

  try {
    const listed = await fetchMyHouseholds(userId)
    return sessionFromHouseholdList(accountKind, listed)
  } catch (listErr) {
    console.warn('list_my_households fallback failed:', listErr)
    return { ...EMPTY_SESSION, account_kind: accountKind }
  }
}
