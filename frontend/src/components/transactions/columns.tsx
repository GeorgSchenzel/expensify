import type { ColumnDef, Column } from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Category, Transaction } from '@/lib/types'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { CategorySelect } from './category-select'

function SortHeader({ column, label }: { column: Column<Transaction>; label: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-7 text-xs font-medium text-muted-foreground"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {label} <ArrowUpDown className="ml-1 w-3 h-3" />
    </Button>
  )
}

export function buildColumns(categories: Category[]): ColumnDef<Transaction>[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name]))

  return [
    {
      accessorKey: 'date',
      header: ({ column }) => <SortHeader column={column} label="Date" />,
      cell: ({ row }) => (
        <span className="text-xs text-neutral-600 whitespace-nowrap">
          {formatDate(row.original.date)}
        </span>
      ),
      // "yyyy-MM-dd" strings sort chronologically as plain strings.
      sortingFn: 'basic',
    },
    {
      accessorKey: 'description',
      header: ({ column }) => <SortHeader column={column} label="Description" />,
      cell: ({ row }) => (
        <span className="text-xs text-neutral-800 break-words">{row.original.description}</span>
      ),
    },
    {
      id: 'category',
      accessorFn: (row) => (row.categoryId ? nameById.get(row.categoryId) ?? '' : ''),
      header: ({ column }) => <SortHeader column={column} label="Category" />,
      cell: ({ row }) => (
        <CategorySelect transaction={row.original} categories={categories} variant="cell" />
      ),
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => <SortHeader column={column} label="Amount" />,
      cell: ({ row }) => {
        const { amount, currency } = row.original
        return (
          <span
            className={cn(
              'text-xs font-mono font-medium whitespace-nowrap',
              amount >= 0 ? 'text-emerald-600' : 'text-neutral-800'
            )}
          >
            {formatCurrency(amount, currency)}
          </span>
        )
      },
      sortingFn: 'basic',
    },
  ]
}
