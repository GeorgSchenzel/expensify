import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Trash2, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { keys } from '@/lib/queries'
import type { RuleWithCategory } from '@/lib/types'
import { errorMessage } from '@/lib/utils'

export function RulesTable({ rules }: { rules: RuleWithCategory[] }) {
  const client = useQueryClient()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const reorder = useMutation({
    mutationFn: (ordered: RuleWithCategory[]) => api.rules.reorder(ordered.map((r) => r.id)),
    onMutate: async (ordered) => {
      // Optimistic: show the new order immediately.
      await client.cancelQueries({ queryKey: keys.rules })
      client.setQueryData<RuleWithCategory[]>(keys.rules, ordered)
    },
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.rules })
      client.invalidateQueries({ queryKey: [...keys.transactions, 'rule-preview'] })
    },
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = rules.findIndex((r) => r.id === active.id)
    const newIndex = rules.findIndex((r) => r.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    reorder.mutate(arrayMove(rules, oldIndex, newIndex))
  }

  if (rules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No rules yet. Add one below to start auto-categorizing transactions.
      </p>
    )
  }

  // DndContext must wrap the table from outside — it renders an accessibility <div>
  // that would be invalid HTML if placed inside <table>.
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-border">
            <tr>
              <th className="w-8" />
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Pattern</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Category</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Options</th>
              <th className="px-4 py-2.5 w-10" />
            </tr>
          </thead>
          <SortableContext items={rules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <tbody className="divide-y divide-border bg-white">
              {rules.map((rule, index) => (
                <SortableRow key={rule.id} rule={rule} index={index} disabled={reorder.isPending} />
              ))}
            </tbody>
          </SortableContext>
        </table>
      </div>
    </DndContext>
  )
}

function SortableRow({
  rule,
  index,
  disabled,
}: {
  rule: RuleWithCategory
  index: number
  disabled: boolean
}) {
  const client = useQueryClient()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rule.id,
  })

  const remove = useMutation({
    mutationFn: () => api.rules.remove(rule.id),
    onMutate: async () => {
      // Optimistic remove.
      await client.cancelQueries({ queryKey: keys.rules })
      client.setQueryData<RuleWithCategory[]>(keys.rules, (old) => old?.filter((r) => r.id !== rule.id))
    },
    onSuccess: () => toast.success('Rule deleted'),
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.rules })
      client.invalidateQueries({ queryKey: [...keys.transactions, 'rule-preview'] })
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'bg-neutral-50 shadow-md opacity-80 z-10 relative' : 'hover:bg-neutral-50/50'}
    >
      <td className="pl-2 pr-0 py-3 w-8">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex items-center justify-center w-6 h-6 rounded text-neutral-300 hover:text-neutral-500 hover:bg-neutral-100 cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </td>

      <td className="px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-neutral-300 tabular-nums w-4 text-right shrink-0">
            {index + 1}
          </span>
          <span className="font-mono text-xs text-neutral-800 break-all">{rule.pattern}</span>
        </span>
      </td>

      <td className="px-4 py-3">
        <Badge variant={rule.type === 'REGEX' ? 'secondary' : 'outline'} className="text-xs font-mono">
          {rule.type}
        </Badge>
      </td>

      <td className="px-4 py-3">
        <span className="flex items-center gap-1.5 text-xs">
          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: rule.category.colorHex }} />
          {rule.category.name}
        </span>
      </td>

      <td className="px-4 py-3">
        {rule.isCaseInsensitive && <span className="text-xs text-muted-foreground">case-insensitive</span>}
      </td>

      <td className="px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete rule"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          disabled={disabled || remove.isPending}
          onClick={() => remove.mutate()}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </td>
    </tr>
  )
}
