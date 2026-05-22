import type { QueryClient } from '@tanstack/react-query'
import { invalidateTimeOffQueries } from '@/lib/invalidate-time-off'

export function invalidateCalendarQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['schedule'] })
  void invalidateTimeOffQueries(qc)
  qc.invalidateQueries({ queryKey: ['activities'] })
}
