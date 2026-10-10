import { useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardFilters, type DashboardFilterValue } from '@/components/dashboard/dashboard-filters'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { FlowChart } from '@/components/dashboard/flow-chart'
import { MonthPace } from '@/components/dashboard/month-pace'
import { CategoryBreakdown } from '@/components/dashboard/category-breakdown'
import { RecurringPayments } from '@/components/dashboard/recurring-payments'
import { LargestExpenses } from '@/components/dashboard/largest-expenses'
import { SpendingHeatmap } from '@/components/dashboard/spending-heatmap'
import { UncategorizedBanner } from '@/components/dashboard/uncategorized-banner'
import { QueryState } from '@/components/query-state'
import {
  DEFAULT_PRESET,
  effectiveRange,
  formatRange,
  isRangePreset,
  presetDates,
} from '@/lib/dashboard-range'
import { useCategories, useDashboard } from '@/lib/queries'
import { buildParams, dateParam } from '@/lib/search-params'
import type { GroupBy } from '@/lib/types'
import { cn, fromDateKey } from '@/lib/utils'

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // URL state: ?range=<preset> | ?from=yyyy-MM-dd&to=yyyy-MM-dd, &cat=id…, &groupBy (absent = automatic, reset when the range changes),
  // &focus=<category key> (highlighted category). Without range or dates the default preset applies.
  const filters = useMemo<DashboardFilterValue>(() => {
    const from = dateParam(searchParams, 'from')
    const to = dateParam(searchParams, 'to')
    const range = searchParams.get('range')
    const preset = from || to ? null : isRangePreset(range) ? range : DEFAULT_PRESET
    return { preset, ...(preset ? presetDates(preset) : { from, to }), cat: searchParams.getAll('cat') }
  }, [searchParams])
  const focus = searchParams.get('focus')
  const gb = searchParams.get('groupBy')
  const explicitGroupBy: GroupBy | null = gb === 'week' || gb === 'month' || gb === 'year' ? gb : null

  const categories = useCategories()
  const dashboard = useDashboard({
    from: filters.from,
    to: filters.to,
    cat: filters.cat,
    groupBy: explicitGroupBy ?? 'auto',
  })
  const data = dashboard.data

  function update(changes: Record<string, string | string[] | undefined>) {
    const current = {
      range: searchParams.get('range') ?? undefined,
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      cat: searchParams.getAll('cat'),
      groupBy: searchParams.get('groupBy') ?? undefined,
      focus: searchParams.get('focus') ?? undefined,
    }
    setSearchParams(buildParams({ ...current, ...changes }))
  }

  const isDefault = !['range', 'from', 'to', 'cat', 'groupBy', 'focus'].some((k) => searchParams.has(k))
  const shownRange = data ? effectiveRange(filters.from, filters.to, data.dataRange) : null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {shownRange ? formatRange(shownRange) : ' '}
          {data?.previousRange && <> · compared with {formatRange(data.previousRange)}</>}
        </p>
      </div>

      <DashboardFilters
        categories={categories.data ?? []}
        value={filters}
        isDefault={isDefault}
        // Changing the range resets an explicit grouping: auto fits the new range better.
        onPreset={(preset) =>
          update({ range: preset === DEFAULT_PRESET ? undefined : preset, from: undefined, to: undefined, groupBy: undefined })
        }
        onCustom={(from, to) =>
          from || to
            ? update({ range: undefined, from, to, groupBy: undefined })
            : update({ range: 'all', from: undefined, to: undefined, groupBy: undefined })
        }
        onCategories={(cat) => update({ cat })}
        onReset={() => setSearchParams(new URLSearchParams())}
      />

      {!data ? (
        <QueryState error={dashboard.error} onRetry={() => dashboard.refetch()} />
      ) : !data.dataRange ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No transactions yet. Import a CSV to fill the dashboard.
          </CardContent>
        </Card>
      ) : (
        <div className={cn('space-y-4 transition-opacity', dashboard.isPlaceholderData && 'opacity-60')}>
          <UncategorizedBanner
            count={data.uncategorized.count}
            spend={data.uncategorized.spend}
            totalSpend={data.summary.expenses}
            range={shownRange}
          />

          <KpiCards data={data} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Panel
              className="lg:col-span-8"
              title="Income vs. expenses"
              action={
                <div className="flex h-7 items-center overflow-hidden rounded-md border border-input">
                  {GROUP_BY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update({ groupBy: opt.value })}
                      className={cn(
                        'h-full px-2.5 text-xs transition-colors',
                        data.groupBy === opt.value
                          ? 'bg-neutral-900 text-white'
                          : 'text-muted-foreground hover:bg-neutral-100'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              }
            >
              <FlowChart
                flow={data.flow}
                groupBy={data.groupBy}
                categories={data.categories}
                incomeCategories={data.incomeCategories}
                focus={focus}
                onFocus={(key) => update({ focus: key ?? undefined })}
              />
            </Panel>

            {data.pace && (
              <Panel
                className="lg:col-span-4"
                title={`${format(fromDateKey(`${data.pace.month}-01`)!, 'MMMM')} pace`}
                subtitle="Cumulative spending through the month"
              >
                <MonthPace pace={data.pace} />
              </Panel>
            )}

            <Panel
              className="lg:col-span-5"
              title="By category"
              subtitle={data.previous ? 'Change vs. previous period · click to highlight' : 'Click to highlight in the chart'}
            >
              <CategoryBreakdown
                categories={data.categories}
                incomeCategories={data.incomeCategories}
                range={shownRange}
                focus={focus}
                onFocus={(key) => update({ focus: key ?? undefined })}
              />
            </Panel>

            <div className="grid gap-4 lg:col-span-7">
              <Panel title="Recurring payments" subtitle="Detected from all transactions, independent of the filters">
                <RecurringPayments categories={categories.data ?? []} />
              </Panel>
              <Panel title="Largest expenses">
                <LargestExpenses transactions={data.largest} categories={categories.data ?? []} />
              </Panel>
            </div>

            {shownRange && (
              <Panel className="lg:col-span-12" title="Daily spending">
                <SpendingHeatmap daily={data.daily} range={shownRange} />
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Panel({
  title,
  subtitle,
  action,
  className,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
    </Card>
  )
}
