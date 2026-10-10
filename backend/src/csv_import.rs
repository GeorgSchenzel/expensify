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
    /// Negates single-column amounts, for exports that list expenses as positive.
    #[serde(default)]
    pub invert_amount: bool,
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

/// Transforms all rows of one file. The order of ambiguous numeric dates is
/// decided once for the whole date column.
pub fn parse_rows(rows: &[RawRow], mapping: &MappingConfig) -> Vec<Result<ParsedRow, String>> {
    let order = detect_date_order(
        rows.iter().filter_map(|r| r.get(&mapping.date_column)).map(String::as_str),
    );
    rows.iter().map(|row| parse_row(row, mapping, order)).collect()
}

/// Transforms one raw CSV row according to the mapping.
fn parse_row(row: &RawRow, mapping: &MappingConfig, order: DateOrder) -> Result<ParsedRow, String> {
    let cell = |col: &str| row.get(col).map(String::as_str).unwrap_or("");

    let date = parse_date(cell(&mapping.date_column), order)?;
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

/// Single column → the signed amount as-is (negated with `invert_amount`). Credit/debit columns → credit is
/// incoming (positive), debit is outgoing (negative), regardless of the sign
/// the bank wrote into the cell.
fn extract_amount(row: &RawRow, mapping: &MappingConfig) -> Result<i64, String> {
    let read = |col: &Option<String>| -> Result<Option<i64>, String> {
        let raw = col.as_deref().and_then(|c| row.get(c)).map(|v| js_trim(v)).unwrap_or("");
        if raw.is_empty() { Ok(None) } else { parse_amount(raw).map(Some) }
    };

    match mapping.amount_mode {
        AmountMode::Single => {
            let amount = read(&mapping.amount_column)?.ok_or("Missing amount")?;
            Ok(if mapping.invert_amount { -amount } else { amount })
        }
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

/// How to read an all-numeric date whose year comes last (`03/04/2026`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum DateOrder {
    #[default]
    DayFirst,
    MonthFirst,
}

/// A trailing time part: "T10:00:00Z", " 10:00", "  8.30 Uhr" or the
/// "-19.53.13.631181" style some Austrian banks use.
static TIME_SUFFIX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:(?:T|\s+)\d{1,2}[:.]\d{2}(?:\D.*)?|-\d{1,2}\.\d{2}\.\d{2}(?:\.\d+)?)$")
        .expect("valid regex")
});

#[rustfmt::skip]
const MONTHS: &[(&str, u32)] = &[
    ("jan", 1), ("january", 1), ("januar", 1), ("jän", 1), ("jänner", 1), ("jaenner", 1),
    ("feb", 2), ("february", 2), ("februar", 2),
    ("mar", 3), ("march", 3), ("mär", 3), ("märz", 3), ("maerz", 3), ("mrz", 3),
    ("apr", 4), ("april", 4),
    ("may", 5), ("mai", 5),
    ("jun", 6), ("june", 6), ("juni", 6),
    ("jul", 7), ("july", 7), ("juli", 7),
    ("aug", 8), ("august", 8),
    ("sep", 9), ("sept", 9), ("september", 9),
    ("oct", 10), ("october", 10), ("okt", 10), ("oktober", 10),
    ("nov", 11), ("november", 11),
    ("dec", 12), ("december", 12), ("dez", 12), ("dezember", 12),
];

/// Words that may appear in a date without carrying information.
#[rustfmt::skip]
const FILLER: &[&str] = &[
    "st", "nd", "rd", "th", "of",
    "mon", "monday", "tue", "tues", "tuesday", "wed", "wednesday", "thu", "thur", "thurs",
    "thursday", "fri", "friday", "sat", "saturday", "sun", "sunday",
    "mo", "montag", "di", "dienstag", "mi", "mittwoch", "do", "donnerstag", "fr", "freitag",
    "sa", "samstag", "so", "sonntag",
];

/// A date split into its numeric parts and an optional month name.
struct DateParts<'a> {
    numbers: Vec<&'a str>,
    month_name: Option<u32>,
}

