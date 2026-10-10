import { useState } from 'react'
import { startOfMonth, endOfMonth, subMonths, isSameDay } from 'date-fns'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { CategoryMultiSelect } from '@/components/category-multi-select'
import type { Category } from '@/lib/types'
import { cn, fromDateKey, toDateKey } from '@/lib/utils'

export interface TransactionFilterValue {
  /** Always set — the page applies "first of this month → today" by default. */
  from: string
  to: string
  cat: string[]
  amountMin?: string
  amountMax?: string
}

type Preset = 'this-month' | 'last-month' | 'last-3-months' | 'custom'

const PRESETS: { key: Exclude<Preset, 'custom'> | 'custom'; label: string }[] = [
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'last-3-months', label: 'Last 3 months' },
  { key: 'custom', label: 'Custom' },
]

export function presetRange(preset: Exclude<Preset, 'custom'>, today = new Date()) {
  switch (preset) {
    case 'this-month':
      return { from: toDateKey(startOfMonth(today)), to: toDateKey(today) }
    case 'last-month': {
      const prev = subMonths(today, 1)
      return { from: toDateKey(startOfMonth(prev)), to: toDateKey(endOfMonth(prev)) }
    }
    case 'last-3-months':
      return { from: toDateKey(startOfMonth(subMonths(today, 3))), to: toDateKey(today) }
  }
}

function detectPreset(from: string, to: string): Preset {
  const f = fromDateKey(from)
  const t = fromDateKey(to)
  if (!f || !t) return 'custom'
  for (const key of ['this-month', 'last-month', 'last-3-months'] as const) {
    const range = presetRange(key)
    if (isSameDay(f, fromDateKey(range.from)!) && isSameDay(t, fromDateKey(range.to)!)) return key
  }
  return 'custom'
}

/** Accepts "-500", "12.5", "12,50"; anything else is treated as empty. */
function cleanAmount(raw: string): string | undefined {
  const v = raw.trim()
  return /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(v) ? v : undefined
}

/** Local input state that resets whenever the URL value changes (e.g. back button). */
function useSyncedInput(urlValue: string) {
  const [value, setValue] = useState(urlValue)
  const [seen, setSeen] = useState(urlValue)
  if (seen !== urlValue) {
    setSeen(urlValue)
    setValue(urlValue)
  }
  return [value, setValue] as const
}

interface TransactionFiltersProps {
  categories: Category[]
  value: TransactionFilterValue
  isDefault: boolean
  onChange: (value: TransactionFilterValue) => void
  onReset: () => void
}

export function TransactionFilters({
  categories,
  value,
  isDefault,
  onChange,
  onReset,
}: TransactionFiltersProps) {
  // "Custom" can be chosen before any dates are picked, so it is local state.
  const [customChosen, setCustomChosen] = useState(false)
  const detected = detectPreset(value.from, value.to)
  const preset: Preset = customChosen ? 'custom' : detected

  const [amountMin, setAmountMin] = useSyncedInput(value.amountMin ?? '')
  const [amountMax, setAmountMax] = useSyncedInput(value.amountMax ?? '')

  function applyPreset(p: Preset) {
    if (p === 'custom') {
      setCustomChosen(true)
      return
    }
    setCustomChosen(false)
    onChange({ ...value, ...presetRange(p) })
  }

  function handleCustomRange(from: Date | undefined, to: Date | undefined) {
    if (!from && !to) {
      // Cleared → back to the default range.
      setCustomChosen(false)
      onChange({ ...value, ...presetRange('this-month') })
      return
    }
    const today = new Date()
    onChange({
      ...value,
      from: toDateKey(from ?? startOfMonth(today)),
      to: toDateKey(to ?? today),
    })
  }

  function commitAmounts() {
    const min = cleanAmount(amountMin)
    const max = cleanAmount(amountMax)
    setAmountMin(min ?? '')
    setAmountMax(max ?? '')
    if (min !== value.amountMin || max !== value.amountMax) {
      onChange({ ...value, amountMin: min, amountMax: max })
    }
  }

  function handleReset() {
    setCustomChosen(false)
    setAmountMin('')
    setAmountMax('')
    onReset()
  }

  const showReset = !isDefault || customChosen

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Period — full width on mobile so presets don't clip */}
      <div className="flex flex-col gap-1.5 w-full md:w-auto">
        <Label className="text-xs font-medium">Period</Label>
        <div className="flex gap-1 bg-neutral-100 p-0.5 rounded-lg h-8 items-center w-full md:w-auto">
          {PRESETS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className={cn(
                'flex-1 md:flex-none px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap text-center',
                preset === key
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {preset === 'custom' && (
        <div className="flex flex-col gap-1.5 w-full md:w-auto">
          <Label className="text-xs font-medium">Date range</Label>
          <DateRangePicker
            from={fromDateKey(value.from)}
            to={fromDateKey(value.to)}
            onChange={handleCustomRange}
            className="w-full md:w-auto"
          />
        </div>
      )}

      {/* Amount min / max — own full-width row on mobile */}
      <div className="flex items-end gap-2 flex-nowrap w-full md:w-auto">
        <div className="flex flex-col gap-1.5 flex-1 md:flex-none">
          <Label htmlFor="amount-min" className="text-xs font-medium">Amount min</Label>
          <Input
            id="amount-min"
            inputMode="decimal"
            placeholder="e.g. -500"
            value={amountMin}
            onChange={(e) => setAmountMin(e.target.value)}
            onBlur={commitAmounts}
            onKeyDown={(e) => e.key === 'Enter' && commitAmounts()}
            className="h-8 text-xs w-full md:w-24"
          />
        </div>
        <div className="flex flex-col gap-1.5 flex-1 md:flex-none">
          <Label htmlFor="amount-max" className="text-xs font-medium">Amount max</Label>
          <Input
            id="amount-max"
            inputMode="decimal"
            placeholder="e.g. 0"
            value={amountMax}
            onChange={(e) => setAmountMax(e.target.value)}
            onBlur={commitAmounts}
            onKeyDown={(e) => e.key === 'Enter' && commitAmounts()}
            className="h-8 text-xs w-full md:w-24"
          />
        </div>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-col gap-1.5 w-1/2 md:w-auto">
          <Label className="text-xs font-medium">Category</Label>
          <CategoryMultiSelect
            idPrefix="tx-cat"
            categories={categories}
            selected={value.cat}
            onChange={(cat) => onChange({ ...value, cat })}
            className="w-full md:w-auto"
          />
        </div>
      )}

      {showReset && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="h-8 text-xs text-muted-foreground gap-1 self-end"
        >
          <X className="w-3 h-3" />
          Reset
        </Button>
      )}
    </div>
  )
}
