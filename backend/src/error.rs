use axum::{
    Json,
    extract::rejection::JsonRejection,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use axum_extra::extract::QueryRejection;
use serde_json::json;

/// Every handler returns `Result<_, AppError>`. Errors are rendered as
/// `{"error": "<message>"}` with a matching HTTP status code.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Conflict(String),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self::BadRequest(msg.into())
    }

    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::NotFound(msg.into())
    }

    pub fn conflict(msg: impl Into<String>) -> Self {
        Self::Conflict(msg.into())
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        if let Some(db_err) = err.as_database_error() {
            // A referenced category vanished between validation and write
            // (e.g. deleted concurrently in another tab).
            if db_err.is_foreign_key_violation() {
                return Self::bad_request("Referenced category does not exist");
            }
        }
        Self::Internal(err.into())
    }
}

impl From<JsonRejection> for AppError {
    fn from(rejection: JsonRejection) -> Self {
        Self::BadRequest(rejection.body_text())
    }
}

impl From<QueryRejection> for AppError {
    fn from(rejection: QueryRejection) -> Self {
        Self::BadRequest(rejection.body_text())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::Internal(err) => {
                tracing::error!(error = ?err, "internal error");
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };
        let message = match &self {
            // Never leak internals (SQL, paths) to the client.
            Self::Internal(_) => "Internal server error".to_owned(),
            other => other.to_string(),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}
