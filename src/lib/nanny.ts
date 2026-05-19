import type { HouseholdNanny } from '@/types/household-nanny'

export function nannyDisplayName(n: Pick<HouseholdNanny, 'first_name' | 'last_name'>): string {
  return [n.first_name, n.last_name].filter(Boolean).join(' ')
}

export function isNannyClaimed(n: HouseholdNanny): boolean {
  return !!n.user_id && !!n.claimed_at
}
