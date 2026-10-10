use std::collections::{BTreeMap, HashMap};

use axum::{Json, Router, extract::State, routing::get};
use chrono::{Datelike, Duration, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sqlx::{QueryBuilder, Sqlite, SqlitePool};

use crate::{
    error::{AppError, AppResult},
    models::Category,
    money::cents_to_f64,
    routes::{
        ApiQuery, parse_optional_date,
        transactions::{TransactionFilter, push_filters},
    },
};

pub fn router() -> Router<SqlitePool> {
    Router::new().route("/", get(dashboard))
}

/// Series key for expenses without a category. Category keys are their ids,
/// which can never collide with this or with the `period` field.
pub const UNCATEGORIZED_KEY: &str = "__uncategorized__";
const UNCATEGORIZED_NAME: &str = "Uncategorized";
const UNCATEGORIZED_COLOR: &str = "#d1d5db";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GroupBy {
    Week,
    Month,
    Year,
}

impl GroupBy {
    fn parse(raw: Option<&str>) -> AppResult<Self> {
        match raw.map(str::trim) {
            None | Some("") | Some("month") => Ok(Self::Month),
            Some("week") => Ok(Self::Week),
            Some("year") => Ok(Self::Year),
            Some(other) => Err(AppError::bad_request(format!(
                "Invalid groupBy \"{other}\"; expected week, month or year"
            ))),
        }
    }

    /// First day of the period containing `date` (weeks start on Monday).
    fn period_start(self, date: NaiveDate) -> NaiveDate {
        match self {
            Self::Week => date - Duration::days(date.weekday().num_days_from_monday().into()),
            Self::Month => date.with_day(1).expect("day 1 exists"),
            Self::Year => NaiveDate::from_ymd_opt(date.year(), 1, 1).expect("Jan 1 exists"),
        }
    }

    fn next_period(self, start: NaiveDate) -> NaiveDate {
        match self {
            Self::Week => start + Duration::days(7),
            Self::Month => start.checked_add_months(chrono::Months::new(1)).expect("in range"),
            Self::Year => start.with_year(start.year() + 1).expect("in range"),
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
pub struct Series {
    key: String,
    name: String,
    color_hex: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PieSlice {
    key: String,
    name: String,
    value: f64,
    color_hex: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    total_count: i64,
    total_expenses: f64,
    total_income: f64,
    net_balance: f64,
    group_by: GroupBy,
    /// Every category with spend in the range (alphabetical), then Uncategorized.
    series: Vec<Series>,
    pie: Vec<PieSlice>,
    /// `{ period, <seriesKey>: spend, ... }`; every key present in every point.
    bar: Vec<Map<String, Value>>,
    line_by_month: Vec<Map<String, Value>>,
    line_by_year: Vec<Map<String, Value>>,
}

struct Expense {
    date: NaiveDate,
    key: String,
    /// Positive spend in cents.
    spend: i64,
}

async fn dashboard(
    State(pool): State<SqlitePool>,
    ApiQuery(query): ApiQuery<DashboardQuery>,
) -> AppResult<Json<Dashboard>> {
    let group_by = GroupBy::parse(query.group_by.as_deref())?;
    let filter = TransactionFilter {
        from: parse_optional_date("from", query.from.as_deref())?,
        to: parse_optional_date("to", query.to.as_deref())?,
        category_ids: query.cat.into_iter().filter(|c| !c.is_empty()).collect(),
        uncategorized: false,
        amount_min_cents: None,
        amount_max_cents: None,
        search: None,
    };

    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
        "SELECT date, category_id, amount_cents FROM transactions WHERE amount_cents < 0",
    );
    push_filters(&mut qb, &filter);
    let expense_rows: Vec<(String, Option<String>, i64)> =
        qb.build_query_as().fetch_all(&pool).await?;

    // Income ignores the category filter: income is rarely categorised and the
    // summary should still show the full balance for the period.
    let income_filter =
        TransactionFilter { category_ids: Vec::new(), uncategorized: false, ..filter };
    let mut qb: QueryBuilder<Sqlite> = QueryBuilder::new(
        "SELECT COALESCE(SUM(amount_cents), 0) FROM transactions WHERE amount_cents > 0",
    );
    push_filters(&mut qb, &income_filter);
    let income_cents: i64 = qb.build_query_scalar().fetch_one(&pool).await?;

    let total_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM transactions").fetch_one(&pool).await?;

    let categories: HashMap<String, Category> =
        sqlx::query_as::<_, Category>("SELECT id, name, color_hex, created_at FROM categories")
            .fetch_all(&pool)
            .await?
            .into_iter()
            .map(|c| (c.id.clone(), c))
            .collect();

    let mut expenses = Vec::with_capacity(expense_rows.len());
    for (date, category_id, amount_cents) in expense_rows {
        let date = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
            .map_err(|err| anyhow::anyhow!("corrupt date {date:?} in database: {err}"))?;
        let key = category_id
            .filter(|id| categories.contains_key(id))
            .unwrap_or_else(|| UNCATEGORIZED_KEY.to_owned());
        expenses.push(Expense { date, key, spend: -amount_cents });
    }

    let mut spend_by_key: HashMap<&str, i64> = HashMap::new();
    for e in &expenses {
        *spend_by_key.entry(e.key.as_str()).or_default() += e.spend;
    }

    let describe = |key: &str| -> (String, String) {
        match categories.get(key) {
            Some(c) => (c.name.clone(), c.color_hex.clone()),
            None => (UNCATEGORIZED_NAME.to_owned(), UNCATEGORIZED_COLOR.to_owned()),
        }
    };

    let mut series: Vec<Series> = spend_by_key
        .keys()
        .map(|key| {
            let (name, color_hex) = describe(key);
            Series { key: (*key).to_owned(), name, color_hex }
        })
        .collect();
    series.sort_by(|a, b| {
        let uncategorized = |s: &Series| s.key == UNCATEGORIZED_KEY;
        uncategorized(a)
            .cmp(&uncategorized(b))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.key.cmp(&b.key))
    });

    let mut pie: Vec<PieSlice> = spend_by_key
        .iter()
        .map(|(key, cents)| {
            let (name, color_hex) = describe(key);
            PieSlice { key: (*key).to_owned(), name, value: cents_to_f64(*cents), color_hex }
        })
        .collect();
    pie.sort_by(|a, b| b.value.total_cmp(&a.value).then_with(|| a.name.cmp(&b.name)));

    let keys: Vec<&str> = series.iter().map(|s| s.key.as_str()).collect();
    let total_expenses: i64 = expenses.iter().map(|e| e.spend).sum();

    Ok(Json(Dashboard {
        total_count,
        total_expenses: cents_to_f64(total_expenses),
        total_income: cents_to_f64(income_cents),
        net_balance: cents_to_f64(income_cents - total_expenses),
        group_by,
        bar: bucketize(&expenses, &keys, group_by),
        line_by_month: bucketize(&expenses, &keys, GroupBy::Month),
        line_by_year: bucketize(&expenses, &keys, GroupBy::Year),
        series,
        pie,
    }))
}

/// Sums spend per period and series key. Every period between the first and
/// the last expense is present (gaps are zero-filled) and every point carries
/// every key, which stacked bars and continuous lines require.
fn bucketize(expenses: &[Expense], keys: &[&str], group_by: GroupBy) -> Vec<Map<String, Value>> {
    let mut buckets: BTreeMap<NaiveDate, HashMap<&str, i64>> = BTreeMap::new();
    for e in expenses {
        *buckets
            .entry(group_by.period_start(e.date))
            .or_default()
            .entry(e.key.as_str())
            .or_default() += e.spend;
    }
    let (Some(&first), Some(&last)) = (buckets.keys().next(), buckets.keys().next_back()) else {
        return Vec::new();
    };

    let empty = HashMap::new();
    let mut points = Vec::new();
    let mut period = first;
    while period <= last {
        let sums = buckets.get(&period).unwrap_or(&empty);
        let mut point = Map::new();
        point.insert("period".into(), Value::String(group_by.label(period)));
        for key in keys {
            let cents = sums.get(key).copied().unwrap_or(0);
            point.insert((*key).to_owned(), Value::from(cents_to_f64(cents)));
        }
        points.push(point);
        period = group_by.next_period(period);
    }
    points
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
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
    fn buckets_are_zero_filled_and_contiguous() {
        let expenses = vec![
            Expense { date: d("2026-01-15"), key: "a".into(), spend: 1000 },
            Expense { date: d("2026-03-02"), key: "b".into(), spend: 250 },
            Expense { date: d("2026-03-20"), key: "a".into(), spend: 5 },
        ];
        let points = bucketize(&expenses, &["a", "b"], GroupBy::Month);
        let periods: Vec<_> = points.iter().map(|p| p["period"].as_str().unwrap()).collect();
        assert_eq!(periods, ["2026-01", "2026-02", "2026-03"]);
        assert_eq!(points[0]["a"], 10.0);
        assert_eq!(points[0]["b"], 0.0);
        assert_eq!(points[1]["a"], 0.0);
        assert_eq!(points[2]["a"], 0.05);
        assert_eq!(points[2]["b"], 2.5);
    }

    #[test]
    fn group_by_parsing() {
        assert_eq!(GroupBy::parse(None).unwrap(), GroupBy::Month);
        assert_eq!(GroupBy::parse(Some("week")).unwrap(), GroupBy::Week);
        assert!(GroupBy::parse(Some("day")).is_err());
    }
}
