//! UTC, UT1 and TT time basis ported from `src/time-scale.ts` (MIT).
//!
//! The arithmetic and the model/table handoff follow the TypeScript engine.
//! Generated tables retain that source's provenance; this module makes no
//! independent accuracy claim about the values or their uncertainty bands.

use crate::calendar::{civil_date_of, Calendar};
use crate::deltat::{delta_t_at, DeltaT, DeltaTError, DELTA_T_MODEL};
use crate::time_data::*;

const DAY: f64 = 86_400_000.0;
const J2000_MS: f64 = 946_728_000_000.0;
const MJD_UNIX: f64 = 40_587.0;
const MODEL_KNOTS_FROM: f64 = (1941.0 - 2000.0) * 365.25;

/// First day of the leap-second list, epoch milliseconds on UTC.
pub const LEAP_SECONDS_FROM: f64 = 63_072_000_000.0;
/// Fallback uncertainty of UT1 minus UTC, in seconds.
pub const UT1_FALLBACK_BAND: f64 = 0.9;
/// Model identifier for Delta T derived from leap seconds and the IERS table.
pub const DELTA_T_IERS_MODEL: &str = "iers-utc/1";

/// The scale on which an input instant is read.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TimeScaleName {
    Utc,
    Ut1,
    Tt,
}

impl TimeScaleName {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Utc => "utc",
            Self::Ut1 => "ut1",
            Self::Tt => "tt",
        }
    }
}

/// UT1 minus UTC, seconds, with the table's band and source category.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Ut1MinusUtc {
    pub seconds: f64,
    pub sigma: f64,
    pub source: &'static str,
}

/// TAI minus UTC, seconds, and whether the leap-second list remains current.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LeapSeconds {
    pub tai_minus_utc: f64,
    pub listed: bool,
}

/// The input scale and the rules used to convert it to UT1 and TT.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TimeScale {
    pub input: TimeScaleName,
    pub basis: &'static str,
    pub ut1_minus_utc: Option<Ut1MinusUtc>,
    pub leap_seconds: Option<LeapSeconds>,
}

/// An instant's UT1 and TT in days since J2000 on their respective scales.
///
/// Inside a leap second, `utc_ms` uses the following day's timestamp with the
/// old leap-second offset, as the TypeScript engine does for JavaScript Date.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TimeBasis {
    pub utc_ms: f64,
    pub ut1_days: f64,
    pub tt_days: f64,
    pub delta_t: DeltaT,
    pub time_scale: TimeScale,
}

/// TAI minus UTC, whole seconds, at a UTC epoch-millisecond instant.
///
/// This low-level helper retains the first offset for pre-table input.
pub fn tai_minus_utc_at(utc_ms: f64) -> f64 {
    let mjd = (utc_ms / DAY).floor() + MJD_UNIX;
    let mut value = LEAP_SECOND_CHANGES[0].1;
    for &(from, dtai) in LEAP_SECOND_CHANGES {
        if mjd >= from {
            value = dtai;
        }
    }
    value
}

fn tai_minus_utc_at_tai(tai_ms: f64) -> f64 {
    let mut value = LEAP_SECOND_CHANGES[0].1;
    for &(from, dtai) in LEAP_SECOND_CHANGES {
        if tai_ms >= (from - MJD_UNIX) * DAY + dtai * 1000.0 {
            value = dtai;
        }
    }
    value
}

fn ut1_minus_tai(utc_ms: f64) -> f64 {
    let days = (utc_ms - UT1_FINALS_FROM_MS) / DAY;
    let grid_from = -UT1_GRID_BEFORE * UT1_STEP;
    if days < grid_from {
        let fraction = (utc_ms - UT1_FROM_MS) / DAY / (grid_from - (UT1_FROM - UT1_FINALS_FROM));
        return (UT1_HEAD + fraction * (UT1_KNOTS[0] - UT1_HEAD)) / 1000.0;
    }
    // JavaScript's NaN array index produces undefined and hence NaN. Preserve
    // that result without converting a NaN index to a Rust array subscript.
    if days.is_nan() {
        return f64::NAN;
    }
    let last = UT1_KNOTS.len() - 1;
    let k = ((last - 1) as f64).min(UT1_GRID_BEFORE + (days / UT1_STEP).floor()) as usize;
    let start = (k as f64 - UT1_GRID_BEFORE) * UT1_STEP;
    let end = if k + 1 == last {
        UT1_TO - UT1_FINALS_FROM
    } else {
        start + UT1_STEP
    };
    let fraction = (days - start) / (end - start);
    (UT1_KNOTS[k] + fraction * (UT1_KNOTS[k + 1] - UT1_KNOTS[k])) / 1000.0
}

