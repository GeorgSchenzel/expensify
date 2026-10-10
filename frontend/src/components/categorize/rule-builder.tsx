import { forwardRef } from 'react'
import { AlertCircle, Loader2, WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Category, RuleDraft, RulePreview, RuleType } from '@/lib/types'
import type { KeywordSuggestion } from '@/lib/grouping'
import { cn, errorMessage, formatCurrency } from '@/lib/utils'
import { CategoryPicker, type CategoryChoice } from './category-picker'

interface RuleBuilderProps {
  draft: RuleDraft
  onDraftChange: (draft: RuleDraft) => void
  category: CategoryChoice
  onCategoryChange: (choice: CategoryChoice) => void
  categories: Category[]
  preview: RulePreview | undefined
  previewLoading: boolean
  previewError: unknown
  suggestions: KeywordSuggestion[]
  /** Name of the chosen (or to-be-created) category, shown on the button. */
  categoryName: string | null
  canSubmit: boolean
  submitting: boolean
  onSubmit: () => void
}

export const RuleBuilder = forwardRef<HTMLInputElement, RuleBuilderProps>(function RuleBuilder(
  {
    draft,
    onDraftChange,
    category,
    onCategoryChange,
    categories,
    preview,
    previewLoading,
    previewError,
    suggestions,
    categoryName,
    canSubmit,
    submitting,
    onSubmit,
  },
  patternRef
) {
  const hasPattern = draft.pattern.trim() !== ''
  const nameById = new Map(categories.map((c) => [c.id, c.name]))
  const categorizedTotal = preview?.categorizedMatches.reduce((n, c) => n + c.count, 0) ?? 0

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit) onSubmit()
      }}
    >
      {/* Pattern */}
      <div className="space-y-1.5">
        <Label htmlFor="draft-pattern" className="text-xs font-medium">
          Description contains…
        </Label>
        <Input
          id="draft-pattern"
          ref={patternRef}
          autoFocus
          autoComplete="off"
          value={draft.pattern}
          onChange={(e) => onDraftChange({ ...draft, pattern: e.target.value })}
          placeholder={draft.type === 'CONTAINS' ? 'e.g. billa' : 'e.g. billa|spar|hofer'}
          maxLength={500}
          className="h-9 text-sm font-mono"
        />
        <div className="flex items-center gap-3 pt-1">
          <div className="flex gap-0.5 bg-neutral-100 p-0.5 rounded-md">
            {(['CONTAINS', 'REGEX'] as RuleType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onDraftChange({ ...draft, type: t })}
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                  draft.type === t ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                )}
              >
                {t === 'CONTAINS' ? 'Text' : 'Regex'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="draft-ci"
              checked={draft.isCaseInsensitive}
              onCheckedChange={(v) => onDraftChange({ ...draft, isCaseInsensitive: v === true })}
            />
            <Label htmlFor="draft-ci" className="text-[11px] cursor-pointer text-neutral-600">
              Ignore case
            </Label>
          </div>
        </div>
      </div>

      {/* Live match info */}
      <div
        aria-live="polite"
        className={cn(
          'rounded-lg border px-3 py-2.5 text-xs space-y-1',
          !hasPattern
            ? 'bg-neutral-50 border-border text-muted-foreground'
            : previewError
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
        )}
      >
        {!hasPattern ? (
          <p>Type a pattern, or pick a suggestion or group, to see what it matches.</p>
        ) : previewError ? (
          <p className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {errorMessage(previewError)}
          </p>
        ) : preview ? (
          <>
            <p className="flex items-center gap-1.5 text-sm">
              <span className="font-semibold tabular-nums">{preview.newMatches}</span>
              uncategorized transaction{preview.newMatches !== 1 ? 's' : ''}
              {preview.newMatches > 0 && (
                <span className="text-emerald-700 tabular-nums">
                  · {formatCurrency(preview.newMatchAmount)}
                </span>
              )}
              {previewLoading && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
            </p>
            {preview.shadowed > 0 && (
              <p className="text-amber-700">
                {preview.shadowed} more match an existing rule first and will be categorized by it.
              </p>
            )}
            {categorizedTotal > 0 && (
              <p className="text-neutral-600">
                Also matches {categorizedTotal} already categorized (
                {preview.categorizedMatches
                  .slice(0, 3)
                  .map((c) => `${nameById.get(c.categoryId) ?? 'unknown'} ${c.count}`)
                  .join(', ')}
                {preview.categorizedMatches.length > 3 ? ', …' : ''}) — those stay unchanged.
              </p>
            )}
          </>
        ) : (
          <p className="flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Checking…
          </p>
        )}
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Assign to category</Label>
        <CategoryPicker categories={categories} value={category} onChange={onCategoryChange} />
      </div>

      <Button type="submit" size="sm" className="w-full gap-1.5" disabled={!canSubmit}>
        {submitting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <WandSparkles className="w-3.5 h-3.5" />
        )}
        <span className="truncate">
          {preview && preview.newMatches > 0 && !previewError
            ? `Categorize ${preview.newMatches} as ${categoryName ?? '…'}`
            : categoryName
              ? `Create rule for ${categoryName}`
              : 'Create rule'}
        </span>
      </Button>

      {/* Keyword suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">Frequent words in uncategorized</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.keyword}
                type="button"
                onClick={() =>
                  onDraftChange({ pattern: s.keyword, type: 'CONTAINS', isCaseInsensitive: true })
                }
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                  draft.pattern.trim().toLowerCase() === s.keyword
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'
                )}
              >
                {s.keyword}
                <span className="tabular-nums opacity-60">{s.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  )
})
