import { useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ColorPicker } from '@/components/rules/color-picker'
import type { Category } from '@/lib/types'

export const NEW_CATEGORY = '__new__'

export interface CategoryChoice {
  /** An existing category id, NEW_CATEGORY, or '' for none yet. */
  id: string
  newName: string
  newColor: string
}

interface CategoryPickerProps {
  categories: Category[]
  value: CategoryChoice
  onChange: (value: CategoryChoice) => void
}

/** Pick an existing category or type a new one without leaving the workflow. */
export function CategoryPicker({ categories, value, onChange }: CategoryPickerProps) {
  const nameRef = useRef<HTMLInputElement>(null)
  const isNew = value.id === NEW_CATEGORY
  // An existing selection may have been deleted elsewhere.
  const selectValue = isNew || categories.some((c) => c.id === value.id) ? value.id : ''

  useEffect(() => {
    if (isNew) nameRef.current?.focus()
  }, [isNew])

  return (
    <div className="space-y-2">
      {/* Remount when the list changes: Radix Select does not pick up the label
          of a selected item that only appears after the value was set (a
          category created a moment ago). */}
      <Select
        key={categories.map((c) => c.id).join()}
        value={selectValue}
        onValueChange={(id) => onChange({ ...value, id })}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select category…" />
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
          {categories.length > 0 && <SelectSeparator />}
          <SelectItem value={NEW_CATEGORY}>
            <span className="flex items-center gap-2">
              <Plus className="w-3 h-3" />
              New category…
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      {isNew && (
        <div className="space-y-2 rounded-md border border-dashed border-neutral-300 p-2">
          <Input
            ref={nameRef}
            value={value.newName}
            onChange={(e) => onChange({ ...value, newName: e.target.value })}
            placeholder="New category name, e.g. Groceries"
            maxLength={100}
            className="h-8 text-xs"
          />
          <ColorPicker value={value.newColor} onChange={(newColor) => onChange({ ...value, newColor })} />
        </div>
      )}
    </div>
  )
}
