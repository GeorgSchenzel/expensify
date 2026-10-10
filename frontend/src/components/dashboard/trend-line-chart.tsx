import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ChartPoint, ChartSeries } from '@/lib/types'
import { cn, formatCurrency, formatMonth } from '@/lib/utils'
import { axisTick, euroTick, legendLabel, tooltipStyle } from './chart-style'
import { EmptyChart } from './empty-chart'

interface TrendLineChartProps {
  dataByMonth: ChartPoint[]
  dataByYear: ChartPoint[]
  series: ChartSeries[]
}

type ViewMode = 'month' | 'year'

export function TrendLineChart({ dataByMonth, dataByYear, series }: TrendLineChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('month')

  const data = viewMode === 'month' ? dataByMonth : dataByYear
  const tickFormatter = viewMode === 'month' ? formatMonth : (v: string) => v

  return (
    <div className="space-y-3">
      <ViewToggle mode={viewMode} onChange={setViewMode} />
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="period" tickFormatter={tickFormatter} tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={euroTick} tick={axisTick} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
              contentStyle={tooltipStyle}
              labelFormatter={(label) => tickFormatter(String(label))}
            />
            <Legend iconType="circle" iconSize={8} formatter={legendLabel} />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.colorHex}
                strokeWidth={2}
                dot={data.length === 1}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex gap-1 w-fit bg-neutral-100 p-0.5 rounded-lg">
      {(['month', 'year'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            'px-3 py-1 rounded-md text-xs font-medium transition-colors',
            mode === m ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
          )}
        >
          {m === 'month' ? 'Per month' : 'Per year'}
        </button>
      ))}
    </div>
  )
}
