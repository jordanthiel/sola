/** Serialize unknown thrown values for logs and API responses. */

export interface SerializedError {
  message: string
  name?: string
  code?: string
  details?: string
  hint?: string
  stack?: string
  raw?: string
}

export function serializeError(e: unknown): SerializedError {
  if (e instanceof Error) {
    const extra = e as Error & { code?: string; details?: string; hint?: string }
    return {
      message: e.message || 'Unknown error',
      name: e.name,
      code: extra.code,
      details: extra.details,
      hint: extra.hint,
      stack: e.stack,
    }
  }

  if (typeof e === 'object' && e !== null) {
    const o = e as Record<string, unknown>
    const message =
      (typeof o.message === 'string' && o.message) ||
      (typeof o.error === 'string' && o.error) ||
      (typeof o.error_description === 'string' && o.error_description) ||
      'Request failed'

    return {
      message,
      name: typeof o.name === 'string' ? o.name : undefined,
      code: typeof o.code === 'string' ? o.code : undefined,
      details: typeof o.details === 'string' ? o.details : undefined,
      hint: typeof o.hint === 'string' ? o.hint : undefined,
      raw: safeJsonStringify(o),
    }
  }

  return { message: String(e) }
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function httpStatusForError(message: string): number {
  if (message === 'Unauthorized') return 401
  if (message.startsWith('Forbidden')) return 403
  if (message.includes('not available for your account')) return 403
  if (message.includes('not configured') || message.includes('required')) return 400
  return 500
}
