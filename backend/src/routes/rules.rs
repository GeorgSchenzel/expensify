use std::collections::HashSet;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post, put},
};
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use crate::{
    error::{AppError, AppResult},
    models::{Category, Rule, RuleKind, RuleWithCategory, new_id, now_timestamp},
    money::cents_to_f64,
    routes::ApiJson,
    rules_engine::{self, build_regex},
};

pub fn router() -> Router<SqlitePool> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/order", put(reorder))
        .route("/apply", post(apply))
        .route("/preview", post(preview))
        .route("/{id}", delete(remove))
}

const SELECT_WITH_CATEGORY: &str = "
    SELECT r.id, r.category_id, r.kind, r.pattern, r.is_case_insensitive, r.priority, r.created_at,
           c.name AS category_name, c.color_hex AS category_color_hex,
           c.created_at AS category_created_at
    FROM rules r JOIN categories c ON c.id = r.category_id";

#[derive(FromRow)]
struct JoinedRow {
    #[sqlx(flatten)]
    rule: Rule,
    category_name: String,
    category_color_hex: String,
    category_created_at: String,
}

impl From<JoinedRow> for RuleWithCategory {
    fn from(row: JoinedRow) -> Self {
        let category = Category {
            id: row.rule.category_id.clone(),
            name: row.category_name,
            color_hex: row.category_color_hex,
            created_at: row.category_created_at,
        };
        Self { rule: row.rule, category }
    }
}

/// Rules ordered by evaluation priority (first match wins).
pub async fn load_ordered(executor: impl sqlx::SqliteExecutor<'_>) -> sqlx::Result<Vec<Rule>> {
    sqlx::query_as::<_, Rule>(
        "SELECT id, category_id, kind, pattern, is_case_insensitive, priority, created_at
         FROM rules ORDER BY priority, created_at, id",
    )
    .fetch_all(executor)
    .await
}

async fn list(State(pool): State<SqlitePool>) -> AppResult<Json<Vec<RuleWithCategory>>> {
    let rows = sqlx::query_as::<_, JoinedRow>(&format!(
        "{SELECT_WITH_CATEGORY} ORDER BY r.priority, r.created_at, r.id"
    ))
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleInput {
    pattern: String,
    #[serde(rename = "type")]
    kind: RuleKind,
    category_id: String,
    is_case_insensitive: bool,
}

/// Shared by create and preview, so a preview never accepts what create rejects.
fn validate_pattern(raw: &str, kind: RuleKind, case_insensitive: bool) -> AppResult<String> {
    let pattern = raw.trim().to_owned();
    if pattern.is_empty() {
        return Err(AppError::bad_request("Pattern must not be empty"));
    }
    if pattern.chars().count() > 500 {
        return Err(AppError::bad_request("Pattern must be at most 500 characters"));
    }
    if kind == RuleKind::Regex {
        build_regex(&pattern, case_insensitive)
            .map_err(|err| AppError::bad_request(format!("Invalid regex pattern: {err}")))?;
    }
    Ok(pattern)
}

async fn create(
    State(pool): State<SqlitePool>,
    ApiJson(input): ApiJson<RuleInput>,
) -> AppResult<(StatusCode, Json<RuleWithCategory>)> {
    let pattern = validate_pattern(&input.pattern, input.kind, input.is_case_insensitive)?;

    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let exists: Option<(String,)> = sqlx::query_as("SELECT id FROM categories WHERE id = ?")
        .bind(&input.category_id)
        .fetch_optional(&mut *tx)
        .await?;
    if exists.is_none() {
        return Err(AppError::bad_request("Category not found"));
    }

    // New rules go to the end of the evaluation order.
    let id = new_id();
    sqlx::query(
        "INSERT INTO rules (id, category_id, kind, pattern, is_case_insensitive, priority, created_at)
         VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(priority), -1) + 1 FROM rules), ?)",
    )
    .bind(&id)
    .bind(&input.category_id)
    .bind(input.kind)
    .bind(&pattern)
    .bind(input.is_case_insensitive)
    .bind(now_timestamp())
    .execute(&mut *tx)
    .await?;

    let row = sqlx::query_as::<_, JoinedRow>(&format!("{SELECT_WITH_CATEGORY} WHERE r.id = ?"))
        .bind(&id)
        .fetch_one(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(row.into())))
}

