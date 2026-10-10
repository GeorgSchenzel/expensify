import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
  format,
  isSameYear,
  startOfMonth,
  startOfYear,
  subMonths,
} from 'date-fns'
import type { DateRange, GroupBy } from './types'
import { fromDateKey, toDateKey } from './utils'

export type RangePreset = 'this-month' | 'last-month' | '3m' | '6m' | '12m' | 'ytd' | 'all'

export const DEFAULT_PRESET: RangePreset = '12m'

export const RANGE_PRESETS: { key: RangePreset; label: string; title: string }[] = [
  { key: 'this-month', label: 'Month', title: 'This month' },
  { key: 'last-month', label: 'Last month', title: 'Last month' },
  { key: '3m', label: '3M', title: 'Last 3 months (incl. this one)' },
  { key: '6m', label: '6M', title: 'Last 6 months (incl. this one)' },
  { key: '12m', label: '12M', title: 'Last 12 months (incl. this one)' },
  { key: 'ytd', label: 'YTD', title: 'Year to date' },
  { key: 'all', label: 'All', title: 'All transactions' },
]

export function isRangePreset(value: string | null): value is RangePreset {
  return RANGE_PRESETS.some((p) => p.key === value)
}

/** Dates of a preset; `all` is open on both ends. */
export function presetDates(preset: RangePreset, today = new Date()): { from?: string; to?: string } {
  const monthsBack = (n: number) => ({ from: toDateKey(startOfMonth(subMonths(today, n))), to: toDateKey(today) })
  switch (preset) {
    case 'this-month':
      return monthsBack(0)
    case 'last-month': {
      const prev = subMonths(today, 1)
      return { from: toDateKey(startOfMonth(prev)), to: toDateKey(endOfMonth(prev)) }
    }
    case '3m':
      return monthsBack(2)
    case '6m':
      return monthsBack(5)
    case '12m':
      return monthsBack(11)
    case 'ytd':
      return { from: toDateKey(startOfYear(today)), to: toDateKey(today) }
    case 'all':
      return {}
  }
}

/** The range actually shown: open ends fall back to the stored data's extent. */
export function effectiveRange(
  from: string | undefined,
  to: string | undefined,
  data: DateRange | null
): DateRange | null {
  const f = from ?? data?.from
  const t = to ?? data?.to
  return f && t ? { from: f, to: t } : null
}

/** "1 Sep – 30 Sep 2026", "3 Dec 2025 – 10 Oct 2026". */
export function formatRange(range: DateRange): string {
  const from = fromDateKey(range.from)!
  const to = fromDateKey(range.to)!
  if (range.from === range.to) return format(to, 'd MMM yyyy')
  return `${format(from, isSameYear(from, to) ? 'd MMM' : 'd MMM yyyy')} – ${format(to, 'd MMM yyyy')}`
}

/** First and last day of a chart period ("yyyy-MM-dd" week start, "yyyy-MM" or "yyyy"). */
export function periodRange(period: string, groupBy: GroupBy): DateRange {
  const start =
    groupBy === 'week'
      ? fromDateKey(period)!
      : groupBy === 'month'
        ? fromDateKey(`${period}-01`)!
        : fromDateKey(`${period}-01-01`)!
  const next = groupBy === 'week' ? addWeeks(start, 1) : groupBy === 'month' ? addMonths(start, 1) : addYears(start, 1)
  return { from: toDateKey(start), to: toDateKey(addDays(next, -1)) }
}

/** Link to the transactions page for a date range and optional category key. */
export function transactionsLink(range: DateRange, key?: string): string {
  const params = new URLSearchParams({ from: range.from, to: range.to })
  if (key === '__uncategorized__') params.set('uncategorized', 'true')
  else if (key) params.set('cat', key)
  return `/transactions?${params}`
}