fn ut1_sigma(utc_ms: f64) -> f64 {
    if utc_ms < UT1_FINALS_FROM_MS {
        return UT1_EARLY_ERROR / 1e6 + UT1_BOUND;
    }
    if utc_ms <= UT1_OBSERVED_TO_MS {
        // This branch lies inside the modern positive Date range. Truncating
        // milliseconds first matches Date's TimeClip before extracting year.
        let jdn = (utc_ms.trunc() / DAY).floor() + 2_440_588.0;
        let year = civil_date_of(jdn, Calendar::Gregorian).year - UT1_FIRST_YEAR;
        let index = year.max(0.0).min((UT1_OBSERVED_ERRORS.len() - 1) as f64) as usize;
        return UT1_OBSERVED_ERRORS[index] / 1e6 + UT1_BOUND;
    }
    if utc_ms.is_nan() {
        return f64::NAN;
    }
    let days = (utc_ms - UT1_OBSERVED_TO_MS) / DAY - 1.0;
    let k = (days / 10.0)
        .floor()
        .max(0.0)
        .min((UT1_PREDICTED_ERRORS.len() - 2) as f64) as usize;
    let span = if k + 1 == UT1_PREDICTED_ERRORS.len() - 1 {
        UT1_TO - UT1_OBSERVED_TO - 1.0 - 10.0 * k as f64
    } else {
        10.0
    };
    let fraction = ((days - 10.0 * k as f64) / span).clamp(0.0, 1.0);
    (UT1_PREDICTED_ERRORS[k] + fraction * (UT1_PREDICTED_ERRORS[k + 1] - UT1_PREDICTED_ERRORS[k]))
        / 1e6
        + UT1_BOUND
}

fn fallback() -> Ut1MinusUtc {
    Ut1MinusUtc {
        seconds: 0.0,
        sigma: UT1_FALLBACK_BAND,
        source: "fallback",
    }
}

fn table_ut1_minus_utc(utc_ms: f64, tai_minus_utc: f64) -> Ut1MinusUtc {
    Ut1MinusUtc {
        seconds: ut1_minus_tai(utc_ms) + tai_minus_utc,
        sigma: ut1_sigma(utc_ms),
        source: if utc_ms <= UT1_OBSERVED_TO_MS {
            "observed"
        } else {
            "predicted"
        },
    }
}

/// UT1 minus UTC at a UTC epoch-millisecond instant, with its band and source.
#[allow(clippy::manual_range_contains)] // Explicit comparisons keep NaN on the table branch.
pub fn ut1_minus_utc_at(utc_ms: f64) -> Ut1MinusUtc {
    if utc_ms < UT1_FROM_MS || utc_ms > UT1_TO_MS {
        return fallback();
    }
    table_ut1_minus_utc(utc_ms, tai_minus_utc_at(utc_ms))
}

fn model_delta_t(ut1_ms: f64) -> Result<DeltaT, DeltaTError> {
    delta_t_at((ut1_ms - J2000_MS) / DAY)
}

