use std::{
    net::SocketAddr,
    path::{Path, PathBuf},
};

use anyhow::Context;
use tracing_subscriber::EnvFilter;

const DEFAULT_DATABASE_URL: &str = "sqlite://data/fin.db";
const DEFAULT_BIND_ADDR: &str = "127.0.0.1:3030";

/// Configuration via environment variables:
/// - `DATABASE_URL` (default `sqlite://data/fin.db`, relative to the working directory)
/// - `BIND_ADDR`    (default `127.0.0.1:3030`)
/// - `STATIC_DIR`   (optional; directory of the built frontend to serve)
/// - `RUST_LOG`     (default `info`)
///
/// `fin-backend import-legacy <old-sqlite.db>` copies data from a database of
/// the original Next.js app into `DATABASE_URL` and exits.
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,sqlx=warn")),
        )
        .init();

    let database_url = env_or("DATABASE_URL", DEFAULT_DATABASE_URL);

    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.as_slice() {
        [] => {}
        [cmd, path] if cmd == "import-legacy" => {
            let pool = fin_backend::db::connect(&database_url).await?;
            let report = fin_backend::legacy::import_legacy(&pool, Path::new(path)).await?;
            pool.close().await;
            println!(
                "Imported {} categories, {} rules, {} transactions into {database_url}",
                report.categories, report.rules, report.transactions
            );
            return Ok(());
        }
        _ => anyhow::bail!("usage: fin-backend [import-legacy <old-sqlite.db>]"),
    }
    let bind_addr: SocketAddr = env_or("BIND_ADDR", DEFAULT_BIND_ADDR)
        .parse()
        .context("BIND_ADDR must look like 127.0.0.1:3030")?;
    let static_dir = std::env::var_os("STATIC_DIR").filter(|v| !v.is_empty()).map(PathBuf::from);

    if let Some(dir) = &static_dir {
        anyhow::ensure!(
            dir.join("index.html").is_file(),
            "STATIC_DIR {} does not contain index.html — build the frontend first",
            dir.display()
        );
    }

    let pool = fin_backend::db::connect(&database_url).await?;
    let app = fin_backend::app(pool.clone(), static_dir.as_deref());

    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .with_context(|| format!("binding {bind_addr}"))?;
    tracing::info!(%database_url, "listening on http://{bind_addr}");
    if let Some(dir) = &static_dir {
        tracing::info!("serving frontend from {}", dir.display());
    }

    axum::serve(listener, app).with_graceful_shutdown(shutdown_signal()).await?;
    pool.close().await;
    Ok(())
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).ok().filter(|v| !v.is_empty()).unwrap_or_else(|| default.to_owned())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c().await.expect("install Ctrl+C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }
    tracing::info!("shutting down");
}