async fn remove(State(pool): State<SqlitePool>, Path(id): Path<String>) -> AppResult<StatusCode> {
    let deleted = sqlx::query("DELETE FROM rules WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await?
        .rows_affected();
    if deleted == 0 {
        return Err(AppError::not_found("Rule not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct ReorderInput {
    ids: Vec<String>,
}

/// Persists a drag-and-drop reorder. `ids` must list every rule exactly once;
/// otherwise the client's view is stale and the request is refused.
async fn reorder(
    State(pool): State<SqlitePool>,
    ApiJson(input): ApiJson<ReorderInput>,
) -> AppResult<StatusCode> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let existing: HashSet<String> =
        sqlx::query_scalar("SELECT id FROM rules").fetch_all(&mut *tx).await?.into_iter().collect();
    let requested: HashSet<&String> = input.ids.iter().collect();
    let is_permutation = requested.len() == input.ids.len()
        && input.ids.len() == existing.len()
        && input.ids.iter().all(|id| existing.contains(id));
    if !is_permutation {
        return Err(AppError::conflict("The rule list has changed. Reload and try again."));
    }

    for (priority, id) in input.ids.iter().enumerate() {
        sqlx::query("UPDATE rules SET priority = ? WHERE id = ?")
            .bind(priority as i64)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyInput {
    /// Also re-categorise transactions that already have a category. Off by
    /// default so manual assignments are kept.
    #[serde(default)]
    include_categorized: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    /// Transactions whose category changed.
    updated: u64,
    /// Transactions that were examined.
    checked: u64,
}

/// Runs the rules over existing transactions, e.g. after adding a rule for
/// data that was imported earlier. Transactions that match no rule are left
/// unchanged, so this never removes a category.
async fn apply(
    State(pool): State<SqlitePool>,
    ApiJson(input): ApiJson<ApplyInput>,
) -> AppResult<Json<ApplyResult>> {
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let rules = rules_engine::compile(&load_ordered(&mut *tx).await?);

    let sql = if input.include_categorized {
        "SELECT id, description, category_id FROM transactions"
    } else {
        "SELECT id, description, category_id FROM transactions WHERE category_id IS NULL"
    };
    let rows: Vec<(String, String, Option<String>)> =
        sqlx::query_as(sql).fetch_all(&mut *tx).await?;

    let mut updated = 0;
    for (id, description, current) in &rows {
        let Some(category_id) = rules_engine::categorize(&rules, description) else { continue };
        if current.as_deref() == Some(category_id) {
            continue;
        }
        updated += sqlx::query("UPDATE transactions SET category_id = ? WHERE id = ?")
            .bind(category_id)
            .bind(id)
            .execute(&mut *tx)
            .await?
            .rows_affected();
    }
    tx.commit().await?;
    Ok(Json(ApplyResult { updated, checked: rows.len() as u64 }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInput {
    pattern: String,
    #[serde(rename = "type")]
    kind: RuleKind,
    is_case_insensitive: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryCount {
    category_id: String,
    count: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResult {
    /// Uncategorized transactions this rule would categorize if appended to
    /// the current rules (no earlier rule matches them).
    new_matches: u64,
    new_match_ids: Vec<String>,
    /// Signed sum of those transactions' amounts.
    new_match_amount: f64,
    /// Uncategorized transactions that match, but an existing rule matches
    /// first (existing rules have not been applied to them yet).
    shadowed: u64,
    /// Already categorized transactions the pattern also matches, per category.
    /// Only changed by "re-categorize all", but a hint the pattern is too broad.
    categorized_matches: Vec<CategoryCount>,
}

/// Dry run of a rule that is being written: what would it match right now?
/// Uses the exact matcher the importer uses.
async fn preview(
    State(pool): State<SqlitePool>,
    ApiJson(input): ApiJson<PreviewInput>,
) -> AppResult<Json<PreviewResult>> {
    let pattern = validate_pattern(&input.pattern, input.kind, input.is_case_insensitive)?;
    let candidate = Rule {
        id: "__preview__".into(),
        category_id: "__preview__".into(),
        kind: input.kind,
        pattern,
        is_case_insensitive: input.is_case_insensitive,
        priority: i64::MAX,
        created_at: String::new(),
    };
    let candidate = rules_engine::compile(std::slice::from_ref(&candidate))
        .pop()
        .ok_or_else(|| AppError::bad_request("Invalid pattern"))?;

    let mut conn = pool.acquire().await?;
    let existing = rules_engine::compile(&load_ordered(&mut *conn).await?);
    let rows: Vec<(String, String, Option<String>, i64)> =
        sqlx::query_as("SELECT id, description, category_id, amount_cents FROM transactions")
            .fetch_all(&mut *conn)
            .await?;

    let mut new_match_ids = Vec::new();
    let mut new_match_cents: i64 = 0;
    let mut shadowed = 0;
    let mut by_category: HashMap<String, u64> = HashMap::new();
    for (id, description, category_id, amount_cents) in rows {
        let lowered = description.to_lowercase();
        if !candidate.is_match(&description, &lowered) {
            continue;
        }
        match category_id {
            Some(cat) => *by_category.entry(cat).or_default() += 1,
            None if rules_engine::categorize(&existing, &description).is_some() => shadowed += 1,
            None => {
                new_match_ids.push(id);
                new_match_cents += amount_cents;
            }
        }
    }

    let mut categorized_matches: Vec<CategoryCount> = by_category
        .into_iter()
        .map(|(category_id, count)| CategoryCount { category_id, count })
        .collect();
    categorized_matches
        .sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.category_id.cmp(&b.category_id)));

    Ok(Json(PreviewResult {
        new_matches: new_match_ids.len() as u64,
        new_match_ids,
        new_match_amount: cents_to_f64(new_match_cents),
        shadowed,
        categorized_matches,
    }))
}
