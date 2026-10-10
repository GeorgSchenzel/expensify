interface PreviewTableProps {
  headers: string[]
  rows: Record<string, string>[]
}

export function PreviewTable({ headers, rows }: PreviewTableProps) {
  const preview = rows.slice(0, 5)

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-neutral-50 border-b border-border">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {preview.map((row, i) => (
            <tr key={i} className="bg-white hover:bg-neutral-50/50">
              {headers.map((h) => (
                <td key={h} className="px-3 py-2 text-neutral-700 whitespace-nowrap max-w-[200px] truncate">
                  {row[h] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 5 && (
        <div className="px-3 py-2 text-xs text-muted-foreground bg-neutral-50 border-t border-border">
          Showing 5 of {rows.length} rows
        </div>
      )}
    </div>
  )
}
