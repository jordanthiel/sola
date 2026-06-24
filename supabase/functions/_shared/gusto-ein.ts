import { getGustoEnv } from './gusto.ts'

/** Normalize to 9 digits or return null if invalid. */
export function normalizeEin(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 9) return null
  return digits
}

/**
 * Sandbox-only: deterministic unique EIN per household so retries don't collide on 123456789.
 * Not for production — families must supply a real EIN.
 */
export function demoEinForHousehold(householdId: string): string {
  const hex = householdId.replace(/-/g, '')
  let hash = 0
  for (let i = 0; i < hex.length; i++) {
    hash = (hash * 31 + parseInt(hex[i], 16)) % 0x7fffffff
  }
  // 9-digit EIN; prefix 91 matches Gusto docs examples for demo
  const suffix = String(hash % 10_000_000).padStart(7, '0')
  return `91${suffix}`
}

export function resolveEinForCreate(
  householdId: string,
  provided?: string,
): { ein: string; generated: boolean } {
  const normalized = normalizeEin(provided)
  if (normalized) return { ein: normalized, generated: false }

  if (getGustoEnv() === 'demo') {
    return { ein: demoEinForHousehold(householdId), generated: true }
  }

  throw new Error(
    'Employer Identification Number (EIN) is required. Enter your 9-digit EIN to enable Gusto payroll.',
  )
}

export function isEinAlreadyInUseError(message: string): boolean {
  return /ein.*already in use/i.test(message)
}
