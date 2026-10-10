// Shared styling and formatting for the dashboard charts and widgets.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const axisTick = { fontSize: 11, fill: '#6b7280' }
export const tooltipStyle = { fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }
export const gridStroke = '#f3f4f6'

export const INCOME_COLOR = '#10b981'
export const EXPENSE_COLOR = '#f43f5e'
/** Key of the aggregated "everything else" series in the flow chart (frontend only). */
export const OTHER_KEY = '__other__'
export const OTHER_COLOR = '#9ca3af'

const compact = new Intl.NumberFormat('de-AT', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const whole = new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

/** "€ 1,2 Tsd." style axis labels. */
export const euroTick = (v: number) => compact.format(v)
/** Whole euros, for headline numbers where cents are noise. */
export const formatWhole = (v: number) => whole.format(v)

/** Floating tooltip box used by every custom Recharts tooltip. */
export function TooltipBox({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-48 max-w-72 rounded-lg border bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="mb-1.5 font-semibold text-neutral-900">{title}</p>
      {children}
    </div>
  )
}

export function TooltipRow({
  color,
  label,
  value,
  strong,
  className,
}: {
  color?: string
  label: ReactNode
  value: ReactNode
  strong?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2 py-0.5', strong && 'font-semibold text-neutral-900', className)}>
      {color && <span className="size-2 shrink-0 rounded-sm" style={{ background: color }} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
