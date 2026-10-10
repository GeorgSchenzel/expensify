import { useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
} from '@tanstack/react-table'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { Category, Transaction } from '@/lib/types'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { buildColumns } from './columns'
import { ExportButton } from './export-button'
import { BulkCategoryApply } from './bulk-category-apply'
import { CategorySelect } from './category-select'

interface TransactionsTableProps {
  transactions: Transaction[]
  categories: Category[]
}

export function TransactionsTable({ transactions, categories }: TransactionsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'date', desc: true }])
  const [globalFilter, setGlobalFilter] = useState('')

  const columns = useMemo(() => buildColumns(categories), [categories])

  const table = useReactTable({
    data: transactions,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // Search every column, including the computed category name.
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: 'includesString',
  })

  const rows = table.getRowModel().rows
  // Render one layout only; every row has an interactive category picker, so
  // mounting both and hiding one with CSS doubles the work.
  const isDesktop = useMediaQuery('(min-width: 768px)')

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search transactions…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{rows.length} rows</span>
          <ExportButton table={table} categories={categories} />
        </div>
      </div>

      <BulkCategoryApply table={table} categories={categories} />

      {/* ── Mobile card list ── */}
      {!isDesktop && (
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border bg-white">
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No transactions found.</p>
          ) : (
            rows.map((row) => <MobileRow key={row.id} tx={row.original} categories={categories} />)
          )}
        </div>
      )}

      {/* ── Desktop table ── */}
      {isDesktop && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-border">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th key={header.id} className="px-4 py-2.5 text-left">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border bg-white">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No transactions found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-neutral-50/50">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MobileRow({ tx, categories }: { tx: Transaction; categories: Category[] }) {
  const desc = tx.description.length > 200 ? tx.description.slice(0, 200) + '…' : tx.description

  return (
    <div className="px-4 py-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground tabular-nums">{formatDate(tx.date)}</span>
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            tx.amount >= 0 ? 'text-emerald-600' : 'text-neutral-900'
          )}
        >
          {formatCurrency(tx.amount, tx.currency)}
        </span>
      </div>
      <p className="text-sm text-neutral-800 leading-snug break-words">{desc}</p>
      <CategorySelect transaction={tx} categories={categories} variant="pill" />
    </div>
  )
}
