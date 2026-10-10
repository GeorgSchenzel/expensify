import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useInvalidate } from '@/lib/queries'
import { cn, errorMessage } from '@/lib/utils'

/** Runs the rules over transactions that are already in the database. */
export function ApplyRules() {
  const invalidate = useInvalidate()
  const [includeCategorized, setIncludeCategorized] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const mutation = useMutation({
    mutationFn: (all: boolean) => api.rules.apply(all),
    onSuccess: async ({ updated, checked }) => {
      await invalidate('transactions', 'dashboard')
      setConfirm(false)
      toast.success(
        updated === 0
          ? `No changes — checked ${checked} transaction${checked !== 1 ? 's' : ''}`
          : `Categorized ${updated} of ${checked} transaction${checked !== 1 ? 's' : ''}`
      )
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  function handleApply() {
    // Overwriting existing categories can undo manual choices, so confirm first.
    if (includeCategorized && !confirm) {
      setConfirm(true)
      return
    }
    mutation.mutate(includeCategorized)
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 border text-xs',
        confirm ? 'bg-amber-50 border-amber-200' : 'bg-neutral-50 border-border'
      )}
    >
      {confirm ? (
        <>
          <span className="text-amber-800 font-medium">
            Re-categorize all transactions that match a rule? Manual category choices will be
            overwritten. This cannot be undone.
          </span>
          <div className="flex gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setConfirm(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white border-0"
              onClick={handleApply}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Applying…' : 'Yes, re-categorize'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <span className="text-muted-foreground">Apply rules to existing transactions</span>
          <div className="flex items-center gap-2">
            <Checkbox
              id="apply-include-categorized"
              checked={includeCategorized}
              onCheckedChange={(v) => setIncludeCategorized(v === true)}
            />
            <Label htmlFor="apply-include-categorized" className="text-xs cursor-pointer">
              Also re-categorize already categorized
            </Label>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 ml-auto"
            onClick={handleApply}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            Apply rules
          </Button>
        </>
      )}
    </div>
  )
}
