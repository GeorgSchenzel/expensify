import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { QueryState } from '@/components/query-state'
import { RuleBuilder } from '@/components/categorize/rule-builder'
import { NEW_CATEGORY, type CategoryChoice } from '@/components/categorize/category-picker'
import { UncategorizedList } from '@/components/categorize/uncategorized-list'
import { api } from '@/lib/api'
import { groupTransactions, keywordSuggestions } from '@/lib/grouping'
import {
  useCategories,
  useInvalidate,
  useRulePreview,
  useTransactionStats,
  useTransactions,
} from '@/lib/queries'
import type { Category, RuleDraft } from '@/lib/types'
import { useDebounced } from '@/lib/use-debounced'
import { PRESET_COLORS, errorMessage } from '@/lib/utils'

const EMPTY_DRAFT: RuleDraft = { pattern: '', type: 'CONTAINS', isCaseInsensitive: true }

function unusedColor(categories: Category[]): string {
  const used = new Set(categories.map((c) => c.colorHex.toLowerCase()))
  return PRESET_COLORS.find((c) => !used.has(c)) ?? PRESET_COLORS[categories.length % PRESET_COLORS.length]
}

/**
 * Rule-writing workbench: uncategorized transactions next to a rule builder
 * that shows live how many rows the rule would categorize.
 */
export function CategorizePage() {
  const invalidate = useInvalidate()
  const patternRef = useRef<HTMLInputElement>(null)
  const categories = useCategories()
  const stats = useTransactionStats()
  const uncategorized = useTransactions({ uncategorized: true })

  const [draft, setDraft] = useState<RuleDraft>(EMPTY_DRAFT)
  const [category, setCategory] = useState<CategoryChoice>({ id: '', newName: '', newColor: PRESET_COLORS[0] })

  const debouncedDraft = useDebounced(draft, 200)
  const activeDraft = debouncedDraft.pattern.trim() ? debouncedDraft : null
  const preview = useRulePreview(activeDraft)
  const previewData = activeDraft ? preview.data : undefined
  const previewError = activeDraft ? preview.error : null
  const isTyping = draft !== debouncedDraft

  // A manual category change updates the cache optimistically; hide those rows at once.
  const rows = useMemo(
    () => (uncategorized.data ?? []).filter((t) => t.categoryId === null),
    [uncategorized.data]
  )
  const groups = useMemo(() => groupTransactions(rows), [rows])
  const suggestions = useMemo(() => keywordSuggestions(rows), [rows])
  const matchedIds = useMemo(
    () => (previewData && !previewError ? new Set(previewData.newMatchIds) : null),
    [previewData, previewError]
  )

  const categoryList = categories.data ?? []
  const categoryReady =
    category.id === NEW_CATEGORY
      ? category.newName.trim() !== ''
      : categoryList.some((c) => c.id === category.id)

  const categoryName =
    category.id === NEW_CATEGORY
      ? category.newName.trim() || null
      : categoryList.find((c) => c.id === category.id)?.name ?? null

  const create = useMutation({
    mutationFn: async () => {
      let target: Category
      if (category.id === NEW_CATEGORY) {
        target = await api.categories.create({ name: category.newName.trim(), colorHex: category.newColor })
        // Select it right away, so a retry after a failed rule save does not
        // try to create the same category again.
        setCategory({ id: target.id, newName: '', newColor: PRESET_COLORS[0] })
      } else {
        target = categoryList.find((c) => c.id === category.id)!
      }
      const rule = await api.rules.create({
        pattern: draft.pattern.trim(),
        type: draft.type,
        categoryId: target.id,
        isCaseInsensitive: draft.isCaseInsensitive,
      })
      // Runs every rule over uncategorized transactions, so rows an earlier
      // rule matches (not yet applied) are categorized too.
      const applied = await api.rules.apply(false)
      return { target, rule, applied }
    },
    onSuccess: ({ target, rule, applied }) => {
      toast.success(
        `Rule "${rule.pattern}" → ${target.name}: categorized ${applied.updated} transaction${applied.updated !== 1 ? 's' : ''}`
      )
      setDraft((d) => ({ ...EMPTY_DRAFT, type: d.type, isCaseInsensitive: d.isCaseInsensitive }))
      // Keep the category: several rules often feed the same one (billa, spar, hofer…).
      setCategory({ id: target.id, newName: '', newColor: PRESET_COLORS[0] })
      patternRef.current?.focus()
    },
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: () => invalidate('categories', 'rules', 'transactions', 'dashboard'),
  })

  function handleCategoryChange(choice: CategoryChoice) {
    // Suggest a fresh colour when switching to "new category".
    if (choice.id === NEW_CATEGORY && category.id !== NEW_CATEGORY) {
      choice = { ...choice, newColor: unusedColor(categoryList) }
    }
    setCategory(choice)
  }

  function pickPattern(pattern: string) {
    setDraft({ pattern, type: 'CONTAINS', isCaseInsensitive: true })
    patternRef.current?.focus()
  }

  const canSubmit =
    draft.pattern.trim() !== '' &&
    !isTyping &&
    !preview.isFetching &&
    !previewError &&
    categoryReady &&
    !create.isPending

  const total = stats.data?.total ?? 0
  const done = total - (stats.data?.uncategorized ?? 0)
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Categorize</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Write rules against your uncategorized transactions. A few rules usually cover most of them.{' '}
            <Link to="/settings/rules" className="underline underline-offset-2 hover:text-neutral-900">
              Manage rules
            </Link>
          </p>
        </div>
        {stats.data && total > 0 && (
          <div className="w-full sm:w-64 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {done} of {total} categorized
              </span>
              <span className="font-semibold tabular-nums">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-neutral-200 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      {!uncategorized.data || !categories.data ? (
        <QueryState error={uncategorized.error ?? categories.error} onRetry={() => uncategorized.refetch()} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,380px)_1fr] gap-4 items-start">
          <Card className="lg:sticky lg:top-4">
            <CardContent className="pt-5">
              <RuleBuilder
                ref={patternRef}
                draft={draft}
                onDraftChange={setDraft}
                category={category}
                onCategoryChange={handleCategoryChange}
                categories={categoryList}
                preview={previewData}
                previewLoading={isTyping || preview.isFetching}
                previewError={previewError}
                suggestions={suggestions}
                categoryName={categoryName}
                canSubmit={canSubmit}
                submitting={create.isPending}
                onSubmit={() => create.mutate()}
              />
            </CardContent>
          </Card>

          <UncategorizedList
            groups={groups}
            categories={categoryList}
            draft={activeDraft}
            matchedIds={matchedIds}
            onPickPattern={pickPattern}
          />
        </div>
      )}
    </div>
  )
}
