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

export interface DateRange {
  from: string
  to: string
}

/** Totals of a date range. Income ignores the category filter. */
export interface DashboardSummary {
  expenses: number
  income: number
  net: number
  /** `net / income`; null without income. */
  savingsRate: number | null
  expenseCount: number
  incomeCount: number
}

/** `key` is the category id, or `__uncategorized__`. */
export interface CategorySpend {
  key: string
  name: string
  colorHex: string
  /** Positive amount (spent, or received for income). */
  spend: number
  count: number
  /** Null when there is no previous range to compare with. */
  previousSpend: number | null
}

/**
 * `period` is "yyyy-MM-dd" (week start, Monday), "yyyy-MM" or "yyyy".
 * `incomeBy` / `expensesBy` hold positive amounts per category key (non-zero only).
 */
export interface FlowPoint {
  period: string
  income: number
  expenses: number
  net: number
  incomeBy: Record<string, number>
  expensesBy: Record<string, number>
}

export interface PacePoint {
  day: number
  current: number | null
  previous: number | null
  average: number | null
}

/** Cumulative spend through the month containing the range end. */
export interface Pace {
  /** "yyyy-MM". */
  month: string
  daysInMonth: number
  throughDay: number
  spent: number
  /** Null once the month is over. */
  projected: number | null
  previousTotal: number | null
  averageTotal: number | null
  averageMonths: number
  points: PacePoint[]
}

export interface DashboardData {
  groupBy: GroupBy
  /** Extent of all stored transactions; null when there are none. */
  dataRange: DateRange | null
  previousRange: DateRange | null
  summary: DashboardSummary
  previous: DashboardSummary | null
  categories: CategorySpend[]
  incomeCategories: CategorySpend[]
  flow: FlowPoint[]
  /** Days with spend only. */
  daily: { date: string; spend: number }[]
  /** Biggest expense per merchant; `similarCount` counts that merchant's expenses in the range. */
  largest: (Transaction & { similarCount: number })[]
  uncategorized: { count: number; spend: number }
  pace: Pace | null
}

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface RecurringPayment {
  key: string
  description: string
  categoryId: string | null
  cadence: Cadence
  /** Latest amount, positive. */
  amount: number
  count: number
  firstDate: string
  lastDate: string
  nextDate: string
  annualCost: number
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
  /** `auto` picks week, month or year from the range length. */
  groupBy?: GroupBy | 'auto'
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
