import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { CategoryMultiSelect } from '@/components/category-multi-select'
import { RANGE_PRESETS, type RangePreset } from '@/lib/dashboard-range'
import type { Category } from '@/lib/types'
import { cn, fromDateKey, toDateKey } from '@/lib/utils'

export interface DashboardFilterValue {
  /** Null when custom dates are set. */
  preset: RangePreset | null
  /** Resolved dates of the preset (or the custom dates); both absent for "All". */
  from?: string
  to?: string
  cat: string[]
}

interface DashboardFiltersProps {
  categories: Category[]
  value: DashboardFilterValue
  isDefault: boolean
  onPreset: (preset: RangePreset) => void
  onCustom: (from: string | undefined, to: string | undefined) => void
  onCategories: (cat: string[]) => void
  onReset: () => void
}

export function DashboardFilters({
  categories,
  value,
  isDefault,
  onPreset,
  onCustom,
  onCategories,
  onReset,
}: DashboardFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex h-8 items-center overflow-hidden rounded-md border border-input bg-white">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            title={p.title}
            onClick={() => onPreset(p.key)}
            className={cn(
              'h-full whitespace-nowrap px-2.5 text-xs transition-colors',
              value.preset === p.key ? 'bg-neutral-900 text-white' : 'text-muted-foreground hover:bg-neutral-100'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <DateRangePicker
        from={fromDateKey(value.from)}
        to={fromDateKey(value.to)}
        placeholder="All time"
        className={cn(value.preset === null && 'border-neutral-900')}
        onChange={(from, to) => onCustom(from ? toDateKey(from) : undefined, to ? toDateKey(to) : undefined)}
      />

      {categories.length > 0 && (
        <CategoryMultiSelect
          idPrefix="dash-cat"
          categories={categories}
          selected={value.cat}
          onChange={onCategories}
        />
      )}

      {!isDefault && (
        <Button variant="ghost" size="sm" onClick={onReset} className="h-8 gap-1 text-xs text-muted-foreground">
          <X className="h-3 w-3" />
          Reset
        </Button>
      )}
    </div>
  )
}
