import { useState } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import { ChevronDown } from 'lucide-react'
import { QueryState } from '@/components/query-state'
import { useRecurringPayments } from '@/lib/queries'
import type { Cadence, Category } from '@/lib/types'
import { cn, formatCurrency, formatDate, fromDateKey } from '@/lib/utils'
import { formatWhole } from './chart-style'

const COLLAPSED_ROWS = 6

const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

function dueLabel(nextDate: string): { text: string; overdue: boolean } {
  const days = differenceInCalendarDays(fromDateKey(nextDate)!, new Date())
  if (days < 0) return { text: `due ${-days}d ago`, overdue: true }
  if (days === 0) return { text: 'due today', overdue: false }
  if (days === 1) return { text: 'tomorrow', overdue: false }
  if (days < 30) return { text: `in ${days} days`, overdue: false }
  return { text: formatDate(nextDate), overdue: false }
}

/** Subscriptions and other regular payments detected across all data. */
export function RecurringPayments({ categories }: { categories: Category[] }) {
  const recurring = useRecurringPayments()
  const [expanded, setExpanded] = useState(false)

  if (!recurring.data) return <QueryState error={recurring.error} onRetry={() => recurring.refetch()} />
  const items = recurring.data
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No recurring payments detected yet. They show up after a few regular charges.
      </p>
    )
  }

  const byId = new Map(categories.map((c) => [c.id, c]))
  const monthly = items.reduce((sum, r) => sum + r.annualCost, 0) / 12
  const visible = expanded ? items : items.slice(0, COLLAPSED_ROWS)

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums">≈ {formatWhole(monthly)}</span>
        <span className="text-xs text-muted-foreground">
          per month · {formatWhole(monthly * 12)} per year · {items.length} payment{items.length === 1 ? '' : 's'}
        </span>
      </div>
      <ul className="divide-y">
        {visible.map((r) => {
          const category = r.categoryId ? byId.get(r.categoryId) : undefined
          const due = dueLabel(r.nextDate)
          return (
            <li key={r.key} className="flex items-center gap-3 py-2">
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: category?.colorHex ?? '#d1d5db' }}
                title={category?.name ?? 'Uncategorized'}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-800" title={r.description}>
                  {r.description}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {CADENCE_LABEL[r.cadence]} · {r.count}× since {formatDate(r.firstDate)} · next{' '}
                  <span className={cn(due.overdue && 'text-amber-600')}>{due.text}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium tabular-nums">{formatCurrency(r.amount)}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">{formatWhole(r.annualCost)}/yr</p>
              </div>
            </li>
          )
        })}
      </ul>
      {items.length > COLLAPSED_ROWS && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-xs text-muted-foreground hover:bg-neutral-50 hover:text-neutral-900"
        >
          <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
          {expanded ? 'Show less' : `Show ${items.length - COLLAPSED_ROWS} more`}
        </button>
      )}
    </div>
  )
}
