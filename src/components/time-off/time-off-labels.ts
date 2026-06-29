import type { TimeOffType } from '@/types/database'

export function timeOffTypeLabel(type: TimeOffType) {
  if (type === 'pto') return 'PTO'
  if (type === 'vacation') return 'Vacation'
  return type.charAt(0).toUpperCase() + type.slice(1)
}
