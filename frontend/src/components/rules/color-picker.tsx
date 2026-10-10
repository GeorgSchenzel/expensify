import { PRESET_COLORS } from '@/lib/utils'

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    // py-1 on the wrapper gives the selection outline room so it isn't clipped
    <div className="flex items-center gap-1.5 h-8 overflow-x-auto py-1 -my-1 pl-1 -ml-1">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Color ${c}`}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className="w-5 h-5 rounded-full shrink-0 transition-transform hover:scale-110"
          style={{
            background: c,
            outline: value === c ? `2px solid ${c}` : 'none',
            outlineOffset: '2px',
          }}
        />
      ))}
    </div>
  )
}
