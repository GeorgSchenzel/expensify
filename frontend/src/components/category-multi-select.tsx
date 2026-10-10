import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Category } from '@/lib/types'
import { cn } from '@/lib/utils'

interface CategoryMultiSelectProps {
  categories: Category[]
  selected: string[]
  onChange: (ids: string[]) => void
  idPrefix: string
  className?: string
  /** Pass both to offer an "Uncategorized" option (OR-ed with the selected categories). */
  uncategorized?: boolean
  onUncategorizedChange?: (value: boolean) => void
}

export function CategoryMultiSelect({
  categories,
  selected,
  onChange,
  idPrefix,
  className,
  uncategorized = false,
  onUncategorizedChange,
}: CategoryMultiSelectProps) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id])
  }

  const count = selected.length + (uncategorized ? 1 : 0)
  const label =
    count === 0
      ? 'All categories'
      : count === 1 && uncategorized
        ? 'Uncategorized'
        : `${count} categor${count > 1 ? 'ies' : 'y'}`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 text-xs font-normal',
            count > 0 ? 'border-neutral-400' : 'text-muted-foreground',
            className
          )}
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2 max-h-80 overflow-y-auto" align="start">
        <div className="space-y-1">
          {onUncategorizedChange && (
            <div className="flex items-center gap-2 px-1 py-1 rounded hover:bg-neutral-50">
              <Checkbox
                id={`${idPrefix}-uncategorized`}
                checked={uncategorized}
                onCheckedChange={() => onUncategorizedChange(!uncategorized)}
              />
              <Label
                htmlFor={`${idPrefix}-uncategorized`}
                className="flex items-center gap-1.5 text-xs cursor-pointer flex-1 italic"
              >
                <span className="w-2 h-2 rounded-full shrink-0 border border-dashed border-neutral-400" />
                Uncategorized
              </Label>
            </div>
          )}
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-neutral-50">
              <Checkbox
                id={`${idPrefix}-${c.id}`}
                checked={selected.includes(c.id)}
                onCheckedChange={() => toggle(c.id)}
              />
              <Label
                htmlFor={`${idPrefix}-${c.id}`}
                className="flex items-center gap-1.5 text-xs cursor-pointer flex-1"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.colorHex }} />
                {c.name}
              </Label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
