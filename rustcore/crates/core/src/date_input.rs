//! Resolved-instant validation ported from `src/date-input.ts` (MIT).
//!
//! ISO input is parsed in Rust, with integer proleptic Gregorian calendar
//! arithmetic. No host locale, time zone or JavaScript parser is consulted.

use std::fmt;

const DATE_LIMIT_MILLIS: i64 = 8_640_000_000_000_000;
const MILLIS_PER_DAY: i64 = 86_400_000;

/// An invalid resolved instant. The TypeScript boundary adds the input label.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DateError;

impl fmt::Display for DateError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Invalid resolved instant.")
    }
}

impl std::error::Error for DateError {}

/// Apply JavaScript Date's TimeClip operation to epoch milliseconds.
pub fn date_from_millis(value: f64) -> Result<f64, DateError> {
    if !value.is_finite() || value.abs() > DATE_LIMIT_MILLIS as f64 {
        return Err(DateError);
    }
    let millis = value.trunc();
    // TimeClip returns positive zero even for negative fractional timestamps.
    Ok(if millis == 0.0 { 0.0 } else { millis })
}

/// Parse the strict ISO calendar date or resolved date-time grammar of dateFrom.
///
/// Date-only strings mean UTC midnight. Date-times require an explicit offset;
/// fractions may have one to three digits, and leap seconds are not accepted.
pub fn date_from_iso(value: &str) -> Result<f64, DateError> {
    let mut input = IsoParser {
        bytes: value.as_bytes(),
        cursor: 0,
    };
    let year = match input.peek() {
        Some(b'+') | Some(b'-') => {
            let negative = input.peek() == Some(b'-');
            input.cursor += 1;
            let magnitude = input.digits(6)?;
            if negative && magnitude == 0 {
                return Err(DateError);
            }
            if negative {
                -magnitude
            } else {
                magnitude
            }
        }
        _ => input.digits(4)?,
    };
    input.expect(b'-')?;
    let month = input.digits(2)?;
    input.expect(b'-')?;
    let day = input.digits(2)?;
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let month_days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    if !(1..=12).contains(&month) || !(1..=month_days[(month - 1) as usize]).contains(&day) {
        return Err(DateError);
    }

    let mut clock_millis = 0;
    let mut offset_millis = 0;
    if input.peek().is_some() {
        input.expect(b'T')?;
        let hour = input.digits(2)?;
        input.expect(b':')?;
        let minute = input.digits(2)?;
        if hour > 23 || minute > 59 {
            return Err(DateError);
        }
        clock_millis = (hour * 60 + minute) * 60_000;

        if input.peek() == Some(b':') {
            input.cursor += 1;
            let second = input.digits(2)?;
            if second > 59 {
                return Err(DateError);
            }
            clock_millis += second * 1_000;
            if input.peek() == Some(b'.') {
                input.cursor += 1;
                let mut fraction = input.digits(1)? * 100;
                if input.peek().is_some_and(|byte| byte.is_ascii_digit()) {
                    fraction += input.digits(1)? * 10;
                }
                if input.peek().is_some_and(|byte| byte.is_ascii_digit()) {
                    fraction += input.digits(1)?;
                }
                clock_millis += fraction;
            }
        }

        match input.peek() {
            Some(b'Z') => input.cursor += 1,
            Some(b'+') | Some(b'-') => {
                let west = input.peek() == Some(b'-');
                input.cursor += 1;
                let hour = input.digits(2)?;
                input.expect(b':')?;
                let minute = input.digits(2)?;
                if hour > 23 || minute > 59 {
                    return Err(DateError);
                }
                offset_millis = (hour * 60 + minute) * 60_000;
                if west {
                    offset_millis = -offset_millis;
                }
            }
            _ => return Err(DateError),
        }
    }
    if input.cursor != input.bytes.len() {
        return Err(DateError);
    }

    // Count whole years since year zero, with floor division extending the
    // Gregorian leap-year rule into negative years. 1970-01-01 is day 719528
    // on this scale. The accepted six-digit year fits every intermediate in i64.
    let days_before_year = 365 * year + (year + 3).div_euclid(4) - (year + 99).div_euclid(100)
        + (year + 399).div_euclid(400);
    let before_month = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let days =
        days_before_year + before_month[(month - 1) as usize] + i64::from(leap && month > 2) + day
            - 1
            - 719_528;
    let millis = days * MILLIS_PER_DAY + clock_millis - offset_millis;
    if millis.abs() > DATE_LIMIT_MILLIS {
        return Err(DateError);
    }
    // Every accepted integral millisecond is within binary64's exact range.
    Ok(millis as f64)
}

