import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type PieLabelRenderProps,
} from 'recharts'
import type { PieSlice } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { legendLabel, tooltipStyle } from './chart-style'
import { EmptyChart } from './empty-chart'

const RADIAN = Math.PI / 180
function renderCustomLabel(props: PieLabelRenderProps) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props
  if (
    cx == null || cy == null || midAngle == null ||
    innerRadius == null || outerRadius == null || percent == null ||
    (percent as number) < 0.05
  ) return null
  const radius = (innerRadius as number) + ((outerRadius as number) - (innerRadius as number)) * 0.5
  const x = (cx as number) + radius * Math.cos(-(midAngle as number) * RADIAN)
  const y = (cy as number) + radius * Math.sin(-(midAngle as number) * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${((percent as number) * 100).toFixed(0)}%`}
    </text>
  )
}

export function CategoryPieChart({ data }: { data: PieSlice[] }) {
  if (data.length === 0) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={100}
          dataKey="value"
          nameKey="name"
          labelLine={false}
          label={renderCustomLabel}
        >
          {data.map((entry) => (
            <Cell key={entry.key} fill={entry.colorHex} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => [formatCurrency(Number(value)), 'Spend']}
          contentStyle={tooltipStyle}
        />
        <Legend iconType="circle" iconSize={8} formatter={legendLabel} />
      </PieChart>
    </ResponsiveContainer>
  )
}
