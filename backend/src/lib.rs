//! Personal finance tracker backend: a JSON REST API under `/api` and,
//! optionally, the compiled single-page frontend.

pub mod csv_import;
pub mod db;
pub mod error;
pub mod legacy;
pub mod models;
pub mod money;
pub mod routes;
pub mod rules_engine;

use std::path::Path;

use axum::Router;
use sqlx::SqlitePool;
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

/// Builds the application. When `static_dir` is given, files from it are
/// served for every non-API path, falling back to `index.html` so that
/// client-side routes like `/transactions` survive a page reload.
pub fn app(pool: SqlitePool, static_dir: Option<&Path>) -> Router {
    let mut router = Router::new().nest("/api", routes::api_router());
    if let Some(dir) = static_dir {
        let spa = ServeDir::new(dir).fallback(ServeFile::new(dir.join("index.html")));
        router = router.fallback_service(spa);
    }
    router.layer(TraceLayer::new_for_http()).with_state(pool)
}
