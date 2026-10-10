import type { MappingConfig } from '@/lib/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'

interface ColumnMapperProps {
  headers: string[]
  /** First non-empty value of each column, shown next to its name. */
  samples: Record<string, string>
  mapping: MappingConfig
  onChange: (mapping: MappingConfig) => void
}

const NONE = '__none__'

function ColSelect({
  label,
  value,
  headers,
  samples,
  required,
  onChange,
}: {
  label: string
  value: string | undefined
  headers: string[]
  samples: Record<string, string>
  required?: boolean
  onChange: (v: string | undefined) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? undefined : v)}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select column…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— none —</SelectItem>
          {headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
              {samples[h] && (
                <span className="ml-2 inline-block max-w-48 truncate align-bottom font-mono text-muted-foreground">
                  {samples[h]}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function ColumnMapper({ headers, samples, mapping, onChange }: ColumnMapperProps) {
  function update(patch: Partial<MappingConfig>) {
    onChange({ ...mapping, ...patch })
  }

  return (
    <div className="space-y-5">
      {/* Date & Description */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ColSelect
          label="Date column"
          value={mapping.dateColumn}
          headers={headers}
          samples={samples}
          required
          onChange={(v) => update({ dateColumn: v ?? '' })}
        />
        <ColSelect
          label="Description column"
          value={mapping.descriptionColumn}
          headers={headers}
          samples={samples}
          required
          onChange={(v) => update({ descriptionColumn: v ?? '' })}
        />
      </div>

      {/* Amount mode toggle */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">
            Amount mode<span className="text-destructive ml-0.5">*</span>
          </Label>
          <div className="flex gap-2">
            {(['single', 'credit-debit'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => update({ amountMode: mode })}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  mapping.amountMode === mode
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
                }`}
              >
                {mode === 'single' ? 'Single column' : 'Credit / Debit columns'}
              </button>
            ))}
          </div>
        </div>

        {mapping.amountMode === 'single' ? (
          <div className="space-y-3">
            <ColSelect
              label="Amount column"
              value={mapping.amountColumn}
              headers={headers}
              samples={samples}
              required
              onChange={(v) => update({ amountColumn: v })}
            />
            <Label className="flex items-center gap-2 text-xs font-normal cursor-pointer">
              <Checkbox
                checked={mapping.invertAmount}
                onCheckedChange={(checked) => update({ invertAmount: checked === true })}
              />
              Flip signs (this file lists expenses as positive amounts)
            </Label>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ColSelect
              label="Credit column (incoming +)"
              value={mapping.creditColumn}
              headers={headers}
              samples={samples}
              onChange={(v) => update({ creditColumn: v })}
            />
            <ColSelect
              label="Debit column (outgoing −)"
              value={mapping.debitColumn}
              headers={headers}
              samples={samples}
              onChange={(v) => update({ debitColumn: v })}
            />
          </div>
        )}
      </div>

      {/* Currency */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Currency</Label>
          <div className="flex gap-2">
            {(['column', 'manual'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => update({ currencyMode: mode })}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  mapping.currencyMode === mode
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
                }`}
              >
                {mode === 'column' ? 'From column' : 'Fixed value'}
              </button>
            ))}
          </div>
        </div>

        {mapping.currencyMode === 'column' ? (
          <ColSelect
            label="Currency column"
            value={mapping.currencyColumn}
            headers={headers}
            samples={samples}
            onChange={(v) => update({ currencyColumn: v })}
          />
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Currency code</Label>
            <Input
              value={mapping.defaultCurrency}
              onChange={(e) => update({ defaultCurrency: e.target.value.toUpperCase() })}
              placeholder="EUR"
              className="h-8 text-xs w-28"
              maxLength={3}
            />
          </div>
        )}
      </div>
    </div>
  )
}
