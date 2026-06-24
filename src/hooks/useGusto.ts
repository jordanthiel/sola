import { useQuery } from '@tanstack/react-query'
import { useHousehold } from '@/contexts/HouseholdContext'
import { supabase } from '@/lib/supabase'
import { fetchGustoStatus, type PayrollRun } from '@/lib/gusto-api'

export function useGustoStatus() {
  const { activeHousehold, isParent } = useHousehold()
  return useQuery({
    queryKey: ['gusto-status', activeHousehold?.id],
    queryFn: () => fetchGustoStatus(activeHousehold!.id),
    enabled: !!activeHousehold?.id && isParent,
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
  })
}

export function usePayrollRun(payPeriodCloseId?: string) {
  const { activeHousehold } = useHousehold()
  return useQuery({
    queryKey: ['payroll-run', activeHousehold?.id, payPeriodCloseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_runs')
        .select('*')
        .eq('pay_period_close_id', payPeriodCloseId!)
        .maybeSingle()
      if (error) throw error
      return data as PayrollRun | null
    },
    enabled: !!activeHousehold?.id && !!payPeriodCloseId,
  })
}

