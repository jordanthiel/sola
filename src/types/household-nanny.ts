export interface HouseholdNanny {
  id: string
  household_id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  notes: string | null
  user_id: string | null
  claim_token: string | null
  claim_token_expires_at: string | null
  claim_invite_sent_at: string | null
  claim_invite_sent_by: string | null
  claimed_at: string | null
  deactivated_at: string | null
  deactivated_by: string | null
  start_date: string
  created_at: string
  updated_at: string
}
