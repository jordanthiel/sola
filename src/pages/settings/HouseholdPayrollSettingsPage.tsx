import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useFeatureAccess } from '@/hooks/useFeatureAccess'
import { FEATURE_KEYS } from '@/lib/feature-gates'
import { formatSupabaseError } from '@/lib/errors'
import {
  createNkEmployer,
  generateNkDocument,
  getNkStatus,
} from '@/lib/nannykeeper-api'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME',
  'MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI',
  'SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

export function HouseholdPayrollSettingsPage() {
  const { user, profile } = useAuth()
  const { activeHousehold } = useHousehold()
  const householdId = activeHousehold?.id ?? ''
  const { data: hasAccess, isLoading: accessLoading } = useFeatureAccess(FEATURE_KEYS.householdPayroll)
  const qc = useQueryClient()

  const display = profile?.display_name?.trim() || user?.email?.split('@')[0] || 'Parent'
  const parts = display.split(/\s+/)
  const [firstName, setFirstName] = useState(parts[0] ?? '')
  const [lastName, setLastName] = useState(parts.slice(1).join(' ') || 'Household')
  const [email, setEmail] = useState(user?.email ?? '')
  const [state, setState] = useState('CA')

  const statusQuery = useQuery({
    queryKey: ['nk_status', householdId],
    enabled: !!householdId && !!hasAccess,
    queryFn: () => getNkStatus(householdId),
  })

  const createEmployer = useMutation({
    mutationFn: () =>
      createNkEmployer(householdId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        state,
      }),
    onSuccess: () => {
      toast.success('Household employer created in NannyKeeper')
      void qc.invalidateQueries({ queryKey: ['nk_status', householdId] })
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const genDoc = useMutation({
    mutationFn: (docType: 'w2' | 'schedule-h') =>
      generateNkDocument(householdId, {
        docType,
        taxYear: new Date().getFullYear() - (new Date().getMonth() < 1 ? 1 : 0),
      }),
    onSuccess: () => toast.success('Document request sent — check NannyKeeper / API response'),
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  if (accessLoading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Loading…</p>
  }

  if (!hasAccess) {
    return (
      <div className="space-y-4">
        <PageHeader title="Household payroll" subtitle="Paid-tier NannyKeeper integration" />
        <Card>
          <CardContent className="space-y-3 pt-6 text-sm">
            <p>
              Household payroll is a paid feature. Ask an admin to grant{' '}
              <span className="font-medium">Household payroll (NannyKeeper)</span> under Feature access,
              or keep using free-tier <span className="font-medium">Mark as paid</span> on the Earnings
              page.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/settings">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to settings
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const employer = statusQuery.data?.employer

  return (
    <div className="space-y-6">
      <PageHeader
        title="Household payroll"
        subtitle="Paid tier: NannyKeeper for taxes, payroll runs, W-2, and Schedule H"
      />

      <Button asChild variant="ghost" size="sm" className="-mt-2">
        <Link to="/settings">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Settings
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Employer setup</CardTitle>
          <CardDescription>
            Creates a NannyKeeper employer for this household (Professional multi-employer API). Employee
            SSN and bank details stay in NannyKeeper’s secure portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {employer ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge>Connected</Badge>
                <span className="font-medium">
                  {employer.first_name} {employer.last_name}
                </span>
              </div>
              <p className="text-[var(--color-muted-foreground)]">
                {employer.admin_email} · {employer.state}
              </p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Employer ID: {employer.employer_id}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nk-first">First name</Label>
                <Input id="nk-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nk-last">Last name</Label>
                <Input id="nk-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nk-email">Payroll admin email</Label>
                <Input
                  id="nk-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nk-state">State</Label>
                <select
                  id="nk-state"
                  className="flex h-10 w-full rounded-md border border-[var(--color-input)] bg-transparent px-3 py-2 text-sm"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                >
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Button
                  disabled={createEmployer.isPending || !firstName.trim() || !lastName.trim() || !email.trim()}
                  onClick={() => createEmployer.mutate()}
                >
                  {createEmployer.isPending ? 'Creating…' : 'Create NannyKeeper employer'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {employer && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Year-end documents</CardTitle>
            <CardDescription>
              Generate W-2 / Schedule H through NannyKeeper. Link nannies and run payroll from the Earnings
              page.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={genDoc.isPending}
              onClick={() => genDoc.mutate('w2')}
            >
              Generate W-2
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={genDoc.isPending}
              onClick={() => genDoc.mutate('schedule-h')}
            >
              Generate Schedule H
            </Button>
          </CardContent>
        </Card>
      )}

      {(statusQuery.data?.employees.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Linked nannies</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {statusQuery.data!.employees.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{e.email ?? e.employee_id}</span>
                  <Badge variant="outline">{e.onboarding_status}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
