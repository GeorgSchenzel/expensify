use std::{str::FromStr, time::Duration};

use anyhow::Context;
use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};

/// Opens (creating if necessary) the SQLite database and applies pending migrations.
///
/// `url` is a sqlx SQLite URL, e.g. `sqlite://data/fin.db` (relative to the
/// working directory), `sqlite:///abs/path/fin.db` or `sqlite::memory:`.
pub async fn connect(url: &str) -> anyhow::Result<SqlitePool> {
    let options = SqliteConnectOptions::from_str(url)
        .with_context(|| format!("invalid DATABASE_URL: {url}"))?
        .create_if_missing(true)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5));

    let in_memory = url.contains(":memory:") || url.contains("mode=memory");
    let pool = if in_memory {
        // Every connection to `:memory:` is a separate, empty database, so the
        // pool must hold exactly one connection and never recycle it.
        SqlitePoolOptions::new()
            .max_connections(1)
            .min_connections(1)
            .idle_timeout(None)
            .max_lifetime(None)
            .connect_with(options)
            .await?
    } else {
        if let Some(parent) = options.get_filename().parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .with_context(|| format!("creating database directory {}", parent.display()))?;
            }
        }
        let options =
            options.journal_mode(SqliteJournalMode::Wal).synchronous(SqliteSynchronous::Normal);
        SqlitePoolOptions::new().max_connections(8).connect_with(options).await?
    };

    sqlx::migrate!("./migrations").run(&pool).await.context("running database migrations")?;
    Ok(pool)
}
