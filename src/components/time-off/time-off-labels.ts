import type { TimeOffType } from '@/types/database'

export function timeOffTypeLabel(type: TimeOffType) {
  return type === 'pto' ? 'PTO' : type.charAt(0).toUpperCase() + type.slice(1)
}
