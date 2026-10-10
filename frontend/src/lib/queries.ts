import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { DashboardQuery, TransactionQuery } from './types'

// Query keys. Mutations invalidate by prefix, replacing the old app's
// revalidatePath() calls.
export const keys = {
  categories: ['categories'] as const,
  rules: ['rules'] as const,
  transactions: ['transactions'] as const,
  dashboard: ['dashboard'] as const,
}

export function useCategories() {
  return useQuery({ queryKey: keys.categories, queryFn: api.categories.list })
}

export function useRules() {
  return useQuery({ queryKey: keys.rules, queryFn: api.rules.list })
}

export function useTransactions(q: TransactionQuery) {
  return useQuery({
    queryKey: [...keys.transactions, q],
    queryFn: () => api.transactions.list(q),
    placeholderData: keepPreviousData,
  })
}

export function useDashboard(q: DashboardQuery) {
  return useQuery({
    queryKey: [...keys.dashboard, q],
    queryFn: () => api.dashboard(q),
    placeholderData: keepPreviousData,
  })
}

/** Returns a function that refetches everything derived from the given data. */
export function useInvalidate() {
  const client = useQueryClient()
  return (...which: (keyof typeof keys)[]) =>
    Promise.all(which.map((k) => client.invalidateQueries({ queryKey: keys[k] })))
}
