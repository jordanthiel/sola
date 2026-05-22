import { format, isValid, parseISO } from 'date-fns'

export function parseDateValue(value: string): Date | undefined {
  if (!value) return undefined
  const d = parseISO(`${value}T12:00:00`)
  return isValid(d) ? d : undefined
}

export function formatDateDisplay(value: string): string {
  const d = parseDateValue(value)
  return d ? format(d, 'MMM d, yyyy') : ''
}

export function dateToValue(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function parseTimeValue(value: string): { hours: number; minutes: number } | null {
  if (!value) return null
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return { hours: h, minutes: m }
}

export function formatTimeDisplay(value: string): string {
  const t = parseTimeValue(value)
  if (!t) return ''
  const d = new Date()
  d.setHours(t.hours, t.minutes, 0, 0)
  return format(d, 'h:mm a')
}

export function timeToValue(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function parseDatetimeLocalValue(value: string): { date: string; time: string } {
  if (!value) return { date: '', time: '' }
  const [date, time] = value.split('T')
  return { date: date ?? '', time: (time ?? '').slice(0, 5) }
}

export function combineDatetimeLocal(date: string, time: string): string {
  if (!date) return ''
  return `${date}T${time || '00:00'}`
}

export function formatDatetimeDisplay(value: string): string {
  if (!value) return ''
  const d = new Date(value)
  return isValid(d) ? format(d, 'MMM d, yyyy · h:mm a') : ''
}

export function minuteOptions(step: number, includeMinute?: number): number[] {
  const options: number[] = []
  for (let m = 0; m < 60; m += step) options.push(m)
  if (includeMinute != null && !options.includes(includeMinute)) {
    options.push(includeMinute)
    options.sort((a, b) => a - b)
  }
  return options
}
