import { Link } from 'react-router'
import { transactionsLink } from '@/lib/dashboard-range'
import type { Category, Transaction } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'

/** The biggest single expense per merchant in the range; each links to its day. */
export function LargestExpenses({
  transactions,
  categories,
}: {
  transactions: (Transaction & { similarCount: number })[]
  categories: Category[]
}) {
  if (transactions.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No expenses in this range.</p>
  }
  const byId = new Map(categories.map((c) => [c.id, c]))
  const max = Math.abs(transactions[0].amount)

  return (
    <ul className="-mx-2">
      {transactions.map((t) => {
        const category = t.categoryId ? byId.get(t.categoryId) : undefined
        const color = category?.colorHex ?? '#d1d5db'
        return (
          <li key={t.id}>
            <Link
              to={transactionsLink({ from: t.date, to: t.date })}
              className="relative flex items-center gap-3 overflow-hidden rounded-md px-2 py-1.5 hover:bg-neutral-50"
            >
              {/* Faint bar behind the row, proportional to the largest expense. */}
              <span
                className="absolute inset-y-1 left-0 rounded-r-md opacity-[0.08]"
                style={{ width: `${(Math.abs(t.amount) / max) * 100}%`, background: color }}
              />
              <span className="relative w-20 shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {formatDate(t.date)}
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="block truncate text-sm text-neutral-800" title={t.description}>
                  {t.description}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="size-1.5 rounded-full" style={{ background: color }} />
                  {category?.name ?? 'Uncategorized'}
                  {t.similarCount > 1 && <span>· {t.similarCount}× in range</span>}
                </span>
              </span>
              <span className="relative text-sm font-medium tabular-nums">{formatCurrency(Math.abs(t.amount))}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
