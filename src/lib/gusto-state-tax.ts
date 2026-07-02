export type GustoTaxRequirementOption = {
  label: string
  short_label?: string
  value: string | boolean | number
}

export type GustoTaxRequirementMetadata = {
  type: string
  options?: GustoTaxRequirementOption[]
  mask?: string | null
  prefix?: string | null
  validation?: {
    type?: string
    min?: string
    max?: string
    rates?: string[]
  }
}

export type GustoTaxRequirement = {
  key: string
  label: string
  description?: string
  value?: string | boolean | number | null
  editable?: boolean
  applicable_if?: Array<{ key: string; value: string | boolean | number | null }>
  metadata?: GustoTaxRequirementMetadata
}

export type GustoTaxRequirementSet = {
  key: string
  state: string
  label: string
  effective_from: string | null
  requirements: GustoTaxRequirement[]
}

export type GustoStateTaxRequirements = {
  company_uuid?: string
  state: string
  requirement_sets?: GustoTaxRequirementSet[]
  ready_to_run_payroll?: boolean
}

export type StateTaxValues = Record<string, string | boolean | number | null>
export type StateTaxValuesByState = Record<string, StateTaxValues>

export function parseStateTaxRequirements(raw: unknown): GustoStateTaxRequirements | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as GustoStateTaxRequirements
  if (!data.state) return null
  return {
    ...data,
    requirement_sets: Array.isArray(data.requirement_sets) ? data.requirement_sets : [],
  }
}

export function stateHasTaxRequirements(requirements: unknown): boolean {
  const data = parseStateTaxRequirements(requirements)
  if (!data) return false
  return (data.requirement_sets ?? []).some((set) =>
    (set.requirements ?? []).some((req) => req.editable !== false),
  )
}

export function normalizeStateTaxFieldValue(
  requirement: GustoTaxRequirement,
  value: string | boolean | number | null | undefined,
): string | boolean | number | null {
  if (value === undefined || value === null || value === '') return null
  const type = requirement.metadata?.type ?? 'text'
  if (type === 'radio') {
    if (typeof value === 'boolean') return value
    if (value === 'true') return true
    if (value === 'false') return false
    const match = requirement.metadata?.options?.find((option) => String(option.value) === String(value))
    return match ? match.value : value
  }
  if (type === 'tax_rate' || type === 'percent') {
    const num = typeof value === 'number' ? value : Number(String(value))
    return Number.isFinite(num) ? String(num) : String(value)
  }
  return value
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function extractStateTaxValues(requirements: unknown): StateTaxValues {
  const data = parseStateTaxRequirements(requirements)
  if (!data) return {}

  const values: StateTaxValues = {}
  for (const set of data.requirement_sets ?? []) {
    for (const req of set.requirements ?? []) {
      if (req.value !== null && req.value !== undefined) {
        values[req.key] = req.value
      }
    }
  }
  return values
}

export function isRequirementApplicable(req: GustoTaxRequirement, values: StateTaxValues): boolean {
  if (!req.applicable_if?.length) return true
  return req.applicable_if.every((cond) => values[cond.key] === cond.value)
}

export function buildStateTaxUpdatePayload(
  requirements: unknown,
  values: StateTaxValues,
): { requirement_sets: Array<{
  key: string
  state: string
  effective_from: string | null
  requirements: Array<{ key: string; value: string | boolean | number | null }>
}> } {
  const data = parseStateTaxRequirements(requirements)
  if (!data) return { requirement_sets: [] }

  const requirement_sets = (data.requirement_sets ?? [])
    .map((set) => ({
      key: set.key,
      state: set.state,
      effective_from: set.effective_from,
      requirements: (set.requirements ?? [])
        .filter((req) => req.editable !== false && isRequirementApplicable(req, values))
        .filter((req) => {
          const value = values[req.key]
          return value !== undefined && value !== null && value !== ''
        })
        .map((req) => ({
          key: req.key,
          value: normalizeStateTaxFieldValue(req, values[req.key]),
        })),
    }))
    .filter((set) => set.requirements.length > 0)

  return { requirement_sets }
}

export function stateTaxValuesSummary(
  requirements: unknown,
  values: StateTaxValues,
): string {
  const data = parseStateTaxRequirements(requirements)
  if (!data) return ''

  const parts: string[] = []
  for (const set of data.requirement_sets ?? []) {
    for (const req of set.requirements ?? []) {
      if (!isRequirementApplicable(req, values)) continue
      const value = values[req.key]
      if (value === undefined || value === null || value === '') continue
      const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
      parts.push(`${req.label}: ${display}`)
    }
  }
  return parts.join(' · ')
}

export function missingRequiredStateTaxFields(
  requirements: unknown,
  values: StateTaxValues,
): GustoTaxRequirement[] {
  const data = parseStateTaxRequirements(requirements)
  if (!data) return []

  const missing: GustoTaxRequirement[] = []
  for (const set of data.requirement_sets ?? []) {
    for (const req of set.requirements ?? []) {
      if (req.editable === false) continue
      if (!isRequirementApplicable(req, values)) continue
      const value = values[req.key]
      if (value === undefined || value === null || value === '') {
        missing.push(req)
      }
    }
  }
  return missing
}

export function formatTaxRateHint(metadata?: GustoTaxRequirementMetadata): string | undefined {
  if (metadata?.type !== 'tax_rate' && metadata?.type !== 'percent') return undefined
  const min = metadata.validation?.min
  const max = metadata.validation?.max
  if (min && max) return `Enter as a decimal (e.g. 0.05 for 5%). Allowed range: ${min}–${max}.`
  return 'Enter as a decimal (e.g. 0.05 for 5%).'
}
