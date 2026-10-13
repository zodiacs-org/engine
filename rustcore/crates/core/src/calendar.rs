//! Julian and proleptic Gregorian civil dates, ported from `src/civil-calendar.ts`.
//!
//! The arithmetic retains the TypeScript source's binary64 operation order and
//! floor division. These helpers do not interpret a date's time or time zone.

/// A civil date represented in the same numeric fields as the TypeScript API.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CivilDate {
    pub year: f64,
    pub month: f64,
    pub day: f64,
}

/// The calendar in which a civil date is written.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Calendar {
    Gregorian,
    Julian,
}

fn leap_year(year: f64, calendar: Calendar) -> bool {
    year % 4.0 == 0.0
        && (calendar == Calendar::Julian || year % 100.0 != 0.0 || year % 400.0 == 0.0)
}

/// Parse exactly `YYYY-MM-DD`, with an ASCII four-digit year, in the calendar.
pub fn parse_calendar_date(value: &str, calendar: Calendar) -> Option<CivilDate> {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    if !bytes[..4].iter().all(u8::is_ascii_digit)
        || !bytes[5..7].iter().all(u8::is_ascii_digit)
        || !bytes[8..].iter().all(u8::is_ascii_digit)
    {
        return None;
    }
    let decimal = |digits: &[u8]| {
        digits
            .iter()
            .fold(0.0, |number, digit| number * 10.0 + f64::from(digit - b'0'))
    };
    let year = decimal(&bytes[..4]);
    let month = decimal(&bytes[5..7]);
    let day = decimal(&bytes[8..]);
    if !(1.0..=12.0).contains(&month) || day < 1.0 {
        return None;
    }
    let days = if month == 2.0 {
        if leap_year(year, calendar) {
            29.0
        } else {
            28.0
        }
    } else if [4.0, 6.0, 9.0, 11.0].contains(&month) {
        30.0
    } else {
        31.0
    };
    (day <= days).then_some(CivilDate { year, month, day })
}

/// Julian Day Number of a civil date, preserving the source's floor divisions.
///
/// Like the TypeScript helper, this numeric kernel does not validate its input.
pub fn julian_day_number(date: CivilDate, calendar: Calendar) -> f64 {
    let a = ((14.0 - date.month) / 12.0).floor();
    let y = date.year + 4800.0 - a;
    let m = date.month + 12.0 * a - 3.0;
    let base = date.day + ((153.0 * m + 2.0) / 5.0).floor() + 365.0 * y + (y / 4.0).floor();
    match calendar {
        Calendar::Julian => base - 32083.0,
        Calendar::Gregorian => base - (y / 100.0).floor() + (y / 400.0).floor() - 32045.0,
    }
}

fn from_day_number(c: f64, centuries: f64) -> CivilDate {
    let d = ((4.0 * c + 3.0) / 1461.0).floor();
    let e = c - ((1461.0 * d) / 4.0).floor();
    let m = ((5.0 * e + 2.0) / 153.0).floor();
    CivilDate {
        day: e - ((153.0 * m + 2.0) / 5.0).floor() + 1.0,
        month: m + 3.0 - 12.0 * (m / 10.0).floor(),
        year: 100.0 * centuries + d - 4800.0 + (m / 10.0).floor(),
    }
}

/// Civil date of a Julian Day Number in the calendar, without input validation.
pub fn civil_date_of(jdn: f64, calendar: Calendar) -> CivilDate {
    match calendar {
        Calendar::Julian => from_day_number(jdn + 32082.0, 0.0),
        Calendar::Gregorian => {
            let a = jdn + 32044.0;
            let b = ((4.0 * a + 3.0) / 146097.0).floor();
            from_day_number(a - ((146097.0 * b) / 4.0).floor(), b)
        }
    }
}

/// Format finite integer civil fields as `YYYY-MM-DD`, for years 0000 to 9999.
///
/// The native domain requires month 1 to 12 and day 1 to 31. This is formatting,
/// not calendar validation: February 31 remains printable. The TypeScript
/// wrapper retains JavaScript string formatting for fields outside this domain.
pub fn format(date: CivilDate) -> Option<String> {
    if [date.year, date.month, date.day]
        .iter()
        .any(|field| !field.is_finite() || field.fract() != 0.0)
        || !(0.0..=9999.0).contains(&date.year)
        || !(1.0..=12.0).contains(&date.month)
        || !(1.0..=31.0).contains(&date.day)
    {
        return None;
    }
    Some(format!(
        "{:04}-{:02}-{:02}",
        date.year as u32, date.month as u32, date.day as u32
    ))
}

