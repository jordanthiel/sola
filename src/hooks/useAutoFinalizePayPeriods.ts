import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useEmploymentSettings, useNannies } from '@/hooks/useHouseholdData'
import { useMyNannyAccess } from '@/hooks/useMyNannyAccess'
import { invalidateAdvanceQueries } from '@/lib/invalidate-advances'
import { runDueAutoFinalizations } from '@/lib/run-auto-finalize'

/** When a parent has auto-finalize enabled, close due pay periods on app load. */
export function useAutoFinalizePayPeriods() {
  const { activeHousehold, isNannyPreview, loading } = useHousehold()
  const { isDeactivated } = useMyNannyAccess()
  const { data: nannies } = useNannies()
  const { data: settings } = useEmploymentSettings()
  const qc = useQueryClient()
  const ranForHousehold = useRef<string | null>(null)

  useEffect(() => {
    if (loading || isNannyPreview || isDeactivated) return
    if (!activeHousehold || !nannies || !settings) return
    if (!settings.some((s) => s.auto_finalize_pay_periods)) return
    if (ranForHousehold.current === activeHousehold.id) return

    ranForHousehold.current = activeHousehold.id
    let cancelled = false

    void runDueAutoFinalizations({
      householdId: activeHousehold.id,
      householdName: activeHousehold.name,
      nannies,
      settings,
    })
      .then((closed) => {
        if (cancelled || closed <= 0) return
        invalidateAdvanceQueries(qc)
        void qc.invalidateQueries({ queryKey: ['pay_period_close'] })
        void qc.invalidateQueries({ queryKey: ['pay_period_closes'] })
      })
      .catch((err) => {
        console.error('Auto-finalize pay periods failed', err)
        ranForHousehold.current = null
      })

    return () => {
      cancelled = true
    }
  }, [
    activeHousehold,
    isDeactivated,
    isNannyPreview,
    loading,
    nannies,
    qc,
    settings,
  ])
}
