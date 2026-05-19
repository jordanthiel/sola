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
  claimed_at: string | null
  created_at: string
  updated_at: string
}
