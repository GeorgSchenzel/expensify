import { AlertCircle, Loader2 } from 'lucide-react'
import { errorMessage } from '@/lib/utils'

/** Placeholder shown while a page's data is loading or failed to load. */
export function QueryState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-red-700">
        <AlertCircle className="w-5 h-5" />
        <p>{errorMessage(error)}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="text-xs underline text-muted-foreground">
            Try again
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  )
}
