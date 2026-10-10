// Shapes of the backend's JSON API (see backend/src/models.rs and routes/).

export interface Category {
  id: string
  name: string
  colorHex: string
  createdAt: string
}

export type RuleType = 'CONTAINS' | 'REGEX'

export interface Rule {
  id: string
  categoryId: string
  type: RuleType
  pattern: string
  isCaseInsensitive: boolean
  priority: number
  createdAt: string
}

export interface RuleWithCategory extends Rule {
  category: Category
}

export interface Transaction {
  id: string
  /** Calendar date, "yyyy-MM-dd". */
  date: string
  description: string
  /** Signed decimal in major units: negative = expense. */
  amount: number
  currency: string
  categoryId: string | null
}

export interface MappingConfig {
  dateColumn: string
  descriptionColumn: string
  amountMode: 'single' | 'credit-debit'
  amountColumn?: string
  creditColumn?: string
  debitColumn?: string
  currencyMode: 'column' | 'manual'
  currencyColumn?: string
  defaultCurrency: string
}

export interface ImportResult {
  inserted: number
  skipped: number
  errors: string[]
}

export type GroupBy = 'week' | 'month' | 'year'

/** One chart series. `key` is the category id (or `__uncategorized__`). */
export interface ChartSeries {
  key: string
  name: string
  colorHex: string
}

export interface PieSlice extends ChartSeries {
  value: number
}

/**
 * `period` is "yyyy-MM-dd" (week start, Monday), "yyyy-MM" or "yyyy"; every
 * other key is a series key with that period's spend.
 */
export type ChartPoint = { period: string } & Record<string, number | string>

export interface DashboardData {
  totalCount: number
  totalExpenses: number
  totalIncome: number
  netBalance: number
  groupBy: GroupBy
  series: ChartSeries[]
  pie: PieSlice[]
  bar: ChartPoint[]
  lineByMonth: ChartPoint[]
  lineByYear: ChartPoint[]
}

export interface TransactionQuery {
  from?: string
  to?: string
  cat?: string[]
  amountMin?: string
  amountMax?: string
}

export interface DashboardQuery {
  from?: string
  to?: string
  cat?: string[]
  groupBy?: GroupBy
}
