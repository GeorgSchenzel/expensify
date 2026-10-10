use std::collections::{BTreeMap, HashSet};

use axum::{Json, Router, extract::State, routing::post};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::{
    csv_import::{MappingConfig, ParsedRow, RawRow, parse_rows},
    error::{AppError, AppResult},
    models::new_id,
    money::cents_to_f64,
    routes::{ApiJson, rules::load_ordered},
    rules_engine,
};

pub fn router() -> Router<SqlitePool> {
    Router::new().route("/", post(import)).route("/preview", post(preview))
}

#[derive(Debug, Deserialize)]
pub struct ImportRequest {
    rows: Vec<RawRow>,
    mapping: MappingConfig,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ImportResult {
    inserted: usize,
    /// Rows already in the database, or repeated within the same file.
    skipped: usize,
    errors: Vec<String>,
}

/// Validates the mapping and parses every row; shared by import and preview so
/// the preview shows exactly what an import would do.
fn parse_all(request: &ImportRequest) -> AppResult<Vec<Result<ParsedRow, String>>> {
    request.mapping.validate().map_err(AppError::BadRequest)?;
    Ok(parse_rows(&request.rows, &request.mapping))
}

/// parse rows → load rules → categorise → insert, skipping known hashes.
/// All inserts happen in one transaction: an import is applied fully or not at all.
async fn import(
    State(pool): State<SqlitePool>,
    ApiJson(request): ApiJson<ImportRequest>,
) -> AppResult<Json<ImportResult>> {
    let mut errors = Vec::new();
    let mut parsed = Vec::with_capacity(request.rows.len());
    for (index, result) in parse_all(&request)?.into_iter().enumerate() {
        match result {
            Ok(p) => parsed.push(p),
            Err(err) => errors.push(format!("Row {}: {err}", index + 1)),
        }
    }

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let rules = rules_engine::compile(&load_ordered(&mut *tx).await?);

    let mut inserted = 0;
    for row in &parsed {
        let category_id = rules_engine::categorize(&rules, &row.description);
        let result = sqlx::query(
            "INSERT INTO transactions (id, hash, date, description, amount_cents, currency, category_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (hash) DO NOTHING",
        )
        .bind(new_id())
        .bind(&row.hash)
        .bind(row.date.format("%Y-%m-%d").to_string())
        .bind(&row.description)
        .bind(row.amount_cents)
        .bind(&row.currency)
        .bind(category_id)
        .execute(&mut *tx)
        .await?;
        inserted += result.rows_affected() as usize;
    }
    tx.commit().await?;

    Ok(Json(ImportResult { inserted, skipped: parsed.len() - inserted, errors }))
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum RowStatus {
    /// Would be inserted.
    New,
    /// Same date, amount and description as a transaction already stored.
    Existing,
    /// Same date, amount and description as an earlier row of this file.
    Repeated,
    /// Cannot be parsed with this mapping.
    Error,
}

/// One CSV row as the import would treat it. Fields other than `row` and
/// `status` are absent for error rows.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewRow {
    /// 1-based data row number, as used in import error messages.
    row: usize,
    status: RowStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    amount: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    currency: Option<String>,
    /// Category the current rules would assign (new rows only).
    #[serde(skip_serializing_if = "Option::is_none")]
    category_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Money moved by the new rows of one currency.
#[derive(Debug, Serialize)]
struct CurrencyTotal {
    currency: String,
    income: f64,
    /// Negative.
    expenses: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewResult {
    rows: Vec<PreviewRow>,
    /// Totals of the `new` rows, one entry per currency.
    totals: Vec<CurrencyTotal>,
    /// Date range of the transactions already stored (`None` when empty).
    existing_from: Option<String>,
    existing_to: Option<String>,
}

/// Dry run of `import`: parses, deduplicates and categorises without writing.
async fn preview(
    State(pool): State<SqlitePool>,
    ApiJson(request): ApiJson<ImportRequest>,
) -> AppResult<Json<PreviewResult>> {
    let parsed = parse_all(&request)?;

    let hashes: Vec<&str> = parsed.iter().flatten().map(|p| p.hash.as_str()).collect();
    let mut tx = pool.begin().await?;
    let existing: HashSet<String> = sqlx::query_scalar(
        "SELECT hash FROM transactions WHERE hash IN (SELECT value FROM json_each(?))",
    )
    .bind(serde_json::to_string(&hashes).expect("strings serialize"))
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .collect();
    let rules = rules_engine::compile(&load_ordered(&mut *tx).await?);
    let (existing_from, existing_to): (Option<String>, Option<String>) =
        sqlx::query_as("SELECT MIN(date), MAX(date) FROM transactions").fetch_one(&mut *tx).await?;
    tx.commit().await?;

    let mut seen = HashSet::new();
    // currency → (income, expenses) in cents
    let mut sums: BTreeMap<String, (i64, i64)> = BTreeMap::new();
    let rows = parsed
        .into_iter()
        .enumerate()
        .map(|(index, result)| match result {
            Err(err) => PreviewRow {
                row: index + 1,
                status: RowStatus::Error,
                date: None,
                description: None,
                amount: None,
                currency: None,
                category_id: None,
                error: Some(err),
            },
            Ok(p) => {
                let status = if existing.contains(&p.hash) {
                    RowStatus::Existing
                } else if !seen.insert(p.hash.clone()) {
                    RowStatus::Repeated
                } else {
                    let sum = sums.entry(p.currency.clone()).or_default();
                    if p.amount_cents >= 0 {
                        sum.0 += p.amount_cents
                    } else {
                        sum.1 += p.amount_cents
                    }
                    RowStatus::New
                };
                let category_id = (status == RowStatus::New)
                    .then(|| rules_engine::categorize(&rules, &p.description))
                    .flatten()
                    .map(str::to_owned);
                PreviewRow {
                    row: index + 1,
                    status,
                    date: Some(p.date.format("%Y-%m-%d").to_string()),
                    description: Some(p.description),
                    amount: Some(cents_to_f64(p.amount_cents)),
                    currency: Some(p.currency),
                    category_id,
                    error: None,
                }
            }
        })
        .collect();

    let totals = sums
        .into_iter()
        .map(|(currency, (income, expenses))| CurrencyTotal {
            currency,
            income: cents_to_f64(income),
            expenses: cents_to_f64(expenses),
        })
        .collect();
    Ok(Json(PreviewResult { rows, totals, existing_from, existing_to }))
}
