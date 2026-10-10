import type {
  Category,
  DashboardData,
  DashboardQuery,
  ImportPreview,
  ImportResult,
  MappingConfig,
  RuleDraft,
  RulePreview,
  RuleType,
  RuleWithCategory,
  Transaction,
  TransactionQuery,
  TransactionStats,
} from './types'

/** Error returned by the backend as `{ "error": "..." }`. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the backend running?')
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown = undefined
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      // Non-JSON body (e.g. a proxy error page); handled below.
    }
  }
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Request failed (${res.status})`
    throw new ApiError(res.status, message)
  }
  return data as T
}

function toQueryString(params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => search.append(key, v))
    else if (value !== undefined && value !== '') search.set(key, value)
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export const api = {
  categories: {
    list: () => request<Category[]>('GET', '/categories'),
    create: (data: { name: string; colorHex: string }) =>
      request<Category>('POST', '/categories', data),
    update: (id: string, data: { name: string; colorHex: string }) =>
      request<Category>('PUT', `/categories/${encodeURIComponent(id)}`, data),
    remove: (id: string) => request<void>('DELETE', `/categories/${encodeURIComponent(id)}`),
  },
  rules: {
    list: () => request<RuleWithCategory[]>('GET', '/rules'),
    create: (data: {
      pattern: string
      type: RuleType
      categoryId: string
      isCaseInsensitive: boolean
    }) => request<RuleWithCategory>('POST', '/rules', data),
    remove: (id: string) => request<void>('DELETE', `/rules/${encodeURIComponent(id)}`),
    reorder: (ids: string[]) => request<void>('PUT', '/rules/order', { ids }),
    apply: (includeCategorized: boolean) =>
      request<{ updated: number; checked: number }>('POST', '/rules/apply', { includeCategorized }),
    preview: (draft: RuleDraft) => request<RulePreview>('POST', '/rules/preview', draft),
  },
  transactions: {
    list: ({ uncategorized, ...q }: TransactionQuery) =>
      request<Transaction[]>(
        'GET',
        `/transactions${toQueryString({ ...q, uncategorized: uncategorized ? 'true' : undefined })}`
      ),
    stats: () => request<TransactionStats>('GET', '/transactions/stats'),
    setCategory: (id: string, categoryId: string | null) =>
      request<Transaction>('PATCH', `/transactions/${encodeURIComponent(id)}`, { categoryId }),
    bulkSetCategory: (ids: string[], categoryId: string | null) =>
      request<{ updated: number }>('POST', '/transactions/bulk-category', { ids, categoryId }),
  },
  import: (rows: Record<string, string>[], mapping: MappingConfig) =>
    request<ImportResult>('POST', '/import', { rows, mapping }),
  importPreview: (rows: Record<string, string>[], mapping: MappingConfig) =>
    request<ImportPreview>('POST', '/import/preview', { rows, mapping }),
  dashboard: (q: DashboardQuery) =>
    request<DashboardData>('GET', `/dashboard${toQueryString({ ...q })}`),
}
