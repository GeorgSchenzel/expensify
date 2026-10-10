//! Aggregations for the dashboard. Everything is computed in memory from the
//! full transaction list: a personal ledger is small, and comparisons, pacing
//! and recurring-payment detection all need data outside the selected range.

use std::collections::{BTreeMap, HashMap, HashSet};

use axum::{Json, Router, extract::State, routing::get};
use chrono::{Datelike, Duration, Months, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlx::SqlitePool;

use crate::{
    error::{AppError, AppResult},
    models::{Category, Transaction},
    money::cents_to_f64,
    routes::{ApiQuery, parse_optional_date},
};

pub fn router() -> Router<SqlitePool> {
    Router::new().route("/", get(dashboard)).route("/recurring", get(recurring))
}

/// Series key for expenses without a category. Category keys are their ids,
/// which can never collide with this or with the `period` field.
pub const UNCATEGORIZED_KEY: &str = "__uncategorized__";
const UNCATEGORIZED_NAME: &str = "Uncategorized";
const UNCATEGORIZED_COLOR: &str = "#d1d5db";
const LARGEST_COUNT: usize = 8;
/// Months averaged for the "typical month" pace line.
const PACE_HISTORY_MONTHS: u32 = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GroupBy {
    Week,
    Month,
    Year,
}

impl GroupBy {
    /// `None` means `auto`: chosen by [`GroupBy::for_range`].
    fn parse(raw: Option<&str>) -> AppResult<Option<Self>> {
        match raw.map(str::trim) {
            None | Some("") | Some("month") => Ok(Some(Self::Month)),
            Some("week") => Ok(Some(Self::Week)),
            Some("year") => Ok(Some(Self::Year)),
            Some("auto") => Ok(None),
            Some(other) => Err(AppError::bad_request(format!(
                "Invalid groupBy \"{other}\"; expected auto, week, month or year"
            ))),
        }
    }

    /// Weeks for up to two months, years beyond three years, months otherwise.
    fn for_range(range: Option<DateRange>) -> Self {
        match range.map(|r| (r.to - r.from).num_days()) {
            Some(days) if days <= 62 => Self::Week,
            Some(days) if days > 3 * 366 => Self::Year,
            _ => Self::Month,
        }
    }

    /// First day of the period containing `date` (weeks start on Monday).
    fn period_start(self, date: NaiveDate) -> NaiveDate {
        match self {
            Self::Week => date - Duration::days(date.weekday().num_days_from_monday().into()),
            Self::Month => month_start(date),
            Self::Year => NaiveDate::from_ymd_opt(date.year(), 1, 1).expect("Jan 1 exists"),
        }
    }

    fn next_period(self, start: NaiveDate) -> NaiveDate {
        match self {
            Self::Week => start + Duration::days(7),
            Self::Month => start + Months::new(1),
            Self::Year => start + Months::new(12),
        }
    }

    /// `yyyy-MM-dd` (week start), `yyyy-MM` or `yyyy`.
    fn label(self, start: NaiveDate) -> String {
        let fmt = match self {
            Self::Week => "%Y-%m-%d",
            Self::Month => "%Y-%m",
            Self::Year => "%Y",
        };
        start.format(fmt).to_string()
    }

    /// Period starts covering `start..=end`.
    fn periods(self, start: NaiveDate, end: NaiveDate) -> Vec<NaiveDate> {
        let mut out = Vec::new();
        let mut period = self.period_start(start);
        while period <= end {
            out.push(period);
            period = self.next_period(period);
        }
        out
    }
}

fn month_start(date: NaiveDate) -> NaiveDate {
    date.with_day(1).expect("day 1 exists")
}

fn month_end(date: NaiveDate) -> NaiveDate {
    month_start(date) + Months::new(1) - Duration::days(1)
}

fn days_in_month(date: NaiveDate) -> u32 {
    month_end(date).day()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct DateRange {
    from: NaiveDate,
    to: NaiveDate,
}

impl DateRange {
    fn contains(self, date: NaiveDate) -> bool {
        self.from <= date && date <= self.to
    }
}

/// The period a range is compared against.
///
/// Ranges starting on the 1st shift by whole months, so "September" compares
/// with "August" and "1–10 October" with "1–10 September". A range starting
/// on 1 January and reaching past January (year to date) compares with the
/// same dates one year earlier. Any other range compares with the equally
/// long period right before it.
fn previous_range(range: DateRange) -> DateRange {
    let DateRange { from, to } = range;
    if from.day() != 1 {
        let len = (to - from).num_days() + 1;
        return DateRange { from: from - Duration::days(len), to: from - Duration::days(1) };
    }
    let spanned =
        (to.year() * 12 + to.month0() as i32) - (from.year() * 12 + from.month0() as i32) + 1;
    let year_to_date = from.month() == 1 && to.year() == from.year() && to.month() > 1;
    let shift = Months::new(if year_to_date { 12 } else { spanned.max(1) as u32 });
    let prev_to = if to == month_end(to) { month_end(to - shift) } else { to - shift };
    DateRange { from: from - shift, to: prev_to }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardQuery {
    from: Option<String>,
    to: Option<String>,
    #[serde(default)]
    cat: Vec<String>,
    group_by: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    expenses: f64,
    income: f64,
    net: f64,
    /// `net / income`; null without income.
    savings_rate: Option<f64>,
    expense_count: usize,
    income_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategorySpend {
    key: String,
    name: String,
    color_hex: String,
    spend: f64,
    count: usize,
    /// Spend in the previous range; null when there is nothing to compare with.
    previous_spend: Option<f64>,
}

/// Income and expenses of one period, in total and per category key (only
/// keys with a non-zero amount are present).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowPoint {
    period: String,
    income: f64,
    expenses: f64,
    net: f64,
    income_by: Map<String, Value>,
    expenses_by: Map<String, Value>,
}

#[derive(Debug, Serialize)]
pub struct DailySpend {
    date: NaiveDate,
    spend: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LargestExpense {
    #[serde(flatten)]
    transaction: Transaction,
    /// Expenses in the range with the same merchant, this one included.
    similar_count: usize,
}

#[derive(Debug, Serialize)]
pub struct UncategorizedSummary {
    count: usize,
    spend: f64,
}

/// Cumulative spend through one calendar month, against the month before and
/// the average of the months before that.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pace {
    /// `yyyy-MM`.
    month: String,
    days_in_month: u32,
    /// Last day with known spend: today in the current month, else the month end.
    through_day: u32,
    spent: f64,
    /// Expected month total; null once the month is over.
    projected: Option<f64>,
    previous_total: Option<f64>,
    average_total: Option<f64>,
    average_months: u32,
    points: Vec<PacePoint>,
}

#[derive(Debug, Serialize)]
pub struct PacePoint {
    day: u32,
    current: Option<f64>,
    previous: Option<f64>,
    average: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    group_by: GroupBy,
    /// First and last date of all stored transactions; null when there are none.
    data_range: Option<DateRange>,
    /// What `previous` and `previousSpend` refer to; null for open-ended
    /// ranges and when the stored data does not reach back that far (checked
    /// at month granularity).
    previous_range: Option<DateRange>,
    summary: Summary,
    previous: Option<Summary>,
    /// Spend per category in the range (sorted by spend, descending), including
    /// categories that only had spend in the previous range.
    categories: Vec<CategorySpend>,
    /// Same as `categories` for income (`spend` is the amount received).
    income_categories: Vec<CategorySpend>,
    /// One point per period of the range, gaps included.
    flow: Vec<FlowPoint>,
    /// Days with spend only.
    daily: Vec<DailySpend>,
    /// Biggest expense per merchant (see [`merchant_key`]), largest first.
    largest: Vec<LargestExpense>,
    uncategorized: UncategorizedSummary,
    pace: Option<Pace>,
}

/// A stored transaction with its series key resolved.
struct Tx {
    id: String,
    date: NaiveDate,
    description: String,
    cents: i64,
    currency: String,
    category_id: Option<String>,
    /// Category id, or [`UNCATEGORIZED_KEY`] (also for dangling ids).
    key: String,
}

impl Tx {
    fn spend(&self) -> i64 {
        -self.cents
    }

    fn to_api(&self) -> Transaction {
        Transaction {
            id: self.id.clone(),
            date: self.date.format("%Y-%m-%d").to_string(),
            description: self.description.clone(),
            amount: cents_to_f64(self.cents),
            currency: self.currency.clone(),
            category_id: self.category_id.clone(),
        }
    }
}

async fn load_categories(pool: &SqlitePool) -> AppResult<HashMap<String, Category>> {
    Ok(sqlx::query_as::<_, Category>("SELECT id, name, color_hex, created_at FROM categories")
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|c| (c.id.clone(), c))
        .collect())
}

/// All transactions, oldest first.
async fn load_transactions(
    pool: &SqlitePool,
    categories: &HashMap<String, Category>,
) -> AppResult<Vec<Tx>> {
    let rows: Vec<(String, String, String, i64, String, Option<String>)> = sqlx::query_as(
        "SELECT id, date, description, amount_cents, currency, category_id
         FROM transactions ORDER BY date, id",
    )
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(|(id, date, description, cents, currency, category_id)| {
            let date = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
                .map_err(|err| anyhow::anyhow!("corrupt date {date:?} in database: {err}"))?;
            let key = category_id
                .as_ref()
                .filter(|id| categories.contains_key(*id))
                .cloned()
                .unwrap_or_else(|| UNCATEGORIZED_KEY.to_owned());
            Ok(Tx { id, date, description, cents, currency, category_id, key })
        })
        .collect()
}

async fn dashboard(
    State(pool): State<SqlitePool>,
    ApiQuery(query): ApiQuery<DashboardQuery>,
) -> AppResult<Json<Dashboard>> {
    let params = Params {
        from: parse_optional_date("from", query.from.as_deref())?,
        to: parse_optional_date("to", query.to.as_deref())?,
        cats: query.cat.into_iter().filter(|c| !c.is_empty()).collect(),
        group_by: GroupBy::parse(query.group_by.as_deref())?,
    };
    let categories = load_categories(&pool).await?;
    let txs = load_transactions(&pool, &categories).await?;
    let today = chrono::Local::now().date_naive();
    Ok(Json(build_dashboard(&txs, &categories, &params, today)))
}

struct Params {
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
    /// Restricts expenses (not income) to these categories; empty = all.
    cats: HashSet<String>,
    /// `None` = automatic.
    group_by: Option<GroupBy>,
}

fn build_dashboard(
    txs: &[Tx],
    categories: &HashMap<String, Category>,
    params: &Params,
    today: NaiveDate,
) -> Dashboard {
    let data_range = match (txs.first(), txs.last()) {
        (Some(first), Some(last)) => Some(DateRange { from: first.date, to: last.date }),
        _ => None,
    };
    let group_by = params.group_by.unwrap_or_else(|| {
        GroupBy::for_range(data_range.map(|data| DateRange {
            from: params.from.unwrap_or(data.from),
            to: params.to.unwrap_or(data.to),
        }))
    });
    let in_range = |date: NaiveDate| {
        params.from.is_none_or(|from| date >= from) && params.to.is_none_or(|to| date <= to)
    };

    // Income ignores the category filter: income is rarely categorised and the
    // summary should still show the full balance for the period.
    let expenses: Vec<&Tx> = txs
        .iter()
        .filter(|t| {
            t.cents < 0
                && (params.cats.is_empty()
                    || t.category_id.as_ref().is_some_and(|id| params.cats.contains(id)))
        })
        .collect();
    let income: Vec<&Tx> = txs.iter().filter(|t| t.cents > 0).collect();

    let current_expenses: Vec<&Tx> =
        expenses.iter().copied().filter(|t| in_range(t.date)).collect();
    let current_income: Vec<&Tx> = income.iter().copied().filter(|t| in_range(t.date)).collect();

    let previous_range = params.from.and_then(|from| {
        let to = params.to.unwrap_or(today).max(from);
        let prev = previous_range(DateRange { from, to });
        // A partly covered previous range would make every change look huge.
        data_range.is_some_and(|data| month_start(data.from) <= prev.from).then_some(prev)
    });
    let previous_expenses: Vec<&Tx> = match previous_range {
        Some(prev) => expenses.iter().copied().filter(|t| prev.contains(t.date)).collect(),
        None => Vec::new(),
    };

    let previous_income: Vec<&Tx> = match previous_range {
        Some(prev) => income.iter().copied().filter(|t| prev.contains(t.date)).collect(),
        None => Vec::new(),
    };
    let has_previous = previous_range.is_some();
    let expense_categories =
        breakdown(&current_expenses, &previous_expenses, has_previous, categories, Tx::spend);
    let income_categories =
        breakdown(&current_income, &previous_income, has_previous, categories, |t| t.cents);

    // Chart periods cover the whole selected range, clamped to the stored data
    // (and today) so an open or generous range does not produce empty decades.
    let periods = data_range
        .and_then(|data| {
            let start = params.from.unwrap_or(data.from).max(data.from);
            let end = params.to.unwrap_or(data.to).min(data.to.max(today));
            (start <= end).then(|| group_by.periods(start, end))
        })
        .unwrap_or_default();

    let flow = {
        let income_buckets = period_buckets(&current_income, group_by, |t| t.cents);
        let expense_buckets = period_buckets(&current_expenses, group_by, Tx::spend);
        let to_map = |sums: Option<&BTreeMap<&str, i64>>| -> (i64, Map<String, Value>) {
            let mut total = 0;
            let mut map = Map::new();
            for (key, cents) in sums.into_iter().flatten() {
                total += cents;
                map.insert((*key).to_owned(), Value::from(cents_to_f64(*cents)));
            }
            (total, map)
        };
        periods
            .iter()
            .map(|period| {
                let (earned, income_by) = to_map(income_buckets.get(period));
                let (spent, expenses_by) = to_map(expense_buckets.get(period));
                FlowPoint {
                    period: group_by.label(*period),
                    income: cents_to_f64(earned),
                    expenses: cents_to_f64(spent),
                    net: cents_to_f64(earned - spent),
                    income_by,
                    expenses_by,
                }
            })
            .collect()
    };

    let mut daily: BTreeMap<NaiveDate, i64> = BTreeMap::new();
    for t in &current_expenses {
        *daily.entry(t.date).or_default() += t.spend();
    }

    // One row per merchant, so the rent does not fill the whole list.
    let mut by_merchant: HashMap<String, (&Tx, usize)> = HashMap::new();
    for t in &current_expenses {
        let entry = by_merchant.entry(merchant_key(&t.description)).or_insert((t, 0));
        entry.1 += 1;
        if (t.cents, std::cmp::Reverse(t.date)) < (entry.0.cents, std::cmp::Reverse(entry.0.date)) {
            entry.0 = t;
        }
    }
    let mut largest: Vec<(&Tx, usize)> = by_merchant.into_values().collect();
    largest.sort_by(|a, b| a.0.cents.cmp(&b.0.cents).then_with(|| b.0.date.cmp(&a.0.date)));

    let uncategorized: Vec<&&Tx> =
        current_expenses.iter().filter(|t| t.key == UNCATEGORIZED_KEY).collect();

    let previous = previous_range.map(|_| summarize(&previous_expenses, &previous_income));

    let pace = data_range.map(|data| {
        let anchor = params.to.unwrap_or(today).min(today);
        build_pace(&expenses, anchor, today, data.from)
    });

    Dashboard {
        group_by,
        data_range,
        previous_range,
        summary: summarize(&current_expenses, &current_income),
        previous,
        categories: expense_categories,
        income_categories,
        flow,
        daily: daily
            .into_iter()
            .map(|(date, cents)| DailySpend { date, spend: cents_to_f64(cents) })
            .collect(),
        largest: largest
            .into_iter()
            .take(LARGEST_COUNT)
            .map(|(t, count)| LargestExpense { transaction: t.to_api(), similar_count: count })
            .collect(),
        uncategorized: UncategorizedSummary {
            count: uncategorized.len(),
            spend: cents_to_f64(uncategorized.iter().map(|t| t.spend()).sum()),
        },
        pace,
    }
}

fn summarize(expenses: &[&Tx], income: &[&Tx]) -> Summary {
    let spend: i64 = expenses.iter().map(|t| t.spend()).sum();
    let earned: i64 = income.iter().map(|t| t.cents).sum();
    Summary {
        expenses: cents_to_f64(spend),
        income: cents_to_f64(earned),
        net: cents_to_f64(earned - spend),
        savings_rate: (earned > 0).then(|| (earned - spend) as f64 / earned as f64),
        expense_count: expenses.len(),
        income_count: income.len(),
    }
}

/// Sums `amount` per period start and category key.
fn period_buckets<'a>(
    txs: &[&'a Tx],
    group_by: GroupBy,
    amount: fn(&Tx) -> i64,
) -> HashMap<NaiveDate, BTreeMap<&'a str, i64>> {
    let mut buckets: HashMap<NaiveDate, BTreeMap<&str, i64>> = HashMap::new();
    for t in txs {
        *buckets
            .entry(group_by.period_start(t.date))
            .or_default()
            .entry(t.key.as_str())
            .or_default() += amount(t);
    }
    buckets
}

/// Per-category totals of `current` (with `previous` for comparison), sorted
/// by amount, descending. `amount` yields positive cents.
fn breakdown(
    current: &[&Tx],
    previous: &[&Tx],
    has_previous: bool,
    categories: &HashMap<String, Category>,
    amount: fn(&Tx) -> i64,
) -> Vec<CategorySpend> {
    let mut by_key: HashMap<&str, (i64, usize)> = HashMap::new();
    for t in current {
        let entry = by_key.entry(t.key.as_str()).or_default();
        entry.0 += amount(t);
        entry.1 += 1;
    }
    let mut prev_by_key: HashMap<&str, i64> = HashMap::new();
    for t in previous {
        *prev_by_key.entry(t.key.as_str()).or_default() += amount(t);
    }
    let keys: HashSet<&str> = by_key.keys().chain(prev_by_key.keys()).copied().collect();
    let mut rows: Vec<(i64, i64, CategorySpend)> = keys
        .into_iter()
        .map(|key| {
            let (cents, count) = by_key.get(key).copied().unwrap_or_default();
            let prev = prev_by_key.get(key).copied().unwrap_or(0);
            let (name, color_hex) = match categories.get(key) {
                Some(c) => (c.name.clone(), c.color_hex.clone()),
                None => (UNCATEGORIZED_NAME.to_owned(), UNCATEGORIZED_COLOR.to_owned()),
            };
            let row = CategorySpend {
                key: key.to_owned(),
                name,
                color_hex,
                spend: cents_to_f64(cents),
                count,
                previous_spend: has_previous.then(|| cents_to_f64(prev)),
            };
            (cents, prev, row)
        })
        .collect();
    rows.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| b.1.cmp(&a.1))
            .then_with(|| a.2.name.to_lowercase().cmp(&b.2.name.to_lowercase()))
            .then_with(|| a.2.key.cmp(&b.2.key))
    });
    rows.into_iter().map(|(_, _, row)| row).collect()
}