/// Read UT1 and TT from an epoch-millisecond instant on the specified scale.
///
/// `pin` supplies Delta T (TT minus UT1), in seconds. Input validation follows
/// the underlying TypeScript helper: model calls reject nonfinite times; a
/// supplied pin is taken as given. Public callers validate their input first.
#[allow(clippy::manual_range_contains)] // Explicit comparisons keep NaN on the IERS branch.
pub fn time_basis(
    ms: f64,
    scale: TimeScaleName,
    pin: Option<f64>,
) -> Result<TimeBasis, DeltaTError> {
    let record = |utc_ms: f64,
                  ut1_ms: f64,
                  delta_t: DeltaT,
                  basis: &'static str,
                  ut1_minus_utc: Option<Ut1MinusUtc>,
                  leap_seconds: Option<LeapSeconds>| {
        let ut1_days = (ut1_ms - J2000_MS) / DAY;
        TimeBasis {
            utc_ms,
            ut1_days,
            tt_days: ut1_days + delta_t.seconds / 86_400.0,
            delta_t,
            time_scale: TimeScale {
                input: scale,
                basis,
                ut1_minus_utc,
                leap_seconds,
            },
        }
    };
    if let Some(pin) = pin {
        let delta_t = DeltaT {
            seconds: pin,
            sigma: None,
            model: "pinned",
            table: None,
            table_digest: None,
            segment: "pinned",
        };
        if scale == TimeScaleName::Tt {
            return Ok(record(
                ms - pin * 1000.0,
                ms - pin * 1000.0,
                delta_t,
                "pinned",
                None,
                None,
            ));
        }
        let ut1_minus_utc = if scale == TimeScaleName::Utc && ms >= LEAP_SECONDS_FROM {
            Some(ut1_minus_utc_at(ms))
        } else {
            None
        };
        return Ok(record(
            ms,
            ms + ut1_minus_utc.map_or(0.0, |ut1| ut1.seconds) * 1000.0,
            delta_t,
            "pinned",
            ut1_minus_utc,
            None,
        ));
    }
    let utc = if scale == TimeScaleName::Tt {
        ms - model_delta_t(ms)?.seconds * 1000.0
    } else {
        ms
    };
    if utc < LEAP_SECONDS_FROM || utc > UT1_TO_MS {
        let mut ut1_ms = ms;
        if scale == TimeScaleName::Tt {
            for _ in 0..4 {
                ut1_ms = ms - model_delta_t(ut1_ms)?.seconds * 1000.0;
            }
        }
        return Ok(record(
            ut1_ms,
            ut1_ms,
            model_delta_t(ut1_ms)?,
            "delta-t",
            if utc > UT1_TO_MS && scale != TimeScaleName::Ut1 {
                Some(fallback())
            } else {
                None
            },
            None,
        ));
    }
    let tai_ms;
    let tai_minus_utc;
    let mut utc_ms = ms;
    if scale == TimeScaleName::Utc {
        tai_minus_utc = tai_minus_utc_at(ms);
        tai_ms = ms + tai_minus_utc * 1000.0;
    } else {
        tai_ms = if scale == TimeScaleName::Tt {
            ms - 32_184.0
        } else {
            ms - ut1_minus_tai(ms) * 1000.0
        };
        tai_minus_utc = tai_minus_utc_at_tai(tai_ms);
        utc_ms = tai_ms - tai_minus_utc * 1000.0;
    }
    let ut1 = table_ut1_minus_utc(utc_ms, tai_minus_utc);
    let ut1_ms = if scale == TimeScaleName::Ut1 {
        ms
    } else {
        utc_ms + ut1.seconds * 1000.0
    };
    Ok(record(
        utc_ms,
        ut1_ms,
        DeltaT {
            seconds: (tai_ms + 32_184.0 - ut1_ms) / 1000.0,
            sigma: Some(ut1.sigma),
            model: DELTA_T_IERS_MODEL,
            table: Some(UT1_VERSION),
            table_digest: Some(UT1_DIGEST),
            segment: ut1.source,
        },
        "iers",
        Some(if scale == TimeScaleName::Ut1 {
            Ut1MinusUtc {
                seconds: (ut1_ms - utc_ms) / 1000.0,
                ..ut1
            }
        } else {
            ut1
        }),
        Some(LeapSeconds {
            tai_minus_utc,
            listed: utc_ms < LEAP_SECONDS_EXPIRE_MS,
        }),
    ))
}

