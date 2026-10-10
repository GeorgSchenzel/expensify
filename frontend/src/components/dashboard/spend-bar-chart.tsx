import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ChartPoint, ChartSeries, GroupBy } from '@/lib/types'
import { formatCurrency, formatPeriod } from '@/lib/utils'
import { axisTick, euroTick, legendLabel, tooltipStyle } from './chart-style'
import { EmptyChart } from './empty-chart'

interface SpendBarChartProps {
  data: ChartPoint[]
  series: ChartSeries[]
  groupBy: GroupBy
}

/** Stacked spend per period; one stack segment per category. */
export function SpendBarChart({ data, series, groupBy }: SpendBarChartProps) {
  if (data.length === 0) return <EmptyChart />
  const fmt = (label: string) => formatPeriod(label, groupBy)

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="period" tickFormatter={fmt} tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={euroTick} tick={axisTick} axisLine={false} tickLine={false} width={48} />
        <Tooltip
          formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
          contentStyle={tooltipStyle}
          labelFormatter={(label) => fmt(String(label))}
        />
        <Legend iconType="square" iconSize={8} formatter={legendLabel} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="stack" fill={s.colorHex} radius={0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
