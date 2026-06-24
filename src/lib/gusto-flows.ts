/** Gusto Flow types we expose in Soola (see Gusto Embedded flow-types docs). */

export type GustoCompanyFlowType =
  | 'company_onboarding'
  | 'add_addresses'
  | 'add_bank_info'
  | 'federal_tax_setup'
  | 'payroll_schedule'
  | 'add_employees'
  | 'state_setup'
  | 'sign_all_forms'
  | 'select_industry'

export type GustoEmployeeFlowType =
  | 'employee_self_management'
  | 'employee_form_signing'
  | 'employee_federal_setup'
  | 'employee_state_setup'

export type GustoFlowType = GustoCompanyFlowType | GustoEmployeeFlowType

const ALL_FLOW_TYPES = new Set<string>([
  'company_onboarding',
  'add_addresses',
  'add_bank_info',
  'add_bank_plaid_only',
  'verify_bank_info',
  'federal_tax_setup',
  'payroll_schedule',
  'add_employees',
  'state_setup',
  'sign_all_forms',
  'select_industry',
  'employee_management',
  'employee_self_management',
  'employee_form_signing',
  'employee_federal_setup',
  'employee_state_setup',
  'manage_employee_addresses',
])

export function isGustoFlowType(value: string): value is GustoFlowType {
  return ALL_FLOW_TYPES.has(value)
}

export interface GustoFlowRouteParams {
  flowType: GustoFlowType
  title: string
  entityUuid?: string
  entityType?: 'Employee' | 'Contractor' | 'Company' | 'Payroll'
  returnTo: string
}

export function buildGustoFlowPath(params: {
  flowType: GustoFlowType
  title?: string
  entityUuid?: string
  entityType?: GustoFlowRouteParams['entityType']
  returnTo?: string
}): string {
  const search = new URLSearchParams()
  search.set('flow', params.flowType)
  if (params.title) search.set('title', params.title)
  if (params.entityUuid) search.set('entity', params.entityUuid)
  if (params.entityType) search.set('entityType', params.entityType)
  if (params.returnTo) search.set('returnTo', params.returnTo)
  return `/settings/gusto?${search.toString()}`
}

export function parseGustoFlowSearchParams(
  searchParams: URLSearchParams,
): GustoFlowRouteParams | null {
  const flow = searchParams.get('flow')?.trim()
  if (!flow || !isGustoFlowType(flow)) return null

  const returnTo = searchParams.get('returnTo')?.trim() || '/settings'
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) return null

  const entityUuid = searchParams.get('entity')?.trim() || undefined
  const entityTypeRaw = searchParams.get('entityType')?.trim()
  const entityTypes = ['Employee', 'Contractor', 'Company', 'Payroll'] as const
  const entityType = entityTypes.includes(entityTypeRaw as (typeof entityTypes)[number])
    ? (entityTypeRaw as GustoFlowRouteParams['entityType'])
    : entityUuid
      ? 'Employee'
      : undefined

  const title = searchParams.get('title')?.trim() || defaultFlowTitle(flow)

  return { flowType: flow, title, entityUuid, entityType, returnTo }
}

function defaultFlowTitle(flowType: GustoFlowType): string {
  if (flowType === 'company_onboarding') return 'Company setup in Gusto'
  if (flowType === 'employee_self_management') return 'Nanny onboarding in Gusto'
  return flowType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export const GUSTO_FLOW_FINISH_EVENT = 'gusto:flow-finish'

/** Gusto flow URLs expire after ~1h inactivity; cache slightly under that. */
const GUSTO_FLOW_URL_TTL_MS = 50 * 60 * 1000
const GUSTO_FLOW_CACHE_PREFIX = 'soola:gusto-flow:'

export interface CachedGustoFlowUrl {
  url: string
  createdAt: number
}

export function gustoFlowCacheKey(params: {
  householdId: string
  flowType: string
  entityUuid?: string
}): string {
  return `${GUSTO_FLOW_CACHE_PREFIX}${params.householdId}:${params.flowType}:${params.entityUuid ?? ''}`
}

export function readCachedGustoFlowUrl(cacheKey: string): CachedGustoFlowUrl | null {
  try {
    const raw = sessionStorage.getItem(cacheKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedGustoFlowUrl
    if (!parsed.url || typeof parsed.createdAt !== 'number') return null
    if (Date.now() - parsed.createdAt > GUSTO_FLOW_URL_TTL_MS) {
      sessionStorage.removeItem(cacheKey)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeCachedGustoFlowUrl(cacheKey: string, url: string): void {
  try {
    const entry: CachedGustoFlowUrl = { url, createdAt: Date.now() }
    sessionStorage.setItem(cacheKey, JSON.stringify(entry))
  } catch {
    /* sessionStorage full or unavailable */
  }
}

export function clearCachedGustoFlowUrl(cacheKey: string): void {
  try {
    sessionStorage.removeItem(cacheKey)
  } catch {
    /* ignore */
  }
}

export function gustoFlowsOrigin(gustoEnv: 'demo' | 'production'): string {
  return gustoEnv === 'demo' ? 'https://flows.gusto-demo.com' : 'https://flows.gusto.com'
}

export function isGustoFlowMessageOrigin(origin: string, gustoEnv: 'demo' | 'production'): boolean {
  try {
    const expected = new URL(gustoFlowsOrigin(gustoEnv)).origin
    return origin === expected
  } catch {
    return false
  }
}

export interface GustoOnboardingStepView {
  id: string
  title: string
  completed: boolean
}

/** Normalize Gusto onboarding_status steps for checklist UI. */
export function normalizeOnboardingSteps(
  steps: Record<string, { completed?: boolean; title?: string; id?: string }> | null | undefined,
): GustoOnboardingStepView[] {
  if (!steps || typeof steps !== 'object') return []
  return Object.entries(steps).map(([key, step]) => ({
    id: (step.id ?? key).replace(/^step_/, ''),
    title: step.title ?? formatStepTitle(step.id ?? key),
    completed: step.completed === true,
  }))
}

function formatStepTitle(id: string): string {
  return id
    .replace(/^step_/, '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Map onboarding step ids from Gusto to flow_type values (when they differ). */
export function flowTypeForOnboardingStep(stepId: string): GustoCompanyFlowType | null {
  const id = stepId.replace(/^step_/, '')
  const known: Record<string, GustoCompanyFlowType> = {
    add_addresses: 'add_addresses',
    add_bank_info: 'add_bank_info',
    federal_tax_setup: 'federal_tax_setup',
    payroll_schedule: 'payroll_schedule',
    add_employees: 'add_employees',
    state_setup: 'state_setup',
    sign_all_forms: 'sign_all_forms',
    select_industry: 'select_industry',
    industry_selection: 'select_industry',
  }
  return known[id] ?? null
}
