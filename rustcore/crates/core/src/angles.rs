//! MIT translations of the arithmetic in `src/aspects.ts`, `src/points.ts`
//! and `src/window-ranges.ts`. These are compatibility kernels, not new
//! definitions of exact circular arithmetic.

use crate::{normalize_longitude, LongitudeError};

/// Unchecked wrapping from `src/window-ranges.ts`, in degrees.
/// Nonfinite inputs propagate NaN, unlike `normalize_longitude`.
pub fn wrap360(value: f64) -> f64 {
    ((value % 360.0) + 360.0) % 360.0
}

/// Unsigned separation from `src/aspects.ts`, in degrees.
pub fn separation(a: f64, b: f64) -> f64 {
    let difference = wrap360(a - b).abs();
    if difference > 180.0 {
        360.0 - difference
    } else {
        difference
    }
}

/// Signed shortest step from `from` to `to`, in (-180, 180] degrees.
pub fn signed_delta(from: f64, to: f64) -> f64 {
    let difference = wrap360(to - from);
    if difference > 180.0 {
        difference - 360.0
    } else {
        difference
    }
}

/// Forward step used by the window search; steps above 300 degrees wrap back.
pub fn advance(from: f64, to: f64) -> f64 {
    let step = wrap360(to - from);
    if step > 300.0 {
        step - 360.0
    } else {
        step
    }
}

/// Reflect a longitude across the solstitial axis, in degrees.
pub fn antiscion(longitude: f64) -> Result<f64, LongitudeError> {
    normalize_longitude(180.0 - longitude)
}

/// Reflect a longitude across the equinoctial axis, in degrees.
pub fn contra_antiscion(longitude: f64) -> Result<f64, LongitudeError> {
    normalize_longitude(-longitude)
}

/// Nearer midpoint, choosing 90 degrees past `first` for an antipodal pair.
pub fn midpoint(first: f64, second: f64) -> Result<f64, LongitudeError> {
    // Subtract before wrapping, even for finite operands that overflow.
    let arc = normalize_longitude(second - first)?;
    normalize_longitude(first + if arc > 180.0 { arc - 360.0 } else { arc } / 2.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handles_wraps_antipodes_and_argument_order() {
        for (from, to, unsigned, signed) in [
            (350.0, 10.0, 20.0_f64, 20.0_f64),
            (10.0, 350.0, 20.0, -20.0),
            (0.0, 180.0, 180.0, 180.0),
            (180.0, 0.0, 180.0, 180.0),
            (-360.0, 720.0, 0.0, 0.0),
        ] {
            assert_eq!(separation(from, to).to_bits(), unsigned.to_bits());
            assert_eq!(signed_delta(from, to).to_bits(), signed.to_bits());
        }
        assert_eq!(midpoint(0.0, 180.0), Ok(90.0));
        assert_eq!(midpoint(180.0, 0.0), Ok(270.0));
        assert_eq!(midpoint(350.0, 10.0), Ok(0.0));
        assert_eq!(midpoint(10.0, 350.0), Ok(0.0));
    }

    #[test]
    fn preserves_advance_threshold_and_reflection_conventions() {
        assert_eq!(advance(0.0, 300.0), 300.0);
        assert_eq!(advance(0.0, 300.5), -59.5);
        assert_eq!(advance(0.0, 270.0), 270.0);
        assert_eq!(signed_delta(0.0, 270.0), -90.0);
        assert_eq!(antiscion(40.0), Ok(140.0));
        assert_eq!(contra_antiscion(40.0), Ok(320.0));
    }

    #[test]
    fn keeps_reference_zero_rounding_and_overflow_behavior() {
        let below_turn = f64::from_bits(360.0_f64.to_bits() - 1);
        for value in [-0.0, -f64::from_bits(1), below_turn] {
            assert_eq!(wrap360(value).to_bits(), 0.0_f64.to_bits());
        }
        assert!(separation(f64::MAX, -f64::MAX).is_nan());
        assert!(signed_delta(-f64::MAX, f64::MAX).is_nan());
        assert!(advance(0.0, f64::INFINITY).is_nan());
        assert_eq!(midpoint(-f64::MAX, f64::MAX), Err(LongitudeError));
        assert_eq!(antiscion(f64::NAN), Err(LongitudeError));
        assert_eq!(contra_antiscion(f64::INFINITY), Err(LongitudeError));
    }
}
