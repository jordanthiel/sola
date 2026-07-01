import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, addDays } from 'date-fns'
import { Check, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  formatEinDisplay,
  formatPhoneDisplay,
  isRedactedAccountNumber,
  loadGustoSetupProgress,
  markGustoStepComplete,
  redactAccountNumber,
  updateGustoSetupDrafts,
  updateGustoSetupStepIndex,
} from '@/lib/gusto-setup-progress'
import {
  finishGustoOnboarding,
  getGustoSetup,
  getGustoStatus,
  saveGustoBankAccount,
  saveGustoFederalTax,
  saveGustoIndustry,
  saveGustoLocation,
  saveGustoPaySchedule,
  saveGustoSignatory,
  saveGustoStateTax,
  signGustoForms,
  verifyGustoBankAccount,
} from '@/lib/gusto-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { selectCn, cn } from '@/lib/utils'
import { formatSupabaseError } from '@/lib/errors'
import { useHouseholdNannies } from '@/hooks/useHouseholdData'
import { isNannyActive } from '@/lib/nanny'
import { GustoEmployeeSetupPanel } from '@/components/payroll/GustoEmployeeSetupPanel'
import { GustoStateTaxForm } from '@/components/settings/GustoStateTaxForm'
import { PayrollHelpCallout, PayrollHelpLink } from '@/components/settings/PayrollHelpCallout'
import { FEDERAL_EIN_HELP, STATE_TAX_STEP_HELP } from '@/lib/gusto-field-help'
import {
  buildStateTaxUpdatePayload,
  extractStateTaxValues,
  missingRequiredStateTaxFields,
  stateHasTaxRequirements,
  stateTaxValuesSummary,
  type StateTaxValuesByState,
} from '@/lib/gusto-state-tax'

const TAX_PAYER_TYPES = [
  'Sole proprietor',
  'LLC',
  'C-Corporation',
  'S-Corporation',
  'General partnership',
  'Non-Profit',
] as const

const PAY_FREQUENCIES = [
  { value: 'Every week', label: 'Every week' },
  { value: 'Every other week', label: 'Every other week (biweekly)' },
  { value: 'Twice per month', label: 'Twice per month' },
  { value: 'Monthly', label: 'Monthly' },
] as const

const WIZARD_STEPS = [
  { id: 'add_addresses', label: 'Business address' },
  { id: 'add_bank_info', label: 'Bank account' },
  { id: 'federal_tax_setup', label: 'Federal tax' },
  { id: 'select_industry', label: 'Industry' },
  { id: 'payroll_schedule', label: 'Pay schedule' },
  { id: 'verify_bank_info', label: 'Verify bank' },
  { id: 'add_employees', label: 'Add nanny' },
  { id: 'state_setup', label: 'State taxes' },
  { id: 'signatory', label: 'Signatory' },
  { id: 'sign_all_forms', label: 'Sign forms' },
  { id: 'submit', label: 'Submit' },
] as const

type WizardStepId = (typeof WIZARD_STEPS)[number]['id']