/// Cumulative spend in cents for each day of the month starting at `start`.
fn cumulative_month(expenses: &[&Tx], start: NaiveDate) -> Vec<i64> {
    let mut per_day = vec![0i64; days_in_month(start) as usize];
    let end = month_end(start);
    for t in expenses.iter().filter(|t| start <= t.date && t.date <= end) {
        per_day[t.date.day0() as usize] += t.spend();
    }
    let mut total = 0;
    per_day
        .into_iter()
        .map(|cents| {
            total += cents;
            total
        })
        .collect()
}

/// Value of a cumulative curve on `day` (1-based); shorter months stay at their total.
fn on_day(curve: &[i64], day: u32) -> i64 {
    curve[(day as usize).min(curve.len()) - 1]
}

fn build_pace(expenses: &[&Tx], anchor: NaiveDate, today: NaiveDate, data_from: NaiveDate) -> Pace {
    let start = month_start(anchor);
    let dim = days_in_month(start);
    let through = if start == month_start(today) { today.day() } else { dim };
    let first_month = month_start(data_from);

    let current = cumulative_month(expenses, start);
    let prev_start = start - Months::new(1);
    let previous = (prev_start >= first_month).then(|| cumulative_month(expenses, prev_start));
    let history: Vec<Vec<i64>> = (1..=PACE_HISTORY_MONTHS)
        .map(|k| start - Months::new(k))
        .filter(|m| *m >= first_month)
        .map(|m| cumulative_month(expenses, m))
        .collect();
    let n = history.len() as i64;
    let average: Option<Vec<i64>> = (n > 0).then(|| {
        (1..=dim)
            .map(|day| {
                let sum: i64 = history.iter().map(|curve| on_day(curve, day)).sum();
                (sum as f64 / n as f64).round() as i64
            })
            .collect()
    });
    let average_total = (n > 0).then(|| {
        let sum: i64 = history.iter().map(|curve| *curve.last().expect("non-empty month")).sum();
        (sum as f64 / n as f64).round() as i64
    });

    let spent = on_day(&current, through);
    let projected = (through < dim).then(|| match &average {
        // Expect the rest of the month to go like a typical month's remainder.
        Some(avg) => spent + (on_day(avg, dim) - on_day(avg, through)).max(0),
        None => (spent as f64 * f64::from(dim) / f64::from(through)).round() as i64,
    });

    Pace {
        month: start.format("%Y-%m").to_string(),
        days_in_month: dim,
        through_day: through,
        spent: cents_to_f64(spent),
        projected: projected.map(cents_to_f64),
        previous_total: previous
            .as_ref()
            .map(|c| cents_to_f64(*c.last().expect("non-empty month"))),
        average_total: average_total.map(cents_to_f64),
        average_months: n as u32,
        points: (1..=dim)
            .map(|day| PacePoint {
                day,
                current: (day <= through).then(|| cents_to_f64(on_day(&current, day))),
                previous: previous.as_ref().map(|c| cents_to_f64(on_day(c, day))),
                average: average.as_ref().map(|c| cents_to_f64(on_day(c, day))),
            })
            .collect(),
    }
}

