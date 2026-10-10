use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, put},
};
use serde::Deserialize;
use sqlx::SqlitePool;

use crate::{
    error::{AppError, AppResult},
    models::{Category, new_id, now_timestamp},
    routes::ApiJson,
};

pub fn router() -> Router<SqlitePool> {
    Router::new().route("/", get(list).post(create)).route("/{id}", put(update).delete(remove))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryInput {
    name: String,
    color_hex: String,
}

impl CategoryInput {
    fn validated(self) -> AppResult<(String, String)> {
        let name = self.name.trim().to_owned();
        if name.is_empty() {
            return Err(AppError::bad_request("Category name must not be empty"));
        }
        if name.chars().count() > 100 {
            return Err(AppError::bad_request("Category name must be at most 100 characters"));
        }
        let color = self.color_hex.trim().to_ascii_lowercase();
        let valid_color = color.len() == 7
            && color.starts_with('#')
            && color[1..].bytes().all(|b| b.is_ascii_hexdigit());
        if !valid_color {
            return Err(AppError::bad_request("Color must be a hex value like #10b981"));
        }
        Ok((name, color))
    }
}

fn map_unique(err: sqlx::Error) -> AppError {
    match err.as_database_error() {
        Some(db) if db.is_unique_violation() => {
            AppError::conflict("A category with that name already exists")
        }
        _ => err.into(),
    }
}

async fn list(State(pool): State<SqlitePool>) -> AppResult<Json<Vec<Category>>> {
    let categories = sqlx::query_as::<_, Category>(
        "SELECT id, name, color_hex, created_at FROM categories ORDER BY name COLLATE NOCASE, name",
    )
    .fetch_all(&pool)
    .await?;
    Ok(Json(categories))
}

async fn create(
    State(pool): State<SqlitePool>,
    ApiJson(input): ApiJson<CategoryInput>,
) -> AppResult<(StatusCode, Json<Category>)> {
    let (name, color_hex) = input.validated()?;
    let category = sqlx::query_as::<_, Category>(
        "INSERT INTO categories (id, name, color_hex, created_at) VALUES (?, ?, ?, ?)
         RETURNING id, name, color_hex, created_at",
    )
    .bind(new_id())
    .bind(name)
    .bind(color_hex)
    .bind(now_timestamp())
    .fetch_one(&pool)
    .await
    .map_err(map_unique)?;
    Ok((StatusCode::CREATED, Json(category)))
}

async fn update(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
    ApiJson(input): ApiJson<CategoryInput>,
) -> AppResult<Json<Category>> {
    let (name, color_hex) = input.validated()?;
    sqlx::query_as::<_, Category>(
        "UPDATE categories SET name = ?, color_hex = ? WHERE id = ?
         RETURNING id, name, color_hex, created_at",
    )
    .bind(name)
    .bind(color_hex)
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(map_unique)?
    .map(Json)
    .ok_or_else(|| AppError::not_found("Category not found"))
}

/// Deletes a category and its rules. Transactions are never deleted; they
/// simply become uncategorised.
async fn remove(State(pool): State<SqlitePool>, Path(id): Path<String>) -> AppResult<StatusCode> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    sqlx::query("UPDATE transactions SET category_id = NULL WHERE category_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM rules WHERE category_id = ?").bind(&id).execute(&mut *tx).await?;
    let deleted = sqlx::query("DELETE FROM categories WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    if deleted == 0 {
        return Err(AppError::not_found("Category not found"));
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
