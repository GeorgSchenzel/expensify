import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { periodRange, transactionsLink } from '@/lib/dashboard-range'
import type { CategorySpend, FlowPoint, GroupBy } from '@/lib/types'
import { cn, formatCurrency, formatPeriod } from '@/lib/utils'
import {
  OTHER_COLOR,
  OTHER_KEY,
  TooltipBox,
  TooltipRow,
  axisTick,
  euroTick,
  gridStroke,
} from './chart-style'
import { EmptyChart } from './empty-chart'

interface Series {
  key: string
  name: string
  colorHex: string
}

/**
 * The largest categories get their own stack segment; the rest share "Other".
 * With 10–30 categories, one segment each would be unreadable.
 */
function pickSeries(categories: CategorySpend[], max: number): { series: Series[]; other: Set<string> } {
  const active = categories.filter((c) => c.spend > 0)
  if (active.length <= max) return { series: active, other: new Set() }
  const top = active.slice(0, max - 1)
  return {
    series: [...top, { key: OTHER_KEY, name: `Other (${active.length - top.length})`, colorHex: OTHER_COLOR }],
    other: new Set(active.slice(max - 1).map((c) => c.key)),
  }
}

function amountOf(by: Record<string, number>, key: string, other: Set<string>): number {
  if (key !== OTHER_KEY) return by[key] ?? 0
  let sum = 0
  for (const k of other) sum += by[k] ?? 0
  return sum
}

interface FlowChartProps {
  flow: FlowPoint[]
  groupBy: GroupBy
  categories: CategorySpend[]
  incomeCategories: CategorySpend[]
  /** Highlighted category key. */
  focus: string | null
  onFocus: (key: string | null) => void
}