struct IsoParser<'a> {
    bytes: &'a [u8],
    cursor: usize,
}

impl IsoParser<'_> {
    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.cursor).copied()
    }

    fn expect(&mut self, expected: u8) -> Result<(), DateError> {
        if self.peek() != Some(expected) {
            return Err(DateError);
        }
        self.cursor += 1;
        Ok(())
    }

    fn digits(&mut self, count: usize) -> Result<i64, DateError> {
        let mut result = 0;
        for _ in 0..count {
            let byte = self.peek().filter(u8::is_ascii_digit).ok_or(DateError)?;
            result = result * 10 + i64::from(byte - b'0');
            self.cursor += 1;
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::{date_from_iso, date_from_millis, DateError, DATE_LIMIT_MILLIS, MILLIS_PER_DAY};

    #[test]
    fn clips_fractional_milliseconds_and_discards_negative_zero() {
        for (value, expected) in [
            (0.0_f64, 0.0_f64),
            (-0.0, 0.0),
            (-0.999, 0.0),
            (0.999, 0.0),
            (-1.999, -1.0),
            (1.999, 1.0),
            (f64::from_bits(1), 0.0),
            (-f64::from_bits(1), 0.0),
        ] {
            assert_eq!(
                date_from_millis(value).unwrap().to_bits(),
                expected.to_bits()
            );
        }
    }

    #[test]
    fn clips_the_date_range_before_truncation() {
        let limit = DATE_LIMIT_MILLIS as f64;
        for value in [limit, -limit, limit - 1.0, -limit + 1.0] {
            assert_eq!(date_from_millis(value), Ok(value));
        }
        for value in [
            limit + 1.0,
            -limit - 1.0,
            f64::MAX,
            f64::NAN,
            f64::INFINITY,
            f64::NEG_INFINITY,
        ] {
            assert_eq!(date_from_millis(value), Err(DateError));
        }
    }

    #[test]
    fn parses_utc_offset_and_fraction_forms_as_integral_milliseconds() {
        for text in [
            "1970-01-01",
            "1970-01-01T00:00Z",
            "1970-01-01T00:00:00Z",
            "1970-01-01T00:00+00:00",
            "1970-01-01T00:00-00:00",
            "1970-01-01T23:59+23:59",
            "1969-12-31T00:01-23:59",
        ] {
            assert_eq!(
                date_from_iso(text).unwrap().to_bits(),
                0.0_f64.to_bits(),
                "{text}"
            );
        }
        for (text, expected) in [
            ("1970-01-01T00:00:00.1Z", 100.0),
            ("1970-01-01T00:00:00.12Z", 120.0),
            ("1970-01-01T00:00:00.123Z", 123.0),
            ("1969-12-31T23:59:59.999Z", -1.0),
            ("2000-01-01T12:00Z", 946_728_000_000.0),
        ] {
            assert_eq!(date_from_iso(text), Ok(expected), "{text}");
        }
    }

    #[test]
    fn preserves_astronomical_year_numbering_and_gregorian_leap_rules() {
        // Regression values from Node 22 Date parsing, not accuracy evidence.
        for (text, expected) in [
            ("0000-01-01", -62_167_219_200_000.0),
            ("+000000-01-01", -62_167_219_200_000.0),
            ("0000-02-29", -62_162_121_600_000.0),
            ("0099-12-31", -59_011_545_600_000.0),
            ("-000001-01-01", -62_198_755_200_000.0),
            ("-000004-02-29", -62_288_352_000_000.0),
        ] {
            assert_eq!(date_from_iso(text), Ok(expected), "{text}");
        }
        for (february, march, days) in [
            ("1800-02-28", "1800-03-01", 1),
            ("1900-02-28", "1900-03-01", 1),
            ("2000-02-28", "2000-03-01", 2),
            ("2100-02-28", "2100-03-01", 1),
            ("-000400-02-28", "-000400-03-01", 2),
            ("-000100-02-28", "-000100-03-01", 1),
        ] {
            assert_eq!(
                date_from_iso(march).unwrap() - date_from_iso(february).unwrap(),
                (days * MILLIS_PER_DAY) as f64
            );
        }
    }

    #[test]
    fn applies_the_offset_before_testing_the_representable_range() {
        for text in [
            "+275760-09-13",
            "+275760-09-13T01:00+01:00",
            "+275760-09-13T23:59+23:59",
        ] {
            assert_eq!(date_from_iso(text), Ok(DATE_LIMIT_MILLIS as f64), "{text}");
        }
        for text in ["-271821-04-20", "-271821-04-19T23:59-00:01"] {
            assert_eq!(
                date_from_iso(text),
                Ok(-(DATE_LIMIT_MILLIS as f64)),
                "{text}"
            );
        }
        for text in [
            "+275760-09-13T00:00:00.001Z",
            "-271821-04-19T23:59:59.999Z",
            "+999999-01-01",
            "-999999-12-31",
        ] {
            assert_eq!(date_from_iso(text), Err(DateError), "{text}");
        }
    }

    #[test]
    fn rejects_rollovers_unresolved_times_and_noncanonical_syntax() {
        for text in [
            "",
            "1970",
            "1970-1-01",
            "1970-01-1",
            "1970-00-01",
            "1970-13-01",
            "1970-01-00",
            "1970-01-32",
            "2000-04-31",
            "1900-02-29",
            "2100-02-29",
            "-000100-02-29",
            "-000000-01-01",
            "+1970-01-01",
            "+0019700-01-01",
            "-00197-01-01",
            "1970-01-01Z",
            "1970-01-01T00:00",
            "1970-01-01 00:00Z",
            "1970-01-01t00:00Z",
            "1970-01-01T00:00z",
            "1970-01-01T24:00Z",
            "1970-01-01T00:60Z",
            "1970-01-01T00:00:60Z",
            "1970-01-01T00:00:00.Z",
            "1970-01-01T00:00:00.1234Z",
            "1970-01-01T00:00.123Z",
            "1970-01-01T00:00+24:00",
            "1970-01-01T00:00+00:60",
            "1970-01-01T00:00+0000",
            "1970-01-01T00:00+00",
            "1970-01-01\n",
            "1970-01-01\r\n",
            "1970-01-01\0",
            " 1970-01-01",
            "1970-01-01 ",
            "１９７０-01-01",
            "1970-٠١-01",
            "01/01/1970",
        ] {
            assert_eq!(date_from_iso(text), Err(DateError), "{text:?}");
        }
    }

    #[test]
    fn refuses_every_truncated_datetime_except_complete_grammar_forms() {
        let text = "+001970-01-01T01:02:03.004+05:06";
        for end in 0..text.len() {
            if end == 13 {
                assert_eq!(date_from_iso(&text[..end]), Ok(0.0));
            } else {
                assert_eq!(
                    date_from_iso(&text[..end]),
                    Err(DateError),
                    "{}",
                    &text[..end]
                );
            }
        }
        assert!(date_from_iso(text).is_ok());
    }
}