fn piece_of(value: &TimeBasis) -> String {
    let TimeScale {
        input,
        basis,
        ut1_minus_utc,
        ..
    } = value.time_scale;
    if input == TimeScaleName::Tt {
        return String::new();
    }
    let model = if value.delta_t.model == DELTA_T_MODEL {
        if value.ut1_days < MODEL_KNOTS_FROM {
            "spline"
        } else {
            "knots"
        }
    } else {
        value.delta_t.model
    };
    if input == TimeScaleName::Ut1 {
        return format!("{basis} {model}");
    }
    let reading = match ut1_minus_utc {
        None => "as-ut1".to_owned(),
        Some(ut1) if ut1.source == "fallback" => "fallback".to_owned(),
        Some(_) => tai_minus_utc_at(value.utc_ms).to_string(),
    };
    format!("{basis} {model} {reading}")
}

/// Sample separation in input days, adjusted to TT when the time basis steps.
pub fn elapsed_days(before: &TimeBasis, after: &TimeBasis, days: f64) -> f64 {
    if piece_of(before) == piece_of(after) {
        days
    } else {
        after.tt_days - before.tt_days
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::date_input::date_from_iso;

    fn ms(iso: &str) -> f64 {
        date_from_iso(iso).unwrap()
    }

    fn basis(iso: &str, scale: TimeScaleName) -> TimeBasis {
        time_basis(ms(iso), scale, None).unwrap()
    }

    #[test]
    fn leap_changes_apply_on_utc_midnight_and_after_the_leap_on_tai() {
        let mut previous = LEAP_SECOND_CHANGES[0].1;
        for &(mjd, offset) in LEAP_SECOND_CHANGES {
            let at = (mjd - MJD_UNIX) * DAY;
            assert_eq!(tai_minus_utc_at(at - 1.0), previous);
            assert_eq!(tai_minus_utc_at(at), offset);
            assert_eq!(tai_minus_utc_at_tai(at + offset * 1000.0 - 1.0), previous);
            assert_eq!(tai_minus_utc_at_tai(at + offset * 1000.0), offset);
            previous = offset;
        }
        assert_eq!(tai_minus_utc_at(f64::NAN), LEAP_SECOND_CHANGES[0].1);
    }

    #[test]
    fn table_uses_the_generated_knots_and_the_first_and_short_final_intervals() {
        assert_eq!(ut1_minus_tai(UT1_FROM_MS), UT1_HEAD / 1000.0);
        let first_grid_ms = UT1_FINALS_FROM_MS - UT1_GRID_BEFORE * UT1_STEP * DAY;
        assert_eq!(ut1_minus_tai(first_grid_ms), UT1_KNOTS[0] / 1000.0);
        for (k, &knot) in UT1_KNOTS.iter().enumerate() {
            let at = if k == UT1_KNOTS.len() - 1 {
                UT1_TO_MS
            } else {
                UT1_FINALS_FROM_MS + (k as f64 - UT1_GRID_BEFORE) * UT1_STEP * DAY
            };
            assert_eq!(ut1_minus_tai(at).to_bits(), (knot / 1000.0).to_bits());
        }
        assert_eq!(ut1_minus_utc_at(UT1_FROM_MS - 1.0), fallback());
        assert_eq!(ut1_minus_utc_at(UT1_TO_MS + 1.0), fallback());
        assert_eq!(ut1_minus_utc_at(UT1_FROM_MS).source, "observed");
        assert_eq!(ut1_minus_utc_at(UT1_OBSERVED_TO_MS).source, "observed");
        assert_eq!(
            ut1_minus_utc_at(UT1_OBSERVED_TO_MS + 1.0).source,
            "predicted"
        );
        assert_eq!(ut1_minus_utc_at(UT1_TO_MS).source, "predicted");
    }

    #[test]
    fn sigma_tracks_early_yearly_and_prediction_bands() {
        assert_eq!(ut1_sigma(UT1_FROM_MS), UT1_EARLY_ERROR / 1e6 + UT1_BOUND);
        for (index, error) in UT1_OBSERVED_ERRORS.iter().enumerate() {
            let at = ms(&format!("{:04}-01-02", UT1_FIRST_YEAR as usize + index));
            assert_eq!(ut1_sigma(at).to_bits(), (error / 1e6 + UT1_BOUND).to_bits());
        }
        for (index, error) in UT1_PREDICTED_ERRORS.iter().enumerate() {
            let at = if index == UT1_PREDICTED_ERRORS.len() - 1 {
                UT1_TO_MS
            } else {
                UT1_OBSERVED_TO_MS + (1.0 + index as f64 * 10.0) * DAY
            };
            assert_eq!(ut1_sigma(at).to_bits(), (error / 1e6 + UT1_BOUND).to_bits());
        }
    }

    #[test]
    fn civil_model_and_iers_records_follow_the_input_scale() {
        for iso in ["1800-01-01", "1941-01-01", "1971-12-31", "2200-01-01"] {
            let value = basis(iso, TimeScaleName::Utc);
            assert_eq!(value.time_scale.basis, "delta-t");
            assert_eq!(
                value.delta_t,
                delta_t_at((ms(iso) - J2000_MS) / DAY).unwrap()
            );
            assert_eq!(value.time_scale.leap_seconds, None);
            let expected = (ms(iso) > UT1_TO_MS).then(fallback);
            assert_eq!(value.time_scale.ut1_minus_utc, expected);
        }
        for scale in [TimeScaleName::Utc, TimeScaleName::Ut1, TimeScaleName::Tt] {
            let value = basis("2000-01-01T12:00:00Z", scale);
            assert_eq!(value.time_scale.basis, "iers");
            assert_eq!(value.delta_t.model, DELTA_T_IERS_MODEL);
            assert_eq!(value.delta_t.table, Some(UT1_VERSION));
            assert_eq!(value.delta_t.table_digest, Some(UT1_DIGEST));
            assert_eq!(value.delta_t.segment, "observed");
            assert_eq!(
                value.delta_t.sigma,
                Some(value.time_scale.ut1_minus_utc.unwrap().sigma)
            );
        }
    }

    #[test]
    fn every_leap_second_keeps_the_old_tai_offset_on_tt_input() {
        for (index, &(mjd, offset)) in LEAP_SECOND_CHANGES.iter().enumerate().skip(1) {
            let old = LEAP_SECOND_CHANGES[index - 1].1;
            let at = (mjd - MJD_UNIX) * DAY;
            for fraction in [0.0, 250.0, 500.0, 999.0] {
                let input = at + old * 1000.0 + fraction + 32_184.0;
                let value = time_basis(input, TimeScaleName::Tt, None).unwrap();
                assert_eq!(value.utc_ms, at + fraction);
                assert_eq!(value.time_scale.leap_seconds.unwrap().tai_minus_utc, old);
                assert_eq!(value.time_scale.basis, "iers");
            }
            let value =
                time_basis(at + offset * 1000.0 + 32_184.0, TimeScaleName::Tt, None).unwrap();
            assert_eq!(value.utc_ms, at);
            assert_eq!(value.time_scale.leap_seconds.unwrap().tai_minus_utc, offset);
        }
    }

    #[test]
    fn expiry_marks_carried_leap_offset_and_table_edges_preserve_metadata() {
        for (at, listed) in [
            (LEAP_SECONDS_EXPIRE_MS - 1.0, true),
            (LEAP_SECONDS_EXPIRE_MS, false),
        ] {
            let value = time_basis(at, TimeScaleName::Utc, None).unwrap();
            assert_eq!(value.time_scale.leap_seconds.unwrap().listed, listed);
        }
        for at in [UT1_FROM_MS, UT1_FINALS_FROM_MS, UT1_TO_MS] {
            let value = time_basis(at, TimeScaleName::Ut1, None).unwrap();
            assert_eq!(value.time_scale.basis, "iers");
            assert_eq!(
                value.time_scale.ut1_minus_utc.unwrap().seconds.to_bits(),
                ((at - value.utc_ms) / 1000.0).to_bits()
            );
        }
        let after = time_basis(UT1_TO_MS + 1.0, TimeScaleName::Ut1, None).unwrap();
        assert_eq!(after.time_scale.basis, "delta-t");
        assert_eq!(after.time_scale.ut1_minus_utc, None);
    }

    #[test]
    fn pinned_offsets_keep_ut1_and_replace_only_delta_t() {
        for scale in [TimeScaleName::Utc, TimeScaleName::Ut1, TimeScaleName::Tt] {
            let at = ms("2016-06-01T12:00:00Z");
            let value = time_basis(at, scale, Some(70.0)).unwrap();
            assert_eq!(value.time_scale.basis, "pinned");
            assert_eq!(value.delta_t.seconds, 70.0);
            assert_eq!(value.delta_t.sigma, None);
            assert_eq!(value.delta_t.table, None);
            assert_eq!(value.delta_t.table_digest, None);
            assert_eq!(value.time_scale.leap_seconds, None);
            let expected_ut1 = match scale {
                TimeScaleName::Utc => at + ut1_minus_utc_at(at).seconds * 1000.0,
                TimeScaleName::Ut1 => at,
                TimeScaleName::Tt => at - 70_000.0,
            };
            assert_eq!(
                value.ut1_days.to_bits(),
                ((expected_ut1 - J2000_MS) / DAY).to_bits()
            );
            assert_eq!(
                value.tt_days.to_bits(),
                (value.ut1_days + 70.0 / 86_400.0).to_bits()
            );
        }
        let negative_zero = time_basis(0.0, TimeScaleName::Ut1, Some(-0.0)).unwrap();
        assert_eq!(
            negative_zero.delta_t.seconds.to_bits(),
            (-0.0_f64).to_bits()
        );
    }

    #[test]
    fn elapsed_days_adjusts_only_when_the_basis_piece_changes() {
        let days = 2.0 / DAY;
        for at in [
            J2000_MS + MODEL_KNOTS_FROM * DAY,
            LEAP_SECONDS_FROM,
            UT1_TO_MS,
            ms("2017-01-01"),
        ] {
            let before = time_basis(at - 1.0, TimeScaleName::Utc, None).unwrap();
            let after = time_basis(at + 1.0, TimeScaleName::Utc, None).unwrap();
            assert_eq!(
                elapsed_days(&before, &after, days).to_bits(),
                (after.tt_days - before.tt_days).to_bits()
            );
        }
        for scale in [TimeScaleName::Utc, TimeScaleName::Ut1, TimeScaleName::Tt] {
            let before = basis("2000-01-01T12:00:00Z", scale);
            let after = basis("2000-01-01T12:00:01Z", scale);
            assert_eq!(
                elapsed_days(&before, &after, -0.0).to_bits(),
                (-0.0_f64).to_bits()
            );
        }
        let before = basis("1800-01-01", TimeScaleName::Tt);
        let after = basis("2200-01-01", TimeScaleName::Tt);
        assert_eq!(elapsed_days(&before, &after, 1.25), 1.25);
    }

    #[test]
    fn nonfinite_low_level_inputs_do_not_panic_or_gain_new_validation() {
        for scale in [TimeScaleName::Utc, TimeScaleName::Ut1] {
            let value = time_basis(f64::NAN, scale, None).unwrap();
            assert!(value.utc_ms.is_nan());
            assert!(value.ut1_days.is_nan());
            assert!(value.delta_t.seconds.is_nan());
        }
        assert!(time_basis(f64::NAN, TimeScaleName::Tt, None).is_err());
        for value in [f64::INFINITY, f64::NEG_INFINITY] {
            for scale in [TimeScaleName::Utc, TimeScaleName::Ut1, TimeScaleName::Tt] {
                assert!(time_basis(value, scale, None).is_err());
                assert!(time_basis(value, scale, Some(0.0)).is_ok());
            }
        }
        let nan = ut1_minus_utc_at(f64::NAN);
        assert!(nan.seconds.is_nan());
        assert!(nan.sigma.is_nan());
        assert_eq!(nan.source, "predicted");
    }
}
