import { fromDateKey } from './utils'

/** A `yyyy-MM-dd` URL param, or undefined when absent or malformed. */
export function dateParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)
  return value && fromDateKey(value) ? value : undefined
}

/** Builds URLSearchParams, dropping empty values and expanding arrays. */
export function buildParams(values: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v))
    else if (value) params.set(key, value)
  }
  return params
}
