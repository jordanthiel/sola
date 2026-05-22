import type { QueryClient } from '@tanstack/react-query'

/** Refetch advance balances and repayment history after any advance mutation. */
export function invalidateAdvanceQueries(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['advances'] }),
    qc.invalidateQueries({ queryKey: ['advance_repayments'] }),
  ])
}
