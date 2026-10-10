import { useMemo, useState, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { useCategories } from '@/lib/queries'
import type { Category, ImportPreview, ImportPreviewRow, ImportRowStatus } from '@/lib/types'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

const PAGE = 100

const STATUS: Record<ImportRowStatus, { label: string; tab: string; className: string }> = {
  new: { label: 'New', tab: 'New', className: 'bg-emerald-50 text-emerald-700' },
  existing: {
    label: 'Already imported',
    tab: 'Already imported',
    className: 'bg-neutral-100 text-neutral-600',
  },
  repeated: {
    label: 'Duplicate in file',
    tab: 'Duplicates in file',
    className: 'bg-neutral-100 text-neutral-600',
  },
  error: { label: 'Error', tab: 'Errors', className: 'bg-red-50 text-red-700' },
}

type Filter = 'all' | ImportRowStatus

export function countByStatus(rows: ImportPreviewRow[]): Record<ImportRowStatus, number> {
  const counts = { new: 0, existing: 0, repeated: 0, error: 0 }
  for (const r of rows) counts[r.status]++
  return counts
}

/** Summary and row-by-row table of what an import would do. */
export function ParsedPreview({ preview }: { preview: ImportPreview }) {
  const { data: categories } = useCategories()
  const categoryById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories]
  )
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(PAGE)

  const counts = countByStatus(preview.rows)
  const tabs: Filter[] = [
    'all',
    ...(['new', 'existing', 'repeated', 'error'] as const).filter((s) => counts[s] > 0),
  ]
  // A filter can become empty when the mapping changes; fall back to all rows.
  const activeFilter = tabs.includes(filter) ? filter : 'all'
  const rows =
    activeFilter === 'all' ? preview.rows : preview.rows.filter((r) => r.status === activeFilter)

  return (
    <div className="space-y-4">
      <Summary preview={preview} categoryById={categoryById} />

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setFilter(t)
              setLimit(PAGE)
            }}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
              activeFilter === t
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
            )}
          >
            {t === 'all' ? 'All' : STATUS[t].tab}
            <span className="ml-1.5 opacity-60">{t === 'all' ? preview.rows.length : counts[t]}</span>
          </button>
        ))}
      </div>

      <div className="overflow-auto max-h-[28rem] rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-neutral-50 border-b border-border">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium text-right w-10">#</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium text-right">Amount</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.slice(0, limit).map((r) => (
              <PreviewRow key={r.row} row={r} category={r.categoryId ? categoryById.get(r.categoryId) : undefined} />
            ))}
          </tbody>
        </table>
        {rows.length > limit && (
          <div className="px-3 py-2 text-xs text-muted-foreground bg-neutral-50 border-t border-border">
            Showing {limit} of {rows.length} rows ·{' '}
            <button type="button" className="underline" onClick={() => setLimit(rows.length)}>
              show all
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewRow({ row, category }: { row: ImportPreviewRow; category?: Category }) {
  const status = STATUS[row.status]
  const muted = row.status === 'existing' || row.status === 'repeated'
  return (
    <tr className={cn('bg-white', muted && 'text-muted-foreground')}>
      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{row.row}</td>
      {row.status === 'error' ? (
        <td colSpan={4} className="px-3 py-1.5 text-red-700">
          <span className="inline-flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {row.error}
          </span>
        </td>
      ) : (
        <>
          <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(row.date!)}</td>
          <td className="px-3 py-1.5 max-w-xs truncate" title={row.description}>
            {row.description}
          </td>
          <td
            className={cn(
              'px-3 py-1.5 text-right tabular-nums whitespace-nowrap font-medium',
              !muted && (row.amount! >= 0 ? 'text-emerald-600' : 'text-neutral-800')
            )}
          >
            {formatCurrency(row.amount!, row.currency)}
          </td>
          <td className="px-3 py-1.5 whitespace-nowrap">
            {category ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: category.colorHex }} />
                {category.name}
              </span>
            ) : (
              row.status === 'new' && <span className="text-muted-foreground">—</span>
            )}
          </td>
        </>
      )}
      <td className="px-3 py-1.5 whitespace-nowrap">
        <span className={cn('px-1.5 py-0.5 rounded text-[11px] font-medium', status.className)}>
          {status.label}
        </span>
      </td>
    </tr>
  )
}

function Summary({
  preview,
  categoryById,
}: {
  preview: ImportPreview
  categoryById: Map<string, Category>
}) {
  const newRows = preview.rows.filter((r) => r.status === 'new')
  // yyyy-MM-dd strings sort chronologically.
  const dates = newRows.map((r) => r.date!).sort()
  const byCategory = new Map<string, number>()
  for (const r of newRows) {
    if (r.categoryId) byCategory.set(r.categoryId, (byCategory.get(r.categoryId) ?? 0) + 1)
  }
  const categorized = [...byCategory.values()].reduce((a, b) => a + b, 0)
  const topCategories = [...byCategory.entries()].sort((a, b) => b[1] - a[1])

  if (newRows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nothing new to import in this file.</p>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Stat label="New transactions">
        <p className="text-lg font-semibold text-neutral-900 tabular-nums">{newRows.length}</p>
        <p className="text-xs text-muted-foreground">
          {formatDate(dates[0])} – {formatDate(dates[dates.length - 1])}
        </p>
        {preview.existingTo && (
          <p className="text-xs text-muted-foreground">
            Stored so far: {formatDate(preview.existingFrom!)} – {formatDate(preview.existingTo)}
          </p>
        )}
      </Stat>

      <Stat label="Money moved">
        {preview.totals.map((t) => (
          <div key={t.currency} className="text-xs tabular-nums space-y-0.5">
            <p className="text-emerald-600 font-medium">+{formatCurrency(t.income, t.currency)}</p>
            <p className="text-neutral-800 font-medium">{formatCurrency(t.expenses, t.currency)}</p>
          </div>
        ))}
      </Stat>

      <Stat label="Categorized by your rules">
        <p className="text-lg font-semibold text-neutral-900 tabular-nums">
          {categorized}
          <span className="text-xs font-normal text-muted-foreground">
            {' '}
            of {newRows.length} ({Math.round((categorized / newRows.length) * 100)}%)
          </span>
        </p>
        <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden flex">
          {topCategories.map(([id, n]) => (
            <div
              key={id}
              style={{
                width: `${(n / newRows.length) * 100}%`,
                backgroundColor: categoryById.get(id)?.colorHex ?? '#a3a3a3',
              }}
              title={`${categoryById.get(id)?.name ?? 'Unknown'}: ${n}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
          {topCategories.slice(0, 4).map(([id, n]) => (
            <span key={id} className="inline-flex items-center gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: categoryById.get(id)?.colorHex }}
              />
              {categoryById.get(id)?.name ?? 'Unknown'} {n}
            </span>
          ))}
          {topCategories.length > 4 && <span>+{topCategories.length - 4} more</span>}
        </div>
      </Stat>
    </div>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3 space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}
