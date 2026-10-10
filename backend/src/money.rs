//! Exact decimal handling for money. Amounts are stored as `i64` cents.

/// Parses an amount as it appears in bank CSV exports into cents.
///
/// Accepts both decimal conventions (`1.234,56` and `1,234.56`), surrounding
/// whitespace and currency symbols (`€ 12,50`, `12.50 EUR`), a leading `+`/`-`
/// (or the Unicode minus `−`), a trailing `-` (`12,50-`) and accounting
/// parentheses (`(12.50)`).
///
/// Rejects anything it cannot interpret unambiguously instead of guessing:
/// a single separator followed by exactly three digits (`1.000` could be one
/// or one thousand) and more than two non-zero decimal places.
pub fn parse_amount(raw: &str) -> Result<i64, String> {
    let err = |reason: &str| format!("Cannot parse amount \"{}\": {reason}", raw.trim());

    let compact: String = raw
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '\'')
        .map(|c| if c == '\u{2212}' { '-' } else { c })
        .collect();
    let s = compact.trim_matches(|c: char| !(c.is_ascii_digit() || "+-.,()".contains(c)));
    if s.is_empty() {
        return Err(err("no digits"));
    }

    let (negative, body) = split_sign(s).ok_or_else(|| err("invalid sign"))?;
    if body.is_empty() || !body.chars().all(|c| c.is_ascii_digit() || c == '.' || c == ',') {
        return Err(err("unexpected characters"));
    }
    if !body.chars().any(|c| c.is_ascii_digit()) {
        return Err(err("no digits"));
    }

    let (int_part, frac_part) = split_decimal(body).map_err(|reason| err(&reason))?;

    if frac_part.len() > 2 && frac_part[2..].chars().any(|c| c != '0') {
        return Err(err("more than two decimal places"));
    }
    let frac2: String = frac_part.chars().chain("00".chars()).take(2).collect();

    let int_value: i64 = if int_part.is_empty() {
        0
    } else {
        int_part.parse().map_err(|_| err("number too large"))?
    };
    let frac_value: i64 = frac2.parse().expect("two ASCII digits");
    let cents = int_value
        .checked_mul(100)
        .and_then(|v| v.checked_add(frac_value))
        .ok_or_else(|| err("number too large"))?;

    Ok(if negative { -cents } else { cents })
}

/// Returns `(is_negative, unsigned_body)` or `None` for conflicting signs.
fn split_sign(s: &str) -> Option<(bool, &str)> {
    if let Some(inner) = s.strip_prefix('(').and_then(|r| r.strip_suffix(')')) {
        return (!inner.contains(['(', ')', '+', '-'])).then_some((true, inner));
    }
    let (mut negative, mut body) = (false, s);
    if let Some(rest) = body.strip_prefix('-') {
        (negative, body) = (true, rest);
    } else if let Some(rest) = body.strip_prefix('+') {
        body = rest;
    }
    if let Some(rest) = body.strip_suffix('-') {
        if negative || s.starts_with('+') {
            return None;
        }
        (negative, body) = (true, rest);
    }
    (!body.contains(['(', ')', '+', '-'])).then_some((negative, body))
}

/// Splits `body` (digits, `.` and `,` only) into integer digits and fraction digits.
fn split_decimal(body: &str) -> Result<(String, String), String> {
    let dots = body.matches('.').count();
    let commas = body.matches(',').count();

    let (decimal_sep, group_sep) = match (dots, commas) {
        (0, 0) => (None, None),
        (_, 0) | (0, _) => {
            let sep = if dots > 0 { '.' } else { ',' };
            let count = dots.max(commas);
            if count > 1 {
                (None, Some(sep))
            } else {
                let digits_after = body.len() - body.find(sep).expect("present") - 1;
                if digits_after == 3 {
                    return Err(format!(
                        "ambiguous separator '{sep}' (thousands or decimal?); use two decimal places"
                    ));
                }
                (Some(sep), None)
            }
        }
        _ => {
            let last_dot = body.rfind('.').expect("present");
            let last_comma = body.rfind(',').expect("present");
            if last_dot > last_comma { (Some('.'), Some(',')) } else { (Some(','), Some('.')) }
        }
    };

    let (int_raw, frac_raw) = match decimal_sep {
        Some(sep) => {
            let idx = body.rfind(sep).expect("present");
            if body[..idx].contains(sep) {
                return Err("multiple decimal separators".to_owned());
            }
            (&body[..idx], &body[idx + 1..])
        }
        None => (body, ""),
    };
    if let Some(group) = group_sep {
        if frac_raw.contains(group) {
            return Err("thousands separator after decimal separator".to_owned());
        }
    }

    let int_digits = match group_sep {
        Some(group) => {
            let groups: Vec<&str> = int_raw.split(group).collect();
            let first_ok = (1..=3).contains(&groups[0].len());
            let rest_ok = groups[1..].iter().all(|g| g.len() == 3);
            if !first_ok || !rest_ok {
                return Err("misplaced thousands separator".to_owned());
            }
            groups.concat()
        }
        None => int_raw.to_owned(),
    };

    Ok((int_digits, frac_raw.to_owned()))
}

/// Which way to round a user-supplied filter bound that has sub-cent precision.
#[derive(Debug, Clone, Copy)]
pub enum Round {
    Floor,
    Ceil,
}

