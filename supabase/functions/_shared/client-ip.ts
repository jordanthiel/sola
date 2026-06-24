/** Best-effort client IP for Gusto ToS acceptance (required by their API). */
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-client-ip') ??
    null
  )
}

export function resolveIpForGusto(req: Request, bodyIp?: string): string {
  const fromHeaders = getClientIp(req)
  const candidate = fromHeaders ?? bodyIp?.trim()
  if (candidate && isPlausibleIp(candidate)) return candidate
  // Local dev / missing proxy headers — Gusto docs use private IPs in examples
  return '127.0.0.1'
}

function isPlausibleIp(value: string): boolean {
  if (value === '127.0.0.1' || value === '::1') return true
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value) || value.includes(':')
}
