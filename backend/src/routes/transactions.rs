use axum::{
    Json, Router,
    extract::{Path, State},
    routing::{get, patch, post},
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Sqlite, SqlitePool};

use crate::{
    error::{AppError, AppResult},
    models::{Transaction, TransactionRow},
    money::{Round, parse_bound},
    routes::{ApiJson, ApiQuery, parse_optional_date},
};

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/", get(list))
        .route("/bulk-category", post(bulk_update_category))
        .route("/stats", get(stats))
        .route("/{id}", patch(update_category))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    from: Option<String>,
    to: Option<String>,
    #[serde(default)]
    cat: Vec<String>,
    /// `true` includes transactions without a category (combined with `cat` as OR).
    uncategorized: Option<String>,
    amount_min: Option<String>,
    amount_max: Option<String>,
    search: Option<String>,
}

pub struct TransactionFilter {
    pub from: Option<NaiveDate>,
    pub to: Option<NaiveDate>,
    pub category_ids: Vec<String>,
    pub uncategorized: bool,
    pub amount_min_cents: Option<i64>,
    pub amount_max_cents: Option<i64>,
    pub search: Option<String>,
}

impl TryFrom<ListQuery> for TransactionFilter {
    type Error = AppError;

    fn try_from(q: ListQuery) -> AppResult<Self> {
        let bound = |raw: Option<String>, round| -> AppResult<Option<i64>> {
            match raw.as_deref().map(str::trim) {
                None | Some("") => Ok(None),
                Some(s) => parse_bound(s, round).map(Some).map_err(AppError::BadRequest),
            }
        };
        Ok(Self {
            from: parse_optional_date("from", q.from.as_deref())?,
            to: parse_optional_date("to", q.to.as_deref())?,
            category_ids: q.cat.into_iter().filter(|c| !c.is_empty()).collect(),
            uncategorized: match q.uncategorized.as_deref().map(str::trim) {
                None | Some("") | Some("false") | Some("0") => false,
                Some("true") | Some("1") => true,
                Some(other) => {
                    return Err(AppError::bad_request(format!(
                        "Invalid uncategorized \"{other}\"; expected true or false"
                    )));
                }
            },
            amount_min_cents: bound(q.amount_min, Round::Ceil)?,
            amount_max_cents: bound(q.amount_max, Round::Floor)?,
            search: q.search.map(|s| s.trim().to_owned()).filter(|s| !s.is_empty()),
        })
    }
}

/// Appends `AND ...` clauses for every active filter. Dates are inclusive.
pub fn push_filters(qb: &mut QueryBuilder<'_, Sqlite>, filter: &TransactionFilter) {
    if let Some(from) = filter.from {
        qb.push(" AND date >= ").push_bind(from.format("%Y-%m-%d").to_string());
    }
    if let Some(to) = filter.to {
        qb.push(" AND date <= ").push_bind(to.format("%Y-%m-%d").to_string());
    }
    match (filter.category_ids.is_empty(), filter.uncategorized) {
        (true, false) => {}
        (true, true) => {
            qb.push(" AND category_id IS NULL");
        }
        (false, uncategorized) => {
            qb.push(if uncategorized {
                " AND (category_id IS NULL OR category_id IN ("
            } else {
                " AND (category_id IN ("
            });
            let mut list = qb.separated(", ");
            for id in &filter.category_ids {
                list.push_bind(id.clone());
            }
            qb.push("))");
        }
    }
    if let Some(min) = filter.amount_min_cents {
        qb.push(" AND amount_cents >= ").push_bind(min);
    }
    if let Some(max) = filter.amount_max_cents {
        qb.push(" AND amount_cents <= ").push_bind(max);
    }
    if let Some(search) = &filter.search {
        let escaped = search.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
        qb.push(" AND description LIKE ").push_bind(format!("%{escaped}%")).push(" ESCAPE '\\'");
    }
}

async fn list(
    State(pool): State<SqlitePool>,
    ApiQuery(query): ApiQuery<ListQuery>,
) -> AppResult<Json<Vec<Transaction>>> {
    let filter = TransactionFilter::try_from(query)?;
    let mut qb = QueryBuilder::new(
        "SELECT id, date, description, amount_cents, currency, category_id FROM transactions WHERE 1 = 1",
    );
    push_filters(&mut qb, &filter);
    qb.push(" ORDER BY date DESC, id DESC");
    let rows = qb.build_query_as::<TransactionRow>().fetch_all(&pool).await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryAssignment {
    /// `null` removes the category.
    category_id: Option<String>,
}

async fn ensure_category_exists(pool: &SqlitePool, id: Option<&str>) -> AppResult<()> {
    let Some(id) = id else { return Ok(()) };
    let found: Option<(String,)> = sqlx::query_as("SELECT id FROM categories WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    found.map(|_| ()).ok_or_else(|| AppError::bad_request("Category not found"))
}

async fn update_category(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
    ApiJson(input): ApiJson<CategoryAssignment>,
) -> AppResult<Json<Transaction>> {
    ensure_category_exists(&pool, input.category_id.as_deref()).await?;
    sqlx::query_as::<_, TransactionRow>(
        "UPDATE transactions SET category_id = ? WHERE id = ?
         RETURNING id, date, description, amount_cents, currency, category_id",
    )
    .bind(&input.category_id)
    .bind(&id)
    .fetch_optional(&pool)
    .await?
    .map(|row| Json(row.into()))
    .ok_or_else(|| AppError::not_found("Transaction not found"))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkAssignment {
    ids: Vec<String>,
    category_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BulkResult {
    updated: u64,
}

async fn bulk_update_category(
    State(pool): State<SqlitePool>,
    ApiJson(input): ApiJson<BulkAssignment>,
) -> AppResult<Json<BulkResult>> {
    if input.ids.is_empty() {
        return Ok(Json(BulkResult { updated: 0 }));
    }
    ensure_category_exists(&pool, input.category_id.as_deref()).await?;

    let mut tx = pool.begin().await?;
    let mut updated = 0;
    // Stay well below SQLite's bound-parameter limit.
    for chunk in input.ids.chunks(500) {
        let mut qb = QueryBuilder::<Sqlite>::new("UPDATE transactions SET category_id = ");
        qb.push_bind(input.category_id.clone()).push(" WHERE id IN (");
        let mut list = qb.separated(", ");
        for id in chunk {
            list.push_bind(id.clone());
        }
        qb.push(")");
        updated += qb.build().execute(&mut *tx).await?.rows_affected();
    }
    tx.commit().await?;
    Ok(Json(BulkResult { updated }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    total: i64,
    uncategorized: i64,
}

/// Categorization progress across all transactions.
async fn stats(State(pool): State<SqlitePool>) -> AppResult<Json<Stats>> {
    let (total, uncategorized): (i64, i64) =
        sqlx::query_as("SELECT COUNT(*), COALESCE(SUM(category_id IS NULL), 0) FROM transactions")
            .fetch_one(&pool)
            .await?;
    Ok(Json(Stats { total, uncategorized }))
}
