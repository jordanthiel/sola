export const FEATURE_KEYS = {
  featureGateAdmin: 'feature_gate_admin',
  gustoPayroll: 'gusto_payroll',
} as const

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS]

export type FeatureGateAdminRow = {
  feature_key: string
  label: string
  description: string | null
  open_to_all: boolean
  allowlist_user_ids: string[]
}

export type FeatureGateUser = {
  user_id: string
  email: string
  display_name: string
}
