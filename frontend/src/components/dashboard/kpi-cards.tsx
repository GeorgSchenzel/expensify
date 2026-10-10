import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import type { DashboardData } from '@/lib/types'
import { cn, formatCurrency } from '@/lib/utils'
import { EXPENSE_COLOR, INCOME_COLOR, formatWhole } from './chart-style'
import { Delta } from './delta'

export function KpiCards({ data }: { data: DashboardData }) {
  const { summary, previous, flow } = data
  const rate = summary.savingsRate
  const prevRate = previous?.savingsRate ?? null

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <Kpi
        label="Spent"
        value={formatCurrency(summary.expenses)}
        sub={`${summary.expenseCount} expense${summary.expenseCount === 1 ? '' : 's'}`}
        delta={<Delta current={summary.expenses} previous={previous?.expenses} goodWhen="down" />}
        previous={previous && formatWhole(previous.expenses)}
        spark={flow.map((p) => p.expenses)}
        color={EXPENSE_COLOR}
      />
      <Kpi
        label="Income"
        value={formatCurrency(summary.income)}
        valueClass="text-emerald-600"
        sub={`${summary.incomeCount} payment${summary.incomeCount === 1 ? '' : 's'} in`}
        delta={<Delta current={summary.income} previous={previous?.income} goodWhen="up" />}
        previous={previous && formatWhole(previous.income)}
        spark={flow.map((p) => p.income)}
        color={INCOME_COLOR}
      />
      <Kpi
        label="Net"
        value={formatCurrency(summary.net)}
        valueClass={summary.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}
        sub={summary.net >= 0 ? 'Saved' : 'Overspent'}
        delta={previous && <AbsoluteDelta value={summary.net - previous.net} />}
        previous={previous && formatWhole(previous.net)}
        spark={flow.map((p) => p.net)}
        color={summary.net >= 0 ? INCOME_COLOR : EXPENSE_COLOR}
      />
      <Kpi
        label="Savings rate"
        value={rate === null ? '—' : `${(rate * 100).toFixed(1)}%`}
        valueClass={rate === null ? 'text-muted-foreground' : rate >= 0 ? 'text-neutral-900' : 'text-rose-600'}
        sub="of income kept"
        delta={rate !== null && prevRate !== null && <PointsDelta value={(rate - prevRate) * 100} />}
        previous={prevRate !== null ? `${(prevRate * 100).toFixed(0)}%` : null}
      >
        {rate !== null && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100">
            <div
              className={cn('h-full rounded-full', rate >= 0 ? 'bg-emerald-500' : 'bg-rose-500')}
              style={{ width: `${Math.min(100, Math.abs(rate) * 100)}%` }}
            />
          </div>
        )}
      </Kpi>
    </div>
  )
}

interface KpiProps {
  label: string
  value: string
  valueClass?: string
  sub: string
  delta?: React.ReactNode
  previous?: string | null
  spark?: number[]
  color?: string
  children?: React.ReactNode
}

function Kpi({ label, value, valueClass, sub, delta, previous, spark, color, children }: KpiProps) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4 lg:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('mt-1 text-xl font-semibold tracking-tight tabular-nums lg:text-2xl', valueClass)}>{value}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {delta}
          {previous != null && <span>vs {previous}</span>}
          {!delta && previous == null && <span>{sub}</span>}
        </div>
        {children}
        {spark && spark.length > 1 && color && <Sparkline values={spark} color={color} />}
      </CardContent>
    </Card>
  )
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const data = values.map((v, i) => ({ i, v }))
  const id = `spark-${color.slice(1)}`
  return (
    <div className="pointer-events-none mt-2 h-8">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${id})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function AbsoluteDelta({ value }: { value: number }) {
  if (Math.abs(value) < 0.5) return <span className="font-medium">±0</span>
  return (
    <span className={cn('font-medium tabular-nums', value > 0 ? 'text-emerald-600' : 'text-rose-600')}>
      {value > 0 ? '+' : '−'}
      {formatWhole(Math.abs(value))}
    </span>
  )
}

function PointsDelta({ value }: { value: number }) {
  if (Math.abs(value) < 0.05) return <span className="font-medium">±0 pp</span>
  return (
    <span className={cn('font-medium tabular-nums', value > 0 ? 'text-emerald-600' : 'text-rose-600')}>
      {value > 0 ? '+' : '−'}
      {Math.abs(value).toFixed(1)} pp
    </span>
  )
}
