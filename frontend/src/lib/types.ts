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
  /** Negate single-column amounts (exports that list expenses as positive). */
  invertAmount: boolean
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

/**
 * How an import would treat a CSV row: `new` is inserted, `existing` is
 * already stored, `repeated` duplicates an earlier row of the same file.
 */
export type ImportRowStatus = 'new' | 'existing' | 'repeated' | 'error'

export interface ImportPreviewRow {
  /** 1-based data row number. */
  row: number
  status: ImportRowStatus
  /** Absent for error rows. */
  date?: string
  description?: string
  amount?: number
  currency?: string
  /** Category the rules would assign (new rows only). */
  categoryId?: string
  error?: string
}

export interface ImportPreview {
  rows: ImportPreviewRow[]
  /** Totals of the new rows per currency; `expenses` is negative. */
  totals: { currency: string; income: number; expenses: number }[]
  /** Date range of the transactions already stored. */
  existingFrom: string | null
  existingTo: string | null
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
  /** Only transactions without a category (OR-ed with `cat`). */
  uncategorized?: boolean
  amountMin?: string
  amountMax?: string
}

export interface DashboardQuery {
  from?: string
  to?: string
  cat?: string[]
  groupBy?: GroupBy
}

export interface RuleDraft {
  pattern: string
  type: RuleType
  isCaseInsensitive: boolean
}

export interface RulePreview {
  /** Uncategorized transactions the rule would categorize. */
  newMatches: number
  newMatchIds: string[]
  newMatchAmount: number
  /** Uncategorized matches that an existing rule matches first. */
  shadowed: number
  /** Already categorized transactions the pattern also matches. */
  categorizedMatches: { categoryId: string; count: number }[]
}

export interface TransactionStats {
  total: number
  uncategorized: number
}
