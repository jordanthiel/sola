import type { GustoAddressInput } from '@/lib/gusto-api'

export type GustoSetupDrafts = {
  address?: GustoAddressInput & { phone?: string }
  bank?: {
    routingNumber: string
    accountNumber: string
    accountType: 'Checking' | 'Savings'
    name: string
  }
  federalTax?: {
    legalName: string
    ein: string
    taxPayerType: string
    filingForm: '941' | '944'
  }
  industry?: { naicsCode: string }
  paySchedule?: {
    frequency: string
    anchorPayDate: string
    anchorEndOfPayPeriod: string
  }
  signatory?: {
    firstName: string
    lastName: string
    title: string
    email: string
    phone: string
    birthday: string
    homeAddress: GustoAddressInput
  }
  deposits?: { deposit1: string; deposit2: string }
  stateTaxValues?: Record<string, Record<string, string | boolean | number | null>>
  /** @deprecated Use stateTaxValues */
  stateTaxJson?: string
}

export type GustoSetupProgress = {
  stepIndex: number
  completedStepIds: string[]
  drafts: GustoSetupDrafts
  updatedAt: string
}

/** Last 4 digits only — safe to persist after bank account is saved to Gusto. */
export function redactAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '')
  if (!digits) return ''
  if (accountNumber.includes('•') || accountNumber.includes('*')) return accountNumber
  if (digits.length <= 4) return `••••${digits}`
  return `••••${digits.slice(-4)}`
}

export function isRedactedAccountNumber(value: string): boolean {
  return /[•*]/.test(value)
}

export function formatEinDisplay(ein: string): string {
  const digits = ein.replace(/\D/g, '')
  if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2)}`
  return ein.trim()
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return phone.trim()
}

function storageKey(householdId: string) {
  return `gusto_setup_progress:${householdId}`
}

export function loadGustoSetupProgress(householdId: string): GustoSetupProgress | null {
  if (!householdId) return null
  try {
    const raw = localStorage.getItem(storageKey(householdId))
    if (!raw) return null
    return JSON.parse(raw) as GustoSetupProgress
  } catch {
    return null
  }
}

export function saveGustoSetupProgress(householdId: string, progress: GustoSetupProgress) {
  if (!householdId) return
  localStorage.setItem(
    storageKey(householdId),
    JSON.stringify({ ...progress, updatedAt: new Date().toISOString() }),
  )
}

export function markGustoStepComplete(householdId: string, stepId: string, stepIndex: number) {
  const existing = loadGustoSetupProgress(householdId)
  const completedStepIds = [...new Set([...(existing?.completedStepIds ?? []), stepId])]
  saveGustoSetupProgress(householdId, {
    stepIndex,
    completedStepIds,
    drafts: existing?.drafts ?? {},
    updatedAt: new Date().toISOString(),
  })
}

export function updateGustoSetupDrafts(householdId: string, stepIndex: number, drafts: GustoSetupDrafts) {
  const existing = loadGustoSetupProgress(householdId)
  const mergedDrafts = { ...existing?.drafts, ...drafts }
  if (mergedDrafts.stateTaxValues) {
    delete mergedDrafts.stateTaxJson
  }
  saveGustoSetupProgress(householdId, {
    stepIndex,
    completedStepIds: existing?.completedStepIds ?? [],
    drafts: mergedDrafts,
    updatedAt: new Date().toISOString(),
  })
}

export function updateGustoSetupStepIndex(householdId: string, stepIndex: number) {
  const existing = loadGustoSetupProgress(householdId)
  saveGustoSetupProgress(householdId, {
    stepIndex,
    completedStepIds: existing?.completedStepIds ?? [],
    drafts: existing?.drafts ?? {},
    updatedAt: new Date().toISOString(),
  })
}
