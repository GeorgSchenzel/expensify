import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useInvalidate } from '@/lib/queries'
import { PRESET_COLORS, errorMessage } from '@/lib/utils'
import { ColorPicker } from './color-picker'

export function CategoryForm() {
  const invalidate = useInvalidate()
  const [name, setName] = useState('')
  const [colorHex, setColorHex] = useState(PRESET_COLORS[0])

  const mutation = useMutation({
    mutationFn: api.categories.create,
    onSuccess: async () => {
      await invalidate('categories')
      setName('')
      toast.success('Category created')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    mutation.mutate({ name: name.trim(), colorHex })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="category-name" className="text-xs font-medium">Name</Label>
          <Input
            id="category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Groceries"
            className="h-8 text-xs"
            maxLength={100}
            required
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs font-medium">Color</Label>
          <ColorPicker value={colorHex} onChange={setColorHex} />
        </div>
      </div>

      <Button type="submit" size="sm" disabled={mutation.isPending || !name.trim()} className="gap-1.5">
        <Plus className="w-3.5 h-3.5" />
        Add category
      </Button>
    </form>
  )
}
