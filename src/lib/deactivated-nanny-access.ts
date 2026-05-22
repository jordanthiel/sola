/** Routes a deactivated nanny may use (payroll history + profile only). */
const DEACTIVATED_NANNY_ALLOWED_PREFIXES = ['/payroll', '/settings'] as const

export function isDeactivatedNannyAllowedPath(pathname: string): boolean {
  if (pathname.startsWith('/settings/nannies')) return false
  return DEACTIVATED_NANNY_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}
