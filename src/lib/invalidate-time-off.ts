import type { QueryClient } from '@tanstack/react-query'

export function invalidateTimeOffQueries(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['time_off'] }),
    qc.invalidateQueries({ queryKey: ['pending_time_off'] }),
    qc.invalidateQueries({ queryKey: ['pto_balances'] }),
  ])
}