fn split_date(s: &str) -> Option<DateParts<'_>> {
    let s = TIME_SUFFIX.find(s).map_or(s, |m| &s[..m.start()]);
    let mut parts = DateParts { numbers: Vec::new(), month_name: None };
    let mut rest = s;
    while let Some(c) = rest.chars().next() {
        let token_end = |pred: fn(char) -> bool| rest.find(|c| !pred(c)).unwrap_or(rest.len());
        if c.is_ascii_digit() {
            let end = token_end(|c| c.is_ascii_digit());
            parts.numbers.push(&rest[..end]);
            rest = &rest[end..];
        } else if c.is_alphabetic() {
            let end = token_end(char::is_alphabetic);
            let word = rest[..end].to_lowercase();
            if let Some(&(_, m)) = MONTHS.iter().find(|(n, _)| *n == word) {
                if parts.month_name.replace(m).is_some() {
                    return None;
                }
            } else if !FILLER.iter().any(|f| *f == word) {
                return None;
            }
            rest = &rest[end..];
        } else if c.is_whitespace() || ".,/-'".contains(c) {
            rest = &rest[c.len_utf8()..];
        } else {
            return None;
        }
    }
    Some(parts)
}

/// Picks the order of all-numeric dates for a whole column: a value like
/// `25/12/2025` proves day-first, `12/25/2025` month-first. Without evidence,
/// or with contradicting evidence, day-first wins.
pub fn detect_date_order<'a>(values: impl IntoIterator<Item = &'a str>) -> DateOrder {
    let (mut day_first, mut month_first) = (false, false);
    for value in values {
        let Some(parts) = split_date(js_trim(value)) else { continue };
        if let (None, [a, b, _]) = (parts.month_name, parts.numbers.as_slice()) {
            if a.len() <= 2 && b.len() <= 2 {
                day_first |= a.parse::<u32>().is_ok_and(|n| n > 12);
                month_first |= b.parse::<u32>().is_ok_and(|n| n > 12);
            }
        }
    }
    if month_first && !day_first { DateOrder::MonthFirst } else { DateOrder::DayFirst }
}

