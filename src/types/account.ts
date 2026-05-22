export type AccountKind = 'unset' | 'family' | 'nanny'

export type SessionContext = {
  account_kind: AccountKind
  household_id: string | null
  household_name: string | null
  member_role: 'owner' | 'parent' | 'nanny' | null
  has_household_access: boolean
}

export function isFamilyAccount(kind: AccountKind): boolean {
  return kind === 'family'
}

export function isNannyAccount(kind: AccountKind): boolean {
  return kind === 'nanny'
}

/** Prefer membership role over stored profile when they disagree (e.g. owner mis-tagged as nanny). */
export function effectiveAccountKind(
  profileKind: AccountKind | null | undefined,
  session: Pick<SessionContext, 'account_kind' | 'member_role'> | null | undefined,
): AccountKind {
  const role = session?.member_role
  if (role === 'owner' || role === 'parent') return 'family'
  if (role === 'nanny') return 'nanny'
  return session?.account_kind ?? profileKind ?? 'unset'
}

export function accountKindLabel(kind: AccountKind): string {
  switch (kind) {
    case 'family':
      return 'Family'
    case 'nanny':
      return 'Nanny'
    default:
      return 'New account'
  }
}
