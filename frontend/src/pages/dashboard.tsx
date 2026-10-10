import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardFilters, type DashboardFilterValue } from '@/components/dashboard/dashboard-filters'
import { CategoryPieChart } from '@/components/dashboard/category-pie-chart'
import { SpendBarChart } from '@/components/dashboard/spend-bar-chart'
import { TrendLineChart } from '@/components/dashboard/trend-line-chart'
import { QueryState } from '@/components/query-state'
import { useCategories, useDashboard } from '@/lib/queries'
import { buildParams, dateParam } from '@/lib/search-params'
import type { GroupBy } from '@/lib/types'
import { cn, formatCurrency } from '@/lib/utils'

const BAR_TITLES: Record<GroupBy, string> = {
  week: 'Weekly Spend',
  month: 'Monthly Spend',
  year: 'Yearly Spend',
}

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Filter state lives in the URL: ?from=yyyy-MM-dd&to=yyyy-MM-dd&cat=id&groupBy=month
  const filters = useMemo<DashboardFilterValue>(() => {
    const gb = searchParams.get('groupBy')
    return {
      from: dateParam(searchParams, 'from'),
      to: dateParam(searchParams, 'to'),
      cat: searchParams.getAll('cat'),
      groupBy: gb === 'week' || gb === 'year' ? gb : 'month',
    }
  }, [searchParams])

  const categories = useCategories()
  const dashboard = useDashboard(filters)
  const data = dashboard.data

  function handleFiltersChange(next: DashboardFilterValue) {
    setSearchParams(
      buildParams({
        from: next.from,
        to: next.to,
        cat: next.cat,
        groupBy: next.groupBy === 'month' ? undefined : next.groupBy,
      })
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data ? `${data.totalCount} total transactions in your account` : ' '}
        </p>
      </div>

      <DashboardFilters
        categories={categories.data ?? []}
        value={filters}
        onChange={handleFiltersChange}
      />

      {!data ? (
        <QueryState error={dashboard.error} onRetry={() => dashboard.refetch()} />
      ) : (
        <div className={cn('space-y-6 transition-opacity', dashboard.isPlaceholderData && 'opacity-60')}>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard label="Total Expenses" value={formatCurrency(data.totalExpenses)} valueClass="text-neutral-900" />
            <SummaryCard label="Total Income" value={formatCurrency(data.totalIncome)} valueClass="text-emerald-600" />
            <SummaryCard
              label="Net Balance"
              value={formatCurrency(data.netBalance)}
              valueClass={data.netBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}
            />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Spend Composition</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryPieChart data={data.pie} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{BAR_TITLES[data.groupBy]}</CardTitle>
              </CardHeader>
              <CardContent>
                <SpendBarChart data={data.bar} series={data.series} groupBy={data.groupBy} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Spending Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendLineChart
                dataByMonth={data.lineByMonth}
                dataByYear={data.lineByYear}
                series={data.series}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className={`mt-1.5 text-2xl font-semibold tracking-tight ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
