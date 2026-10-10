//! Database rows and their JSON representations (camelCase on the wire).

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::money::cents_to_f64;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    pub color_hex: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "UPPERCASE")]
#[sqlx(type_name = "TEXT", rename_all = "UPPERCASE")]
pub enum RuleKind {
    Contains,
    Regex,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub category_id: String,
    #[serde(rename = "type")]
    pub kind: RuleKind,
    pub pattern: String,
    pub is_case_insensitive: bool,
    pub priority: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleWithCategory {
    #[serde(flatten)]
    pub rule: Rule,
    pub category: Category,
}

/// Row shape as stored.
#[derive(Debug, Clone, FromRow)]
pub struct TransactionRow {
    pub id: String,
    pub date: String,
    pub description: String,
    pub amount_cents: i64,
    pub currency: String,
    pub category_id: Option<String>,
}

/// API shape: `amount` is a decimal number in major units (e.g. `-10.86`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: String,
    /// Calendar date, `YYYY-MM-DD`.
    pub date: String,
    pub description: String,
    pub amount: f64,
    pub currency: String,
    pub category_id: Option<String>,
}

impl From<TransactionRow> for Transaction {
    fn from(row: TransactionRow) -> Self {
        Self {
            id: row.id,
            date: row.date,
            description: row.description,
            amount: cents_to_f64(row.amount_cents),
            currency: row.currency,
            category_id: row.category_id,
        }
    }
}

pub fn new_id() -> String {
    uuid::Uuid::now_v7().to_string()
}

pub fn now_timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
