import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import type { FederalHolidayKey } from '@/lib/federal-holidays'
import type { HouseholdHoliday } from '@/types/database'

export function useHouseholdHolidays() {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['household_holidays', activeHousehold?.id],
    enabled: !!activeHousehold,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_holidays')
        .select('holiday_key, enabled')
        .eq('household_id', activeHousehold!.id)
      if (error) throw error
      return (data ?? []) as Pick<HouseholdHoliday, 'holiday_key' | 'enabled'>[]
    },
  })
}

export function useSetHouseholdHoliday() {
  const { activeHousehold } = useHousehold()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      holidayKey,
      enabled,
    }: {
      holidayKey: FederalHolidayKey
      enabled: boolean
    }) => {
      const { error } = await supabase.from('household_holidays').upsert(
        {
          household_id: activeHousehold!.id,
          holiday_key: holidayKey,
          enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'household_id,holiday_key' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['household_holidays'] })
    },
  })
}
