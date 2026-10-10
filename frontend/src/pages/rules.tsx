import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { RulesTable } from '@/components/rules/rules-table'
import { RuleForm } from '@/components/rules/rule-form'
import { ApplyRules } from '@/components/rules/apply-rules'
import { CategoryForm } from '@/components/rules/category-form'
import { CategoryList } from '@/components/rules/category-list'
import { QueryState } from '@/components/query-state'
import { useCategories, useRules } from '@/lib/queries'

export function RulesPage() {
  const categories = useCategories()
  const rules = useRules()

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Rules & Categories</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Rules auto-categorize transactions during import, or on demand for existing ones. First matching rule wins.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Categories</CardTitle>
          <CardDescription className="text-xs">
            {categories.data
              ? `${categories.data.length} categor${categories.data.length === 1 ? 'y' : 'ies'}`
              : ' '}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories.data ? (
            <>
              <CategoryList categories={categories.data} />
              {categories.data.length > 0 && <Separator />}
              <CategoryForm />
            </>
          ) : (
            <QueryState error={categories.error} onRetry={() => categories.refetch()} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Auto-categorization Rules</CardTitle>
          <CardDescription className="text-xs">
            Rules run top to bottom; drag to reorder. First match wins.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rules.data && categories.data ? (
            <>
              <RulesTable rules={rules.data} />
              {rules.data.length > 0 && <ApplyRules />}
              {categories.data.length > 0 ? (
                <>
                  <Separator />
                  <RuleForm categories={categories.data} />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Create at least one category above before adding rules.
                </p>
              )}
            </>
          ) : (
            <QueryState error={rules.error ?? categories.error} onRetry={() => rules.refetch()} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
