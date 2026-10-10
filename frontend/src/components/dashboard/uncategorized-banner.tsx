import { Link } from 'react-router'
import { Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { transactionsLink } from '@/lib/dashboard-range'
import type { DateRange } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

interface UncategorizedBannerProps {
  count: number
  spend: number
  totalSpend: number
  range: DateRange | null
}

/** Nudge to categorize: every breakdown on the page is only as good as the categories. */
export function UncategorizedBanner({ count, spend, totalSpend, range }: UncategorizedBannerProps) {
  if (count === 0) return null
  const share = totalSpend > 0 ? (spend / totalSpend) * 100 : 0

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      <Tags className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">
          {count} expense{count === 1 ? '' : 's'} ({formatCurrency(spend)}, {share.toFixed(0)}% of spending)
        </span>{' '}
        in this range {count === 1 ? 'has' : 'have'} no category.
      </p>
      <div className="flex gap-2">
        {range && (
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-amber-900 hover:bg-amber-100">
            <Link to={transactionsLink(range, '__uncategorized__')}>View</Link>
          </Button>
        )}
        <Button asChild size="sm" className="h-7 bg-amber-600 text-xs text-white hover:bg-amber-700">
          <Link to="/categorize">Categorize</Link>
        </Button>
      </div>
    </div>
  )
}
