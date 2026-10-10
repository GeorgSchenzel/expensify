import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { CategoryMultiSelect } from '@/components/category-multi-select'
import type { Category, GroupBy } from '@/lib/types'
import { cn, fromDateKey, toDateKey } from '@/lib/utils'

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

export interface DashboardFilterValue {
  from?: string
  to?: string
  cat: string[]
  groupBy: GroupBy
}

interface DashboardFiltersProps {
  categories: Category[]
  value: DashboardFilterValue
  onChange: (value: DashboardFilterValue) => void
}

export function DashboardFilters({ categories, value, onChange }: DashboardFiltersProps) {
  const hasFilters = Boolean(value.from || value.to || value.cat.length > 0)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Group-by toggle */}
      <div className="flex items-center rounded-md border border-input overflow-hidden h-8">
        {GROUP_BY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange({ ...value, groupBy: opt.value })}
            className={cn(
              'px-3 text-xs h-full transition-colors',
              value.groupBy === opt.value
                ? 'bg-neutral-900 text-white'
                : 'text-muted-foreground hover:bg-neutral-100'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <DateRangePicker
        from={fromDateKey(value.from)}
        to={fromDateKey(value.to)}
        onChange={(from, to) =>
          onChange({
            ...value,
            from: from ? toDateKey(from) : undefined,
            to: to ? toDateKey(to) : undefined,
          })
        }
      />

      {categories.length > 0 && (
        <CategoryMultiSelect
          idPrefix="dash-cat"
          categories={categories}
          selected={value.cat}
          onChange={(cat) => onChange({ ...value, cat })}
        />
      )}

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ cat: [], groupBy: value.groupBy })}
          className="h-8 text-xs text-muted-foreground gap-1"
        >
          <X className="w-3 h-3" />
          Reset
        </Button>
      )}
    </div>
  )
}
