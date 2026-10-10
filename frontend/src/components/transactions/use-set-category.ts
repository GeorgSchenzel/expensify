import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { keys } from '@/lib/queries'
import type { Transaction } from '@/lib/types'
import { errorMessage } from '@/lib/utils'

/** Reassigns one transaction's category, updating the cached lists immediately. */
export function useSetTransactionCategory() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, categoryId }: { id: string; categoryId: string | null }) =>
      api.transactions.setCategory(id, categoryId),
    onMutate: async ({ id, categoryId }) => {
      await client.cancelQueries({ queryKey: keys.transactions })
      const previous = client.getQueriesData<Transaction[]>({ queryKey: keys.transactions })
      // The transactions key also covers stats and preview caches; only the lists are arrays.
      client.setQueriesData<Transaction[]>({ queryKey: keys.transactions }, (old) =>
        Array.isArray(old) ? old.map((t) => (t.id === id ? { ...t, categoryId } : t)) : old
      )
      return { previous }
    },
    onError: (err, _vars, context) => {
      context?.previous.forEach(([key, data]) => client.setQueryData(key, data))
      toast.error(errorMessage(err))
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.transactions })
      client.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}
