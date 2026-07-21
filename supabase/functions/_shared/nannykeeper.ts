const NK_API_BASE = 'https://www.nannykeeper.com/api/v1'

export type NkPayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

export function requireNannyKeeperApiKey(): string {
  const key = Deno.env.get('NANNYKEEPER_API_KEY') ?? ''
  if (!key) throw new Error('NannyKeeper is not configured (NANNYKEEPER_API_KEY)')
  return key
}

export async function nkFetch<T = unknown>(
  path: string,
  init: RequestInit & { apiKey?: string } = {},
): Promise<T> {
  const apiKey = init.apiKey ?? requireNannyKeeperApiKey()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${apiKey}`)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')

  const res = await fetch(`${NK_API_BASE}${path}`, {
    method: init.method,
    body: init.body,
    headers,
    signal: init.signal,
  })

  const text = await res.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = { raw: text }
  }

  if (!res.ok) {
    const body = parsed as { error?: { message?: string; example?: unknown }; message?: string }
    const message =
      body?.error?.message ||
      body?.message ||
      `NannyKeeper API error (${res.status})`
    const err = new Error(message) as Error & { status?: number; body?: unknown }
    err.status = res.status
    err.body = parsed
    throw err
  }

  return parsed as T
}

export function mapSoolaPayPeriod(
  payPeriod: 'weekly' | 'biweekly' | 'monthly' | string | null | undefined,
): NkPayFrequency {
  if (payPeriod === 'weekly') return 'weekly'
  if (payPeriod === 'monthly') return 'monthly'
  return 'biweekly'
}

export interface SoolaPayrollSnapshot {
  regularMinutes?: number
  overtimeMinutes?: number
  overnightMinutes?: number
  holidayMinutes?: number
  regularPayCents?: number
  overtimePayCents?: number
  overnightPayCents?: number
  vacationPayCents?: number
  holidayPayCents?: number
  lineItemsTotalCents?: number
  advanceDeductionCents?: number
  grossPayCents?: number
  netPayCents?: number
}

/** Map closed Soola snapshot → NannyKeeper payroll employee earnings. */
export function mapSnapshotToNkEmployeeEarnings(snapshot: SoolaPayrollSnapshot) {
  const regularHours = Math.max(0, (snapshot.regularMinutes ?? 0) / 60)
  const overtimeHours = Math.max(0, (snapshot.overtimeMinutes ?? 0) / 60)
  const otherCents =
    (snapshot.overnightPayCents ?? 0) +
    (snapshot.vacationPayCents ?? 0) +
    (snapshot.holidayPayCents ?? 0) +
    (snapshot.lineItemsTotalCents ?? 0)

  return {
    regular_hours: Number(regularHours.toFixed(2)),
    overtime_hours: Number(overtimeHours.toFixed(2)),
    other_earnings: Number((otherCents / 100).toFixed(2)),
    soola: {
      grossPayDollars: (snapshot.grossPayCents ?? 0) / 100,
      advanceDeductionDollars: (snapshot.advanceDeductionCents ?? 0) / 100,
      netPayDollars: (snapshot.netPayCents ?? 0) / 100,
    },
  }
}

export function dollarsToCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100)
  }
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Math.round(Number(value) * 100)
  }
  return null
}
