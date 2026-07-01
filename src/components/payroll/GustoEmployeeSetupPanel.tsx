import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Link2, UserCheck, Users } from 'lucide-react'
import { useEmploymentSettings } from '@/hooks/useHouseholdData'
import { formatSupabaseError } from '@/lib/errors'
import { nannyDisplayName } from '@/lib/nanny'
import {
  finalizeGustoEmployeeOnboarding,
  getGustoStatus,
  gustoEmployeeOnboardingLabel,
  inviteGustoEmployeeSelfOnboarding,
  setupGustoEmployee,
} from '@/lib/gusto-api'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { selectCn } from '@/lib/utils'

type SetupMode = 'choose' | 'invite' | 'admin'

export type GustoEmployeeSetupNanny = {
  id: string
  first_name: string
  last_name: string
  email: string
  user_id: string | null
}

export function GustoEmployeeSetupPanel({
  householdId,
  householdNannyId,
  nannies,
  showNannySelector = false,
  onNannyIdChange,
  onUpdated,
  onEmployeeComplete,
}: {
  householdId: string
  householdNannyId: string
  nannies?: GustoEmployeeSetupNanny[]
  showNannySelector?: boolean
  onNannyIdChange?: (id: string) => void
  onUpdated?: () => void
  onEmployeeComplete?: () => void
}) {
  const qc = useQueryClient()
  const [setupMode, setSetupMode] = useState<SetupMode>('choose')
  const [employeeForm, setEmployeeForm] = useState({
    dateOfBirth: '',
    ssn: '',
    street1: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
  })

  const { data: settingsList } = useEmploymentSettings(householdNannyId)
  const settings = settingsList?.[0]

  const statusQuery = useQuery({
    queryKey: ['gusto_status', householdId],
    enabled: !!householdId,
    queryFn: () => getGustoStatus(householdId),
  })

  const nannyFromList = nannies?.find((n) => n.id === householdNannyId)
  const nannyQuery = useQuery({
    queryKey: ['household_nanny_profile', householdNannyId],
    enabled: !!householdNannyId && !nannyFromList,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_nannies')
        .select('id, first_name, last_name, email, user_id')
        .eq('id', householdNannyId)
        .single()
      if (error) throw error
      return data as GustoEmployeeSetupNanny
    },
  })

  const nanny = nannyFromList ?? nannyQuery.data
  const gustoEmployee = statusQuery.data?.employees.find((e) => e.household_nanny_id === householdNannyId)
  const employeeOnboardingStatus = gustoEmployee?.onboarding_status
  const employeeComplete = employeeOnboardingStatus === 'onboarding_completed'
  const awaitingNanny = employeeOnboardingStatus === 'awaiting_nanny'
  const awaitingReview = employeeOnboardingStatus === 'awaiting_admin_review'

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['gusto_status', householdId] })
    void qc.invalidateQueries({ queryKey: ['gusto_setup', householdId] })
    onUpdated?.()
  }

  const inviteEmployee = useMutation({
    mutationFn: () =>
      inviteGustoEmployeeSelfOnboarding(householdId, {
        householdNannyId,
        hourlyRateCents: settings?.hourly_rate_cents,
      }),
    onSuccess: (result) => {
      toast.success(
        result.awaitingNannyLogin
          ? 'Payroll setup started. Send your nanny an app invite so they can complete their details.'
          : 'Your nanny was notified to complete their payroll information.',
      )
      setSetupMode('choose')
      invalidate()
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const setupEmployee = useMutation({
    mutationFn: () =>
      setupGustoEmployee(householdId, {
        householdNannyId,
        dateOfBirth: employeeForm.dateOfBirth || undefined,
        ssn: employeeForm.ssn || undefined,
        hourlyRateCents: settings?.hourly_rate_cents,
        homeAddress:
          employeeForm.street1 && employeeForm.city && employeeForm.state && employeeForm.zip
            ? {
                street1: employeeForm.street1,
                street2: employeeForm.street2 || undefined,
                city: employeeForm.city,
                state: employeeForm.state,
                zip: employeeForm.zip,
              }
            : undefined,
        markOnboardingComplete: true,
      }),
    onSuccess: () => {
      toast.success('Nanny set up in Gusto')
      setSetupMode('choose')
      invalidate()
      onEmployeeComplete?.()
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const finalizeEmployee = useMutation({
    mutationFn: () => finalizeGustoEmployeeOnboarding(householdId, { householdNannyId }),
    onSuccess: () => {
      toast.success('Nanny payroll setup complete')
      invalidate()
      onEmployeeComplete?.()
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  if (!nannies?.length && nannyQuery.isLoading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Loading nanny…</p>
  }

  if (showNannySelector && nannies && nannies.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Add a nanny in Settings before setting up payroll.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {showNannySelector && nannies && nannies.length > 1 && (
        <div className="space-y-2">
          <Label>Nanny</Label>
          <select
            className={selectCn}
            value={householdNannyId}
            onChange={(e) => onNannyIdChange?.(e.target.value)}
          >
            {nannies.map((n) => (
              <option key={n.id} value={n.id}>
                {nannyDisplayName(n)}
              </option>
            ))}
          </select>
        </div>
      )}

      {employeeComplete && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">Complete</Badge>
            {nanny && <span>{nannyDisplayName(nanny)} is set up in Gusto.</span>}
          </div>
        </div>
      )}

      {gustoEmployee?.employee_uuid && !employeeComplete && (
        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{gustoEmployeeOnboardingLabel(employeeOnboardingStatus)}</Badge>
          </div>
          {awaitingNanny && (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Waiting for {nanny?.first_name ?? 'your nanny'} to enter their date of birth, SSN, and home address
              on the Earnings page.
              {!nanny?.user_id && (
                <>
                  {' '}
                  They need to claim their profile in the app first — send an invite from Settings.
                </>
              )}
            </p>
          )}
          {awaitingReview && (
            <>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                {nanny?.first_name ?? 'Your nanny'} submitted their payroll details. Review and finalize to complete
                setup.
              </p>
              <Button size="sm" onClick={() => finalizeEmployee.mutate()} disabled={finalizeEmployee.isPending}>
                <UserCheck className="mr-2 h-4 w-4" />
                {finalizeEmployee.isPending ? 'Finalizing…' : 'Review & finalize'}
              </Button>
            </>
          )}
        </div>
      )}

      {!gustoEmployee?.employee_uuid && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Most families ask the nanny to enter their own SSN and address securely in the app. You can also enter
            everything yourself.
          </p>

          {setupMode === 'choose' && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setSetupMode('invite')}>
                <Users className="mr-2 h-4 w-4" />
                Ask nanny to complete
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSetupMode('admin')}>
                <Link2 className="mr-2 h-4 w-4" />
                Enter details myself
              </Button>
            </div>
          )}

          {setupMode === 'invite' && (
            <div className="space-y-4 rounded-lg border p-4">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                We&apos;ll set up their job and pay rate in Gusto, then ask{' '}
                <span className="font-medium">{nanny?.first_name ?? 'your nanny'}</span> to enter their personal
                details in the app.
              </p>
              {!nanny?.email && (
                <p className="text-sm text-amber-800">Add an email to the nanny profile before continuing.</p>
              )}
              {!nanny?.user_id && (
                <p className="text-sm text-amber-800">
                  This nanny hasn&apos;t joined the app yet. You can still start setup, but send them an invite from
                  Settings so they can complete their section.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => inviteEmployee.mutate()}
                  disabled={inviteEmployee.isPending || !nanny?.email}
                >
                  {inviteEmployee.isPending ? 'Sending…' : 'Send to nanny'}
                </Button>
                <Button variant="outline" onClick={() => setSetupMode('choose')}>
                  Back
                </Button>
              </div>
            </div>
          )}

          {setupMode === 'admin' && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Date of birth</Label>
                  <Input
                    type="date"
                    value={employeeForm.dateOfBirth}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, dateOfBirth: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>SSN</Label>
                  <Input
                    value={employeeForm.ssn}
                    onChange={(e) =>
                      setEmployeeForm({ ...employeeForm, ssn: e.target.value.replace(/\D/g, '').slice(0, 9) })
                    }
                    placeholder="9 digits"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Home street</Label>
                  <Input
                    value={employeeForm.street1}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, street1: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={employeeForm.city}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input
                    maxLength={2}
                    value={employeeForm.state}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, state: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>ZIP</Label>
                  <Input
                    value={employeeForm.zip}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, zip: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setupEmployee.mutate()} disabled={setupEmployee.isPending}>
                  {setupEmployee.isPending ? 'Saving…' : 'Save to Gusto'}
                </Button>
                <Button variant="outline" onClick={() => setSetupMode('choose')}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
