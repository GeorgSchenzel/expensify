import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { addDays, format, getISODay, max as maxDate, min as minDate, startOfWeek, subWeeks } from 'date-fns'
import { transactionsLink } from '@/lib/dashboard-range'
import type { DateRange } from '@/lib/types'
import { cn, formatCurrency, fromDateKey, toDateKey } from '@/lib/utils'
import { formatWhole } from './chart-style'

const LEVEL_COLORS = ['#f4f4f5', '#fecdd3', '#fda4af', '#fb7185', '#e11d48']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** At most a year of columns; longer ranges show their last 53 weeks. */
const MAX_WEEKS = 53

interface Cell {
  key: string
  date: Date
  spend: number
  /** Outside the shown range (padding to full weeks). */
  outside: boolean
}

/** GitHub-style calendar of daily spend, plus weekday averages. */
export function SpendingHeatmap({ daily, range }: { daily: { date: string; spend: number }[]; range: DateRange }) {
  const navigate = useNavigate()
  const [hover, setHover] = useState<Cell | null>(null)

  const model = useMemo(() => {
    const spendByDay = new Map(daily.map((d) => [d.date, d.spend]))
    const end = minDate([fromDateKey(range.to)!, new Date()])
    const start = maxDate([fromDateKey(range.from)!, subWeeks(startOfWeek(end, { weekStartsOn: 1 }), MAX_WEEKS - 1)])
    const weeks: Cell[][] = []
    const weekdaySums = Array<number>(7).fill(0)
    const weekdayCounts = Array<number>(7).fill(0)
    let days = 0
    let spendDays = 0
    let top: Cell | null = null
    for (let day = startOfWeek(start, { weekStartsOn: 1 }); day <= end; day = addDays(day, 1)) {
      const key = toDateKey(day)
      const outside = day < start
      const cell = { key, date: day, spend: outside ? 0 : (spendByDay.get(key) ?? 0), outside }
      if (getISODay(day) === 1) weeks.push([])
      weeks[weeks.length - 1].push(cell)
      if (!outside) {
        const wd = getISODay(day) - 1
        weekdaySums[wd] += cell.spend
        weekdayCounts[wd] += 1
        days += 1
        if (cell.spend > 0) spendDays += 1
        if (!top || cell.spend > top.spend) top = cell
      }
    }
    // Quartiles of the days with spend, so one rent payment does not wash out the rest.
    const amounts = weeks.flat().filter((c) => !c.outside && c.spend > 0).map((c) => c.spend).sort((a, b) => a - b)
    const q = (p: number) => amounts[Math.min(amounts.length - 1, Math.floor(p * amounts.length))] ?? 0
    const thresholds = [q(0.25), q(0.5), q(0.75)]
    const weekdayAvg = weekdaySums.map((s, i) => (weekdayCounts[i] ? s / weekdayCounts[i] : 0))
    return { weeks, thresholds, weekdayAvg, days, spendDays, top, truncated: start > fromDateKey(range.from)! }
  }, [daily, range])

  const level = (spend: number) => {
    if (spend <= 0) return 0
    const [a, b, c] = model.thresholds
    return spend <= a ? 1 : spend <= b ? 2 : spend <= c ? 3 : 4
  }
  const maxWeekday = Math.max(...model.weekdayAvg, 1)

  return (
    <div className="flex flex-col gap-6 xl:flex-row">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="overflow-x-auto pb-1">
          <div className="inline-flex gap-[3px]">
            {/* Weekday labels */}
            <div className="mr-1 flex flex-col gap-[3px] pt-4 text-[10px] text-muted-foreground">
              {WEEKDAYS.map((d, i) => (
                <span key={d} className="h-[12px] leading-[12px]">
                  {i % 2 === 0 ? d : ''}
                </span>
              ))}
            </div>
            {model.weeks.map((week) => {
              // Label the week holding the 1st of a month.
              const first = week.find((c) => !c.outside && c.date.getDate() === 1)?.date
              return (
                <div key={week[0].key} className="flex flex-col gap-[3px]">
                  <span className="h-[13px] whitespace-nowrap text-[10px] leading-[13px] text-muted-foreground">
                    {first ? format(first, 'MMM') : ''}
                  </span>
                  {week.map((cell) => (
                    <button
                      key={cell.key}
                      type="button"
                      disabled={cell.outside}
                      onMouseEnter={() => !cell.outside && setHover(cell)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => !cell.outside && setHover(cell)}
                      onClick={() => navigate(transactionsLink({ from: cell.key, to: cell.key }))}
                      className={cn(
                        'size-[12px] rounded-[3px] outline-offset-1',
                        cell.outside ? 'invisible' : 'hover:outline hover:outline-neutral-900',
                        hover?.key === cell.key && 'outline outline-neutral-900'
                      )}
                      style={{ background: LEVEL_COLORS[level(cell.spend)] }}
                      aria-label={`${format(cell.date, 'EEE d MMM yyyy')}: ${formatCurrency(cell.spend)}`}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="min-h-4 tabular-nums">
            {hover ? (
              <>
                <span className="font-medium text-neutral-900">{format(hover.date, 'EEEE, d MMM yyyy')}</span> ·{' '}
                {hover.spend > 0 ? formatCurrency(hover.spend) : 'no spending'}
              </>
            ) : (
              <>
                {model.days - model.spendDays} of {model.days} days without spending
                {model.top && model.top.spend > 0 && (
                  <>
                    {' '}
                    · biggest day {format(model.top.date, 'd MMM')} ({formatWhole(model.top.spend)})
                  </>
                )}
                {model.truncated && ' · showing the last 53 weeks'}
              </>
            )}
          </span>
          <span className="flex items-center gap-1">
            Less
            {LEVEL_COLORS.map((c) => (
              <span key={c} className="size-[10px] rounded-[2px]" style={{ background: c }} />
            ))}
            More
          </span>
        </div>
      </div>

      {/* Average spend per weekday */}
      <div className="w-full shrink-0 space-y-1.5 xl:w-56">
        <p className="text-xs font-medium text-neutral-700">Average per weekday</p>
        {model.weekdayAvg.map((avg, i) => (
          <div key={WEEKDAYS[i]} className="flex items-center gap-2 text-[11px]">
            <span className="w-7 text-muted-foreground">{WEEKDAYS[i]}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-rose-400" style={{ width: `${(avg / maxWeekday) * 100}%` }} />
            </div>
            <span className="w-16 text-right tabular-nums text-neutral-700">{formatWhole(avg)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
