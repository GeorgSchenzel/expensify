import type { CSSProperties } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Category, Transaction } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSetTransactionCategory } from './use-set-category'

const NONE = '__none__'

interface CategorySelectProps {
  transaction: Transaction
  categories: Category[]
  /** "cell" for the desktop table, "pill" for the mobile card list. */
  variant: 'cell' | 'pill'
}

/** Inline category picker for a single transaction. */
export function CategorySelect({ transaction, categories, variant }: CategorySelectProps) {
  const mutation = useSetTransactionCategory()
  const category = categories.find((c) => c.id === transaction.categoryId)

  const pillStyle: CSSProperties | undefined =
    variant === 'pill' && category
      ? {
          background: category.colorHex + '18',
          borderColor: category.colorHex + '50',
          color: category.colorHex,
        }
      : undefined

  return (
    <Select
      value={category ? category.id : NONE}
      onValueChange={(value) =>
        mutation.mutate({ id: transaction.id, categoryId: value === NONE ? null : value })
      }
    >
      <SelectTrigger
        className={cn(
          variant === 'cell'
            ? 'h-7 w-40 text-xs border-transparent bg-transparent hover:bg-neutral-100 focus:bg-white focus:border-border'
            : cn(
                'h-6 w-fit max-w-full gap-1.5 px-2 text-[11px] border rounded-full bg-transparent focus:ring-0',
                category ? 'border-transparent' : 'border-neutral-200 text-muted-foreground'
              ),
          mutation.isPending && 'opacity-40'
        )}
        style={pillStyle}
      >
        <SelectValue>
          {category ? (
            <span className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: category.colorHex }}
              />
              {category.name}
            </span>
          ) : variant === 'cell' ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            'Uncategorized'
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <span className="text-muted-foreground">Uncategorized</span>
        </SelectItem>
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
  )
}
