import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowRight, CheckCircle2, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CsvDropzone } from '@/components/import/csv-dropzone'
import { PreviewTable } from '@/components/import/preview-table'
import { ColumnMapper } from '@/components/import/column-mapper'
import { ParsedPreview, countByStatus } from '@/components/import/parsed-preview'
import { QueryState } from '@/components/query-state'
import { api } from '@/lib/api'
import { useImportPreview, useInvalidate } from '@/lib/queries'
import type { ImportResult, MappingConfig } from '@/lib/types'
import { errorMessage } from '@/lib/utils'

type Step = 'upload' | 'map' | 'done'

const defaultMapping: MappingConfig = {
  dateColumn: '',
  descriptionColumn: '',
  amountMode: 'single',
  amountColumn: undefined,
  invertAmount: false,
  creditColumn: undefined,
  debitColumn: undefined,
  currencyMode: 'manual',
  currencyColumn: undefined,
  defaultCurrency: 'EUR',
}

function isMappingValid(m: MappingConfig): boolean {
  if (!m.dateColumn || !m.descriptionColumn) return false
  if (m.amountMode === 'single' && !m.amountColumn) return false
  if (m.amountMode === 'credit-debit' && !m.creditColumn && !m.debitColumn) return false
  if (m.currencyMode === 'column' && !m.currencyColumn) return false
  return /^[A-Z]{3}$/.test(m.defaultCurrency)
}

/** Guesses the mapping from common English and German bank-export headers. */
function autoDetect(headers: string[]): MappingConfig {
  const find = (re: RegExp) => headers.find((h) => re.test(h))
  const currency = find(/^(currency|w(ä|ae)hrung)$/i)
  return {
    ...defaultMapping,
    dateColumn: find(/date|datum/i) ?? '',
    descriptionColumn: find(/desc|text|purpose|usage|betreff|verwendung/i) ?? '',
    amountColumn: find(/^(amount|betrag|value)$/i),
    currencyMode: currency ? 'column' : 'manual',
    currencyColumn: currency,
  }
}

export function ImportPage() {
  const navigate = useNavigate()
  const invalidate = useInvalidate()
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  // Bumped per upload; identifies the rows in the preview's query key.
  const [fileId, setFileId] = useState(0)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<MappingConfig>(defaultMapping)
  const [result, setResult] = useState<ImportResult | null>(null)

  const samples = useMemo(
    () =>
      Object.fromEntries(
        headers.map((h) => [h, rows.find((r) => r[h]?.trim())?.[h]?.trim() ?? ''])
      ),
    [headers, rows]
  )
  const mappingValid = isMappingValid(mapping)
  const preview = useImportPreview(fileId, rows, step === 'map' && mappingValid ? mapping : null)
  // Only trust the preview for the current mapping, not a placeholder from the previous one.
  const currentPreview = mappingValid && !preview.isPlaceholderData ? preview.data : undefined
  const newCount = currentPreview ? countByStatus(currentPreview.rows).new : 0

  const importMutation = useMutation({
    mutationFn: () => api.import(rows, mapping),
    onSuccess: async (res) => {
      await invalidate('transactions', 'dashboard')
      setResult(res)
      setStep('done')
      if (res.errors.length > 0) {
        toast.warning(`Import finished with ${res.errors.length} row error(s)`)
      } else {
        toast.success(`Imported ${res.inserted} transaction(s)`)
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const isPending = importMutation.isPending

  function handleParsed(hdrs: string[], data: Record<string, string>[], name: string) {
    setHeaders(hdrs)
    setRows(data)
    setFileName(name)
    setFileId((id) => id + 1)
    setMapping(autoDetect(hdrs))
    setStep('map')
  }

  function reset() {
    setStep('upload')
    setResult(null)
    setRows([])
    setHeaders([])
    setFileName('')
    setMapping(defaultMapping)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Import CSV</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a bank export and map the columns to import transactions.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-medium">
        {(['upload', 'map', 'done'] as const).map((s, i) => {
          const labels = { upload: 'Upload file', map: 'Map columns', done: 'Complete' }
          const order = { upload: 0, map: 1, done: 2 }
          const done = order[s] < order[step] || (s === 'done' && step === 'done')
          const active = s === step
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="w-6 h-px bg-neutral-200" />}
              <span
                className={
                  done ? 'text-emerald-600' : active ? 'text-neutral-900' : 'text-muted-foreground'
                }
              >
                {done ? '✓ ' : `${i + 1}. `}
                {labels[s]}
              </span>
            </div>
          )
        })}
      </div>

      {step === 'upload' && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Select a CSV file</CardTitle>
            <CardDescription className="text-xs">
              Supports any bank CSV export with a header row (comma or semicolon separated).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CsvDropzone onParsed={handleParsed} />
          </CardContent>
        </Card>
      )}

      {step === 'map' && (
        <>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Map columns</CardTitle>
              <CardDescription className="text-xs">
                {fileName} · {rows.length} rows. Tell us which CSV column corresponds to each
                field.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <ColumnMapper
                headers={headers}
                samples={samples}
                mapping={mapping}
                onChange={setMapping}
              />
              <details className="group">
                <summary className="flex items-center gap-1 text-xs font-medium text-muted-foreground cursor-pointer select-none list-none">
                  <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                  Raw file contents
                </summary>
                <div className="mt-3">
                  <PreviewTable headers={headers} rows={rows} />
                </div>
              </details>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Preview</CardTitle>
              <CardDescription className="text-xs">
                What the import will do with the current mapping. Nothing is saved yet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!mappingValid ? (
                <p className="text-sm text-muted-foreground">
                  Complete the required fields above to see the preview.
                </p>
              ) : preview.data ? (
                <div className={preview.isPlaceholderData ? 'opacity-60 transition-opacity' : ''}>
                  <ParsedPreview preview={preview.data} />
                </div>
              ) : (
                <QueryState error={preview.error} onRetry={() => void preview.refetch()} />
              )}
              {preview.data && preview.error && (
                <p className="mt-3 text-xs text-red-700">{errorMessage(preview.error)}</p>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={reset} disabled={isPending}>
              Back
            </Button>
            <Button
              size="sm"
              onClick={() => importMutation.mutate()}
              disabled={!currentPreview || newCount === 0 || isPending}
              className="gap-1.5"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Importing…
                </>
              ) : currentPreview && newCount === 0 ? (
                'Nothing new to import'
              ) : (
                <>
                  Import {newCount} new transaction{newCount === 1 ? '' : 's'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />
              <div>
                <p className="font-semibold text-neutral-900">Import complete</p>
                <p className="text-sm text-muted-foreground">
                  {result.inserted} inserted · {result.skipped} skipped (duplicates)
                  {result.errors.length > 0 && ` · ${result.errors.length} failed`}
                </p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {result.errors.length} row(s) had errors and were not imported
                </div>
                {result.errors.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-xs text-amber-700 font-mono pl-5">{e}</p>
                ))}
                {result.errors.length > 5 && (
                  <p className="text-xs text-amber-700 pl-5">…and {result.errors.length - 5} more</p>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={() => navigate('/categorize')}>
                Categorize transactions
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/transactions')}>
                View transactions
              </Button>
              <Button variant="outline" size="sm" onClick={reset}>
                Import another file
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
