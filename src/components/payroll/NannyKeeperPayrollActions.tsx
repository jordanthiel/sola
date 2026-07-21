import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { RefreshCw, Send } from 'lucide-react'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useFeatureAccess } from '@/hooks/useFeatureAccess'
import { FEATURE_KEYS } from '@/lib/feature-gates'
import { formatSupabaseError } from '@/lib/errors'
import { formatCurrency } from '@/lib/utils'
import {
  createNkEmployee,
  getNkStatus,
  initiateNkAch,
  previewNkPayroll,
  runNkPayroll,
} from '@/lib/nannykeeper-api'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState } from 'react'

export function NannyKeeperPayrollActions({
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
  const { data: hasAccess } = useFeatureAccess(FEATURE_KEYS.householdPayroll)
  const qc = useQueryClient()
  const [employeeEmail, setEmployeeEmail] = useState('')

  const statusQuery = useQuery({
    queryKey: ['nk_status', householdId],
    enabled: !!householdId && !!hasAccess,
    queryFn: () => getNkStatus(householdId),
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

  const linkedEmployee = statusQuery.data?.employees.find(
    (e) => e.household_nanny_id === householdNannyId,
  )

  const createEmployee = useMutation({
    mutationFn: () =>
      createNkEmployee(householdId, {
        householdNannyId,
        email: employeeEmail.trim(),
      }),
    onSuccess: () => {
      toast.success('Nanny linked to NannyKeeper')
      void qc.invalidateQueries({ queryKey: ['nk_status', householdId] })
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const preview = useMutation({
    mutationFn: () =>
      previewNkPayroll(householdId, {
        payPeriodCloseId: payPeriodCloseId!,
        householdNannyId,
      }),
    onSuccess: (result) => {
      toast.success('Tax preview updated')
      void qc.invalidateQueries({ queryKey: ['payroll_run', payPeriodCloseId] })
      if (result.netPayCents != null) {
        toast.message(`Estimated net: ${formatCurrency(result.netPayCents)}`)
      }
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const run = useMutation({
    mutationFn: () =>
      runNkPayroll(householdId, {
        payrollRunId: payrollRunQuery.data!.id,
        paymentMethod: 'check',
      }),
    onSuccess: () => {
      toast.success('Payroll run submitted to NannyKeeper')
      void qc.invalidateQueries({ queryKey: ['payroll_run', payPeriodCloseId] })
      void qc.invalidateQueries({ queryKey: ['pay_period_close'] })
      void qc.invalidateQueries({ queryKey: ['pay_period_closes'] })
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const ach = useMutation({
    mutationFn: () => initiateNkAch(householdId, payrollRunQuery.data!.id),
    onSuccess: () => {
      toast.success('Direct deposit initiated')
      void qc.invalidateQueries({ queryKey: ['payroll_run', payPeriodCloseId] })
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  if (!hasAccess) return null

  const employer = statusQuery.data?.employer
  const runRow = payrollRunQuery.data

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">Household payroll</CardTitle>
          <Badge variant="secondary">Paid tier</Badge>
        </div>
        <CardDescription>
          Compliant tax calc and payroll run via NannyKeeper for {periodLabel}. Hours and gross stay in
          Soola; NannyKeeper handles withholdings, YTD, and documents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!employer && (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Set up your household employer under{' '}
            <Link to="/settings/payroll" className="font-medium text-[var(--color-primary)] underline">
              Settings → Household payroll
            </Link>{' '}
            first.
          </p>
        )}

        {employer && !linkedEmployee && (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm">Link this nanny as a NannyKeeper employee (SSN/bank completed in their portal).</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="nk-employee-email">Nanny email</Label>
                <Input
                  id="nk-employee-email"
                  type="email"
                  className="w-64"
                  value={employeeEmail}
                  onChange={(e) => setEmployeeEmail(e.target.value)}
                  placeholder="nanny@example.com"
                />
              </div>
              <Button
                size="sm"
                disabled={!employeeEmail.trim() || createEmployee.isPending}
                onClick={() => createEmployee.mutate()}
              >
                {createEmployee.isPending ? 'Linking…' : 'Link nanny'}
              </Button>
            </div>
          </div>
        )}

        {linkedEmployee?.portal_url && (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Employee portal:{' '}
            <a
              href={linkedEmployee.portal_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--color-primary)] underline"
            >
              complete SSN / bank details
            </a>
          </p>
        )}

        {employer && linkedEmployee && (
          <>
            {!payPeriodCloseId ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Finalize this pay period first, then preview and run payroll.
              </p>
            ) : (
              <div className="space-y-3">
                {runRow && (
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span>
                      Status <Badge variant="outline">{runRow.status}</Badge>
                    </span>
                    {runRow.net_pay_cents != null && (
                      <span>
                        Net <span className="font-medium">{formatCurrency(runRow.net_pay_cents)}</span>
                      </span>
                    )}
                    {runRow.tax_debit_cents != null && (
                      <span>
                        Taxes{' '}
                        <span className="font-medium">{formatCurrency(runRow.tax_debit_cents)}</span>
                      </span>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={preview.isPending}
                    onClick={() => preview.mutate()}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {preview.isPending ? 'Previewing…' : 'Preview taxes'}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!runRow || run.isPending || runRow.status === 'submitted'}
                    onClick={() => run.mutate()}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {run.isPending ? 'Running…' : 'Run payroll'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!runRow?.external_payroll_id || ach.isPending}
                    onClick={() => ach.mutate()}
                  >
                    {ach.isPending ? 'Starting ACH…' : 'Initiate direct deposit'}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
