import { useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  selectTriggerClassName,
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

/**
 * Inline category picker for a single transaction. Every table row has one,
 * so it renders a plain look-alike button and mounts the Radix Select (and the
 * mutation) only once the row's picker is first opened.
 */
export function CategorySelect({ transaction, categories, variant }: CategorySelectProps) {
  const [active, setActive] = useState(false)
  const category = categories.find((c) => c.id === transaction.categoryId)

  const className = cn(
    variant === 'cell'
      ? 'h-7 w-40 text-xs border-transparent bg-transparent hover:bg-neutral-100 focus:bg-white focus:border-border'
      : cn(
          'h-6 w-fit max-w-full gap-1.5 px-2 text-[11px] border rounded-full bg-transparent focus:ring-0',
          category ? 'border-transparent' : 'border-neutral-200 text-muted-foreground'
        )
  )
  const style: CSSProperties | undefined =
    variant === 'pill' && category
      ? {
          background: category.colorHex + '18',
          borderColor: category.colorHex + '50',
          color: category.colorHex,
        }
      : undefined
  const label = category ? (
    <span className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: category.colorHex }} />
      {category.name}
    </span>
  ) : variant === 'cell' ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    'Uncategorized'
  )

  if (!active) {
    return (
      <button
        type="button"
        className={cn(selectTriggerClassName, className)}
        style={style}
        onClick={() => setActive(true)}
      >
        <span>{label}</span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
    )
  }

  return (
    <ActiveCategorySelect
      transaction={transaction}
      categories={categories}
      value={category ? category.id : NONE}
      className={className}
      style={style}
      label={label}
    />
  )
}

interface ActiveCategorySelectProps {
  transaction: Transaction
  categories: Category[]
  value: string
  className: string
  style: CSSProperties | undefined
  label: ReactNode
}

function ActiveCategorySelect({
  transaction,
  categories,
  value,
  className,
  style,
  label,
}: ActiveCategorySelectProps) {
  const mutation = useSetTransactionCategory()

  return (
    <Select
      defaultOpen
      value={value}
      onValueChange={(next) =>
        mutation.mutate({ id: transaction.id, categoryId: next === NONE ? null : next })
      }
    >
      <SelectTrigger className={cn(className, mutation.isPending && 'opacity-40')} style={style}>
        <SelectValue>{label}</SelectValue>
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
