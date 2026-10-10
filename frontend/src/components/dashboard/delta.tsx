import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DeltaProps {
  current: number
  previous: number | null | undefined
  /** Whether an increase is good (income) or bad (spending). */
  goodWhen: 'up' | 'down'
  className?: string
}

/** Relative change against the previous period, coloured by whether it is good news. */
export function Delta({ current, previous, goodWhen, className }: DeltaProps) {
  if (previous == null) return null
  if (previous === 0) {
    if (current === 0) return null
    return <span className={cn('text-[11px] font-medium text-muted-foreground', className)}>new</span>
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100
  if (Math.abs(pct) < 0.5) {
    return <span className={cn('text-[11px] font-medium text-muted-foreground tabular-nums', className)}>±0%</span>
  }
  const up = pct > 0
  const good = up === (goodWhen === 'up')
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
        good ? 'text-emerald-600' : 'text-rose-600',
        className
      )}
    >
      <Icon className="size-3" />
      {Math.abs(pct) >= 999 ? '>999' : Math.abs(pct).toFixed(0)}%
    </span>
  )
}
