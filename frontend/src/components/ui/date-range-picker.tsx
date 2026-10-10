import { useState } from 'react'
import { format } from 'date-fns'
import { CalendarIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'

interface DateRangePickerProps {
  from?: Date
  to?: Date
  onChange: (from: Date | undefined, to: Date | undefined) => void
  placeholder?: string
  className?: string
}

export function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = 'Date range',
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  // When set, the user has picked "from" and is waiting to pick "to"
  const [pendingFrom, setPendingFrom] = useState<Date | undefined>()

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen && pendingFrom) {
      // Picker closed before second click — report from-only
      const changed = pendingFrom.getTime() !== from?.getTime() || to !== undefined
      if (changed) onChange(pendingFrom, undefined)
      setPendingFrom(undefined)
    }
    setOpen(isOpen)
  }

  function handleSelect(date: Date | undefined) {
    if (!date) return

    if (!pendingFrom) {
      // First click — record "from", stay open for second click
      setPendingFrom(date)
    } else {
      // Second click — complete the range (swap if needed)
      const finalFrom = date < pendingFrom ? date : pendingFrom
      const finalTo = date < pendingFrom ? pendingFrom : date
      setPendingFrom(undefined)
      onChange(finalFrom, finalTo)
      setOpen(false)
    }
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    setPendingFrom(undefined)
    onChange(undefined, undefined)
  }

  // While the picker is open and pendingFrom is set, show that as "from" with no "to"
  const displayFrom = open && pendingFrom ? pendingFrom : from
  const displayTo = open && pendingFrom ? undefined : to

  const label = displayFrom
    ? displayTo
      ? `${format(displayFrom, 'dd MMM yyyy')} – ${format(displayTo, 'dd MMM yyyy')}`
      : `${format(displayFrom, 'dd MMM yyyy')} – ?`
    : placeholder

  // Custom modifiers reuse the range_start / range_middle / range_end names
  // that CalendarDayButton already styles correctly
  const modifiers: Record<string, Date[] | { after: Date; before: Date }> = {}
  if (displayFrom) modifiers.range_start = [displayFrom]
  if (displayFrom && displayTo) {
    modifiers.range_end = [displayTo]
    if (displayFrom < displayTo) {
      modifiers.range_middle = { after: displayFrom, before: displayTo }
    }
  }

  const hasExternalValue = Boolean(from || to)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 text-xs gap-1.5 pr-2',
            hasExternalValue || pendingFrom ? 'border-neutral-400' : 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
          <span>{label}</span>
          {hasExternalValue && (
            <span
              role="button"
              onClick={handleClear}
              className="ml-0.5 rounded-sm hover:bg-neutral-200 p-0.5 text-neutral-400 hover:text-neutral-600"
            >
              <X className="w-3 h-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {/*
          mode="single" avoids react-day-picker's range hover-tracking state,
          which captured pointer events after the first click and blocked nav arrows.
          Range highlighting is driven by custom modifiers instead.
        */}
        <Calendar
          mode="single"
          selected={displayFrom}
          onSelect={handleSelect}
          modifiers={modifiers}
          numberOfMonths={1}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
