import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { queryClient } from '@/lib/query-client'
import { AuthProvider } from '@/contexts/AuthContext'
import { HouseholdProvider } from '@/contexts/HouseholdContext'
import { RequireAuth } from '@/components/routes/RequireAuth'
import { RequireHousehold } from '@/components/routes/RequireHousehold'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/auth/Login'
import { SignupPage } from '@/pages/auth/Signup'
import { AcceptInvitePage } from '@/pages/auth/AcceptInvite'
import { ClaimNannyPage } from '@/pages/auth/ClaimNannyPage'
import { CreateHouseholdPage } from '@/pages/onboarding/CreateHousehold'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { SchedulePage } from '@/pages/schedule/SchedulePage'
import { PayrollPage } from '@/pages/payroll/PayrollPage'
import { TimeOffPage } from '@/pages/time-off/TimeOffPage'
import { ChildrenPage } from '@/pages/children/ChildrenPage'
import { ActivitiesPage } from '@/pages/activities/ActivitiesPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HouseholdProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/invite" element={<AcceptInvitePage />} />
              <Route path="/claim" element={<ClaimNannyPage />} />

              <Route element={<RequireAuth />}>
                <Route path="/onboarding" element={<CreateHouseholdPage />} />
                <Route element={<RequireHousehold />}>
                  <Route element={<AppShell />}>
                    <Route index element={<DashboardPage />} />
                    <Route path="schedule" element={<SchedulePage />} />
                    <Route path="hours" element={<Navigate to="/schedule" replace />} />
                    <Route path="payroll" element={<PayrollPage />} />
                    <Route path="time-off" element={<TimeOffPage />} />
                    <Route path="children" element={<ChildrenPage />} />
                    <Route path="activities" element={<ActivitiesPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Route>
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </HouseholdProvider>
      </AuthProvider>
      <Toaster position="top-right" />
    </QueryClientProvider>
  )
}
