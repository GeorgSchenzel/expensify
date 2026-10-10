import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { useInvalidate } from '@/lib/queries'
import type { Category } from '@/lib/types'
import { errorMessage } from '@/lib/utils'
import { ColorPicker } from './color-picker'

export function CategoryList({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null

  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <table className="w-full">
        <thead className="bg-neutral-50 border-b border-border">
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Color</th>
            <th className="px-4 py-2.5 w-20" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-white">
          {categories.map((cat) => (
            <CategoryRow key={cat.id} category={cat} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CategoryRow({ category }: { category: Category }) {
  const invalidate = useInvalidate()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [colorHex, setColorHex] = useState(category.colorHex)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Rules embed the category, transactions and the dashboard show its name/colour.
  const refreshAll = () => invalidate('categories', 'rules', 'transactions', 'dashboard')

  const update = useMutation({
    mutationFn: () => api.categories.update(category.id, { name: name.trim(), colorHex }),
    onSuccess: async () => {
      await refreshAll()
      setEditing(false)
      toast.success('Category updated')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: () => api.categories.remove(category.id),
    onSuccess: async () => {
      await refreshAll()
      toast.success('Category deleted — affected transactions uncategorized')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const isPending = update.isPending || remove.isPending

  function startEditing() {
    setName(category.name)
    setColorHex(category.colorHex)
    setEditing(true)
  }

  function handleSave() {
    if (!name.trim()) return
    update.mutate()
  }

  if (editing) {
    return (
      <tr className="bg-neutral-50/80">
        <td className="px-4 py-2.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-7 text-xs w-44"
            maxLength={100}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        </td>
        <td className="px-4 py-2.5">
          <ColorPicker value={colorHex} onChange={setColorHex} />
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Save"
              className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
              disabled={isPending || !name.trim()}
              onClick={handleSave}
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cancel"
              className="h-7 w-7 text-muted-foreground hover:text-neutral-700"
              disabled={isPending}
              onClick={() => setEditing(false)}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="hover:bg-neutral-50/50">
      <td className="px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-neutral-800">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: category.colorHex }} />
          {category.name}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <span
          className="inline-block px-2 py-0.5 rounded text-xs font-mono"
          style={{ background: category.colorHex + '20', color: category.colorHex }}
        >
          {category.colorHex}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit category"
            className="h-7 w-7 text-muted-foreground hover:text-neutral-800"
            onClick={startEditing}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>

          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-red-600 font-medium whitespace-nowrap">Delete?</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Confirm delete"
                className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                disabled={isPending}
                onClick={() => remove.mutate()}
              >
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cancel delete"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => setConfirmDelete(false)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete category"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}
