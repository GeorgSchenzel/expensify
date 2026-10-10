import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { TransactionsTable } from '@/components/transactions/transactions-table'
import {
  TransactionFilters,
  presetRange,
  type TransactionFilterValue,
} from '@/components/transactions/transaction-filters'
import { QueryState } from '@/components/query-state'
import { useCategories, useTransactions } from '@/lib/queries'
import { buildParams, dateParam } from '@/lib/search-params'
import { cn } from '@/lib/utils'

export function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // URL state: ?from&to (yyyy-MM-dd, inclusive) &cat=id… &uncategorized=true &amountMin &amountMax.
  // Without from/to the range defaults to the first of this month → today.
  const filters = useMemo<TransactionFilterValue>(() => {
    const defaults = presetRange('this-month')
    return {
      from: dateParam(searchParams, 'from') ?? defaults.from,
      to: dateParam(searchParams, 'to') ?? defaults.to,
      cat: searchParams.getAll('cat'),
      uncategorized: searchParams.get('uncategorized') === 'true',
      amountMin: searchParams.get('amountMin') || undefined,
      amountMax: searchParams.get('amountMax') || undefined,
    }
  }, [searchParams])

  const isDefault = !['from', 'to', 'cat', 'uncategorized', 'amountMin', 'amountMax'].some((k) => searchParams.has(k))

  const categories = useCategories()
  const transactions = useTransactions(filters)

  function handleChange(next: TransactionFilterValue) {
    setSearchParams(buildParams({ ...next, uncategorized: next.uncategorized ? 'true' : undefined }))
  }

  const count = transactions.data?.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Transactions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {count === undefined ? ' ' : `${count} transaction${count !== 1 ? 's' : ''}`}
        </p>
      </div>

      <TransactionFilters
        categories={categories.data ?? []}
        value={filters}
        isDefault={isDefault}
        onChange={handleChange}
        onReset={() => setSearchParams(new URLSearchParams())}
      />

      {transactions.data && categories.data ? (
        <div className={cn('transition-opacity', transactions.isPlaceholderData && 'opacity-60')}>
          <TransactionsTable transactions={transactions.data} categories={categories.data} />
        </div>
      ) : (
        <QueryState
          error={transactions.error ?? categories.error}
          onRetry={() => {
            transactions.refetch()
            categories.refetch()
          }}
        />
      )}
    </div>
  )
}
