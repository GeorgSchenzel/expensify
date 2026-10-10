import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { api } from '@/lib/api'
import { useInvalidate } from '@/lib/queries'
import type { Category, RuleType } from '@/lib/types'
import { errorMessage } from '@/lib/utils'

interface RuleFormProps {
  categories: Category[]
}

export function RuleForm({ categories }: RuleFormProps) {
  const invalidate = useInvalidate()
  const [pattern, setPattern] = useState('')
  const [type, setType] = useState<RuleType>('CONTAINS')
  const [categoryId, setCategoryId] = useState('')
  const [caseInsensitive, setCaseInsensitive] = useState(true)

  const mutation = useMutation({
    mutationFn: api.rules.create,
    onSuccess: async () => {
      await invalidate('rules')
      setPattern('')
      toast.success('Rule created')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const isPending = mutation.isPending

  // The selected category may have been deleted in the meantime.
  const validCategoryId = categories.some((c) => c.id === categoryId) ? categoryId : ''

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pattern.trim() || !validCategoryId) return
    mutation.mutate({
      pattern: pattern.trim(),
      type,
      categoryId: validCategoryId,
      isCaseInsensitive: caseInsensitive,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pattern */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="rule-pattern" className="text-xs font-medium">Pattern</Label>
          <Input
            id="rule-pattern"
            maxLength={500}
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder={type === 'CONTAINS' ? 'e.g. bike24' : 'e.g. MAGENTA\\s*(TELEKOM|INTERNET)'}
            className="h-8 text-xs font-mono"
            required
          />
        </div>

        {/* Type */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Match type</Label>
          <Select value={type} onValueChange={(v) => setType(v as RuleType)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CONTAINS">Contains</SelectItem>
              <SelectItem value="REGEX">Regex</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Assign to category</Label>
          <Select value={validCategoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select category…" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ background: c.colorHex }}
                    />
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Case insensitive toggle */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="case-insensitive"
          checked={caseInsensitive}
          onCheckedChange={(v) => setCaseInsensitive(v === true)}
        />
        <Label htmlFor="case-insensitive" className="text-xs cursor-pointer">
          Case insensitive
        </Label>
      </div>

      <Button type="submit" size="sm" disabled={isPending || !pattern.trim() || !validCategoryId} className="gap-1.5">
        <Plus className="w-3.5 h-3.5" />
        Add rule
      </Button>
    </form>
  )
}
