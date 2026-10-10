import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      formatters={formatters}
      className={cn("p-4 select-none", className)}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: "flex flex-col gap-6",
        // relative so the nav buttons can be absolutely positioned over the caption row
        month: "relative flex flex-col gap-4",
        // Buttons sit at the left and right edges of the caption row
        nav: "absolute inset-x-0 top-0 z-10 flex items-center justify-between",
        button_previous: cn(
          "flex items-center justify-center w-9 h-9 rounded-md text-neutral-400",
          "hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
        ),
        button_next: cn(
          "flex items-center justify-center w-9 h-9 rounded-md text-neutral-400",
          "hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
        ),
        // h-9 matches button height; px-9 reserves space for the buttons on each side
        month_caption: "flex h-9 items-center justify-center px-9",
        caption_label: "text-sm font-semibold text-neutral-900",
        // Weekday header row
        weekdays: "flex mb-1",
        weekday: "w-9 h-9 flex items-center justify-center text-xs font-medium text-neutral-400",
        // Day rows
        weeks: "flex flex-col gap-0.5",
        week: "flex",
        day: "w-9 h-9 p-0",
        // State modifiers
        today: "font-semibold",
        outside: "opacity-30",
        disabled: "opacity-30 cursor-not-allowed",
        hidden: "invisible",
        selected: "",
        range_start: "",
        range_end: "",
        range_middle: "",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left"
            ? <ChevronLeftIcon className="w-4 h-4" />
            : <ChevronRightIcon className="w-4 h-4" />,
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const isSelected =
    modifiers.selected &&
    !modifiers.range_start &&
    !modifiers.range_end &&
    !modifiers.range_middle

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        // Base: full cell, centered text
        "w-9 h-9 rounded-md text-sm transition-colors",
        "flex items-center justify-center",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-1",
        // Default state
        "text-neutral-900 hover:bg-neutral-100",
        // Today — subtle background
        modifiers.today && !modifiers.selected &&
          "bg-neutral-100 font-semibold",
        // Selected single day — filled dark
        isSelected &&
          "bg-neutral-900 text-white hover:bg-neutral-800 font-medium",
        // Range states
        modifiers.range_start &&
          "bg-neutral-900 text-white hover:bg-neutral-800 rounded-r-none",
        modifiers.range_end &&
          "bg-neutral-900 text-white hover:bg-neutral-800 rounded-l-none",
        modifiers.range_middle &&
          "bg-neutral-100 text-neutral-900 rounded-none hover:bg-neutral-200",
        // Outside month days
        modifiers.outside && "text-neutral-300 hover:bg-transparent",
        // Disabled
        modifiers.disabled && "pointer-events-none",
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
