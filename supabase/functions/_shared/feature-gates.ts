import { getServiceSupabase } from './supabase.ts'

export async function requireFeatureAccess(userId: string, featureKey: string): Promise<void> {
  const admin = getServiceSupabase()
  const { data, error } = await admin.rpc('user_has_feature_for_user', {
    p_user_id: userId,
    p_feature_key: featureKey,
  })

  if (error) throw error
  if (!data) {
    throw new Error('This feature is not available for your account')
  }
}