// ---------------------------------------------------------------------------
// Recurring payments
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Cadence {
    Weekly,
    Monthly,
    Quarterly,
    Yearly,
}

impl Cadence {
    const ALL: [Self; 4] = [Self::Weekly, Self::Monthly, Self::Quarterly, Self::Yearly];

    /// Accepted gap between two payments, in days.
    fn gap(self) -> std::ops::RangeInclusive<i64> {
        match self {
            Self::Weekly => 5..=9,
            Self::Monthly => 25..=36,
            Self::Quarterly => 80..=100,
            Self::Yearly => 350..=380,
        }
    }

    fn nominal_days(self) -> i64 {
        match self {
            Self::Weekly => 7,
            Self::Monthly => 30,
            Self::Quarterly => 91,
            Self::Yearly => 365,
        }
    }

    fn per_year(self) -> i64 {
        match self {
            Self::Weekly => 52,
            Self::Monthly => 12,
            Self::Quarterly => 4,
            Self::Yearly => 1,
        }
    }

    /// Payments needed before a pattern counts as recurring.
    fn min_count(self) -> usize {
        match self {
            Self::Weekly => 4,
            Self::Monthly | Self::Quarterly => 3,
            Self::Yearly => 2,
        }
    }

    fn next(self, date: NaiveDate) -> NaiveDate {
        match self {
            Self::Weekly => date + Duration::days(7),
            Self::Monthly => date + Months::new(1),
            Self::Quarterly => date + Months::new(3),
            Self::Yearly => date + Months::new(12),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurringPayment {
    /// Normalized description the payments were grouped by.
    key: String,
    /// Description of the latest payment.
    description: String,
    category_id: Option<String>,
    cadence: Cadence,
    /// Latest amount, positive.
    amount: f64,
    count: usize,
    first_date: NaiveDate,
    last_date: NaiveDate,
    next_date: NaiveDate,
    /// Typical (median) amount times payments per year.
    annual_cost: f64,
}

async fn recurring(State(pool): State<SqlitePool>) -> AppResult<Json<Vec<RecurringPayment>>> {
    let categories = load_categories(&pool).await?;
    let txs = load_transactions(&pool, &categories).await?;
    Ok(Json(detect_recurring(&txs)))
}

/// Groups descriptions that differ only in reference numbers, dates and
/// punctuation: tokens containing digits are dropped, the rest lowercased.
fn merchant_key(description: &str) -> String {
    description
        .split_whitespace()
        .filter(|token| !token.chars().any(|c| c.is_ascii_digit()))
        .map(|token| {
            token.chars().filter(|c| c.is_alphanumeric()).collect::<String>().to_lowercase()
        })
        .filter(|token| !token.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn median(values: &mut [i64]) -> i64 {
    values.sort_unstable();
    values[values.len() / 2]
}

/// Expenses with the same merchant, a regular gap and a stable amount that
/// are still active (the next payment is not long overdue relative to the
/// latest stored transaction). Sorted by annual cost, descending.
fn detect_recurring(txs: &[Tx]) -> Vec<RecurringPayment> {
    let Some(latest) = txs.iter().map(|t| t.date).max() else { return Vec::new() };

    // `txs` is sorted by date, so every group is too.
    let mut groups: HashMap<String, Vec<&Tx>> = HashMap::new();
    for t in txs.iter().filter(|t| t.cents < 0) {
        let key = merchant_key(&t.description);
        if !key.is_empty() {
            groups.entry(key).or_default().push(t);
        }
    }

    let mut found = Vec::new();
    for (key, group) in groups {
        // One payment per day; only the recent history decides.
        let mut payments: Vec<(NaiveDate, i64, &Tx)> = Vec::new();
        for t in group {
            match payments.last_mut() {
                Some(last) if last.0 == t.date => {
                    last.1 += t.spend();
                    last.2 = t;
                }
                _ => payments.push((t.date, t.spend(), t)),
            }
        }
        let payments = &payments[payments.len().saturating_sub(12)..];
        if payments.len() < 2 {
            continue;
        }

        let gaps: Vec<i64> = payments.windows(2).map(|w| (w[1].0 - w[0].0).num_days()).collect();
        let typical_gap = median(&mut gaps.clone());
        let Some(cadence) = Cadence::ALL.into_iter().find(|c| c.gap().contains(&typical_gap))
        else {
            continue;
        };
        let regular = gaps.iter().filter(|g| cadence.gap().contains(g)).count();
        if payments.len() < cadence.min_count() || regular * 4 < gaps.len() * 3 {
            continue;
        }

        let typical_amount = median(&mut payments.iter().map(|p| p.1).collect::<Vec<_>>());
        let stable = payments
            .iter()
            .filter(|p| (p.1 - typical_amount).abs() * 100 <= typical_amount * 20)
            .count();
        if stable * 4 < payments.len() * 3 {
            continue;
        }

        let (last_date, last_amount, last_tx) = *payments.last().expect("at least two payments");
        if (latest - last_date).num_days() > cadence.nominal_days() * 3 / 2 + 7 {
            continue;
        }

        found.push(RecurringPayment {
            key,
            description: last_tx.description.trim().to_owned(),
            category_id: last_tx.category_id.clone(),
            cadence,
            amount: cents_to_f64(last_amount),
            count: payments.len(),
            first_date: payments[0].0,
            last_date,
            next_date: cadence.next(last_date),
            annual_cost: cents_to_f64(typical_amount * cadence.per_year()),
        });
    }
    found.sort_by(|a, b| b.annual_cost.total_cmp(&a.annual_cost).then_with(|| a.key.cmp(&b.key)));
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn range(from: &str, to: &str) -> DateRange {
        DateRange { from: d(from), to: d(to) }
    }

    fn tx(date: &str, description: &str, cents: i64, key: &str) -> Tx {
        Tx {
            id: format!("{date}-{description}"),
            date: d(date),
            description: description.into(),
            cents,
            currency: "EUR".into(),
            category_id: (key != UNCATEGORIZED_KEY).then(|| key.to_owned()),
            key: key.into(),
        }
    }

    fn params(from: Option<&str>, to: Option<&str>, group_by: GroupBy) -> Params {
        Params { from: from.map(d), to: to.map(d), cats: HashSet::new(), group_by: Some(group_by) }
    }

    #[test]
    fn period_starts() {
        // 2026-10-10 is a Saturday.
        assert_eq!(GroupBy::Week.period_start(d("2026-10-10")), d("2026-10-05"));
        assert_eq!(GroupBy::Week.period_start(d("2026-10-05")), d("2026-10-05"));
        assert_eq!(GroupBy::Month.period_start(d("2026-10-10")), d("2026-10-01"));
        assert_eq!(GroupBy::Year.period_start(d("2026-10-10")), d("2026-01-01"));
        assert_eq!(GroupBy::Month.next_period(d("2026-12-01")), d("2027-01-01"));
    }

    #[test]
    fn group_by_parsing() {
        assert_eq!(GroupBy::parse(None).unwrap(), Some(GroupBy::Month));
        assert_eq!(GroupBy::parse(Some("week")).unwrap(), Some(GroupBy::Week));
        assert_eq!(GroupBy::parse(Some("auto")).unwrap(), None);
        assert_eq!(GroupBy::for_range(Some(range("2026-09-01", "2026-10-10"))), GroupBy::Week);
        assert_eq!(GroupBy::for_range(Some(range("2025-11-01", "2026-10-10"))), GroupBy::Month);
        assert_eq!(GroupBy::for_range(Some(range("2020-01-01", "2026-10-10"))), GroupBy::Year);
        assert!(GroupBy::parse(Some("day")).is_err());
    }

    #[test]
    fn previous_ranges() {
        // Whole month → previous whole month (different lengths).
        assert_eq!(
            previous_range(range("2026-09-01", "2026-09-30")),
            range("2026-08-01", "2026-08-31")
        );
        assert_eq!(
            previous_range(range("2026-03-01", "2026-03-31")),
            range("2026-02-01", "2026-02-28")
        );
        // Month to date → same days of the previous month.
        assert_eq!(
            previous_range(range("2026-10-01", "2026-10-10")),
            range("2026-09-01", "2026-09-10")
        );
        // Several months → shifted by that many months.
        assert_eq!(
            previous_range(range("2026-08-01", "2026-10-10")),
            range("2026-05-01", "2026-07-10")
        );
        // Year to date → same dates last year; January alone → December.
        assert_eq!(
            previous_range(range("2026-01-01", "2026-10-10")),
            range("2025-01-01", "2025-10-10")
        );
        assert_eq!(
            previous_range(range("2026-01-01", "2026-01-10")),
            range("2025-12-01", "2025-12-10")
        );
        // Arbitrary range → equally long period right before.
        assert_eq!(
            previous_range(range("2026-10-05", "2026-10-11")),
            range("2026-09-28", "2026-10-04")
        );
    }

    #[test]
    fn dashboard_compares_and_zero_fills() {
        let txs = vec![
            tx("2026-08-03", "Billa", -2000, "food"),
            tx("2026-08-28", "Salary", 300000, UNCATEGORIZED_KEY),
            tx("2026-09-03", "Billa", -5000, "food"),
            tx("2026-09-15", "Unknown", -1000, UNCATEGORIZED_KEY),
            tx("2026-09-28", "Salary", 300000, UNCATEGORIZED_KEY),
        ];
        let categories = HashMap::from([(
            "food".to_owned(),
            Category {
                id: "food".into(),
                name: "Food".into(),
                color_hex: "#000".into(),
                created_at: String::new(),
            },
        )]);
        let dash = build_dashboard(
            &txs,
            &categories,
            &params(Some("2026-09-01"), Some("2026-09-30"), GroupBy::Week),
            d("2026-10-10"),
        );
        assert_eq!(dash.previous_range, Some(range("2026-08-01", "2026-08-31")));
        assert_eq!(dash.summary.expenses, 60.0);
        assert_eq!(dash.summary.savings_rate, Some(0.98));
        assert_eq!(dash.previous.as_ref().unwrap().expenses, 20.0);
        assert_eq!(dash.categories[0].key, "food");
        assert_eq!(dash.categories[0].previous_spend, Some(20.0));
        assert_eq!(dash.uncategorized.spend, 10.0);
        // Weeks from Mon 31 Aug through the one containing 30 Sep, gaps included.
        let periods: Vec<_> = dash.flow.iter().map(|p| p.period.as_str()).collect();
        assert_eq!(periods, ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
        assert_eq!(dash.flow[0].expenses_by["food"], 50.0);
        assert!(dash.flow[1].expenses_by.is_empty());
        assert_eq!(dash.flow[4].income, 3000.0);
        assert_eq!(dash.flow[4].income_by[UNCATEGORIZED_KEY], 3000.0);
        assert_eq!(dash.income_categories[0].previous_spend, Some(3000.0));

        // No previous data → nothing to compare with.
        let dash = build_dashboard(
            &txs,
            &categories,
            &params(Some("2026-08-01"), Some("2026-08-31"), GroupBy::Month),
            d("2026-10-10"),
        );
        assert!(dash.previous.is_none());
        assert_eq!(dash.categories[0].previous_spend, None);
    }

    #[test]
    fn pace_projects_from_history() {
        let mut txs = Vec::new();
        for month in ["2026-07", "2026-08", "2026-09"] {
            txs.push(tx(&format!("{month}-01"), "Rent", -100000, "rent"));
            txs.push(tx(&format!("{month}-20"), "Shop", -10000, "shop"));
        }
        txs.push(tx("2026-10-01", "Rent", -100000, "rent"));
        let expenses: Vec<&Tx> = txs.iter().collect();
        let pace = build_pace(&expenses, d("2026-10-10"), d("2026-10-10"), d("2026-07-01"));
        assert_eq!(pace.month, "2026-10");
        assert_eq!(pace.through_day, 10);
        assert_eq!(pace.spent, 1000.0);
        assert_eq!(pace.projected, Some(1100.0));
        assert_eq!(pace.previous_total, Some(1100.0));
        assert_eq!(pace.average_months, 3);
        assert_eq!(pace.points[9].current, Some(1000.0));
        assert_eq!(pace.points[10].current, None);
        // September has 30 days; day 31 holds its total.
        assert_eq!(pace.points[30].previous, Some(1100.0));
    }

    #[test]
    fn merchant_keys_ignore_references() {
        assert_eq!(merchant_key("NETFLIX.COM 866-579 NL"), "netflixcom nl");
        assert_eq!(merchant_key("Spotify P1A2B3 Stockholm"), "spotify stockholm");
        assert_eq!(merchant_key("12345 0815"), "");
    }

    #[test]
    fn detects_recurring_payments() {
        let mut txs = Vec::new();
        for (i, date) in ["2026-06-05", "2026-07-05", "2026-08-04", "2026-09-05"].iter().enumerate()
        {
            txs.push(tx(date, &format!("NETFLIX REF{i}"), -1399, "fun"));
            // Same shop, irregular amounts: not a subscription.
            txs.push(tx(date, "BILLA", [-1000, -4500, -2500, -8000][i], "food"));
        }
        // Weekly but stopped long ago.
        for date in ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"] {
            txs.push(tx(date, "Gym", -500, "fun"));
        }
        txs.sort_by_key(|t| t.date);
        let found = detect_recurring(&txs);
        assert_eq!(found.len(), 1, "{found:?}");
        assert_eq!(found[0].cadence, Cadence::Monthly);
        assert_eq!(found[0].next_date, d("2026-10-05"));
        assert_eq!(found[0].annual_cost, 167.88);
    }
}
