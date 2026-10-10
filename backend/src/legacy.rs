//! One-off import of a database created by the original Next.js/Prisma app.
//!
//! Idempotent: categories are matched by name, rules by (category, type,
//! pattern) and transactions by their dedup hash, so running it twice — or
//! against a database that already has data — never creates duplicates.

use std::path::Path;

use anyhow::Context;
use sqlx::SqlitePool;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct LegacyReport {
    pub categories: u64,
    pub rules: u64,
    pub transactions: u64,
}

/// Prisma stores `DateTime` as epoch milliseconds (or, for SQL defaults, as
/// `YYYY-MM-DD HH:MM:SS` text). Both forms are normalised here.
fn timestamp_sql(column: &str) -> String {
    format!(
        "CASE typeof({column})
           WHEN 'integer' THEN strftime('%Y-%m-%dT%H:%M:%fZ', {column} / 1000.0, 'unixepoch')
           WHEN 'real'    THEN strftime('%Y-%m-%dT%H:%M:%fZ', {column} / 1000.0, 'unixepoch')
           ELSE strftime('%Y-%m-%dT%H:%M:%fZ', {column})
         END"
    )
}

fn date_sql(column: &str) -> String {
    format!(
        "CASE typeof({column})
           WHEN 'integer' THEN date({column} / 1000, 'unixepoch')
           WHEN 'real'    THEN date({column} / 1000, 'unixepoch')
           ELSE date({column})
         END"
    )
}

pub async fn import_legacy(pool: &SqlitePool, legacy_path: &Path) -> anyhow::Result<LegacyReport> {
    anyhow::ensure!(legacy_path.is_file(), "{} does not exist", legacy_path.display());
    let legacy_path = legacy_path.canonicalize()?;

    // ATTACH is per-connection, so everything runs on one connection.
    let mut conn = pool.acquire().await?;
    sqlx::query("ATTACH DATABASE ? AS legacy")
        .bind(legacy_path.to_string_lossy().into_owned())
        .execute(&mut *conn)
        .await
        .context("attaching legacy database")?;

    let result = run(&mut conn).await;

    // Always detach, even on failure, before the connection returns to the pool.
    sqlx::query("DETACH DATABASE legacy").execute(&mut *conn).await?;
    result
}

async fn run(conn: &mut sqlx::SqliteConnection) -> anyhow::Result<LegacyReport> {
    let mut tx = sqlx::Connection::begin(&mut *conn).await?;

    let categories = sqlx::query(&format!(
        "INSERT INTO categories (id, name, color_hex, created_at)
         SELECT lc.id, trim(lc.name), lower(lc.colorHex), {}
         FROM legacy.Category lc
         WHERE trim(lc.name) <> ''
           AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.name = trim(lc.name))
           AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = lc.id)",
        timestamp_sql("lc.createdAt")
    ))
    .execute(&mut *tx)
    .await
    .context("importing categories")?
    .rows_affected();

    // Maps a legacy category id to the matching (by name) current category id.
    const CATEGORY_FOR: &str = "(SELECT c.id FROM categories c
                                 JOIN legacy.Category lc ON trim(lc.name) = c.name
                                 WHERE lc.id = {col})";

    // Legacy rules are appended after existing ones, keeping their relative order.
    let offset: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(priority), -1) + 1 FROM rules")
        .fetch_one(&mut *tx)
        .await?;
    let rules = sqlx::query(&format!(
        "INSERT INTO rules (id, category_id, kind, pattern, is_case_insensitive, priority, created_at)
         SELECT lr.id, {cat}, upper(lr.type), lr.pattern,
                CASE WHEN lr.isCaseInsensitive THEN 1 ELSE 0 END,
                ? + (SELECT COUNT(*) FROM legacy.Rule o
                     WHERE o.priority < lr.priority OR (o.priority = lr.priority AND o.id < lr.id)),
                {created}
         FROM legacy.Rule lr
         WHERE upper(lr.type) IN ('CONTAINS', 'REGEX')
           AND {cat} IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM rules r WHERE r.id = lr.id)
           AND NOT EXISTS (SELECT 1 FROM rules r
                           WHERE r.category_id = {cat} AND r.kind = upper(lr.type)
                             AND r.pattern = lr.pattern)",
        cat = CATEGORY_FOR.replace("{col}", "lr.categoryId"),
        created = timestamp_sql("lr.createdAt"),
    ))
    .bind(offset)
    .execute(&mut *tx)
    .await
    .context("importing rules")?
    .rows_affected();

    let transactions = sqlx::query(&format!(
        "INSERT INTO transactions (id, hash, date, description, amount_cents, currency, category_id)
         SELECT lt.id, lt.hash, {date}, lt.description, CAST(ROUND(lt.amount * 100) AS INTEGER),
                upper(lt.currency), {cat}
         FROM legacy.\"Transaction\" lt
         WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = lt.id)
         ON CONFLICT (hash) DO NOTHING",
        date = date_sql("lt.date"),
        cat = CATEGORY_FOR.replace("{col}", "lt.categoryId"),
    ))
    .execute(&mut *tx)
    .await
    .context("importing transactions")?
    .rows_affected();

    tx.commit().await?;
    Ok(LegacyReport { categories, rules, transactions })
}
