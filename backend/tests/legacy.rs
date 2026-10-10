//! The legacy importer against a database with the original Prisma schema.

use std::str::FromStr;

use sqlx::{
    Connection, SqliteConnection,
    sqlite::{SqliteConnectOptions, SqlitePool},
};

const LEGACY_SCHEMA: &str = r#"
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL DEFAULT '#10b981',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hash" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "categoryId" TEXT
);
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX "Transaction_hash_key" ON "Transaction"("hash");
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "isCaseInsensitive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "Category" VALUES ('cat_groceries', 'Groceries', '#84CC16', 1780035983791);
INSERT INTO "Category" VALUES ('cat_dining', 'Dining', '#3b82f6', '2026-05-29 14:03:00');
INSERT INTO "Rule" VALUES ('rule_spar', 'cat_groceries', 'CONTAINS', 'spar', 1, 1, 1780035983791);
INSERT INTO "Rule" VALUES ('rule_billa', 'cat_groceries', 'CONTAINS', 'billa', 1, 0, 1780035983791);
-- 1776384000000 = 2026-04-17T00:00:00Z. The hash is what the old app computed
-- for (2026-04-17, -12.8, "Coffee").
INSERT INTO "Transaction" VALUES ('tx_1',
    'd18aa7edfb959364e2e4401d32a67eca23e325ef1cc413df8dcf784e543fb7fd',
    1776384000000, 'Coffee', -12.8, 'EUR', 'cat_dining');
INSERT INTO "Transaction" VALUES ('tx_2', 'otherhash', 1776297600000, 'BILLA', -318.63, 'EUR', 'cat_groceries');
INSERT INTO "Transaction" VALUES ('tx_3', 'thirdhash', 1776297600000, 'Salary', 2500, 'EUR', NULL);
"#;

async fn legacy_db() -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!("fin-legacy-{}.db", uuid::Uuid::now_v7()));
    let opts = SqliteConnectOptions::from_str(&format!("sqlite://{}", path.display()))
        .unwrap()
        .create_if_missing(true);
    let mut conn = SqliteConnection::connect_with(&opts).await.unwrap();
    sqlx::raw_sql(LEGACY_SCHEMA).execute(&mut conn).await.unwrap();
    conn.close().await.unwrap();
    path
}

async fn scalar<T>(pool: &SqlitePool, sql: &str) -> T
where
    T: Send + Unpin + for<'r> sqlx::Decode<'r, sqlx::Sqlite> + sqlx::Type<sqlx::Sqlite>,
{
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

#[tokio::test]
async fn imports_legacy_data_idempotently() {
    let legacy = legacy_db().await;
    // A file, not `:memory:` — sqlx opens in-memory databases with
    // SQLITE_OPEN_MEMORY, which makes ATTACHed databases in-memory (empty) too.
    let main_db = std::env::temp_dir().join(format!("fin-main-{}.db", uuid::Uuid::now_v7()));
    let pool = fin_backend::db::connect(&format!("sqlite://{}", main_db.display())).await.unwrap();

    let report = fin_backend::legacy::import_legacy(&pool, &legacy).await.unwrap();
    assert_eq!(
        report,
        fin_backend::legacy::LegacyReport { categories: 2, rules: 2, transactions: 3 }
    );

    // Running it again changes nothing.
    let again = fin_backend::legacy::import_legacy(&pool, &legacy).await.unwrap();
    assert_eq!(again, Default::default());

    assert_eq!(
        scalar::<String>(&pool, "SELECT color_hex FROM categories WHERE name = 'Groceries'").await,
        "#84cc16"
    );
    assert_eq!(
        scalar::<String>(&pool, "SELECT created_at FROM categories WHERE name = 'Dining'").await,
        "2026-05-29T14:03:00.000Z"
    );
    // Relative rule order is preserved.
    assert_eq!(
        scalar::<String>(&pool, "SELECT pattern FROM rules ORDER BY priority LIMIT 1").await,
        "billa"
    );
    assert_eq!(
        scalar::<String>(&pool, "SELECT date FROM transactions WHERE id = 'tx_1'").await,
        "2026-04-17"
    );
    assert_eq!(
        scalar::<i64>(&pool, "SELECT amount_cents FROM transactions WHERE id = 'tx_2'").await,
        -31863
    );
    assert_eq!(
        scalar::<Option<String>>(&pool, "SELECT category_id FROM transactions WHERE id = 'tx_3'")
            .await,
        None
    );

    // A CSV row identical to a migrated transaction is recognised as a duplicate,
    // proving the new hash matches the old app's.
    let mapping = serde_json::json!({
        "dateColumn": "Date", "descriptionColumn": "Description", "amountMode": "single",
        "amountColumn": "Amount", "currencyMode": "manual", "defaultCurrency": "EUR"
    });
    let rows =
        serde_json::json!([{ "Date": "2026-04-17", "Description": "Coffee", "Amount": "-12,80" }]);
    let app = fin_backend::app(pool.clone(), None);
    use tower::ServiceExt;
    let res = app
        .oneshot(
            axum::http::Request::post("/api/import")
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    serde_json::json!({ "rows": rows, "mapping": mapping }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let body = http_body_util::BodyExt::collect(res.into_body()).await.unwrap().to_bytes();
    let result: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(result["inserted"], 0, "{result}");
    assert_eq!(result["skipped"], 1, "{result}");

    pool.close().await;
    for path in [
        legacy,
        main_db.clone(),
        main_db.with_extension("db-wal"),
        main_db.with_extension("db-shm"),
    ] {
        std::fs::remove_file(path).ok();
    }
}
