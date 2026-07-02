import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Shield } from 'lucide-react'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useMyHouseholdNanny } from '@/hooks/useHouseholdData'
import { formatSupabaseError } from '@/lib/errors'
import { submitGustoEmployeeSelfOnboarding } from '@/lib/gusto-api'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function GustoNannyPayrollSetup() {
  const { activeHousehold } = useHousehold()
  const householdId = activeHousehold?.id ?? ''
  const { data: myNanny } = useMyHouseholdNanny()
  const qc = useQueryClient()

  const [form, setForm] = useState({
    dateOfBirth: '',
    ssn: '',
    street1: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
  })

  const gustoEmployeeQuery = useQuery({
    queryKey: ['gusto_employee_self', householdId, myNanny?.id],
    enabled: !!householdId && !!myNanny?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gusto_employees')
        .select('employee_uuid, onboarding_status')
        .eq('household_id', householdId)
        .eq('household_nanny_id', myNanny!.id)
        .maybeSingle()
      if (error) throw error
      return data as { employee_uuid: string | null; onboarding_status: string } | null
    },
  })

  const submitDetails = useMutation({
    mutationFn: () =>
      submitGustoEmployeeSelfOnboarding(householdId, {
        householdNannyId: myNanny!.id,
        dateOfBirth: form.dateOfBirth,
        ssn: form.ssn,
        homeAddress: {
          street1: form.street1,
          street2: form.street2 || undefined,
          city: form.city,
          state: form.state,
          zip: form.zip,
        },
      }),
    onSuccess: () => {
      toast.success('Payroll information submitted')
      void qc.invalidateQueries({ queryKey: ['gusto_employee_self', householdId, myNanny?.id] })
      void qc.invalidateQueries({ queryKey: ['gusto_status', householdId] })
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  if (!myNanny) return null

  const gustoEmployee = gustoEmployeeQuery.data
  const status = gustoEmployee?.onboarding_status

  if (!gustoEmployee?.employee_uuid || status === 'onboarding_completed') return null

  if (status === 'awaiting_admin_review') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payroll information</CardTitle>
          <CardDescription>Your details were sent to your employer for review.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (status !== 'awaiting_nanny') return null

  const canSubmit =
    !!form.dateOfBirth &&
    form.ssn.replace(/\D/g, '').length === 9 &&
    !!form.street1.trim() &&
    !!form.city.trim() &&
    form.state.trim().length === 2 &&
    !!form.zip.trim()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Complete payroll setup</CardTitle>
        <CardDescription>
          {activeHousehold?.name ?? 'Your employer'} needs your personal details for official payroll through
          Gusto. This information is encrypted and sent securely.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
          <Shield className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Only you should enter your SSN and home address. Your employer already set your pay rate and work location.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Date of birth</Label>
            <Input
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>SSN</Label>
            <Input
              value={form.ssn}
              onChange={(e) => setForm({ ...form, ssn: e.target.value.replace(/\D/g, '').slice(0, 9) })}
              placeholder="9 digits"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Home street</Label>
            <Input value={form.street1} onChange={(e) => setForm({ ...form, street1: e.target.value })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Apt / unit (optional)</Label>
            <Input value={form.street2} onChange={(e) => setForm({ ...form, street2: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>State</Label>
            <Input
              maxLength={2}
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-2">
            <Label>ZIP</Label>
            <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
          </div>
        </div>

        <Button onClick={() => submitDetails.mutate()} disabled={!canSubmit || submitDetails.isPending}>
          {submitDetails.isPending ? 'Submitting…' : 'Submit payroll information'}
        </Button>
      </CardContent>
    </Card>
  )
}