function AddressFields({
  prefix,
  values,
  onChange,
}: {
  prefix: string
  values: { street1: string; street2: string; city: string; state: string; zip: string }
  onChange: (next: { street1: string; street2: string; city: string; state: string; zip: string }) => void
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`${prefix}-street1`}>Street address</Label>
        <Input
          id={`${prefix}-street1`}
          value={values.street1}
          onChange={(e) => onChange({ ...values, street1: e.target.value })}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`${prefix}-street2`}>Apt / suite (optional)</Label>
        <Input
          id={`${prefix}-street2`}
          value={values.street2}
          onChange={(e) => onChange({ ...values, street2: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-city`}>City</Label>
        <Input id={`${prefix}-city`} value={values.city} onChange={(e) => onChange({ ...values, city: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-state`}>State</Label>
        <Input
          id={`${prefix}-state`}
          value={values.state}
          maxLength={2}
          onChange={(e) => onChange({ ...values, state: e.target.value.toUpperCase() })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-zip`}>ZIP</Label>
        <Input id={`${prefix}-zip`} value={values.zip} onChange={(e) => onChange({ ...values, zip: e.target.value })} />
      </div>
    </div>
  )
}

function SavedValuesSummary({
  title = 'Saved on file',
  items,
}: {
  title?: string
  items: { label: string; value: string }[]
}) {
  const visible = items.filter((item) => item.value.trim())
  if (visible.length === 0) return null

  return (
    <div className="mb-4 space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-4 py-3 text-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">{title}</p>
      <dl className="space-y-1">
        {visible.map((item) => (
          <div key={item.label} className="flex justify-between gap-4">
            <dt className="text-[var(--color-muted-foreground)]">{item.label}</dt>
            <dd className="text-right font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function formatAddressLine(values: {
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
}) {
  const street = [values.street1, values.street2].filter(Boolean).join(', ')
  const cityLine = [values.city, values.state].filter(Boolean).join(', ')
  return [[street, cityLine, values.zip].filter(Boolean).join(' · ')].filter(Boolean).join('')
}

function isValidUsPhone(phone: string) {
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  return digits.length === 10
}

function isAddressReady(address: {
  street1: string
  city: string
  state: string
  zip: string
  phone: string
}) {
  return (
    !!address.street1.trim() &&
    !!address.city.trim() &&
    address.state.trim().length === 2 &&
    !!address.zip.trim() &&
    isValidUsPhone(address.phone)
  )
}
function parseDepositAmount(value: string): number | undefined {
  const cleaned = value.replace(/[$,\s]/g, '')
  if (!cleaned) return undefined
  const num = Number(cleaned)
  if (!Number.isFinite(num) || num <= 0) return undefined
  return Math.round(num * 100) / 100
}

function isGustoStepComplete(
  stepId: string,
  gustoSteps: Record<string, { completed?: boolean }>,
  extras: { signatorySaved: boolean; employeeSetupComplete: boolean },
  localCompleted: Set<string>,
) {
  if (localCompleted.has(stepId)) return true
  if (stepId === 'add_employees') {
    return extras.employeeSetupComplete || gustoSteps.add_employees?.completed === true
  }
  if (stepId === 'signatory') return extras.signatorySaved || gustoSteps.sign_all_forms?.completed === true
  if (stepId === 'submit') return false
  return gustoSteps[stepId]?.completed === true
}

function firstIncompleteStepIndex(
  gustoSteps: Record<string, { completed?: boolean }>,
  extras: { signatorySaved: boolean; employeeSetupComplete: boolean },
  localCompleted: Set<string>,
) {
  const idx = WIZARD_STEPS.findIndex((s) => !isGustoStepComplete(s.id, gustoSteps, extras, localCompleted))
  return idx === -1 ? WIZARD_STEPS.length - 1 : idx
}

function resolveStepIndex(
  gustoSteps: Record<string, { completed?: boolean }>,
  extras: { signatorySaved: boolean; employeeSetupComplete: boolean },
  localCompleted: Set<string>,
  savedStepIndex?: number,
) {
  const firstIncomplete = firstIncompleteStepIndex(gustoSteps, extras, localCompleted)
  if (savedStepIndex == null) return firstIncomplete
  return Math.max(firstIncomplete, Math.min(savedStepIndex, WIZARD_STEPS.length - 1))
}

export function GustoSetupWizard({
  householdId,
  companyEin,
  adminEmail,
  onRefreshStatus,
}: {
  householdId: string
  companyEin?: string
  adminEmail: string
  onRefreshStatus: () => void
}) {
  const qc = useQueryClient()
  const setupQuery = useQuery({
    queryKey: ['gusto_setup', householdId],
    enabled: !!householdId,
    queryFn: () => getGustoSetup(householdId),
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['gusto_setup', householdId] })
    void qc.invalidateQueries({ queryKey: ['gusto_status', householdId] })
    onRefreshStatus()
  }

  const setup = setupQuery.data
  const gustoSteps = setup?.onboardingSteps ?? {}
  const signatorySaved = (setup?.signatories?.length ?? 0) > 0
  const bankOnFile = (setup?.bankAccounts.length ?? 0) > 0
  const bankOnFileAccount = setup?.bankAccounts[0]
  const savedProgress = useMemo(() => loadGustoSetupProgress(householdId), [householdId])
  const [localCompleted, setLocalCompleted] = useState<Set<string>>(
    () => new Set(savedProgress?.completedStepIds ?? []),
  )

  const [stepIndex, setStepIndex] = useState(0)
  const [initialized, setInitialized] = useState(false)

  const [address, setAddress] = useState({ street1: '', street2: '', city: '', state: '', zip: '', phone: '' })
  const [bank, setBank] = useState({
    routingNumber: '',
    accountNumber: '',
    accountType: 'Checking' as 'Checking' | 'Savings',
    name: 'Payroll account',
  })
  const [federalTax, setFederalTax] = useState({
    legalName: '',
    ein: companyEin ?? '',
    taxPayerType: 'Sole proprietor',
    filingForm: '941' as '941' | '944',
  })
  const [einLocked, setEinLocked] = useState(false)
  const [industry, setIndustry] = useState({ naicsCode: '814110' })
  const [paySchedule, setPaySchedule] = useState({
    frequency: 'Every other week',
    anchorPayDate: format(addDays(new Date(), 14), 'yyyy-MM-dd'),
    anchorEndOfPayPeriod: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
  })
  const [signatory, setSignatory] = useState({
    firstName: '',
    lastName: '',
    title: 'Owner',
    email: adminEmail,
    phone: '',
    birthday: '',
    homeAddress: { street1: '', street2: '', city: '', state: '', zip: '' },
  })
  const [deposits, setDeposits] = useState({ deposit1: '', deposit2: '' })
  const [stateTaxValues, setStateTaxValues] = useState<StateTaxValuesByState>({})
  const [selectedNannyId, setSelectedNannyId] = useState('')

  const { data: nannies } = useHouseholdNannies()
  const activeNannies = useMemo(
    () => (nannies ?? []).filter(isNannyActive),
    [nannies],
  )

  const gustoStatusQuery = useQuery({
    queryKey: ['gusto_status', householdId],
    enabled: !!householdId,
    queryFn: () => getGustoStatus(householdId),
  })

  const employeeSetupComplete = useMemo(
    () => (gustoStatusQuery.data?.employees ?? []).some((e) => e.onboarding_status === 'onboarding_completed'),
    [gustoStatusQuery.data],
  )

  useEffect(() => {
    if (selectedNannyId || activeNannies.length === 0) return
    setSelectedNannyId(activeNannies[0]!.id)
  }, [activeNannies, selectedNannyId])

  useEffect(() => {
    if (!setup || initialized) return
    const extras = { signatorySaved, employeeSetupComplete }
    const drafts = savedProgress?.drafts

    const loc = setup.locations[0] as
      | { street_1?: string; city?: string; state?: string; zip?: string; phone_number?: string; phone?: string }
      | undefined
    if (loc) {
      setAddress({
        street1: loc.street_1 ?? '',
        street2: '',
        city: loc.city ?? '',
        state: loc.state ?? '',
        zip: loc.zip ?? '',
        phone: loc.phone_number ?? loc.phone ?? '',
      })
    }

    const tax = setup.federalTax
    if (tax) {
      setFederalTax((prev) => ({
        ...prev,
        legalName: String(tax.legal_name ?? prev.legalName),
        ein: String(tax.ein ?? prev.ein ?? companyEin ?? ''),
        taxPayerType: String(tax.tax_payer_type ?? prev.taxPayerType),
        filingForm: (tax.filing_form as '941' | '944') ?? prev.filingForm,
      }))
      setEinLocked(tax.has_ein === true)
    } else if (companyEin) {
      setFederalTax((prev) => ({ ...prev, ein: companyEin }))
      setEinLocked(true)
    }

    const ind = setup.industry
    if (ind?.naics_code) {
      setIndustry({ naicsCode: String(ind.naics_code) })
    }

    const schedule = setup.paySchedules[0] as
      | { frequency?: string; anchor_pay_date?: string; anchor_end_of_pay_period?: string }
      | undefined
    if (schedule?.frequency) {
      setPaySchedule({
        frequency: schedule.frequency,
        anchorPayDate: schedule.anchor_pay_date ?? format(addDays(new Date(), 14), 'yyyy-MM-dd'),
        anchorEndOfPayPeriod:
          schedule.anchor_end_of_pay_period ?? format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      })
    }

    const sig = setup.signatories[0] as
      | {
          first_name?: string
          last_name?: string
          title?: string
          email?: string
          phone?: string
          birthday?: string
          home_address?: {
            street_1?: string
            street_2?: string
            city?: string
            state?: string
            zip?: string
          }
        }
      | undefined
    if (sig) {
      setSignatory({
        firstName: sig.first_name ?? '',
        lastName: sig.last_name ?? '',
        title: sig.title ?? 'Owner',
        email: sig.email ?? adminEmail,
        phone: sig.phone ?? '',
        birthday: sig.birthday ?? '',
        homeAddress: {
          street1: sig.home_address?.street_1 ?? '',
          street2: sig.home_address?.street_2 ?? '',
          city: sig.home_address?.city ?? '',
          state: sig.home_address?.state ?? '',
          zip: sig.home_address?.zip ?? '',
        },
      })
    }

    const bankAcct = setup.bankAccounts[0]
    if (bankAcct) {
      setBank({
        routingNumber: bankAcct.routing_number ?? '',
        accountNumber: bankAcct.hidden_account_number ?? redactAccountNumber(''),
        accountType: bankAcct.account_type === 'Savings' ? 'Savings' : 'Checking',
        name: bankAcct.name ?? 'Payroll account',
      })
    }

    if (drafts?.address) setAddress((prev) => ({ ...prev, ...drafts.address }))
    if (drafts?.bank) {
      const bankDraft = drafts.bank
      setBank((prev) => ({
        ...prev,
        routingNumber: bankDraft.routingNumber || prev.routingNumber,
        accountType: bankDraft.accountType || prev.accountType,
        name: bankDraft.name || prev.name,
        accountNumber: bankAcct
          ? (bankAcct.hidden_account_number ?? prev.accountNumber)
          : isRedactedAccountNumber(bankDraft.accountNumber)
            ? bankDraft.accountNumber
            : bankDraft.accountNumber || prev.accountNumber,
      }))
    }
    if (drafts?.federalTax) setFederalTax((prev) => ({ ...prev, ...drafts.federalTax }))
    if (drafts?.industry) setIndustry((prev) => ({ ...prev, ...drafts.industry }))
    if (drafts?.paySchedule) setPaySchedule((prev) => ({ ...prev, ...drafts.paySchedule }))
    if (drafts?.signatory) {
      setSignatory((prev) => ({
        ...prev,
        ...drafts.signatory,
        homeAddress: { ...prev.homeAddress, ...drafts.signatory?.homeAddress },
      }))
    }
    if (drafts?.deposits) setDeposits(drafts.deposits)

    const initialStateTaxValues: StateTaxValuesByState = {}
    for (const state of Object.keys(setup.stateRequirements ?? {})) {
      initialStateTaxValues[state] = extractStateTaxValues(setup.stateRequirements[state])
    }
    if (Object.keys(initialStateTaxValues).length > 0) {
      setStateTaxValues(initialStateTaxValues)
    }
    if (drafts?.stateTaxValues) {
      setStateTaxValues((prev) => {
        const next = { ...prev, ...initialStateTaxValues }
        for (const [state, values] of Object.entries(drafts.stateTaxValues ?? {})) {
          next[state] = { ...(next[state] ?? {}), ...values }
        }
        return next
      })
    } else if (drafts?.stateTaxJson && drafts.stateTaxJson.trim() !== '{}') {
      try {
        const legacy = JSON.parse(drafts.stateTaxJson) as Record<string, unknown>
        const firstState = Object.keys(setup.stateRequirements ?? {})[0]
        if (firstState) {
          setStateTaxValues((prev) => ({
            ...prev,
            [firstState]: { ...(prev[firstState] ?? {}), ...(legacy as StateTaxValuesByState[string]) },
          }))
        }
      } catch {
        /* ignore invalid legacy draft */
      }
    }

    const resumeCompleted = new Set(savedProgress?.completedStepIds ?? [])
    if (setup.bankAccounts.length > 0) resumeCompleted.add('add_bank_info')
    if (setup.paySchedules.length > 0) resumeCompleted.add('payroll_schedule')
    setLocalCompleted(resumeCompleted)

    setStepIndex(resolveStepIndex(gustoSteps, extras, resumeCompleted, savedProgress?.stepIndex))
    setInitialized(true)
  }, [setup, companyEin, gustoSteps, signatorySaved, employeeSetupComplete, initialized, savedProgress, adminEmail])

  useEffect(() => {
    setInitialized(false)
    setStepIndex(0)
    const progress = loadGustoSetupProgress(householdId)
    setLocalCompleted(new Set(progress?.completedStepIds ?? []))
  }, [householdId])

  useEffect(() => {
    if (!initialized || !householdId) return
    const timer = window.setTimeout(() => {
      updateGustoSetupDrafts(householdId, stepIndex, {
        address,
        bank: bankOnFile
          ? {
              ...bank,
              accountNumber:
                bankOnFileAccount?.hidden_account_number ??
                (isRedactedAccountNumber(bank.accountNumber)
                  ? bank.accountNumber
                  : redactAccountNumber(bank.accountNumber)),
            }
          : bank,
        federalTax,
        industry,
        paySchedule,
        signatory,
        deposits,
        stateTaxValues,
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [
    initialized,
    householdId,
    stepIndex,
    address,
    bank,
    bankOnFile,
    bankOnFileAccount?.hidden_account_number,
    federalTax,
    industry,
    paySchedule,
    signatory,
    deposits,
    stateTaxValues,
  ])

  const pendingForms = useMemo(
    () => (setup?.forms ?? []).filter((f) => f.requires_signing && !f.signed),
    [setup?.forms],
  )

  const stateCodes = Object.keys(setup?.stateRequirements ?? {})
  const stateTaxRequirementsReady =
    stateCodes.length > 0 && stateCodes.every((state) => stateHasTaxRequirements(setup?.stateRequirements[state]))
  const canSaveStateTax =
    stateTaxRequirementsReady &&
    stateCodes.every(
      (state) =>
        missingRequiredStateTaxFields(setup?.stateRequirements[state], stateTaxValues[state] ?? {}).length === 0,
    )
  const currentStep = WIZARD_STEPS[stepIndex]
  const extras = { signatorySaved, employeeSetupComplete }

  useEffect(() => {
    if (currentStep.id !== 'state_setup' || !householdId) return
    void setupQuery.refetch()
  }, [currentStep.id, householdId, setupQuery.refetch])

  const goToStep = (index: number) => {
    const next = Math.max(0, Math.min(index, WIZARD_STEPS.length - 1))
    setStepIndex(next)
    updateGustoSetupStepIndex(householdId, next)
  }

  const advance = () => goToStep(stepIndex + 1)
  const goBack = () => goToStep(stepIndex - 1)

  const onStepSaved = async () => {
    const stepId = currentStep.id
    const nextIndex = Math.min(stepIndex + 1, WIZARD_STEPS.length - 1)
    markGustoStepComplete(householdId, stepId, nextIndex)
    setLocalCompleted((prev) => new Set([...prev, stepId]))
    await qc.invalidateQueries({ queryKey: ['gusto_setup', householdId] })
    await qc.invalidateQueries({ queryKey: ['gusto_status', householdId] })
    onRefreshStatus()
    goToStep(nextIndex)
  }

  const onContinue = () => {
    if (currentStep.id === 'add_employees' && !stepComplete) {
      const emp = gustoStatusQuery.data?.employees.find((e) => e.household_nanny_id === selectedNannyId)
      if (!emp?.employee_uuid) {
        markGustoStepComplete(householdId, 'add_employees', stepIndex + 1)
        setLocalCompleted((prev) => new Set([...prev, 'add_employees']))
      }
    }
    advance()
  }

  const selectedGustoEmployee = gustoStatusQuery.data?.employees.find(
    (e) => e.household_nanny_id === selectedNannyId,
  )
  const hasStartedEmployeeSetup = !!selectedGustoEmployee?.employee_uuid

  const saveLocation = useMutation({
    mutationFn: () => saveGustoLocation(householdId, address),
    onSuccess: () => {
      toast.success('Business address saved')
      void onStepSaved()
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const saveBank = useMutation({
    mutationFn: () => saveGustoBankAccount(householdId, bank),
    onSuccess: () => {
      toast.success('Bank account saved')
      const redacted =
        bankOnFileAccount?.hidden_account_number ?? redactAccountNumber(bank.accountNumber)
      setBank((prev) => ({ ...prev, accountNumber: redacted }))
      updateGustoSetupDrafts(householdId, Math.min(stepIndex + 1, WIZARD_STEPS.length - 1), {
        bank: { ...bank, accountNumber: redacted },
      })
      void onStepSaved()
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const saveFederal = useMutation({
    mutationFn: () => saveGustoFederalTax(householdId, federalTax),
    onSuccess: () => {
      toast.success('Federal tax details saved')
      void onStepSaved()
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const saveIndustryMutation = useMutation({
    mutationFn: () => saveGustoIndustry(householdId, industry),
    onSuccess: () => {
      toast.success('Industry saved')
      void onStepSaved()
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const saveSchedule = useMutation({
    mutationFn: () => saveGustoPaySchedule(householdId, paySchedule),
    onSuccess: () => {
      toast.success('Pay schedule saved')
      void onStepSaved()
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const saveSignatoryMutation = useMutation({
    mutationFn: () =>
      saveGustoSignatory(householdId, {
        ...signatory,
        homeAddress: signatory.homeAddress,
      }),
    onSuccess: () => {
      toast.success('Signatory saved')
      void onStepSaved()
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const verifyBank = useMutation({
    mutationFn: () => {
      if (setup?.gustoEnv === 'demo') {
        return verifyGustoBankAccount(householdId, { sendTestDeposits: true })
      }
      const deposit1 = parseDepositAmount(deposits.deposit1)
      const deposit2 = parseDepositAmount(deposits.deposit2)
      if (deposit1 == null || deposit2 == null) {
        throw new Error('Enter both micro-deposit amounts from your bank statement (e.g. 0.07 and 0.13).')
      }
      return verifyGustoBankAccount(householdId, { deposit1, deposit2 })
    },
    onSuccess: (result) => {
      toast.success(result.verified ? 'Bank account verified' : `Bank status: ${result.verificationStatus}`)
      void onStepSaved()
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const saveState = useMutation({
    mutationFn: async () => {
      if (stateCodes.length === 0) throw new Error('Link a nanny with a work location first')
      if (!stateTaxRequirementsReady) {
        throw new Error('State tax fields are not ready yet. Finish nanny setup, then refresh this step.')
      }

      for (const state of stateCodes) {
        const missing = missingRequiredStateTaxFields(
          setup?.stateRequirements[state],
          stateTaxValues[state] ?? {},
        )
        if (missing.length > 0) {
          throw new Error(`Complete all required ${state} tax fields before saving.`)
        }

        const payload = buildStateTaxUpdatePayload(
          setup?.stateRequirements[state],
          stateTaxValues[state] ?? {},
        )
        if (payload.requirement_sets.length === 0) continue

        await saveGustoStateTax(householdId, {
          state,
          requirementSets: payload.requirement_sets,
        })
      }
    },
    onSuccess: () => {
      toast.success('State tax information saved')
      void onStepSaved()
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const signFormsMutation = useMutation({
    mutationFn: () => signGustoForms(householdId),
    onSuccess: (result) => {
      toast.success(result.signedCount ? `Signed ${result.signedCount} form(s)` : 'No forms needed signing')
      void onStepSaved()
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const finishMutation = useMutation({
    mutationFn: () => finishGustoOnboarding(householdId),
    onSuccess: () => {
      toast.success('Onboarding submitted to Gusto for review')
      invalidate()
    },
    onError: (err) => toast.error(formatSupabaseError(err)),
  })

  const stepComplete = currentStep
    ? isGustoStepComplete(currentStep.id, gustoSteps, extras, localCompleted)
    : false

  const isSaving =
    saveLocation.isPending ||
    saveBank.isPending ||
    saveFederal.isPending ||
    saveIndustryMutation.isPending ||
    saveSchedule.isPending ||
    saveSignatoryMutation.isPending ||
    verifyBank.isPending ||
    saveState.isPending ||
    signFormsMutation.isPending ||
    finishMutation.isPending

  const canVerifyBank =
    setup?.gustoEnv === 'demo' ||
    (parseDepositAmount(deposits.deposit1) != null && parseDepositAmount(deposits.deposit2) != null)

  if (setupQuery.isLoading) {
    return <p className="text-sm text-[var(--color-muted-foreground)]">Loading setup…</p>
  }

  if (setupQuery.isError) {
    return <p className="text-sm text-red-600">{formatSupabaseError(setupQuery.error)}</p>
  }

  if (!currentStep) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg">Company setup</CardTitle>
            <CardDescription>
              Step {stepIndex + 1} of {WIZARD_STEPS.length} — {currentStep.label}
            </CardDescription>
          </div>
          {stepComplete && currentStep.id !== 'submit' && <Badge variant="success">Complete</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <nav aria-label="Setup progress" className="overflow-x-auto pb-1">
          <ol className="flex min-w-max gap-1">
            {WIZARD_STEPS.map((step, i) => {
              const done = isGustoStepComplete(step.id, gustoSteps, extras, localCompleted)
              const active = i === stepIndex
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => goToStep(i)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors',
                      active
                        ? 'bg-[var(--color-primary)]/12 font-medium text-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/25'
                        : done
                          ? 'text-emerald-700 hover:bg-emerald-50'
                          : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]/50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                        done
                          ? 'bg-emerald-600 text-white'
                          : active
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]',
                      )}
                    >
                      {done ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <div className="min-h-[200px]">
          {currentStep.id === 'add_addresses' && (
            <StepPanel
              title="Business address"
              description="Your household filing and mailing address. This is also the default work location for your nanny."
              complete={stepComplete}
            >
              {(stepComplete || address.street1.trim()) && (
                <SavedValuesSummary
                  title={stepComplete ? 'Saved on file' : 'Your progress'}
                  items={[
                    { label: 'Address', value: formatAddressLine(address) },
                    { label: 'Phone', value: formatPhoneDisplay(address.phone) },
                  ]}
                />
              )}
              <AddressFields
                prefix="company"
                values={address}
                onChange={(next) => setAddress({ ...address, ...next })}
              />
              <div className="mt-4 space-y-2">
                <Label htmlFor="company-phone">Phone</Label>
                <Input
                  id="company-phone"
                  type="tel"
                  placeholder="10-digit US number"
                  value={address.phone}
                  onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                />
              </div>
            </StepPanel>
          )}

          {currentStep.id === 'add_bank_info' && (
            <StepPanel
              title="Bank account"
              description="Account used to fund payroll. Gusto sends micro-deposits for verification in a later step."
              complete={stepComplete}
            >
              {(stepComplete || bankOnFile || bank.routingNumber) && (
                <SavedValuesSummary
                  title={bankOnFile || stepComplete ? 'Saved on file' : 'Your progress'}
                  items={[
                    { label: 'Account name', value: bank.name },
                    { label: 'Routing number', value: bank.routingNumber },
                    {
                      label: 'Account number',
                      value:
                        bankOnFileAccount?.hidden_account_number ??
                        (isRedactedAccountNumber(bank.accountNumber)
                          ? bank.accountNumber
                          : bank.accountNumber
                            ? redactAccountNumber(bank.accountNumber)
                            : ''),
                    },
                    { label: 'Account type', value: bank.accountType },
                  ]}
                />
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Routing number</Label>
                  <Input
                    value={bank.routingNumber}
                    readOnly={bankOnFile}
                    className={bankOnFile ? 'bg-[var(--color-muted)]/50' : undefined}
                    onChange={(e) => setBank({ ...bank, routingNumber: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account number</Label>
                  <Input
                    value={
                      bankOnFile
                        ? (bankOnFileAccount?.hidden_account_number ?? bank.accountNumber)
                        : bank.accountNumber
                    }
                    readOnly={bankOnFile}
                    placeholder={bankOnFile ? undefined : 'Account number'}
                    className={bankOnFile ? 'bg-[var(--color-muted)]/50 text-[var(--color-muted-foreground)]' : undefined}
                    onChange={(e) => setBank({ ...bank, accountNumber: e.target.value.replace(/\D/g, '') })}
                  />
                  {bankOnFile && (
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Full account number is hidden after saving. Contact support to change bank details.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Account type</Label>
                  <select
                    className={selectCn}
                    value={bank.accountType}
                    disabled={bankOnFile}
                    onChange={(e) => setBank({ ...bank, accountType: e.target.value as 'Checking' | 'Savings' })}
                  >
                    <option value="Checking">Checking</option>
                    <option value="Savings">Savings</option>
                  </select>
                </div>
              </div>
            </StepPanel>
          )}

          {currentStep.id === 'federal_tax_setup' && (
            <StepPanel
              title="Federal tax details"
              description="Employer tax information from your IRS records."
              complete={stepComplete}
            >
              {(stepComplete || federalTax.legalName.trim()) && (
                <SavedValuesSummary
                  title={stepComplete ? 'Saved on file' : 'Your progress'}
                  items={[
                    { label: 'Legal name', value: federalTax.legalName },
                    { label: 'EIN', value: formatEinDisplay(federalTax.ein) },
                    { label: 'Tax payer type', value: federalTax.taxPayerType },
                    { label: 'Filing form', value: federalTax.filingForm },
                  ]}
                />
              )}
              <PayrollHelpCallout title={FEDERAL_EIN_HELP.title} className="mb-4">
                {FEDERAL_EIN_HELP.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                <ul className="list-disc space-y-1 pl-5">
                  {FEDERAL_EIN_HELP.links.map((link) => (
                    <li key={link.href}>
                      <PayrollHelpLink href={link.href}>{link.label}</PayrollHelpLink>
                    </li>
                  ))}
                </ul>
                {setup?.gustoEnv === 'demo' && (
                  <p className="text-xs text-blue-800/80">{FEDERAL_EIN_HELP.demoNote}</p>
                )}
              </PayrollHelpCallout>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Legal company name</Label>
                  <Input
                    value={federalTax.legalName}
                    onChange={(e) => setFederalTax({ ...federalTax, legalName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>EIN</Label>
                  <Input
                    value={federalTax.ein}
                    disabled={einLocked}
                    onChange={(e) => setFederalTax({ ...federalTax, ein: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                  />
                  {einLocked && (
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      EIN was set when you created your Gusto company and cannot be changed here.
                    </p>
                  )}
                  {!einLocked && !federalTax.ein && (
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Enter the 9-digit EIN from your IRS confirmation letter or prior tax filings.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Tax payer type</Label>
                  <select
                    className={selectCn}
                    value={federalTax.taxPayerType}
                    onChange={(e) => setFederalTax({ ...federalTax, taxPayerType: e.target.value })}
                  >
                    {TAX_PAYER_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Federal filing form</Label>
                  <select
                    className={selectCn}
                    value={federalTax.filingForm}
                    onChange={(e) => setFederalTax({ ...federalTax, filingForm: e.target.value as '941' | '944' })}
                  >
                    <option value="941">941 (quarterly)</option>
                    <option value="944">944 (annual)</option>
                  </select>
                </div>
              </div>
            </StepPanel>
          )}

          {currentStep.id === 'select_industry' && (
            <StepPanel
              title="Industry"
              description="814110 is typical for private household employers (nanny payroll)."
              complete={stepComplete}
            >
              {(stepComplete || industry.naicsCode) && (
                <SavedValuesSummary
                  title={stepComplete ? 'Saved on file' : 'Your progress'}
                  items={[{ label: 'NAICS code', value: industry.naicsCode }]}
                />
              )}
              <div className="space-y-2">
                <Label>NAICS code</Label>
                <Input
                  value={industry.naicsCode}
                  onChange={(e) => setIndustry({ naicsCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                />
              </div>
            </StepPanel>
          )}

          {currentStep.id === 'payroll_schedule' && (
            <StepPanel
              title="Pay schedule"
              description="When your nanny will be paid through Gusto."
              complete={stepComplete}
            >
              {(stepComplete || paySchedule.frequency) && (
                <SavedValuesSummary
                  title={stepComplete ? 'Saved on file' : 'Your progress'}
                  items={[
                    { label: 'Pay frequency', value: paySchedule.frequency },
                    { label: 'First pay date', value: paySchedule.anchorPayDate },
                    { label: 'First pay period end', value: paySchedule.anchorEndOfPayPeriod },
                  ]}
                />
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Pay frequency</Label>
                  <select
                    className={selectCn}
                    value={paySchedule.frequency}
                    onChange={(e) => setPaySchedule({ ...paySchedule, frequency: e.target.value })}
                  >
                    {PAY_FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>First pay date</Label>
                  <Input
                    type="date"
                    value={paySchedule.anchorPayDate}
                    onChange={(e) => setPaySchedule({ ...paySchedule, anchorPayDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>First pay period end date</Label>
                  <Input
                    type="date"
                    value={paySchedule.anchorEndOfPayPeriod}
                    onChange={(e) => setPaySchedule({ ...paySchedule, anchorEndOfPayPeriod: e.target.value })}
                  />
                </div>
              </div>
            </StepPanel>
          )}

          {currentStep.id === 'verify_bank_info' && (
            <StepPanel
              title="Verify bank account"
              description={
                setup?.gustoEnv === 'demo'
                  ? 'In demo, we simulate micro-deposits and verify instantly.'
                  : 'After micro-deposits arrive (1–2 business days), enter the two deposit amounts.'
              }
              complete={stepComplete}
            >
              {bankOnFileAccount && (
                <SavedValuesSummary
                  title="Bank on file"
                  items={[
                    { label: 'Account name', value: bankOnFileAccount.name ?? bank.name },
                    { label: 'Routing number', value: bankOnFileAccount.routing_number ?? bank.routingNumber },
                    {
                      label: 'Account number',
                      value: bankOnFileAccount.hidden_account_number ?? redactAccountNumber(bank.accountNumber),
                    },
                    {
                      label: 'Verification',
                      value: bankOnFileAccount.verification_status ?? 'pending',
                    },
                  ]}
                />
              )}
              {setup?.gustoEnv !== 'demo' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Deposit 1 ($)</Label>
                    <Input
                      inputMode="decimal"
                      value={deposits.deposit1}
                      onChange={(e) => setDeposits({ ...deposits, deposit1: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Deposit 2 ($)</Label>
                    <Input
                      inputMode="decimal"
                      value={deposits.deposit2}
                      onChange={(e) => setDeposits({ ...deposits, deposit2: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </StepPanel>
          )}

          {currentStep.id === 'add_employees' && (
            <StepPanel
              title="Add your nanny"
              description="Link your nanny in Gusto for payroll. Ask them to enter their personal details, or enter everything yourself."
              complete={stepComplete}
            >
              {activeNannies.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Add a nanny in Settings first, then return to this step.
                </p>
              ) : selectedNannyId ? (
                <GustoEmployeeSetupPanel
                  householdId={householdId}
                  householdNannyId={selectedNannyId}
                  nannies={activeNannies}
                  showNannySelector={activeNannies.length > 1}
                  onNannyIdChange={setSelectedNannyId}
                  onUpdated={() => {
                    void qc.invalidateQueries({ queryKey: ['gusto_status', householdId] })
                    onRefreshStatus()
                  }}
                  onEmployeeComplete={() => void onStepSaved()}
                />
              ) : null}
            </StepPanel>
          )}

          {currentStep.id === 'state_setup' && (
            <StepPanel
              title="State taxes"
              description={
                stateCodes.length
                  ? `State tax setup for ${stateCodes.join(', ')}.`
                  : 'Complete after your nanny is linked with a work location.'
              }
              complete={stepComplete}
            >
              {stateCodes.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  No state requirements yet. Add your nanny in the previous step first, then return here.
                </p>
              ) : !stateTaxRequirementsReady ? (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Gusto has not returned state tax fields yet. Finish linking your nanny with a work location in
                    the previous step, then refresh.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void setupQuery.refetch()}
                    disabled={setupQuery.isFetching}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${setupQuery.isFetching ? 'animate-spin' : ''}`} />
                    {setupQuery.isFetching ? 'Refreshing…' : 'Refresh requirements'}
                  </Button>
                </div>
              ) : (
                <>
                  <PayrollHelpCallout title={STATE_TAX_STEP_HELP.title} className="mb-4">
                    {STATE_TAX_STEP_HELP.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </PayrollHelpCallout>
                  {(stepComplete ||
                    stateCodes.some((state) =>
                      stateTaxValuesSummary(setup?.stateRequirements[state], stateTaxValues[state] ?? {}),
                    )) && (
                    <SavedValuesSummary
                      title={stepComplete ? 'Saved on file' : 'Your progress'}
                      items={stateCodes.flatMap((state) => {
                        const summary = stateTaxValuesSummary(
                          setup?.stateRequirements[state],
                          stateTaxValues[state] ?? {},
                        )
                        return summary ? [{ label: state, value: summary }] : []
                      })}
                    />
                  )}
                  {stateCodes.map((state) => (
                    <div key={state} className="mb-6">
                      <GustoStateTaxForm
                        state={state}
                        requirements={setup?.stateRequirements[state]}
                        values={stateTaxValues[state] ?? {}}
                        onChange={(next) =>
                          setStateTaxValues((prev) => ({
                            ...prev,
                            [state]: next,
                          }))
                        }
                      />
                    </div>
                  ))}
                </>
              )}
            </StepPanel>
          )}

          {currentStep.id === 'signatory' && (
            <StepPanel
              title="Authorized signatory"
              description="Person authorized to sign payroll tax forms on behalf of your household."
              complete={stepComplete}
            >
              {(stepComplete || signatory.firstName.trim() || signatorySaved) && (
                <SavedValuesSummary
                  title={stepComplete || signatorySaved ? 'Saved on file' : 'Your progress'}
                  items={[
                    {
                      label: 'Name',
                      value: [signatory.firstName, signatory.lastName].filter(Boolean).join(' '),
                    },
                    { label: 'Title', value: signatory.title },
                    { label: 'Email', value: signatory.email },
                    { label: 'Phone', value: formatPhoneDisplay(signatory.phone) },
                    { label: 'Home address', value: formatAddressLine(signatory.homeAddress) },
                  ]}
                />
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>First name</Label>
                  <Input
                    value={signatory.firstName}
                    onChange={(e) => setSignatory({ ...signatory, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last name</Label>
                  <Input
                    value={signatory.lastName}
                    onChange={(e) => setSignatory({ ...signatory, lastName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={signatory.title}
                    onChange={(e) => setSignatory({ ...signatory, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={signatory.email}
                    onChange={(e) => setSignatory({ ...signatory, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="mt-4">
                <AddressFields
                  prefix="signatory"
                  values={signatory.homeAddress}
                  onChange={(homeAddress) => setSignatory({ ...signatory, homeAddress })}
                />
              </div>
            </StepPanel>
          )}

          {currentStep.id === 'sign_all_forms' && (
            <StepPanel
              title="Sign required forms"
              description="Electronically sign payroll forms required by Gusto."
              complete={stepComplete}
            >
              {(setup?.forms.length ?? 0) > 0 && (
                <SavedValuesSummary
                  title={stepComplete ? 'Saved on file' : 'Forms status'}
                  items={[
                    {
                      label: 'Signed',
                      value: String((setup?.forms ?? []).filter((f) => f.signed).length),
                    },
                    {
                      label: 'Pending signature',
                      value: String(pendingForms.length),
                    },
                  ]}
                />
              )}
              {pendingForms.length > 0 ? (
                <ul className="mb-4 space-y-1 text-sm">
                  {pendingForms.map((f) => (
                    <li key={f.uuid}>{f.name ?? f.uuid}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  {stepComplete ? 'All required forms are signed.' : 'No pending forms yet — complete prior steps first.'}
                </p>
              )}
            </StepPanel>
          )}

          {currentStep.id === 'submit' && (
            <StepPanel
              title="Submit to Gusto"
              description="Send your completed setup for Gusto review. In demo, approve the company from the status card above."
            >
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Make sure all prior steps show as complete in the progress bar above.
              </p>
            </StepPanel>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button type="button" variant="outline" onClick={goBack} disabled={stepIndex === 0 || isSaving}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>

          <div className="flex flex-wrap gap-2">
            {renderPrimaryAction({
              stepId: currentStep.id,
              stepComplete,
              isSaving,
              setup,
              pendingForms,
              stateCodes,
              canSaveAddress: isAddressReady(address),
              canVerifyBank,
              canSaveStateTax,
              stateTaxRequirementsReady,
              hasStartedEmployeeSetup,
              mutations: {
                saveLocation,
                saveBank,
                saveFederal,
                saveIndustryMutation,
                saveSchedule,
                verifyBank,
                saveState,
                saveSignatoryMutation,
                signFormsMutation,
                finishMutation,
              },
              onContinue: onContinue,
              onRefreshStateTax: () => void setupQuery.refetch(),
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StepPanel({
  title,
  description,
  complete,
  children,
}: {
  title: string
  description: string
  complete?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{description}</p>
      </div>
      {complete ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          This step is complete. You can continue or go back to review.
        </p>
      ) : null}
      {children}
    </div>
  )
}

function renderPrimaryAction({
  stepId,
  stepComplete,
  isSaving,
  setup,
  pendingForms,
  stateCodes,
  canSaveAddress,
  canVerifyBank,
  canSaveStateTax,
  stateTaxRequirementsReady,
  hasStartedEmployeeSetup,
  mutations,
  onContinue,
  onRefreshStateTax,
}: {
  stepId: WizardStepId
  stepComplete: boolean
  isSaving: boolean
  setup: { gustoEnv?: string } | undefined
  pendingForms: { uuid: string; name?: string }[]
  stateCodes: string[]
  canSaveAddress: boolean
  canVerifyBank: boolean
  canSaveStateTax: boolean
  stateTaxRequirementsReady: boolean
  hasStartedEmployeeSetup: boolean
  mutations: {
    saveLocation: { mutate: () => void; isPending: boolean }
    saveBank: { mutate: () => void; isPending: boolean }
    saveFederal: { mutate: () => void; isPending: boolean }
    saveIndustryMutation: { mutate: () => void; isPending: boolean }
    saveSchedule: { mutate: () => void; isPending: boolean }
    verifyBank: { mutate: () => void; isPending: boolean }
    saveState: { mutate: () => void; isPending: boolean }
    saveSignatoryMutation: { mutate: () => void; isPending: boolean }
    signFormsMutation: { mutate: () => void; isPending: boolean }
    finishMutation: { mutate: () => void; isPending: boolean }
  }
  onContinue: () => void
  onRefreshStateTax: () => void
}) {
  if (stepComplete && stepId !== 'submit') {
    return (
      <Button type="button" onClick={onContinue} disabled={isSaving}>
        Continue
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    )
  }

  switch (stepId) {
    case 'add_addresses':
      return (
        <Button
          onClick={() => mutations.saveLocation.mutate()}
          disabled={mutations.saveLocation.isPending || !canSaveAddress}
        >
          {mutations.saveLocation.isPending ? 'Saving…' : 'Save & continue'}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      )
    case 'add_bank_info':
      return (
        <Button onClick={() => mutations.saveBank.mutate()} disabled={mutations.saveBank.isPending}>
          {mutations.saveBank.isPending ? 'Saving…' : 'Save & continue'}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      )
    case 'federal_tax_setup':
      return (
        <Button onClick={() => mutations.saveFederal.mutate()} disabled={mutations.saveFederal.isPending}>
          {mutations.saveFederal.isPending ? 'Saving…' : 'Save & continue'}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      )
    case 'select_industry':
      return (
        <Button onClick={() => mutations.saveIndustryMutation.mutate()} disabled={mutations.saveIndustryMutation.isPending}>
          {mutations.saveIndustryMutation.isPending ? 'Saving…' : 'Save & continue'}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      )
    case 'payroll_schedule':
      return (
        <Button onClick={() => mutations.saveSchedule.mutate()} disabled={mutations.saveSchedule.isPending}>
          {mutations.saveSchedule.isPending ? 'Saving…' : 'Save & continue'}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      )
    case 'verify_bank_info':
      return (
        <Button
          onClick={() => mutations.verifyBank.mutate()}
          disabled={mutations.verifyBank.isPending || !canVerifyBank}
        >
          {mutations.verifyBank.isPending
            ? 'Verifying…'
            : setup?.gustoEnv === 'demo'
              ? 'Send test deposits & verify'
              : 'Verify & continue'}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      )
    case 'add_employees':
      return (
        <Button type="button" onClick={onContinue} disabled={isSaving}>
          {stepComplete ? 'Continue' : hasStartedEmployeeSetup ? 'Continue' : 'Continue without nanny'}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      )
    case 'state_setup':
      if (stepComplete) {
        return (
          <Button type="button" onClick={onContinue} disabled={isSaving}>
            Continue
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )
      }
      if (stateCodes.length === 0 || !stateTaxRequirementsReady) {
        return (
          <Button type="button" variant="outline" onClick={onRefreshStateTax} disabled={isSaving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh requirements
          </Button>
        )
      }
      return (
        <Button
          onClick={() => mutations.saveState.mutate()}
          disabled={mutations.saveState.isPending || !canSaveStateTax}
        >
          {mutations.saveState.isPending ? 'Saving…' : 'Save & continue'}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      )
    case 'signatory':
      return (
        <Button onClick={() => mutations.saveSignatoryMutation.mutate()} disabled={mutations.saveSignatoryMutation.isPending}>
          {mutations.saveSignatoryMutation.isPending ? 'Saving…' : 'Save & continue'}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      )
    case 'sign_all_forms':
      return (
        <Button onClick={() => mutations.signFormsMutation.mutate()} disabled={mutations.signFormsMutation.isPending}>
          {mutations.signFormsMutation.isPending
            ? 'Signing…'
            : pendingForms.length
              ? `Sign ${pendingForms.length} form(s) & continue`
              : 'Continue'}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      )
    case 'submit':
      return (
        <Button onClick={() => mutations.finishMutation.mutate()} disabled={mutations.finishMutation.isPending}>
          {mutations.finishMutation.isPending ? 'Submitting…' : 'Submit onboarding to Gusto'}
        </Button>
      )
    default:
      return null
  }
}
