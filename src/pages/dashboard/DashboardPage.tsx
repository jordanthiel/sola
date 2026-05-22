import { Navigate } from 'react-router-dom'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useMyNannyAccess } from '@/hooks/useMyNannyAccess'
import { NannyDashboard } from '@/pages/dashboard/NannyDashboard'
import { ParentDashboard } from '@/pages/dashboard/ParentDashboard'

export function DashboardPage() {
  const { isNanny } = useHousehold()
  const { isDeactivated } = useMyNannyAccess()

  if (isDeactivated) {
    return <Navigate to="/payroll" replace />
  }

  return isNanny ? <NannyDashboard /> : <ParentDashboard />
}
