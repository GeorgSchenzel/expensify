import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Layers, ListChecks } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { CategorySelect } from '@/components/transactions/category-select'
import type { TransactionGroup } from '@/lib/grouping'
import type { Category, RuleDraft, Transaction } from '@/lib/types'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { Highlight } from './highlight'

type View = 'groups' | 'rows'
const PAGE = 100

interface UncategorizedListProps {
  groups: TransactionGroup[]
  categories: Category[]
  /** The rule being written, for highlighting; null when the pattern is empty. */
  draft: RuleDraft | null
  /** Ids the draft would categorize (from the backend preview); null without a draft. */
  matchedIds: Set<string> | null
  onPickPattern: (pattern: string) => void
}

export function UncategorizedList({
  groups,
  categories,
  draft,
  matchedIds,
  onPickPattern,
}: UncategorizedListProps) {
  const [view, setView] = useState<View>('groups')
  const [onlyMatches, setOnlyMatches] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  const matchCounts = useMemo(() => {
    const counts = new Map<string, number>()
    if (matchedIds) {
      for (const g of groups) {
        counts.set(g.key, g.transactions.filter((t) => matchedIds.has(t.id)).length)
      }
    }
    return counts
  }, [groups, matchedIds])
  const matchCount = (g: TransactionGroup) => matchCounts.get(g.key) ?? 0

  // Groups the draft touches float to the top.
  const sortedGroups = useMemo(() => {
    if (!matchedIds) return groups
    return groups
      .map((g, i) => ({ g, i, m: matchCounts.get(g.key) ?? 0 }))
      .filter(({ m }) => !onlyMatches || m > 0)
      .sort((a, b) => b.m - a.m || a.i - b.i)
      .map(({ g }) => g)
  }, [groups, matchedIds, matchCounts, onlyMatches])

  // Rows in group order (biggest merchants first), matches first.
  const rows = useMemo(() => {
    const all = groups.flatMap((g) => g.transactions)
    if (!matchedIds) return all
    const matched = all.filter((t) => matchedIds.has(t.id))
    return onlyMatches ? matched : [...matched, ...all.filter((t) => !matchedIds.has(t.id))]
  }, [groups, matchedIds, onlyMatches])

  const total = groups.reduce((n, g) => n + g.transactions.length, 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-neutral-100 p-0.5 rounded-lg">
          {(
            [
              ['groups', 'Groups', Layers],
              ['rows', 'All rows', ListChecks],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setView(key)
                setLimit(PAGE)
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
                view === key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
        {matchedIds && (
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="only-matches"
              checked={onlyMatches}
              onCheckedChange={(v) => setOnlyMatches(v === true)}
            />
            <Label htmlFor="only-matches" className="text-xs cursor-pointer">
              Only matches ({matchedIds.size})
            </Label>
          </div>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {view === 'groups' ? `${groups.length} groups · ` : ''}
          {total} uncategorized
        </span>
      </div>

      <div className="rounded-lg border border-border bg-white divide-y divide-border overflow-hidden">
        {view === 'groups'
          ? sortedGroups.slice(0, limit).map((g) => (
              <GroupRow
                key={g.key}
                group={g}
                matched={matchCount(g)}
                hasDraft={matchedIds !== null}
                categories={categories}
                draft={draft}
                matchedIds={matchedIds}
                onPickPattern={onPickPattern}
              />
            ))
          : rows
              .slice(0, limit)
              .map((t) => (
                <TxRow
                  key={t.id}
                  tx={t}
                  categories={categories}
                  draft={draft}
                  matched={matchedIds?.has(t.id) ?? false}
                />
              ))}
        {(view === 'groups' ? sortedGroups.length : rows.length) === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {onlyMatches ? 'No uncategorized transaction matches this pattern.' : 'Nothing left to categorize. 🎉'}
          </p>
        )}
      </div>

      {(view === 'groups' ? sortedGroups.length : rows.length) > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="w-full text-xs text-muted-foreground hover:text-neutral-900 py-1"
        >
          Show more
        </button>
      )}
    </div>
  )
}

function GroupRow({
  group,
  matched,
  hasDraft,
  categories,
  draft,
  matchedIds,
  onPickPattern,
}: {
  group: TransactionGroup
  matched: number
  hasDraft: boolean
  categories: Category[]
  draft: RuleDraft | null
  matchedIds: Set<string> | null
  onPickPattern: (pattern: string) => void
}) {
  const [open, setOpen] = useState(false)
  const n = group.transactions.length
  const sample = group.transactions[0].description
  const fully = hasDraft && matched === n

  return (
    <div className={cn(hasDraft && matched > 0 && 'bg-emerald-50/40')}>
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          aria-label={open ? 'Collapse group' : 'Expand group'}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center justify-center w-6 h-6 rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 shrink-0"
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <button
          type="button"
          disabled={!group.pattern}
          onClick={() => onPickPattern(group.pattern)}
          title={group.pattern ? `Use "${group.pattern}" as pattern` : undefined}
          className="flex-1 min-w-0 text-left group/pick disabled:cursor-default"
        >
          <span className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-neutral-900 group-hover/pick:underline underline-offset-2">
              {group.key || 'No keyword'}
            </span>
            <span className="truncate text-xs text-muted-foreground">{sample}</span>
          </span>
        </button>
        {hasDraft && matched > 0 && (
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
              fully ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-800'
            )}
          >
            {fully ? 'all match' : `${matched}/${n} match`}
          </span>
        )}
        <span className="shrink-0 w-10 text-right text-xs font-semibold tabular-nums text-neutral-700">
          {n}×
        </span>
        <span
          className={cn(
            'shrink-0 w-24 text-right text-xs font-mono tabular-nums',
            group.total >= 0 ? 'text-emerald-600' : 'text-neutral-700'
          )}
        >
          {formatCurrency(group.total)}
        </span>
      </div>
      {open && (
        <div className="border-t border-border divide-y divide-border bg-neutral-50/50">
          {group.transactions.map((t) => (
            <TxRow
              key={t.id}
              tx={t}
              categories={categories}
              draft={draft}
              matched={matchedIds?.has(t.id) ?? false}
              indent
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TxRow({
  tx,
  categories,
  draft,
  matched,
  indent,
}: {
  tx: Transaction
  categories: Category[]
  draft: RuleDraft | null
  matched: boolean
  indent?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 py-1.5 pr-2 border-l-2',
        indent ? 'pl-9' : 'pl-3',
        matched ? 'border-l-emerald-500 bg-emerald-50/60' : 'border-l-transparent'
      )}
    >
      <span className="w-20 shrink-0 text-[11px] text-muted-foreground tabular-nums">
        {formatDate(tx.date)}
      </span>
      <span className="flex-1 min-w-0 text-xs text-neutral-800 break-words">
        <Highlight text={tx.description} draft={draft} />
      </span>
      <span
        className={cn(
          'shrink-0 w-24 text-right text-xs font-mono tabular-nums',
          tx.amount >= 0 ? 'text-emerald-600' : 'text-neutral-800'
        )}
      >
        {formatCurrency(tx.amount, tx.currency)}
      </span>
      <div className="shrink-0 hidden sm:block">
        <CategorySelect transaction={tx} categories={categories} variant="cell" />
      </div>
    </div>
  )
}
