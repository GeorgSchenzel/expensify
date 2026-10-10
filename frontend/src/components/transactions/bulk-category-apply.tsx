import { useState } from 'react'
import type { Table } from '@tanstack/react-table'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { useInvalidate } from '@/lib/queries'
import type { Category, Transaction } from '@/lib/types'
import { cn, errorMessage } from '@/lib/utils'

interface BulkCategoryApplyProps {
  table: Table<Transaction>
  categories: Category[]
}

/** Two-step "apply category X to all N filtered rows". */
export function BulkCategoryApply({ table, categories }: BulkCategoryApplyProps) {
  const [categoryId, setCategoryId] = useState('')
  const [confirm, setConfirm] = useState(false)
  const invalidate = useInvalidate()

  const mutation = useMutation({
    mutationFn: ({ ids, category }: { ids: string[]; category: Category }) =>
      api.transactions.bulkSetCategory(ids, category.id),
    onSuccess: async ({ updated }, { category }) => {
      await invalidate('transactions', 'dashboard')
      toast.success(
        `Applied "${category.name}" to ${updated} transaction${updated !== 1 ? 's' : ''}`
      )
      setConfirm(false)
      setCategoryId('')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const rows = table.getFilteredRowModel().rows
  const count = rows.length
  const selectedCategory = categories.find((c) => c.id === categoryId)

  if (count === 0 || categories.length === 0) return null

  function handleApply() {
    if (!selectedCategory) return
    if (!confirm) {
      setConfirm(true)
      return
    }
    mutation.mutate({ ids: rows.map((r) => r.original.id), category: selectedCategory })
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 border text-xs',
        confirm ? 'bg-amber-50 border-amber-200' : 'bg-neutral-50 border-border'
      )}
    >
      <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

      {confirm ? (
        <>
          <span className="text-amber-800 font-medium">
            Apply <span className="font-semibold">"{selectedCategory?.name}"</span> to {count}{' '}
            transaction{count !== 1 ? 's' : ''}? This cannot be undone.
          </span>
          <div className="flex gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setConfirm(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white border-0"
              onClick={handleApply}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Applying…' : `Yes, apply to ${count}`}
            </Button>
          </div>
        </>
      ) : (
        <>
          <span className="text-muted-foreground">
            Bulk apply to {count} filtered row{count !== 1 ? 's' : ''}:
          </span>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="h-7 text-xs w-36">
              <SelectValue placeholder="Pick category…" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.colorHex }} />
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={!categoryId}
            onClick={handleApply}
          >
            Apply
          </Button>
        </>
      )}
    </div>
  )
}
