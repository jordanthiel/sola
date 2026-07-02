import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useFeatureAccess } from '@/hooks/useFeatureAccess'
import { FEATURE_KEYS } from '@/lib/feature-gates'
import { formatSupabaseError } from '@/lib/errors'
import {
  acceptGustoTerms,
  createGustoCompany,
  demoApproveGustoCompany,
  getGustoStatus,
} from '@/lib/gusto-api'
import { GustoSetupWizard } from '@/components/settings/GustoSetupWizard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function onboardingStatusLabel(status: string) {
  switch (status) {
    case 'terms_required':
      return 'Terms required'
    case 'setup_in_progress':
      return 'Setup in progress'
    case 'awaiting_approval':
      return 'Awaiting approval'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    default:
      return status
  }
}

export function GustoSettingsPage() {
  const { user, profile } = useAuth()
  const { activeHousehold } = useHousehold()
  const householdId = activeHousehold?.id ?? ''
  const { data: hasAccess, isLoading: accessLoading } = useFeatureAccess(FEATURE_KEYS.gustoPayroll)
  const qc = useQueryClient()

  const [companyName, setCompanyName] = useState(activeHousehold?.name ?? '')
  const [ein, setEin] = useState('')
  const [adminEmail, setAdminEmail] = useState(user?.email ?? '')
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const statusQuery = useQuery({
    queryKey: ['gusto_status', householdId],
    enabled: !!householdId && !!hasAccess,
    queryFn: () => getGustoStatus(householdId),
  })

  const createCompany = useMutation({
    mutationFn: async () => {
      const parts = (profile?.display_name ?? user?.email?.split('@')[0] ?? 'Admin').trim().split(/\s+/)
      const firstName = parts[0] ?? 'Admin'
      const lastName = parts.slice(1).join(' ') || 'User'
      return createGustoCompany(householdId, {
        userEmail: adminEmail.trim(),
        userFirstName: firstName,
        userLastName: lastName,
        companyName: companyName.trim() || activeHousehold!.name,
        ein: ein.trim() || undefined,
      })
    },
    onSuccess: (result) => {
      if (result.companyEin) setEin(result.companyEin)
      toast.success(
        result.einGeneratedForDemo
          ? 'Gusto demo company created. Accept terms to continue setup.'
          : 'Gusto company created. Accept terms to continue setup.',
      )
      void qc.invalidateQueries({ queryKey: ['gusto_status', householdId] })
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const acceptTerms = useMutation({
    mutationFn: () => acceptGustoTerms(householdId, adminEmail.trim() || undefined),
    onSuccess: () => {
      toast.success('Gusto terms accepted')
      void qc.invalidateQueries({ queryKey: ['gusto_status', householdId] })
      void qc.invalidateQueries({ queryKey: ['gusto_setup', householdId] })
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const demoApprove = useMutation({
    mutationFn: () => demoApproveGustoCompany(householdId),
    onSuccess: () => {
      toast.success('Company approved (demo)')
      void qc.invalidateQueries({ queryKey: ['gusto_status', householdId] })
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const company = statusQuery.data?.company

  if (accessLoading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>
  }

  if (!hasAccess) {
    return (
      <div className="space-y-4">
        <PageHeader title="Gusto payroll" subtitle="Official payroll through Gusto Embedded" />
        <Card>
          <CardContent className="py-6 text-sm text-[var(--color-muted-foreground)]">
            Gusto payroll is not enabled for your account yet. Ask an admin to grant access under{' '}
            <Link to="/settings" className="font-medium text-[var(--color-primary)] underline">
              Settings → Feature access
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gusto payroll"
        subtitle="Set up compliant payroll in Soola — data is sent to Gusto via API"
      />

      {statusQuery.data?.gustoEnv === 'demo' && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Gusto demo environment — use test data only. After submitting onboarding, use “Demo: approve
          company”.
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Connection status</CardTitle>
            <CardDescription>
              {company
                ? `Company ${company.company_uuid.slice(0, 8)}… · ${onboardingStatusLabel(company.onboarding_status)}`
                : 'No Gusto company linked to this household yet'}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => statusQuery.refetch()}
            disabled={statusQuery.isFetching}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusQuery.isError && (
            <p className="text-sm text-red-600">{formatSupabaseError(statusQuery.error)}</p>
          )}

          {company && (
            <div className="flex flex-wrap gap-2">
              <Badge variant={company.onboarding_status === 'approved' ? 'default' : 'secondary'}>
                {onboardingStatusLabel(company.onboarding_status)}
              </Badge>
              {company.terms_accepted_at && <Badge variant="secondary">Terms accepted</Badge>}
              {company.approved_at && <Badge variant="secondary">Approved</Badge>}
            </div>
          )}

          {!company && (
            <div className="space-y-4 border-t pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gusto-company-name">Company name</Label>
                  <Input
                    id="gusto-company-name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gusto-admin-email">Payroll admin email</Label>
                  <Input
                    id="gusto-admin-email"
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="gusto-ein">EIN (optional in demo)</Label>
                  <Input
                    id="gusto-ein"
                    placeholder="9-digit EIN — leave blank to auto-generate in demo"
                    value={ein}
                    onChange={(e) => setEin(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  />
                </div>
              </div>
              <Button
                onClick={() => createCompany.mutate()}
                disabled={createCompany.isPending || !adminEmail.trim()}
              >
                {createCompany.isPending ? 'Creating…' : 'Create Gusto company'}
              </Button>
            </div>
          )}

          {company && !company.terms_accepted_at && (
            <div className="space-y-3 border-t pt-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                />
                <span className="text-sm">
                  I agree to the Gusto Embedded Payroll Terms of Service on behalf of this household
                  employer.
                </span>
              </label>
              <Button
                onClick={() => acceptTerms.mutate()}
                disabled={acceptTerms.isPending || !acceptedTerms}
              >
                {acceptTerms.isPending ? 'Accepting…' : 'Accept terms and continue'}
              </Button>
            </div>
          )}

          {company?.terms_accepted_at && company.onboarding_status !== 'approved' && (
            <div className="space-y-4 border-t pt-4">
              {statusQuery.data?.gustoEnv === 'demo' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => demoApprove.mutate()}
                  disabled={demoApprove.isPending}
                >
                  Demo: approve company
                </Button>
              )}
            </div>
          )}

          {company?.onboarding_status === 'approved' && (
            <p className="border-t pt-4 text-sm text-[var(--color-muted-foreground)]">
              Gusto is approved. Link nannies on the{' '}
              <Link to="/payroll" className="font-medium text-[var(--color-primary)] underline">
                Earnings
              </Link>{' '}
              page, then run payroll after closing a pay period.
            </p>
          )}
        </CardContent>
      </Card>

      {company?.terms_accepted_at && company.onboarding_status !== 'approved' && (
        <GustoSetupWizard
          householdId={householdId}
          companyEin={ein || undefined}
          adminEmail={adminEmail}
          onRefreshStatus={() => void statusQuery.refetch()}
        />
      )}
    </div>
  )
}
