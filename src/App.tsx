import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { queryClient } from '@/lib/query-client'
import { AuthProvider } from '@/contexts/AuthContext'
import { HouseholdProvider } from '@/contexts/HouseholdContext'
import { RequireAuth } from '@/components/routes/RequireAuth'
import { RequireAccountSetup } from '@/components/routes/RequireAccountSetup'
import { RequireHousehold } from '@/components/routes/RequireHousehold'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/auth/Login'
import { SignupPage } from '@/pages/auth/Signup'
import { AcceptInvitePage } from '@/pages/auth/AcceptInvite'
import { ClaimNannyPage } from '@/pages/auth/ClaimNannyPage'
import { CreateHouseholdPage } from '@/pages/onboarding/CreateHousehold'
import { OnboardingSetupPage } from '@/pages/onboarding/OnboardingSetupPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { SchedulePage } from '@/pages/schedule/SchedulePage'
import { PayrollPage } from '@/pages/payroll/PayrollPage'
import { TimeOffPage } from '@/pages/time-off/TimeOffPage'
import { ChildrenPage } from '@/pages/children/ChildrenPage'
import { ActivitiesPage } from '@/pages/activities/ActivitiesPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { GustoSettingsPage } from '@/pages/settings/GustoSettingsPage'
import { NannyPage } from '@/pages/settings/NannyPage'
import { DocumentsPage } from '@/pages/documents/DocumentsPage'
import { FeedPage } from '@/pages/feed/FeedPage'
import { IncidentsPage } from '@/pages/incidents/IncidentsPage'
import { AdvanceDetailPage } from '@/pages/advances/AdvanceDetailPage'
import { HomeRoute } from '@/components/routes/HomeRoute'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HouseholdProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/invite" element={<AcceptInvitePage />} />
              <Route path="/claim" element={<ClaimNannyPage />} />

              <Route element={<RequireAuth />}>
                <Route element={<RequireAccountSetup />}>
                  <Route path="/onboarding" element={<CreateHouseholdPage />} />
                  <Route path="/onboarding/setup" element={<OnboardingSetupPage />} />
                  <Route element={<RequireHousehold />}>
                    <Route element={<AppShell />}>
                      <Route path="dashboard" element={<DashboardPage />} />
                      <Route path="schedule" element={<SchedulePage />} />
                      <Route path="hours" element={<Navigate to="/schedule" replace />} />
                      <Route path="payroll" element={<PayrollPage />} />
                      <Route path="payroll/advances/:advanceId" element={<AdvanceDetailPage />} />
                      <Route path="time-off" element={<TimeOffPage />} />
                      <Route path="children" element={<ChildrenPage />} />
                      <Route path="activities" element={<ActivitiesPage />} />
                      <Route path="documents" element={<DocumentsPage />} />
                      <Route path="feed" element={<FeedPage />} />
                      <Route path="incidents" element={<IncidentsPage />} />
                      <Route path="settings" element={<SettingsPage />} />
                      <Route path="settings/gusto" element={<GustoSettingsPage />} />
                      <Route path="settings/nannies/:nannyId" element={<NannyPage />} />
                    </Route>
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