/// Convert a Julian calendar date to a proleptic Gregorian date.
///
/// Returns `None` for invalid input or a result outside the four-digit years.
pub fn julian_to_gregorian(value: &str) -> Option<String> {
    let date = parse_calendar_date(value, Calendar::Julian)?;
    format(civil_date_of(
        julian_day_number(date, Calendar::Julian),
        Calendar::Gregorian,
    ))
}

/// Convert a proleptic Gregorian date to a Julian calendar date.
///
/// Returns `None` for invalid input or a result outside the four-digit years.
pub fn gregorian_to_julian(value: &str) -> Option<String> {
    let date = parse_calendar_date(value, Calendar::Gregorian)?;
    format(civil_date_of(
        julian_day_number(date, Calendar::Gregorian),
        Calendar::Julian,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(year: i32, month: u32, day: u32) -> CivilDate {
        CivilDate {
            year: f64::from(year),
            month: f64::from(month),
            day: f64::from(day),
        }
    }

    fn assert_date_bits(actual: CivilDate, expected: CivilDate) {
        assert_eq!(actual.year.to_bits(), expected.year.to_bits(), "year");
        assert_eq!(actual.month.to_bits(), expected.month.to_bits(), "month");
        assert_eq!(actual.day.to_bits(), expected.day.to_bits(), "day");
    }

    #[test]
    fn parser_checks_shape_and_calendar_validity() {
        for calendar in [Calendar::Gregorian, Calendar::Julian] {
            for value in [
                "",
                "2000-1-01",
                "2000-01-1",
                "+2000-01-01",
                "-0001-01-01",
                "20000-01-01",
                "2000/01/01",
                "2000-00-01",
                "2000-13-01",
                "2000-01-00",
                "2000-01-32",
                "2000-04-31",
                "2000-02-30",
                "2001-02-29",
                " 2000-01-01",
                "2000-01-01\n",
                "２０００-01-01",
                "2000-٠١-01",
                "2000-01-0a",
            ] {
                assert_eq!(parse_calendar_date(value, calendar), None, "{value:?}");
            }
            assert_eq!(
                parse_calendar_date("0000-02-29", calendar),
                Some(date(0, 2, 29))
            );
            assert_eq!(
                parse_calendar_date("9999-12-31", calendar),
                Some(date(9999, 12, 31))
            );
        }
        for year in [1800, 1900, 2100, 2200] {
            let input = format!("{year}-02-29");
            assert_eq!(parse_calendar_date(&input, Calendar::Gregorian), None);
            assert_eq!(
                parse_calendar_date(&input, Calendar::Julian),
                Some(date(year, 2, 29))
            );
        }
        for calendar in [Calendar::Gregorian, Calendar::Julian] {
            assert_eq!(
                parse_calendar_date("2000-02-29", calendar),
                Some(date(2000, 2, 29))
            );
        }
    }

    #[test]
    fn every_civil_day_from_1800_through_2200_round_trips() {
        for calendar in [Calendar::Gregorian, Calendar::Julian] {
            let first = julian_day_number(date(1800, 1, 1), calendar) as i32;
            let end = julian_day_number(date(2201, 1, 1), calendar) as i32;
            for jdn in first..end {
                let jdn = f64::from(jdn);
                let civil = civil_date_of(jdn, calendar);
                assert_eq!(julian_day_number(civil, calendar).to_bits(), jdn.to_bits());
                let text = format(civil).unwrap();
                assert_date_bits(parse_calendar_date(&text, calendar).unwrap(), civil);
                let converted = match calendar {
                    Calendar::Gregorian => gregorian_to_julian(&text).unwrap(),
                    Calendar::Julian => julian_to_gregorian(&text).unwrap(),
                };
                let restored = match calendar {
                    Calendar::Gregorian => julian_to_gregorian(&converted),
                    Calendar::Julian => gregorian_to_julian(&converted),
                };
                assert_eq!(restored.as_deref(), Some(text.as_str()));
            }
        }
    }

    #[test]
    fn day_number_anchors_and_negative_floor_divisions() {
        // Arithmetic anchors and regressions of the port, not ephemeris evidence.
        for (civil, calendar, expected) in [
            (date(2000, 1, 1), Calendar::Gregorian, 2451545.0_f64),
            (date(2000, 1, 1), Calendar::Julian, 2451558.0),
            (date(-4712, 1, 1), Calendar::Julian, 0.0),
            (date(-4801, 1, 1), Calendar::Julian, -32507.0),
            (date(-4801, 1, 1), Calendar::Gregorian, -32469.0),
        ] {
            assert_eq!(
                julian_day_number(civil, calendar).to_bits(),
                expected.to_bits()
            );
            assert_date_bits(civil_date_of(expected, calendar), civil);
        }
        for jdn in [-146097.0_f64, -1461.0, -1.0, 0.0, 1.0, 1461.0, 146097.0] {
            for calendar in [Calendar::Gregorian, Calendar::Julian] {
                assert_eq!(
                    julian_day_number(civil_date_of(jdn, calendar), calendar).to_bits(),
                    jdn.to_bits()
                );
            }
        }
    }

    #[test]
    fn century_leap_differences_are_preserved() {
        for (julian, gregorian) in [
            ("1800-02-29", "1800-03-12"),
            ("1900-02-29", "1900-03-13"),
            ("2000-02-29", "2000-03-13"),
            ("2100-02-29", "2100-03-14"),
            ("2200-02-29", "2200-03-15"),
        ] {
            assert_eq!(julian_to_gregorian(julian).as_deref(), Some(gregorian));
            assert_eq!(gregorian_to_julian(gregorian).as_deref(), Some(julian));
        }
    }

    #[test]
    fn four_digit_year_conversion_edges() {
        assert_eq!(julian_to_gregorian("0000-01-01"), None);
        assert_eq!(julian_to_gregorian("0000-01-02"), None);
        assert_eq!(
            julian_to_gregorian("0000-01-03").as_deref(),
            Some("0000-01-01")
        );
        assert_eq!(
            gregorian_to_julian("0000-01-01").as_deref(),
            Some("0000-01-03")
        );
        assert_eq!(julian_to_gregorian("9999-12-31"), None);
        assert_eq!(
            gregorian_to_julian("9999-12-31").as_deref(),
            Some("9999-10-19")
        );
        assert_eq!(
            julian_to_gregorian("9999-10-19").as_deref(),
            Some("9999-12-31")
        );
        assert_eq!(julian_to_gregorian("9999-10-20"), None);
        assert_eq!(julian_to_gregorian("2001-02-29"), None);
        assert_eq!(gregorian_to_julian("1900-02-29"), None);
    }

    #[test]
    fn native_formatter_domain_is_explicit() {
        assert_eq!(format(date(0, 1, 1)).as_deref(), Some("0000-01-01"));
        assert_eq!(
            format(CivilDate {
                year: -0.0,
                ..date(0, 1, 1)
            })
            .as_deref(),
            Some("0000-01-01")
        );
        assert_eq!(format(date(9999, 12, 31)).as_deref(), Some("9999-12-31"));
        assert_eq!(format(date(2000, 2, 31)).as_deref(), Some("2000-02-31"));
        for civil in [
            date(-1, 1, 1),
            date(10000, 1, 1),
            date(2000, 0, 1),
            date(2000, 1, 0),
            date(2000, 13, 1),
            date(2000, 1, 32),
        ] {
            assert_eq!(format(civil), None);
        }
        for invalid in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 1.5] {
            assert_eq!(
                format(CivilDate {
                    year: invalid,
                    ..date(2000, 1, 1)
                }),
                None
            );
            assert_eq!(
                format(CivilDate {
                    month: invalid,
                    ..date(2000, 1, 1)
                }),
                None
            );
            assert_eq!(
                format(CivilDate {
                    day: invalid,
                    ..date(2000, 1, 1)
                }),
                None
            );
        }
    }
}