/// Parses a plain decimal number typed into a filter field (`-500`, `12.5`,
/// `0,125`) into cents, rounding sub-cent remainders in the given direction so
/// that `amount >= min` / `amount <= max` keep their exact meaning.
pub fn parse_bound(raw: &str, round: Round) -> Result<i64, String> {
    let err = || format!("Invalid amount \"{raw}\"");
    let s = raw.trim().replace(',', ".");
    let (negative, body) = match s.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, s.strip_prefix('+').unwrap_or(&s)),
    };
    let (int_part, frac_part) = body.split_once('.').unwrap_or((body, ""));
    let digits_ok = |p: &str| p.chars().all(|c| c.is_ascii_digit());
    if (int_part.is_empty() && frac_part.is_empty())
        || !digits_ok(int_part)
        || !digits_ok(frac_part)
    {
        return Err(err());
    }

    let int_value: i64 =
        if int_part.is_empty() { 0 } else { int_part.parse().map_err(|_| err())? };
    let frac2: String = frac_part.chars().chain("00".chars()).take(2).collect();
    let has_remainder = frac_part.chars().skip(2).any(|c| c != '0');
    let magnitude = int_value
        .checked_mul(100)
        .and_then(|v| v.checked_add(frac2.parse::<i64>().expect("two ASCII digits")))
        .ok_or_else(err)?;

    let signed = if negative { -magnitude } else { magnitude };
    Ok(match (has_remainder, round, negative) {
        (false, _, _) => signed,
        // Positive values truncate towards zero (down); negative values truncate up.
        (true, Round::Ceil, false) => signed + 1,
        (true, Round::Floor, true) => signed - 1,
        (true, _, _) => signed,
    })
}

/// Formats cents the way JavaScript's `Number.prototype.toString` prints the
/// equivalent decimal (`-1280` → `"-12.8"`, `10000` → `"100"`). Used for the
/// deduplication hash so it stays identical to hashes created by the old app.
pub fn js_number_string(cents: i64) -> String {
    let abs = cents.unsigned_abs();
    let (int, frac) = (abs / 100, abs % 100);
    let sign = if cents < 0 { "-" } else { "" };
    match frac {
        0 => format!("{sign}{int}"),
        f if f % 10 == 0 => format!("{sign}{int}.{}", f / 10),
        f => format!("{sign}{int}.{f:02}"),
    }
}

/// Converts cents to a JSON-friendly decimal number. Division of an exactly
/// representable integer is correctly rounded, so `-1086` becomes `-10.86`.
pub fn cents_to_f64(cents: i64) -> f64 {
    cents as f64 / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_common_formats() {
        let cases = [
            ("-10,86", -1086),
            ("10.86", 1086),
            ("100", 10000),
            ("+3,5", 350),
            ("0,00", 0),
            ("-0,00", 0),
            ("1.234,56", 123456),
            ("1,234.56", 123456),
            ("-1.234.567,89", -123456789),
            ("1.234.567", 123456700),
            ("12 345,67", 1234567),
            ("12\u{a0}345,67", 1234567),
            ("1'234.50", 123450),
            ("€ 12,50", 1250),
            ("12,50 EUR", 1250),
            ("EUR -12,50", -1250),
            ("12,50-", -1250),
            ("(12.50)", -1250),
            ("\u{2212}7,10", -710),
            (",5", 50),
            ("5.", 500),
            ("12.500,00", 1250000),
            ("  -36,78  ", -3678),
        ];
        for (input, expected) in cases {
            assert_eq!(parse_amount(input), Ok(expected), "input {input:?}");
        }
    }

    #[test]
    fn rejects_garbage_and_ambiguity() {
        for input in [
            "",
            "   ",
            "abc",
            "1.000",
            "1,234",
            "12.345",
            "1.2.3,4",
            "1,2,3.4.5",
            "1.23,4.5",
            "--5",
            "-5-",
            "+5-",
            "(5",
            "12a34",
            "1.23,456,78",
            "10.123",
            "99999999999999999999",
        ] {
            assert!(parse_amount(input).is_err(), "input {input:?} should be rejected");
        }
    }

    #[test]
    fn bounds_round_in_the_requested_direction() {
        assert_eq!(parse_bound("-500", Round::Ceil), Ok(-50000));
        assert_eq!(parse_bound("12.5", Round::Floor), Ok(1250));
        assert_eq!(parse_bound("0,29", Round::Floor), Ok(29));
        assert_eq!(parse_bound("0.125", Round::Ceil), Ok(13));
        assert_eq!(parse_bound("0.125", Round::Floor), Ok(12));
        assert_eq!(parse_bound("-0.125", Round::Ceil), Ok(-12));
        assert_eq!(parse_bound("-0.125", Round::Floor), Ok(-13));
        assert_eq!(parse_bound(".5", Round::Floor), Ok(50));
        assert!(parse_bound("", Round::Floor).is_err());
        assert!(parse_bound("1e5", Round::Floor).is_err());
        assert!(parse_bound("-", Round::Floor).is_err());
    }

    #[test]
    fn formats_like_javascript() {
        assert_eq!(js_number_string(-1280), "-12.8");
        assert_eq!(js_number_string(-1086), "-10.86");
        assert_eq!(js_number_string(10000), "100");
        assert_eq!(js_number_string(5), "0.05");
        assert_eq!(js_number_string(-5), "-0.05");
        assert_eq!(js_number_string(0), "0");
        assert_eq!(js_number_string(-31863), "-318.63");
    }

    #[test]
    fn converts_cents_to_float() {
        assert_eq!(cents_to_f64(-1086), -10.86);
        assert_eq!(cents_to_f64(12), 0.12);
    }
}
