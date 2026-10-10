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
}

export function CategoryMultiSelect({
  categories,
  selected,
  onChange,
  idPrefix,
  className,
}: CategoryMultiSelectProps) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id])
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 text-xs font-normal',
            selected.length > 0 ? 'border-neutral-400' : 'text-muted-foreground',
            className
          )}
        >
          {selected.length > 0
            ? `${selected.length} categor${selected.length > 1 ? 'ies' : 'y'}`
            : 'All categories'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2 max-h-80 overflow-y-auto" align="start">
        <div className="space-y-1">
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
