use axum::{Json, Router, extract::State, routing::post};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::{
    csv_import::{MappingConfig, RawRow, parse_row},
    error::{AppError, AppResult},
    models::new_id,
    routes::{ApiJson, rules::load_ordered},
    rules_engine,
};

pub fn router() -> Router<SqlitePool> {
    Router::new().route("/", post(import))
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

/// parse rows → load rules → categorise → insert, skipping known hashes.
/// All inserts happen in one transaction: an import is applied fully or not at all.
async fn import(
    State(pool): State<SqlitePool>,
    ApiJson(request): ApiJson<ImportRequest>,
) -> AppResult<Json<ImportResult>> {
    request.mapping.validate().map_err(AppError::BadRequest)?;

    let mut errors = Vec::new();
    let mut parsed = Vec::with_capacity(request.rows.len());
    for (index, row) in request.rows.iter().enumerate() {
        match parse_row(row, &request.mapping) {
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
