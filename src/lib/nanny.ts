import type { HouseholdNanny } from '@/types/household-nanny'

export function nannyDisplayName(n: Pick<HouseholdNanny, 'first_name' | 'last_name'>): string {
  return [n.first_name, n.last_name].filter(Boolean).join(' ')
}

export function isNannyClaimed(n: HouseholdNanny): boolean {
  return !!n.user_id && !!n.claimed_at
}

export function isNannyActive(n: Pick<HouseholdNanny, 'deactivated_at'>): boolean {
  return !n.deactivated_at
}

export type NannyInviteStatus = 'linked' | 'not_invited' | 'pending' | 'expired'

export function getNannyInviteStatus(n: HouseholdNanny): NannyInviteStatus {
  if (isNannyClaimed(n)) return 'linked'
  if (!n.claim_invite_sent_at) return 'not_invited'
  if (n.claim_token_expires_at && new Date(n.claim_token_expires_at) <= new Date()) {
    return 'expired'
  }
  return 'pending'
}

export function nannyInviteStatusLabel(status: NannyInviteStatus): string {
  switch (status) {
    case 'linked':
      return 'Account linked'
    case 'not_invited':
      return 'Not invited'
    case 'pending':
      return 'Invite sent'
    case 'expired':
      return 'Invite expired'
  }
}

export function nannyInviteStatusVariant(
  status: NannyInviteStatus,
): 'success' | 'warning' | 'secondary' | 'destructive' {
  switch (status) {
    case 'linked':
      return 'success'
    case 'pending':
      return 'warning'
    case 'expired':
      return 'destructive'
    default:
      return 'secondary'
  }
}
