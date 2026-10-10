import { useRef, useState, type DragEvent } from 'react'
import Papa from 'papaparse'
import { Upload, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CsvDropzoneProps {
  onParsed: (headers: string[], rows: Record<string, string>[], fileName: string) => void
}

/** Bank exports are often Windows-1252 rather than UTF-8 (e.g. "Währung"). */
function decode(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

export function CsvDropzone({ onParsed }: CsvDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function processFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please upload a .csv file')
      return
    }
    setError(null)

    let text: string
    try {
      text = decode(await file.arrayBuffer())
    } catch {
      setError('Could not read the file')
      return
    }

    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    })
    // Unnamed columns (e.g. from trailing delimiters) cannot be mapped.
    const headers = (result.meta.fields ?? []).filter((h) => h !== '')
    if (headers.length === 0) {
      setError('No header row found in this file')
      return
    }
    // Keep only header columns and coerce values to strings; PapaParse adds
    // `__parsed_extra` arrays for rows with too many fields.
    const rows = result.data.map((raw) =>
      Object.fromEntries(headers.map((h) => [h, typeof raw[h] === 'string' ? raw[h] : '']))
    )
    if (rows.length === 0) {
      setError('This file has a header row but no data rows')
      return
    }
    onParsed(headers, rows, file.name)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void processFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Allow re-selecting the same file after going back.
    e.target.value = ''
    if (file) void processFile(file)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      className={cn(
        'flex flex-col items-center justify-center gap-3 w-full rounded-xl border-2 border-dashed p-12 cursor-pointer transition-colors',
        dragging
          ? 'border-neutral-400 bg-neutral-50'
          : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50/50'
      )}
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-neutral-100">
        {dragging ? (
          <FileText className="w-6 h-6 text-neutral-500" />
        ) : (
          <Upload className="w-6 h-6 text-neutral-400" />
        )}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-neutral-700">
          {dragging ? 'Drop your CSV here' : 'Drag & drop your CSV file'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">or click to browse</p>
      </div>
      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}
