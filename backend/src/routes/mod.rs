pub mod categories;
pub mod dashboard;
pub mod import;
pub mod rules;
pub mod transactions;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, FromRequest, FromRequestParts},
    routing::get,
};
use chrono::NaiveDate;
use serde_json::{Value, json};
use sqlx::SqlitePool;

use crate::error::{AppError, AppResult};

/// Bank exports can be large; the default 2 MB body limit is too small for
/// the import payload (all rows of the CSV as JSON).
const IMPORT_BODY_LIMIT: usize = 64 * 1024 * 1024;

/// `Json` whose rejections are rendered as `{"error": ...}` like every other error.
#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(AppError))]
pub struct ApiJson<T>(pub T);

/// Query-string extractor supporting repeated keys (`?cat=a&cat=b`), with
/// JSON error rendering.
#[derive(FromRequestParts)]
#[from_request(via(axum_extra::extract::Query), rejection(AppError))]
pub struct ApiQuery<T>(pub T);

/// Parses an optional `YYYY-MM-DD` query parameter; empty means absent.
pub fn parse_optional_date(name: &str, raw: Option<&str>) -> AppResult<Option<NaiveDate>> {
    match raw.map(str::trim) {
        None | Some("") => Ok(None),
        Some(s) => NaiveDate::parse_from_str(s, "%Y-%m-%d").map(Some).map_err(|_| {
            AppError::bad_request(format!("Invalid {name} date \"{s}\"; expected YYYY-MM-DD"))
        }),
    }
}

pub fn api_router() -> Router<SqlitePool> {
    Router::new()
        .route("/health", get(health))
        .nest("/categories", categories::router())
        .nest("/rules", rules::router())
        .nest("/transactions", transactions::router())
        .nest("/import", import::router().layer(DefaultBodyLimit::max(IMPORT_BODY_LIMIT)))
        .nest("/dashboard", dashboard::router())
        .fallback(not_found)
}

async fn health(
    axum::extract::State(pool): axum::extract::State<SqlitePool>,
) -> AppResult<Json<Value>> {
    sqlx::query("SELECT 1").execute(&pool).await?;
    Ok(Json(json!({ "status": "ok" })))
}

async fn not_found() -> AppError {
    AppError::not_found("No such API endpoint")
}
