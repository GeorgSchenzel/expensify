import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, isValid, parse } from 'date-fns'
import type { GroupBy } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'EUR'): string {
  try {
    return new Intl.NumberFormat('de-AT', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount)
  } catch {
    // Unknown currency code: show the number with the code instead of crashing.
    return `${amount.toFixed(2)} ${currency}`
  }
}

/** "yyyy-MM-dd" ⇄ local-midnight Date. Calendar dates never pass through UTC. */
export function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function fromDateKey(key: string | null | undefined): Date | undefined {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return undefined
  const date = parse(key, 'yyyy-MM-dd', new Date())
  return isValid(date) ? date : undefined
}

export function formatDate(key: string): string {
  const date = fromDateKey(key)
  return date ? format(date, 'dd MMM yyyy') : key
}

export function formatMonth(yearMonth: string): string {
  // Input: "yyyy-MM", e.g. "2026-03"
  const [year, month] = yearMonth.split('-').map(Number)
  if (!year || !month) return yearMonth
  return format(new Date(year, month - 1, 1), 'MMM yy')
}

export function formatPeriod(period: string, groupBy: GroupBy): string {
  if (groupBy === 'year') return period
  if (groupBy === 'month') return formatMonth(period)
  // week: period is "yyyy-MM-dd" (Monday)
  const date = fromDateKey(period)
  return date ? format(date, 'd MMM yy') : period
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export const PRESET_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]
