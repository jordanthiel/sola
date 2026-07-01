import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { FeatureKey } from '@/lib/feature-gates'

export function useFeatureAccess(featureKey: FeatureKey | string) {
  return useQuery({
    queryKey: ['feature_access', featureKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('user_has_feature', {
        p_feature_key: featureKey,
      })
      if (error) throw error
      return !!data
    },
    staleTime: 60_000,
  })
}
