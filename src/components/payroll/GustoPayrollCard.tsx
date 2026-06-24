import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useGustoStatus, usePayrollRun } from '@/hooks/useGusto'
import {
  createGustoPayroll,
  linkGustoEmployee,
  previewGustoPayroll,
  submitGustoPayroll,
} from '@/lib/gusto-api'
import { formatSupabaseError } from '@/lib/errors'
import { formatCurrency } from '@/lib/utils'
import { buildGustoFlowPath } from '@/lib/gusto-flows'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface GustoPayrollCardProps {
  payPeriodCloseId: string
  householdNannyId: string
  employmentType?: string | null
  payReportingMode?: string | null
}

export function GustoPayrollCard({
  payPeriodCloseId,
  householdNannyId,
  employmentType,
  payReportingMode,
}: GustoPayrollCardProps) {
  const { activeHousehold } = useHousehold()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: gustoStatus } = useGustoStatus()
  const { data: payrollRun, refetch: refetchRun } = usePayrollRun(payPeriodCloseId)

  const isApproved = !!gustoStatus?.company?.approved_at || gustoStatus?.company?.onboarding_status === 'approved'
  const termsAccepted = !!gustoStatus?.company?.terms_accepted_at
  const employeeLink = gustoStatus?.employees?.find((e) => e.household_nanny_id === householdNannyId)
  const reportingBlocked = payReportingMode != null && payReportingMode !== 'all_over'

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['payroll-run'] })
    qc.invalidateQueries({ queryKey: ['pay_period_close'] })
    qc.invalidateQueries({ queryKey: ['gusto-status'] })
  }

  const linkEmployee = useMutation({
    mutationFn: () =>
      linkGustoEmployee({
        householdId: activeHousehold!.id,
        householdNannyId,
        workerType: employmentType === 'contractor' ? 'contractor' : 'employee',
      }),
    onSuccess: () => {
      invalidate()
      toast.success('Nanny linked in Gusto')
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  })

  const createPayroll = useMutation({
    mutationFn: () =>
      createGustoPayroll({
        householdId: activeHousehold!.id,
        payPeriodCloseId,
      }),
    onSuccess: async (res) => {
      invalidate()
      if (!res.existing) {
        await previewGustoPayroll({
          householdId: activeHousehold!.id,
          payrollRunId: res.payrollRunId,
        })
        refetchRun()
        invalidate()
      }
      toast.success('Gusto payroll draft created')
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  })

  const previewPayroll = useMutation({
    mutationFn: () =>
      previewGustoPayroll({
        householdId: activeHousehold!.id,
        payrollRunId: payrollRun!.id,
      }),
    onSuccess: () => {
      invalidate()
      refetchRun()
      toast.success('Gusto preview updated')
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  })

  const submitPayroll = useMutation({
    mutationFn: () =>
      submitGustoPayroll({
        householdId: activeHousehold!.id,
        payrollRunId: payrollRun!.id,
      }),
    onSuccess: () => {
      invalidate()
      toast.success('Payroll submitted to Gusto')
    },
    onError: (e) => toast.error(formatSupabaseError(e)),
  })

  if (!gustoStatus?.configured) {
    return null
  }

  return (
    <Card className="border-[var(--color-primary)]/30">
      <CardHeader>
        <CardTitle className="text-lg">Gusto payroll</CardTitle>
        <CardDescription>
          Official withholdings and ACH after period close. Soola totals above are estimates; Gusto
          amounts below are used for payment and tax filing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isApproved && (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Finish Gusto setup in Settings before submitting payroll.
          </p>
        )}

        {reportingBlocked && (
          <p className="text-sm text-red-600">
            Gusto requires all wages on the books. Change pay reporting to &quot;All pay on the
            books&quot; in nanny pay settings before using Gusto payroll.
          </p>
        )}

        {termsAccepted && !employeeLink?.employee_uuid && employmentType !== 'contractor' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => linkEmployee.mutate()}
            disabled={linkEmployee.isPending}
          >
            {linkEmployee.isPending ? 'Linking…' : 'Link nanny to Gusto'}
          </Button>
        )}

        {termsAccepted && employeeLink?.employee_uuid && employmentType !== 'contractor' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate(
                buildGustoFlowPath({
                  flowType: 'employee_self_management',
                  title: 'Nanny onboarding in Gusto',
                  entityUuid: employeeLink.employee_uuid!,
                  entityType: 'Employee',
                  returnTo: '/payroll',
                }),
              )
            }
          >
            Complete nanny onboarding in Gusto
          </Button>
        )}

        {isApproved && !reportingBlocked && (
          <div className="flex flex-wrap gap-2">
            {!payrollRun && (
              <Button
                size="sm"
                onClick={() => createPayroll.mutate()}
                disabled={createPayroll.isPending || !employeeLink?.employee_uuid}
              >
                {createPayroll.isPending ? 'Creating…' : 'Create Gusto payroll'}
              </Button>
            )}
            {payrollRun && (
              <>
                <Badge variant="secondary">{payrollRun.status}</Badge>
                {payrollRun.status === 'draft' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => previewPayroll.mutate()}
                    disabled={previewPayroll.isPending}
                  >
                    {previewPayroll.isPending ? 'Previewing…' : 'Refresh Gusto preview'}
                  </Button>
                )}
                {(payrollRun.status === 'ready' || payrollRun.status === 'draft') && (
                  <Button
                    size="sm"
                    onClick={() => submitPayroll.mutate()}
                    disabled={submitPayroll.isPending}
                  >
                    {submitPayroll.isPending ? 'Submitting…' : 'Submit to Gusto'}
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {payrollRun && (payrollRun.net_pay_cents != null || payrollRun.company_debit_cents != null) && (
          <div className="grid gap-2 text-sm md:grid-cols-3">
            {payrollRun.net_pay_cents != null && (
              <div>
                <span className="text-[var(--color-muted-foreground)]">Net pay (Gusto)</span>
                <p className="font-medium">{formatCurrency(payrollRun.net_pay_cents)}</p>
              </div>
            )}
            {payrollRun.tax_debit_cents != null && (
              <div>
                <span className="text-[var(--color-muted-foreground)]">Tax debit</span>
                <p className="font-medium">{formatCurrency(payrollRun.tax_debit_cents)}</p>
              </div>
            )}
            {payrollRun.company_debit_cents != null && (
              <div>
                <span className="text-[var(--color-muted-foreground)]">Total company debit</span>
                <p className="font-medium">{formatCurrency(payrollRun.company_debit_cents)}</p>
              </div>
            )}
          </div>
        )}

        {payrollRun?.status === 'paid' && payrollRun.paid_at && (
          <p className="text-sm text-green-700 dark:text-green-400">
            Paid via Gusto on {new Date(payrollRun.paid_at).toLocaleString()}.
          </p>
        )}

        {payrollRun?.error_message && (
          <p className="text-sm text-red-600">{payrollRun.error_message}</p>
        )}

        <p className="text-xs text-[var(--color-muted-foreground)]">
          Payroll powered by Gusto Embedded. Allow 4 business days for standard ACH processing after
          submit.
        </p>
      </CardContent>
    </Card>
  )
}
