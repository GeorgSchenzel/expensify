import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { transactionsLink } from '@/lib/dashboard-range'
import type { CategorySpend, DateRange } from '@/lib/types'
import { cn, formatCurrency } from '@/lib/utils'
import { Delta } from './delta'

const COLLAPSED_ROWS = 10

interface CategoryBreakdownProps {
  categories: CategorySpend[]
  incomeCategories: CategorySpend[]
  range: DateRange | null
  focus: string | null
  onFocus: (key: string | null) => void
}

/** Ranked list of categories with share, bar and change against the previous period. */
export function CategoryBreakdown({ categories, incomeCategories, range, focus, onFocus }: CategoryBreakdownProps) {
  const [side, setSide] = useState<'expenses' | 'income'>('expenses')
  const [expanded, setExpanded] = useState(false)

  const rows = side === 'expenses' ? categories : incomeCategories
  const active = rows.filter((r) => r.spend > 0)
  const gone = rows.filter((r) => r.spend === 0)
  const total = active.reduce((sum, r) => sum + r.spend, 0)
  const max = active[0]?.spend ?? 0
  const visible = expanded ? [...active, ...gone] : active.slice(0, COLLAPSED_ROWS)
  const hidden = active.length + gone.length - visible.length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex w-fit gap-1 rounded-lg bg-neutral-100 p-0.5">
          {(['expenses', 'income'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors',
                side === s ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatCurrency(total)} · {active.length} categor{active.length === 1 ? 'y' : 'ies'}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No {side} in this range.</p>
      ) : (
        <ul className="-mx-2">
          {visible.map((row) => {
            const isFocus = focus === row.key
            return (
              <li key={row.key}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onFocus(isFocus ? null : row.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onFocus(isFocus ? null : row.key)
                    }
                  }}
                  className={cn(
                    'group grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 transition-colors',
                    isFocus ? 'bg-neutral-100' : 'hover:bg-neutral-50',
                    focus !== null && !isFocus && 'opacity-60',
                    row.spend === 0 && 'opacity-50'
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: row.colorHex }} />
                    <span className="truncate text-sm text-neutral-800">{row.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{row.count || ''}</span>
                    {range && (
                      <Link
                        to={transactionsLink(range, row.key)}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-neutral-200 hover:text-neutral-900 focus:opacity-100 group-hover:opacity-100"
                        title="Show transactions"
                      >
                        <ArrowRight className="size-3" />
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center gap-2 justify-self-end">
                    <Delta
                      current={row.spend}
                      previous={row.previousSpend}
                      goodWhen={side === 'expenses' ? 'down' : 'up'}
                      className="w-12 justify-end"
                    />
                    <span className="w-24 text-right text-sm font-medium tabular-nums text-neutral-900">
                      {formatCurrency(row.spend)}
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${max ? (row.spend / max) * 100 : 0}%`, background: row.colorHex }}
                      />
                    </div>
                    <span className="w-10 text-right text-[11px] text-muted-foreground tabular-nums">
                      {total ? `${((row.spend / total) * 100).toFixed(row.spend / total < 0.1 ? 1 : 0)}%` : ''}
                    </span>
                  </div>
                  {row.spend === 0 && row.previousSpend ? (
                    <span className="col-span-2 text-[11px] text-muted-foreground">
                      was {formatCurrency(row.previousSpend)} in the previous period
                    </span>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-xs text-muted-foreground hover:bg-neutral-50 hover:text-neutral-900"
        >
          <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
          {expanded ? 'Show less' : `Show ${hidden} more`}
        </button>
      )}
    </div>
  )
}
