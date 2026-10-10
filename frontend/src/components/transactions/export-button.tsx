import type { Table } from '@tanstack/react-table'
import Papa from 'papaparse'
import { Download } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import type { Category, Transaction } from '@/lib/types'

interface ExportButtonProps {
  table: Table<Transaction>
  categories: Category[]
}

/** Downloads the currently filtered (and sorted) rows as CSV. */
export function ExportButton({ table, categories }: ExportButtonProps) {
  function handleExport() {
    const nameById = new Map(categories.map((c) => [c.id, c.name]))
    const csv = Papa.unparse(
      table.getSortedRowModel().rows.map(({ original: t }) => ({
        Date: t.date,
        Description: t.description,
        Amount: t.amount,
        Currency: t.currency,
        Category: t.categoryId ? nameById.get(t.categoryId) ?? '' : '',
      })),
      { columns: ['Date', 'Description', 'Amount', 'Currency', 'Category'] }
    )

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoke after the click has been processed, or some browsers cancel the download.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 h-8 text-xs">
      <Download className="w-3.5 h-3.5" />
      Export CSV
    </Button>
  )
}
