//! Pure CSV-row → transaction transformation. No I/O.

use std::{collections::HashMap, sync::LazyLock};

use chrono::NaiveDate;
use regex::Regex;
use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::money::{js_number_string, parse_amount};

pub type RawRow = HashMap<String, String>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AmountMode {
    Single,
    CreditDebit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CurrencyMode {
    Column,
    Manual,
}

/// Which CSV column feeds which transaction field. Sent by the import wizard.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MappingConfig {
    pub date_column: String,
    pub description_column: String,
    pub amount_mode: AmountMode,
    pub amount_column: Option<String>,
    pub credit_column: Option<String>,
    pub debit_column: Option<String>,
    pub currency_mode: CurrencyMode,
    pub currency_column: Option<String>,
    pub default_currency: String,
}

impl MappingConfig {
    /// Rejects mappings that cannot produce a single valid row.
    pub fn validate(&self) -> Result<(), String> {
        let set = |c: &Option<String>| c.as_deref().is_some_and(|s| !s.is_empty());
        if self.date_column.is_empty() {
            return Err("Mapping: date column is required".into());
        }
        if self.description_column.is_empty() {
            return Err("Mapping: description column is required".into());
        }
        match self.amount_mode {
            AmountMode::Single if !set(&self.amount_column) => {
                return Err("Mapping: amount column is required".into());
            }
            AmountMode::CreditDebit if !set(&self.credit_column) && !set(&self.debit_column) => {
                return Err("Mapping: a credit or a debit column is required".into());
            }
            _ => {}
        }
        if self.currency_mode == CurrencyMode::Column && !set(&self.currency_column) {
            return Err("Mapping: currency column is required".into());
        }
        if !is_currency_code(&self.default_currency) {
            return Err(format!(
                "Mapping: \"{}\" is not a three-letter currency code",
                self.default_currency
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedRow {
    pub date: NaiveDate,
    pub description: String,
    pub amount_cents: i64,
    pub currency: String,
    pub hash: String,
}

/// Transforms one raw CSV row according to the mapping.
pub fn parse_row(row: &RawRow, mapping: &MappingConfig) -> Result<ParsedRow, String> {
    let cell = |col: &str| row.get(col).map(String::as_str).unwrap_or("");

    let date = parse_date(cell(&mapping.date_column))?;
    let description = js_trim(cell(&mapping.description_column)).to_owned();
    let amount_cents = extract_amount(row, mapping)?;

    let currency = match (mapping.currency_mode, &mapping.currency_column) {
        (CurrencyMode::Column, Some(col)) => {
            let value = js_trim(cell(col)).to_ascii_uppercase();
            if value.is_empty() { mapping.default_currency.clone() } else { value }
        }
        _ => mapping.default_currency.clone(),
    };
    if !is_currency_code(&currency) {
        return Err(format!("Invalid currency code \"{currency}\""));
    }

    let hash = transaction_hash(date, amount_cents, &description);
    Ok(ParsedRow { date, description, amount_cents, currency, hash })
}

/// Single column → the signed amount as-is. Credit/debit columns → credit is
/// incoming (positive), debit is outgoing (negative), regardless of the sign
/// the bank wrote into the cell.
fn extract_amount(row: &RawRow, mapping: &MappingConfig) -> Result<i64, String> {
    let read = |col: &Option<String>| -> Result<Option<i64>, String> {
        let raw = col.as_deref().and_then(|c| row.get(c)).map(|v| js_trim(v)).unwrap_or("");
        if raw.is_empty() { Ok(None) } else { parse_amount(raw).map(Some) }
    };

    match mapping.amount_mode {
        AmountMode::Single => read(&mapping.amount_column)?.ok_or_else(|| "Missing amount".into()),
        AmountMode::CreditDebit => {
            let credit = read(&mapping.credit_column)?;
            let debit = read(&mapping.debit_column)?;
            match (credit, debit) {
                (None, None) => Err("Missing credit and debit amount".into()),
                (Some(c), _) if c != 0 => Ok(c.abs()),
                (_, Some(d)) if d != 0 => Ok(-d.abs()),
                _ => Ok(0),
            }
        }
    }
}

static DOTTED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$").expect("valid regex"));
static SLASHED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(\d{1,2})/(\d{1,2})/(\d{4})$").expect("valid regex"));
static ISO_PREFIX: LazyLock<Regex> = LazyLock::new(|| {
    // yyyy-MM-dd, optionally followed by a time part: "T10:00", " 10:00" or the
    // "-19.53.13.631181" style some Austrian banks use.
    Regex::new(r"^(\d{4})-(\d{2})-(\d{2})(?:[T\s-]\d.*)?$").expect("valid regex")
});

/// Parses ISO 8601 (`2026-10-12`, `2026-10-12T08:30:00Z`), `dd.MM.yyyy` and
/// `dd/MM/yyyy`. Only the calendar date is kept; a time part is ignored.
pub fn parse_date(raw: &str) -> Result<NaiveDate, String> {
    let s = js_trim(raw);
    let fail = || format!("Cannot parse date: \"{s}\"");

    let ymd = |y: &str, m: &str, d: &str| -> Result<NaiveDate, String> {
        let (y, m, d) = (
            y.parse().map_err(|_| fail())?,
            m.parse().map_err(|_| fail())?,
            d.parse().map_err(|_| fail())?,
        );
        NaiveDate::from_ymd_opt(y, m, d).ok_or_else(fail)
    };

    if let Some(c) = ISO_PREFIX.captures(s) {
        return ymd(&c[1], &c[2], &c[3]);
    }
    if let Some(c) = DOTTED.captures(s).or_else(|| SLASHED.captures(s)) {
        return ymd(&c[3], &c[2], &c[1]);
    }
    Err(fail())
}

/// SHA-256 over `isoDate__amount__description` — byte-for-byte the same key
/// the original TypeScript app produced for date-only input, so previously
/// imported rows are still recognised as duplicates after migrating.
pub fn transaction_hash(date: NaiveDate, amount_cents: i64, description: &str) -> String {
    let key = format!(
        "{}T00:00:00.000Z__{}__{}",
        date.format("%Y-%m-%d"),
        js_number_string(amount_cents),
        js_trim(description)
    );
    hex::encode(Sha256::digest(key.as_bytes()))
}

pub fn is_currency_code(s: &str) -> bool {
    s.len() == 3 && s.bytes().all(|b| b.is_ascii_uppercase())
}

/// `String.prototype.trim` semantics: Unicode whitespace plus the BOM.
fn js_trim(s: &str) -> &str {
    s.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mapping() -> MappingConfig {
        MappingConfig {
            date_column: "Date".into(),
            description_column: "Description".into(),
            amount_mode: AmountMode::Single,
            amount_column: Some("Amount".into()),
            credit_column: None,
            debit_column: None,
            currency_mode: CurrencyMode::Manual,
            currency_column: None,
            default_currency: "EUR".into(),
        }
    }

    fn row(pairs: &[(&str, &str)]) -> RawRow {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    fn d(y: i32, m: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, day).unwrap()
    }

    #[test]
    fn parses_supported_date_formats() {
        assert_eq!(parse_date("2026-10-12"), Ok(d(2026, 10, 12)));
        assert_eq!(parse_date(" 2026-10-12T23:59:59+02:00 "), Ok(d(2026, 10, 12)));
        assert_eq!(parse_date("2026-10-09-19.53.13.631181"), Ok(d(2026, 10, 9)));
        assert_eq!(parse_date("2026-10-09 08:00"), Ok(d(2026, 10, 9)));
        assert_eq!(parse_date("09.10.2026"), Ok(d(2026, 10, 9)));
        assert_eq!(parse_date("9.1.2026"), Ok(d(2026, 1, 9)));
        assert_eq!(parse_date("31/12/2025"), Ok(d(2025, 12, 31)));
    }

    #[test]
    fn rejects_invalid_dates() {
        for input in
            ["", "yesterday", "2026-02-30", "31.02.2026", "13/13/2026", "2026-10-12abc", "12.10.26"]
        {
            assert!(parse_date(input).is_err(), "{input:?} should be rejected");
        }
    }

    /// Expected values were produced by the original TypeScript implementation:
    /// `generateTransactionHash(new Date("2026-10-12"), -10.86, "LIDL DANKT ")` and
    /// `generateTransactionHash(new Date("2026-04-17"), -12.8, "Coffee")`.
    #[test]
    fn hash_matches_original_app() {
        assert_eq!(
            transaction_hash(d(2026, 10, 12), -1086, "LIDL DANKT "),
            "6ab9099711d13aec95e5ec7be21286cfe0cc9f4436218e2362f5494c503beb28"
        );
        assert_eq!(
            transaction_hash(d(2026, 4, 17), -1280, "Coffee"),
            "d18aa7edfb959364e2e4401d32a67eca23e325ef1cc413df8dcf784e543fb7fd"
        );
    }

    #[test]
    fn single_amount_row() {
        let r = row(&[("Date", "2026-10-12"), ("Description", "  Rent "), ("Amount", "-950,00")]);
        let parsed = parse_row(&r, &mapping()).unwrap();
        assert_eq!(parsed.date, d(2026, 10, 12));
        assert_eq!(parsed.description, "Rent");
        assert_eq!(parsed.amount_cents, -95000);
        assert_eq!(parsed.currency, "EUR");
    }

    #[test]
    fn missing_amount_is_an_error_not_zero() {
        let r = row(&[("Date", "2026-10-12"), ("Description", "x"), ("Amount", "")]);
        assert!(parse_row(&r, &mapping()).is_err());
    }

    #[test]
    fn credit_debit_columns_set_the_sign() {
        let m = MappingConfig {
            amount_mode: AmountMode::CreditDebit,
            amount_column: None,
            credit_column: Some("In".into()),
            debit_column: Some("Out".into()),
            ..mapping()
        };
        let base = [("Date", "2026-10-12"), ("Description", "x")];
        let with = |extra: &[(&str, &str)]| {
            let mut r = row(&base);
            r.extend(row(extra));
            parse_row(&r, &m).map(|p| p.amount_cents)
        };
        assert_eq!(with(&[("In", "100,00"), ("Out", "")]), Ok(10000));
        assert_eq!(with(&[("In", ""), ("Out", "25,50")]), Ok(-2550));
        assert_eq!(with(&[("In", ""), ("Out", "-25,50")]), Ok(-2550));
        assert_eq!(with(&[("In", "0,00"), ("Out", "4,20")]), Ok(-420));
        assert_eq!(with(&[("In", "0"), ("Out", "")]), Ok(0));
        assert!(with(&[("In", ""), ("Out", "")]).is_err());
    }

    #[test]
    fn currency_from_column() {
        let m = MappingConfig {
            currency_mode: CurrencyMode::Column,
            currency_column: Some("Cur".into()),
            ..mapping()
        };
        let base = [("Date", "2026-10-12"), ("Description", "x"), ("Amount", "1")];
        let with = |cur: &str| {
            let mut r = row(&base);
            r.insert("Cur".into(), cur.into());
            parse_row(&r, &m).map(|p| p.currency)
        };
        assert_eq!(with(" usd "), Ok("USD".into()));
        assert_eq!(with(""), Ok("EUR".into()));
        assert!(with("Euro").is_err());
    }

    #[test]
    fn validates_mapping() {
        assert!(mapping().validate().is_ok());
        assert!(MappingConfig { amount_column: None, ..mapping() }.validate().is_err());
        assert!(MappingConfig { date_column: String::new(), ..mapping() }.validate().is_err());
        assert!(MappingConfig { default_currency: "EU".into(), ..mapping() }.validate().is_err());
    }
}
