//! Numeric kernels ported from the TypeScript engine in this repository.

#![forbid(unsafe_code)]

pub mod angles;
pub mod calendar;
pub mod date_input;
pub mod deltat;
pub mod ephemeris;
pub mod equator;
pub mod frame;
pub mod lunar;
pub mod moon;
pub mod nutation;
pub mod planets;
pub mod pluto;
pub mod signs;
pub mod time_scales;

#[allow(dead_code)]
mod time_data {
    include!(concat!(env!("OUT_DIR"), "/time_data.rs"));
}

use std::fmt;

/// A longitude that is not a finite binary64 value.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LongitudeError;

impl fmt::Display for LongitudeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Longitude must be finite.")
    }
}

impl std::error::Error for LongitudeError {}

/// Normalize degrees with the operation order of `src/signs.ts`.
///
/// The addition between the two remainders is intentional: changing it to
/// `rem_euclid`, or adding a turn only for negative values, changes rounding.
pub fn normalize_longitude(longitude: f64) -> Result<f64, LongitudeError> {
    if !longitude.is_finite() {
        return Err(LongitudeError);
    }
    Ok(((longitude % 360.0) + 360.0) % 360.0)
}

#[cfg(test)]
mod tests {
    use super::{normalize_longitude, LongitudeError};

    fn assert_bits(input: f64, expected: f64) {
        assert_eq!(
            normalize_longitude(input).unwrap().to_bits(),
            expected.to_bits(),
            "normalizing {input:?}"
        );
    }

    #[test]
    fn normalizes_turns_and_exact_binary_fractions() {
        for (input, expected) in [
            (15.5, 15.5),
            (-15.5, 344.5),
            (375.5, 15.5),
            (-375.5, 344.5),
            (180.0, 180.0),
            (-180.0, 180.0),
        ] {
            assert_bits(input, expected);
        }
    }

    #[test]
    fn converts_both_signed_zeros_and_whole_turns_to_positive_zero() {
        for input in [0.0, -0.0, 360.0, -360.0, 720.0, -720.0] {
            assert_bits(input, 0.0);
        }
    }

    #[test]
    fn preserves_rounding_at_the_wrap_and_for_tiny_values() {
        let least_subnormal = f64::from_bits(1);
        let below_turn = f64::from_bits(360.0_f64.to_bits() - 1);
        let gap = 360.0 - below_turn;

        // Adding a turn discards these small magnitudes, including the
        // negative subnormal whose exact circular representative is near 360.
        for input in [least_subnormal, -least_subnormal, f64::MIN_POSITIVE] {
            assert_bits(input, 0.0);
        }
        // The intermediate sum rounds to 720, so the final remainder is zero.
        assert_bits(below_turn, 0.0);
        assert_bits(-gap, below_turn);
    }

    #[test]
    fn accepts_finite_extremes_without_integer_conversion() {
        assert_bits(f64::MAX, 128.0);
        assert_bits(-f64::MAX, 232.0);
        assert_bits(9_007_199_254_740_991.0, 31.0);
        assert_bits(-9_007_199_254_740_991.0, 329.0);
    }

    #[test]
    fn rejects_every_nonfinite_class() {
        for input in [
            f64::INFINITY,
            f64::NEG_INFINITY,
            f64::NAN,
            f64::from_bits(0xfff8_0000_0000_0001),
            f64::from_bits(0x7ff0_0000_0000_0001),
        ] {
            assert_eq!(normalize_longitude(input), Err(LongitudeError));
        }
        assert_eq!(LongitudeError.to_string(), "Longitude must be finite.");
    }
}