/// Parses the date formats found in bank exports: ISO 8601 (with or without a
/// time), `dd.MM.yyyy`, `dd/MM/yy`, `MM/dd/yyyy` (per `order`), `yyyy/MM/dd`,
/// `yyyyMMdd` and dates with English or German month names (`12 Oct 2026`,
/// `Oct 12, 2026`, `12. Okt. 26`). Only the calendar date is kept.
pub fn parse_date(raw: &str, order: DateOrder) -> Result<NaiveDate, String> {
    let s = js_trim(raw);
    let fail = || format!("Cannot parse date: \"{s}\"");
    let parts = split_date(s).ok_or_else(fail)?;

    let num = |t: &str, max_len: usize| -> Result<u32, String> {
        if t.len() > max_len { Err(fail()) } else { t.parse().map_err(|_| fail()) }
    };
    let year = |t: &str| -> Result<i32, String> {
        match t.len() {
            4 => t.parse().map_err(|_| fail()),
            // Two-digit years: 00–69 → 2000s, 70–99 → 1900s.
            2 => t
                .parse::<i32>()
                .map(|y| if y < 70 { 2000 + y } else { 1900 + y })
                .map_err(|_| fail()),
            _ => Err(fail()),
        }
    };
    let ordered = |a: &str, b: &str| match order {
        DateOrder::DayFirst => (num(b, 2), num(a, 2)),
        DateOrder::MonthFirst => (num(a, 2), num(b, 2)),
    };

    let (y, m, d) = match (parts.month_name, parts.numbers.as_slice()) {
        (Some(m), [a, b]) if a.len() == 4 => (year(a)?, m, num(b, 2)?),
        (Some(m), [a, b]) => (year(b)?, m, num(a, 2)?),
        (None, [compact]) if compact.len() == 8 => {
            let (y, rest) = compact.split_at(4);
            match (year(y)?, num(&rest[..2], 2)?, num(&rest[2..], 2)?) {
                (y, m, d) if NaiveDate::from_ymd_opt(y, m, d).is_some() => (y, m, d),
                // ddMMyyyy / MMddyyyy
                _ => {
                    let (m, d) = ordered(&compact[..2], &compact[2..4]);
                    (year(&compact[4..])?, m?, d?)
                }
            }
        }
        (None, [y, m, d]) if y.len() == 4 => (year(y)?, num(m, 2)?, num(d, 2)?),
        (None, [a, b, y]) => {
            let (m, d) = ordered(a, b);
            (year(y)?, m?, d?)
        }
        _ => return Err(fail()),
    };
    NaiveDate::from_ymd_opt(y, m, d).ok_or_else(fail)
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
            invert_amount: false,
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
        let cases = [
            ("2026-10-12", d(2026, 10, 12)),
            (" 2026-10-12T23:59:59+02:00 ", d(2026, 10, 12)),
            ("2026-10-09-19.53.13.631181", d(2026, 10, 9)),
            ("2026-10-09 08:00", d(2026, 10, 9)),
            ("09.10.2026", d(2026, 10, 9)),
            ("09.10.2026 14:30:00", d(2026, 10, 9)),
            ("9.1.2026", d(2026, 1, 9)),
            ("31/12/2025", d(2025, 12, 31)),
            ("31-12-2025", d(2025, 12, 31)),
            ("12.10.26", d(2026, 10, 12)),
            ("01/02/99", d(1999, 2, 1)),
            ("2026/10/12", d(2026, 10, 12)),
            ("2026.10.12", d(2026, 10, 12)),
            ("20261012", d(2026, 10, 12)),
            ("12102026", d(2026, 10, 12)),
            ("12 Oct 2026", d(2026, 10, 12)),
            ("12-OCT-26", d(2026, 10, 12)),
            ("Oct 12, 2026", d(2026, 10, 12)),
            ("October 12th, 2026", d(2026, 10, 12)),
            ("Mon, 12 Oct 2026 08:30:00 +0200", d(2026, 10, 12)),
            ("12. Okt. 2026", d(2026, 10, 12)),
            ("3. März 2026", d(2026, 3, 3)),
            ("1. Jänner 2026", d(2026, 1, 1)),
            ("2026 Dez 24", d(2026, 12, 24)),
        ];
        for (input, expected) in cases {
            assert_eq!(parse_date(input, DateOrder::DayFirst), Ok(expected), "input {input:?}");
        }
    }

    #[test]
    fn month_first_order_only_affects_ambiguous_numeric_dates() {
        let us = |s| parse_date(s, DateOrder::MonthFirst);
        assert_eq!(us("10/12/2026"), Ok(d(2026, 10, 12)));
        assert_eq!(us("12/31/25"), Ok(d(2025, 12, 31)));
        assert_eq!(us("2026-10-12"), Ok(d(2026, 10, 12)));
        assert_eq!(us("12 Oct 2026"), Ok(d(2026, 10, 12)));
        assert!(us("31/12/2025").is_err());
    }

    #[test]
    fn detects_date_order_from_the_column() {
        use DateOrder::*;
        assert_eq!(detect_date_order(["01/02/2026", "03/04/2026"]), DayFirst);
        assert_eq!(detect_date_order(["01/02/2026", "25/04/2026"]), DayFirst);
        assert_eq!(detect_date_order(["01/02/2026", "04/25/2026"]), MonthFirst);
        assert_eq!(detect_date_order(["25/04/2026", "04/25/2026"]), DayFirst);
        assert_eq!(detect_date_order(["2026-04-25", "garbage"]), DayFirst);
    }

    #[test]
    fn month_first_files_parse_every_row_month_first() {
        let rows: Vec<RawRow> = ["10/12/2026", "10/13/2026"]
            .iter()
            .map(|date| row(&[("Date", date), ("Description", "x"), ("Amount", "1")]))
            .collect();
        let dates: Vec<_> =
            parse_rows(&rows, &mapping()).into_iter().map(|r| r.unwrap().date).collect();
        assert_eq!(dates, [d(2026, 10, 12), d(2026, 10, 13)]);
    }

    #[test]
    fn rejects_invalid_dates() {
        for input in [
            "",
            "yesterday",
            "2026-02-30",
            "31.02.2026",
            "13/13/2026",
            "2026-10-12abc",
            "12.10.2026x",
            "12.10",
            "12.10.202",
            "12 Foo 2026",
            "Oct Nov 2026",
            "1/2/3/2026",
        ] {
            assert!(
                parse_date(input, DateOrder::DayFirst).is_err(),
                "{input:?} should be rejected"
            );
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
        let parsed = parse_row(&r, &mapping(), DateOrder::DayFirst).unwrap();
        assert_eq!(parsed.date, d(2026, 10, 12));
        assert_eq!(parsed.description, "Rent");
        assert_eq!(parsed.amount_cents, -95000);
        assert_eq!(parsed.currency, "EUR");
    }

    #[test]
    fn invert_amount_flips_single_column_sign() {
        let m = MappingConfig { invert_amount: true, ..mapping() };
        let r = row(&[("Date", "2026-10-12"), ("Description", "x"), ("Amount", "18,25")]);
        assert_eq!(parse_row(&r, &m, DateOrder::DayFirst).map(|p| p.amount_cents), Ok(-1825));
    }

    #[test]
    fn missing_amount_is_an_error_not_zero() {
        let r = row(&[("Date", "2026-10-12"), ("Description", "x"), ("Amount", "")]);
        assert!(parse_row(&r, &mapping(), DateOrder::DayFirst).is_err());
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
            parse_row(&r, &m, DateOrder::DayFirst).map(|p| p.amount_cents)
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
            parse_row(&r, &m, DateOrder::DayFirst).map(|p| p.currency)
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
