import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Circle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useGustoStatus } from '@/hooks/useGusto'
import {
  acceptGustoTerms,
  createGustoCompany,
  demoApproveGustoCompany,
  syncGustoOnboarding,
  type GustoOnboardingStatus,
} from '@/lib/gusto-api'
import {
  buildGustoFlowPath,
  flowTypeForOnboardingStep,
  normalizeOnboardingSteps,
  type GustoCompanyFlowType,
} from '@/lib/gusto-flows'
import { formatSupabaseError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function statusLabel(status: GustoOnboardingStatus): string {
  switch (status) {
    case 'pending':
      return 'Not started'
    case 'terms_required':
      return 'Accept terms'
    case 'setup_in_progress':
      return 'Setup in progress'
    case 'awaiting_approval':
      return 'Awaiting Gusto approval'
    case 'approved':
      return 'Approved — ready for payroll'
    case 'rejected':
      return 'Rejected'
    default:
      return status
  }
}

export function GustoPayrollSetupCard() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { activeHousehold } = useHousehold()
  const qc = useQueryClient()
  const { data: status, isLoading, refetch } = useGustoStatus()

  const [companyName, setCompanyName] = useState(activeHousehold?.name ?? '')
  const [ein, setEin] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['gusto-status'] })
    qc.invalidateQueries({ queryKey: ['gusto-company'] })
  }

  const createCompany = useMutation({
    mutationFn: async () => {
      if (!user?.email) throw new Error('Your account needs an email address')
      const name = profile?.display_name?.trim() || user.email
      const parts = name.split(/\s+/)
      const firstName = parts[0] ?? 'Household'
      const lastName = parts.slice(1).join(' ') || 'Employer'
      return createGustoCompany({
        householdId: activeHousehold!.id,
        userEmail: user.email,
        userFirstName: firstName,
        userLastName: lastName,
        companyName: companyName.trim() || activeHousehold!.name,
        ein: ein || undefined,
      })
    },
    onSuccess: () => {
      invalidate()
      setAgreedToTerms(false)
      toast.success('Company created — check the box below and accept Gusto terms to continue')
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  })

  const acceptTerms = useMutation({
    mutationFn: async () => {
      if (!user?.email) throw new Error('Your account needs an email address')
      return acceptGustoTerms({
        householdId: activeHousehold!.id,
        userEmail: user.email,
      })
    },
    onSuccess: async () => {
      try {
        await syncGustoOnboarding(activeHousehold!.id)
      } catch {
        /* checklist fills in on next refresh */
      }
      invalidate()
      toast.success('Terms accepted — continue with company setup below')
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  })

  const syncOnboarding = useMutation({
    mutationFn: () => syncGustoOnboarding(activeHousehold!.id),
    onSuccess: () => {
      invalidate()
      toast.success('Onboarding status updated')
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  })

  const demoApprove = useMutation({
    mutationFn: () => demoApproveGustoCompany(activeHousehold!.id),
    onSuccess: () => {
      invalidate()
      toast.success('Company approved (demo environment)')
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  })

  const termsUrl = status?.termsUrl ?? 'https://flows.gusto.com/terms'
  const company = status?.company
  const isApproved = company?.onboarding_status === 'approved' || !!company?.approved_at
  const needsTermsAcceptance =
    !!status?.configured && !!company && !company.terms_accepted_at && !isApproved

  const onboardingSteps = useMemo(
    () => normalizeOnboardingSteps(company?.onboarding_steps),
    [company?.onboarding_steps],
  )
  const openCompanyFlow = (flowType: GustoCompanyFlowType, title: string) => {
    navigate(
      buildGustoFlowPath({
        flowType,
        title,
        returnTo: '/settings',
      }),
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gusto payroll</CardTitle>
        <CardDescription>
          Run compliant payroll, tax withholding, and direct deposit through Gusto Embedded. Payroll
          powered by Gusto — your family remains the employer of record.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          Before production: confirm with Gusto that household employers (Schedule H / nanny tax) are
          supported for your partner application. See <code className="text-xs">docs/GUSTO_EMBEDDED.md</code>.
        </p>

        {isLoading ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">Loading payroll status…</p>
        ) : !status?.configured ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gusto-company-name">Employer / household name</Label>
              <Input
                id="gusto-company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={activeHousehold?.name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gusto-ein">EIN</Label>
              <Input
                id="gusto-ein"
                value={ein}
                onChange={(e) => setEin(e.target.value)}
                placeholder="12-3456789"
              />
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {status?.gustoEnv === 'demo'
                  ? 'Optional in demo — leave blank for a unique test EIN per household. If you see “EIN already in use”, enter any other 9-digit number.'
                  : 'Required — your 9-digit Employer Identification Number from the IRS.'}
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
              />
              <span>
                I agree to the{' '}
                <a
                  href={termsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline"
                >
                  Gusto Embedded Payroll Terms of Service
                </a>
                . Soola facilitates payroll through Gusto; tax and wage compliance are handled per
                Gusto&apos;s terms.
              </span>
            </label>
            <Button
              onClick={() => createCompany.mutate()}
              disabled={!agreedToTerms || createCompany.isPending || !companyName.trim()}
            >
              {createCompany.isPending ? 'Creating…' : 'Enable Gusto payroll'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isApproved ? 'default' : 'secondary'}>
                {statusLabel(company!.onboarding_status)}
              </Badge>
              <Badge variant="outline">{status.gustoEnv} environment</Badge>
            </div>

            {needsTermsAcceptance && (
              <div className="space-y-3 rounded-lg border-2 border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-4">
                <div>
                  <p className="font-medium">Step 2 — Accept Gusto terms</p>
                  <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                    Your company is registered with Gusto. Confirm you agree to their payroll terms
                    to continue setup. You must be signed in as{' '}
                    <span className="font-medium">{user?.email ?? 'the payroll admin'}</span> (the
                    same email used when payroll was enabled).
                  </p>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                  />
                  <span>
                    I agree to the{' '}
                    <a
                      href={termsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline"
                    >
                      Gusto Embedded Payroll Terms of Service
                    </a>
                  </span>
                </label>
                <Button
                  onClick={() => acceptTerms.mutate()}
                  disabled={!agreedToTerms || acceptTerms.isPending}
                >
                  {acceptTerms.isPending ? 'Submitting…' : 'Accept terms with Gusto'}
                </Button>
              </div>
            )}

            {!needsTermsAcceptance && !isApproved && activeHousehold && status && (
              <div className="space-y-4 rounded-lg border p-4">
                <div>
                  <p className="font-medium">Step 3 — Company setup in Gusto</p>
                  <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                    Add your bank account, tax details, pay schedule, employees, and sign required
                    forms in Gusto&apos;s secure setup page.
                  </p>
                </div>

                <Button
                  type="button"
                  onClick={() => openCompanyFlow('company_onboarding', 'Company setup in Gusto')}
                >
                  Continue company setup
                </Button>

                {onboardingSteps.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {onboardingSteps.map((step) => {
                      const flowType = flowTypeForOnboardingStep(step.id)
                      return (
                        <li key={step.id} className="flex items-start gap-2">
                          {step.completed ? (
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                          ) : (
                            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
                          )}
                          <span className="flex-1">{step.title}</span>
                          {!step.completed && flowType ? (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto shrink-0 px-0"
                              onClick={() => openCompanyFlow(flowType, step.title)}
                            >
                              Continue
                            </Button>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Click &quot;Refresh status&quot; after starting setup to see each step and open
                    individual sections.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncOnboarding.mutate()}
                disabled={syncOnboarding.isPending}
              >
                <RefreshCw className="mr-1 h-4 w-4" />
                {syncOnboarding.isPending ? 'Syncing…' : 'Refresh status'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => refetch()}>
                Reload
              </Button>
              {status.gustoEnv === 'demo' && !isApproved && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => demoApprove.mutate()}
                  disabled={demoApprove.isPending}
                >
                  {demoApprove.isPending ? 'Approving…' : 'Demo: approve company'}
                </Button>
              )}
            </div>

            {isApproved && (
              <p className="text-sm text-green-700 dark:text-green-400">
                Payroll is enabled. Close a pay period on the Payroll page, then submit to Gusto for
                official withholding and payment.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
