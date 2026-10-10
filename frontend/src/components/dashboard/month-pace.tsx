import { format } from 'date-fns'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Pace } from '@/lib/types'
import { cn, formatCurrency, fromDateKey } from '@/lib/utils'
import { EXPENSE_COLOR, TooltipBox, TooltipRow, axisTick, euroTick, formatWhole, gridStroke } from './chart-style'

const PREVIOUS_COLOR = '#a1a1aa'
const AVERAGE_COLOR = '#60a5fa'

/** Cumulative spend through the month vs last month and a typical month. */
export function MonthPace({ pace }: { pace: Pace }) {
  const month = fromDateKey(`${pace.month}-01`)!
  const inProgress = pace.throughDay < pace.daysInMonth
  const benchmark = pace.averageTotal ?? pace.previousTotal
  const outcome = pace.projected ?? pace.spent
  const over = benchmark !== null && outcome > benchmark

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] text-muted-foreground">Spent{inProgress ? ` (day ${pace.throughDay})` : ''}</p>
          <p className="text-lg font-semibold tabular-nums">{formatWhole(pace.spent)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">{inProgress ? 'Projected' : 'Typical month'}</p>
          <p className={cn('text-lg font-semibold tabular-nums', inProgress && (over ? 'text-rose-600' : 'text-emerald-600'))}>
            {inProgress ? formatWhole(outcome) : benchmark !== null ? formatWhole(benchmark) : '—'}
          </p>
        </div>
      </div>
      {benchmark !== null && (
        <p className="text-xs text-muted-foreground">
          {inProgress ? 'On track for ' : 'Ended '}
          <span className={cn('font-medium', over ? 'text-rose-600' : 'text-emerald-600')}>
            {formatWhole(Math.abs(outcome - benchmark))} {over ? 'more' : 'less'}
          </span>{' '}
          than {pace.averageTotal !== null ? `your ${pace.averageMonths}-month average` : 'last month'}.
        </p>
      )}

      <div className="min-h-48 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pace.points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} ticks={[1, 8, 15, 22, pace.daysInMonth]} />
            <YAxis tickFormatter={euroTick} tick={axisTick} axisLine={false} tickLine={false} width={56} />
            {inProgress && <ReferenceLine x={pace.throughDay} stroke="#d4d4d8" strokeDasharray="2 2" />}
            <Tooltip
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as Pace['points'][number] | undefined
                if (!active || !p) return null
                return (
                  <TooltipBox title={`Day ${p.day}`}>
                    {p.current !== null && (
                      <TooltipRow color={EXPENSE_COLOR} label={format(month, 'MMMM')} value={formatCurrency(p.current)} strong />
                    )}
                    {p.previous !== null && (
                      <TooltipRow color={PREVIOUS_COLOR} label="Last month" value={formatCurrency(p.previous)} />
                    )}
                    {p.average !== null && (
                      <TooltipRow color={AVERAGE_COLOR} label={`${pace.averageMonths}-mo average`} value={formatCurrency(p.average)} />
                    )}
                  </TooltipBox>
                )
              }}
            />
            <Line dataKey="average" stroke={AVERAGE_COLOR} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
            <Line
              dataKey="previous"
              stroke={PREVIOUS_COLOR}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
            <Line dataKey="current" stroke={EXPENSE_COLOR} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <LegendItem color={EXPENSE_COLOR} label={format(month, 'MMMM yyyy')} />
        {pace.previousTotal !== null && <LegendItem color={PREVIOUS_COLOR} label="Last month" dashed />}
        {pace.averageTotal !== null && <LegendItem color={AVERAGE_COLOR} label={`${pace.averageMonths}-month average`} />}
      </div>
    </div>
  )
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('w-4 border-t-2', dashed && 'border-dashed')} style={{ borderColor: color }} />
      {label}
    </span>
  )
}