/** Per period: income stacked by category next to expenses stacked by category, plus the net. */
export function FlowChart({ flow, groupBy, categories, incomeCategories, focus, onFocus }: FlowChartProps) {
  const navigate = useNavigate()
  const [showNet, setShowNet] = useState(true)
  const expense = useMemo(() => pickSeries(categories, 8), [categories])
  const income = useMemo(() => pickSeries(incomeCategories, 5), [incomeCategories])
  const netByPeriod = useMemo(() => new Map(flow.map((p) => [p.period, p.net])), [flow])

  if (flow.every((p) => p.income === 0 && p.expenses === 0)) return <EmptyChart />

  const fmt = (period: string) => formatPeriod(period, groupBy)
  const deficits = flow.filter((p) => p.net < 0).length
  // A focused key that lives inside "Other" highlights the Other segment.
  const highlighted = (key: string, other: Set<string>) =>
    focus === null || focus === key || (key === OTHER_KEY && other.has(focus))
  const barSize = flow.length > 40 ? undefined : flow.length > 16 ? 10 : 22

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={flow}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          barGap={2}
          barCategoryGap={flow.length > 16 ? '15%' : '25%'}
          className="cursor-pointer"
          onClick={(state) => {
            const point = flow[Number(state?.activeTooltipIndex)]
            if (point) navigate(transactionsLink(periodRange(point.period, groupBy), focus ?? undefined))
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis
            dataKey="period"
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={8}
            tick={({ x, y, payload }) => {
              const period = String(payload.value)
              const deficit = (netByPeriod.get(period) ?? 0) < 0
              return (
                <text
                  x={x}
                  y={Number(y) + 12}
                  textAnchor="middle"
                  fontSize={11}
                  fill={deficit ? '#e11d48' : '#6b7280'}
                  fontWeight={deficit ? 600 : 400}
                >
                  {fmt(period)}
                </text>
              )
            }}
          />
          <YAxis tickFormatter={euroTick} tick={axisTick} axisLine={false} tickLine={false} width={64} />
          <ReferenceLine y={0} stroke="#d4d4d8" />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as FlowPoint | undefined
              if (!active || !point) return null
              return <FlowTooltip point={point} title={fmt(point.period)} expense={expense} income={income} />
            }}
          />
          {income.series.map((s) => (
            <Bar
              key={`in-${s.key}`}
              stackId="income"
              name={s.name}
              dataKey={(p: FlowPoint) => amountOf(p.incomeBy, s.key, income.other)}
              fill={s.colorHex}
              fillOpacity={highlighted(s.key, income.other) ? 1 : 0.15}
              barSize={barSize}
              isAnimationActive={false}
            />
          ))}
          {expense.series.map((s) => (
            <Bar
              key={`out-${s.key}`}
              stackId="expenses"
              name={s.name}
              dataKey={(p: FlowPoint) => amountOf(p.expensesBy, s.key, expense.other)}
              fill={s.colorHex}
              fillOpacity={highlighted(s.key, expense.other) ? 1 : 0.15}
              barSize={barSize}
              isAnimationActive={false}
            />
          ))}
          {showNet && (
            <Line
              dataKey="net"
              name="Net"
              type="monotone"
              stroke="#18181b"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={{ r: 2.5, fill: '#18181b', strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend: left bar = income, right bar = expenses. Chips focus a category. */}
      <div className="space-y-1.5 text-[11px]">
        <LegendRow label="Income" hint="left bar" series={income.series} other={income.other} focus={focus} onFocus={onFocus} />
        <LegendRow label="Expenses" hint="right bar" series={expense.series} other={expense.other} focus={focus} onFocus={onFocus} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-muted-foreground">
          <button
            type="button"
            onClick={() => setShowNet(!showNet)}
            className={cn('inline-flex items-center gap-1.5 hover:text-neutral-900', !showNet && 'opacity-50')}
          >
            <span className="w-4 border-t-2 border-dashed border-neutral-900" />
            Net
          </button>
          {deficits > 0 && (
            <span>
              <span className="font-semibold text-rose-600">Red labels</span>: {deficits} period
              {deficits === 1 ? '' : 's'} with more spent than earned
            </span>
          )}
          <span className="ml-auto hidden sm:inline">Click a period to see its transactions</span>
        </div>
      </div>
    </div>
  )
}

function LegendRow({
  label,
  hint,
  series,
  other,
  focus,
  onFocus,
}: {
  label: string
  hint: string
  series: Series[]
  other: Set<string>
  focus: string | null
  onFocus: (key: string | null) => void
}) {
  if (series.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="w-20 shrink-0 font-medium text-neutral-700" title={hint}>
        {label}
      </span>
      {series.map((s) => {
        const active = focus === s.key || (s.key === OTHER_KEY && focus !== null && other.has(focus))
        return (
          <button
            key={s.key}
            type="button"
            disabled={s.key === OTHER_KEY}
            onClick={() => onFocus(focus === s.key ? null : s.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-neutral-700 transition-colors',
              active ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-transparent hover:bg-neutral-100',
              focus !== null && !active && 'opacity-50',
              s.key === OTHER_KEY && 'cursor-default hover:bg-transparent'
            )}
          >
            <span className="size-2 rounded-sm" style={{ background: s.colorHex }} />
            {s.name}
          </button>
        )
      })}
    </div>
  )
}

function FlowTooltip({
  point,
  title,
  expense,
  income,
}: {
  point: FlowPoint
  title: string
  expense: { series: Series[]; other: Set<string> }
  income: { series: Series[]; other: Set<string> }
}) {
  const rows = (by: Record<string, number>, picked: { series: Series[]; other: Set<string> }) =>
    picked.series
      .map((s) => ({ ...s, value: amountOf(by, s.key, picked.other) }))
      .filter((r) => r.value > 0)
  const incomeRows = rows(point.incomeBy, income)
  const expenseRows = rows(point.expensesBy, expense)

  return (
    <TooltipBox title={title}>
      <TooltipRow label="Income" value={formatCurrency(point.income)} strong className="text-emerald-700" />
      {incomeRows.map((r) => (
        <TooltipRow key={r.key} color={r.colorHex} label={r.name} value={formatCurrency(r.value)} className="pl-2 text-neutral-600" />
      ))}
      <div className="my-1 border-t" />
      <TooltipRow label="Expenses" value={formatCurrency(point.expenses)} strong className="text-rose-700" />
      {expenseRows.map((r) => (
        <TooltipRow key={r.key} color={r.colorHex} label={r.name} value={formatCurrency(r.value)} className="pl-2 text-neutral-600" />
      ))}
      <div className="my-1 border-t" />
      <TooltipRow
        label="Net"
        value={`${point.net > 0 ? '+' : ''}${formatCurrency(point.net)}`}
        strong
        className={point.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}
      />
    </TooltipBox>
  )
}
