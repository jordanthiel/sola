import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RefreshCw, Send } from 'lucide-react'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useFeatureAccess } from '@/hooks/useFeatureAccess'
import { FEATURE_KEYS } from '@/lib/feature-gates'
import { formatSupabaseError } from '@/lib/errors'
import { formatCurrency } from '@/lib/utils'
import {
  createGustoPayroll,
  getGustoStatus,
  previewGustoPayroll,
  submitGustoPayroll,
} from '@/lib/gusto-api'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GustoEmployeeSetupPanel } from '@/components/payroll/GustoEmployeeSetupPanel'

export function GustoPayrollActions({
  householdNannyId,
  payPeriodCloseId,
  periodLabel,
}: {
  householdNannyId: string
  payPeriodCloseId?: string
  periodLabel: string
}) {
  const { activeHousehold } = useHousehold()
  const householdId = activeHousehold?.id ?? ''
  const { data: hasAccess } = useFeatureAccess(FEATURE_KEYS.gustoPayroll)
  const qc = useQueryClient()

  const statusQuery = useQuery({
    queryKey: ['gusto_status', householdId],
    enabled: !!householdId && !!hasAccess,
    queryFn: () => getGustoStatus(householdId),
  })

  const payrollRunQuery = useQuery({
    queryKey: ['payroll_run', payPeriodCloseId],
    enabled: !!payPeriodCloseId && !!hasAccess,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_runs')
        .select('*')
        .eq('pay_period_close_id', payPeriodCloseId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const createPayroll = useMutation({
    mutationFn: () => createGustoPayroll(householdId, payPeriodCloseId!),
    onSuccess: () => {
      toast.success('Gusto payroll draft created')
      void qc.invalidateQueries({ queryKey: ['payroll_run', payPeriodCloseId] })
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const previewPayroll = useMutation({
    mutationFn: () => previewGustoPayroll(householdId, payrollRunQuery.data!.id),
    onSuccess: (result) => {
      toast.success('Gusto preview updated')
      void qc.invalidateQueries({ queryKey: ['payroll_run', payPeriodCloseId] })
      if (result.netPayCents != null) {
        toast.message(`Net pay: ${formatCurrency(result.netPayCents)}`)
      }
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const submitPayroll = useMutation({
    mutationFn: () => submitGustoPayroll(householdId, payrollRunQuery.data!.id),
    onSuccess: () => {
      toast.success('Payroll submitted to Gusto')
      void qc.invalidateQueries({ queryKey: ['payroll_run', payPeriodCloseId] })
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  if (!hasAccess) return null

  const company = statusQuery.data?.company
  const gustoEmployee = statusQuery.data?.employees.find((e) => e.household_nanny_id === householdNannyId)
  const payrollRun = payrollRunQuery.data
  const companyApproved = company?.onboarding_status === 'approved'
  const canSetupEmployee = !!company?.terms_accepted_at
  const employeeComplete = gustoEmployee?.onboarding_status === 'onboarding_completed'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Gusto payroll</CardTitle>
        <CardDescription>
          Run official payroll for {periodLabel}. Requires Gusto setup and pay reporting set to all on the
          books.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!company && (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Connect Gusto in{' '}
            <a href="/settings/gusto" className="font-medium text-[var(--color-primary)] underline">
              Settings → Gusto payroll
            </a>
            .
          </p>
        )}

        {company && !companyApproved && (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Finish Gusto company setup before running payroll.{' '}
            <a href="/settings/gusto" className="font-medium text-[var(--color-primary)] underline">
              Continue setup
            </a>
          </p>
        )}

        {canSetupEmployee && !employeeComplete && (
          <GustoEmployeeSetupPanel householdId={householdId} householdNannyId={householdNannyId} />
        )}

        {companyApproved && employeeComplete && gustoEmployee?.employee_uuid && payPeriodCloseId && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Linked in Gusto</Badge>
              {payrollRun?.status && <Badge variant="secondary">{payrollRun.status}</Badge>}
            </div>

            <div className="flex flex-wrap gap-2">
              {!payrollRun?.gusto_payroll_uuid && (
                <Button size="sm" onClick={() => createPayroll.mutate()} disabled={createPayroll.isPending}>
                  {createPayroll.isPending ? 'Creating…' : 'Create Gusto payroll'}
                </Button>
              )}

              {payrollRun?.gusto_payroll_uuid && payrollRun.status !== 'submitted' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => previewPayroll.mutate()}
                    disabled={previewPayroll.isPending}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {previewPayroll.isPending ? 'Refreshing…' : 'Refresh Gusto preview'}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => submitPayroll.mutate()}
                    disabled={submitPayroll.isPending || payrollRun.status !== 'ready'}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {submitPayroll.isPending ? 'Submitting…' : 'Submit to Gusto'}
                  </Button>
                </>
              )}
            </div>

            {payrollRun && (payrollRun.net_pay_cents != null || payrollRun.company_debit_cents != null) && (
              <div className="grid gap-2 text-sm md:grid-cols-3">
                {payrollRun.net_pay_cents != null && (
                  <p>
                    <span className="text-[var(--color-muted-foreground)]">Net pay: </span>
                    {formatCurrency(payrollRun.net_pay_cents)}
                  </p>
                )}
                {payrollRun.tax_debit_cents != null && (
                  <p>
                    <span className="text-[var(--color-muted-foreground)]">Tax debit: </span>
                    {formatCurrency(payrollRun.tax_debit_cents)}
                  </p>
                )}
                {payrollRun.company_debit_cents != null && (
                  <p>
                    <span className="text-[var(--color-muted-foreground)]">Company debit: </span>
                    {formatCurrency(payrollRun.company_debit_cents)}
                  </p>
                )}
              </div>
            )}

            {payrollRun?.status === 'submitted' && (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Submitted to Gusto. ACH and tax remittance follow Gusto timelines.
              </p>
            )}
          </div>
        )}

        {!payPeriodCloseId && companyApproved && employeeComplete && gustoEmployee?.employee_uuid && (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Finalize this pay period in Soola before creating a Gusto payroll run.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
