import type { ReactNode } from 'react'
import type { RuleDraft } from '@/lib/types'

/**
 * Marks the parts of `text` the draft rule matches. Display only: JavaScript's
 * regex dialect differs slightly from the backend's, so a regex the browser
 * cannot compile is simply not highlighted.
 */
export function Highlight({ text, draft }: { text: string; draft: RuleDraft | null }) {
  if (!draft) return <>{text}</>
  const ranges: [number, number][] = []

  if (draft.type === 'CONTAINS') {
    const hay = draft.isCaseInsensitive ? text.toLowerCase() : text
    const needle = draft.isCaseInsensitive ? draft.pattern.toLowerCase() : draft.pattern
    if (!needle) return <>{text}</>
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) {
      ranges.push([i, i + needle.length])
    }
  } else {
    let re: RegExp
    try {
      re = new RegExp(draft.pattern, draft.isCaseInsensitive ? 'giu' : 'gu')
    } catch {
      return <>{text}</>
    }
    for (const m of text.matchAll(re)) {
      if (m[0].length > 0 && m.index !== undefined) ranges.push([m.index, m.index + m[0].length])
    }
  }
  if (ranges.length === 0) return <>{text}</>

  const parts: ReactNode[] = []
  let last = 0
  ranges.forEach(([start, end], i) => {
    if (start > last) parts.push(text.slice(last, start))
    parts.push(
      <mark key={i} className="bg-amber-200/70 text-inherit rounded-sm px-px">
        {text.slice(start, end)}
      </mark>
    )
    last = end
  })
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
