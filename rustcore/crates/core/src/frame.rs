//! EQJ to the mean or true ecliptic of date, translated from `src/frame.ts`.
//!
//! Precession follows astronomy-engine 2.1.19's `precession_rot(From2000)`
//! term for term. Copyright (c) 2019-2023 Don Cross, MIT License; the
//! `rustcore/NOTICE` retains that attribution and licence text.

use crate::nutation::{tilt, Tilt};
use crate::{normalize_longitude, LongitudeError};

const DEG: f64 = std::f64::consts::PI / 180.0;
const ASEC2RAD: f64 = DEG / 3600.0;
const RAD: f64 = 180.0 / std::f64::consts::PI;

/// EQJ to the mean ecliptic and equinox of date and the instant's tilt.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EclipticFrame {
    /// Terrestrial Time in days from J2000.0.
    pub tt: f64,
    /// R1(mean obliquity) P, acting on column vectors, stored row by row.
    pub rows: [f64; 9],
    pub tilt: Tilt,
}

/// Longitude and latitude on the true ecliptic and equinox of date, in degrees.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct EclipticAngles {
    pub lon: f64,
    pub lat: f64,
}

/// Build the frame at `tt`, days of TT from J2000.0, without a shared cache.
pub fn ecliptic_frame(tt: f64) -> EclipticFrame {
    let t = tt / 36525.0;
    let mut eps0 = 84381.406;
    let mut psia = ((((-0.0000000951 * t + 0.000132851) * t - 0.00114045) * t - 1.0790069) * t
        + 5038.481507)
        * t;
    let mut omegaa =
        ((((0.0000003337 * t - 0.000000467) * t - 0.00772503) * t + 0.0512623) * t - 0.025754) * t
            + eps0;
    let mut chia = ((((-0.0000000560 * t + 0.000170663) * t - 0.00121197) * t - 2.3814292) * t
        + 10.556403)
        * t;
    eps0 *= ASEC2RAD;
    psia *= ASEC2RAD;
    omegaa *= ASEC2RAD;
    chia *= ASEC2RAD;
    let sa = eps0.sin();
    let ca = eps0.cos();
    let sb = (-psia).sin();
    let cb = (-psia).cos();
    let sc = (-omegaa).sin();
    let cc = (-omegaa).cos();
    let sd = chia.sin();
    let cd = chia.cos();
    let xx = cd * cb - sb * sd * cc;
    let yx = cd * sb * ca + sd * cc * cb * ca - sa * sd * sc;
    let zx = cd * sb * sa + sd * cc * cb * sa + ca * sd * sc;
    let xy = -sd * cb - sb * cd * cc;
    let yy = -sd * sb * ca + cd * cc * cb * ca - sa * cd * sc;
    let zy = -sd * sb * sa + cd * cc * cb * sa + ca * cd * sc;
    let xz = sb * sc;
    let yz = -sc * cb * ca - sa * cc;
    let zz = -sc * cb * sa + cc * ca;
    // P's rows are (xx, yx, zx), (xy, yy, zy), (xz, yz, zz).
    // R1(mean obliquity) turns the mean equator onto the mean ecliptic.
    let at = tilt(tt);
    let e = at.mobl * DEG;
    let ce = e.cos();
    let se = e.sin();
    EclipticFrame {
        tt,
        rows: [
            xx,
            yx,
            zx,
            ce * xy + se * xz,
            ce * yy + se * yz,
            ce * zy + se * zz,
            ce * xz - se * xy,
            ce * yz - se * yy,
            ce * zz - se * zy,
        ],
        tilt: at,
    }
}

/// An EQJ vector on the mean ecliptic and equinox of date, in the input units.
pub fn mean_ecliptic(frame: &EclipticFrame, x: f64, y: f64, z: f64) -> [f64; 3] {
    let m = frame.rows;
    [
        m[0] * x + m[1] * y + m[2] * z,
        m[3] * x + m[4] * y + m[5] * z,
        m[6] * x + m[7] * y + m[8] * z,
    ]
}

/// An EQJ vector's true-ecliptic longitude and latitude, in degrees.
///
/// As in the TypeScript helper, a zero vector has a NaN latitude, and inputs
/// yielding a nonfinite longitude fail normalization. No latitude clamp or
/// independent vector validation is added.
pub fn ecliptic_of_date(x: f64, y: f64, z: f64, tt: f64) -> Result<EclipticAngles, LongitudeError> {
    let frame = ecliptic_frame(tt);
    let [ex, ey, ez] = mean_ecliptic(&frame, x, y, z);
    Ok(EclipticAngles {
        lon: normalize_longitude(ey.atan2(ex) * RAD + frame.tilt.dpsi / 3600.0)?,
        lat: (ez / hypot3(ex, ey, ez)).asin() * RAD,
    })
}

// Math.hypot takes all three terms together. Chaining f64::hypot introduces
// an extra rounded square root. Scale by the maximum before a compensated
// sum of squares instead; this also preserves the JS zero/Infinity/NaN rules.
// Math.hypot's approximation is runtime-dependent, so this is not a promise
// of bit equality across JavaScript engines (see rustcore/PARITY.md).
pub(crate) fn hypot3(x: f64, y: f64, z: f64) -> f64 {
    let terms = [x.abs(), y.abs(), z.abs()];
    if terms.iter().any(|value| value.is_infinite()) {
        return f64::INFINITY;
    }
    if terms.iter().any(|value| value.is_nan()) {
        return f64::NAN;
    }
    let maximum = terms[0].max(terms[1]).max(terms[2]);
    if maximum == 0.0 {
        return 0.0;
    }
    let mut sum = 0.0;
    let mut compensation = 0.0;
    for value in terms {
        let scaled = value / maximum;
        let square = scaled * scaled - compensation;
        let next = sum + square;
        compensation = (next - sum) - square;
        sum = next;
    }
    sum.sqrt() * maximum
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn precession_at_j2000_leaves_the_mean_equinox_fixed() {
        let frame = ecliptic_frame(0.0);
        assert_eq!(mean_ecliptic(&frame, 1.0, 0.0, 0.0), [1.0, 0.0, 0.0]);
        let e = frame.tilt.mobl * DEG;
        let transformed = mean_ecliptic(&frame, 0.0, 1.0, 0.0);
        assert!((transformed[1] - e.cos()).abs() <= f64::EPSILON);
        assert!((transformed[2] + e.sin()).abs() <= f64::EPSILON);
    }

    #[test]
    fn rows_form_a_right_handed_rotation_through_the_reference_centuries() {
        for tt in [-73048.5, -36524.5, -1.0, 0.0, 1.0, 36525.0, 73048.5] {
            let frame = ecliptic_frame(tt);
            let m = frame.rows;
            for row in 0..3 {
                for column in 0..3 {
                    let dot = m[3 * row] * m[3 * column]
                        + m[3 * row + 1] * m[3 * column + 1]
                        + m[3 * row + 2] * m[3 * column + 2];
                    let expected = if row == column { 1.0 } else { 0.0 };
                    assert!((dot - expected).abs() <= 2e-15, "tt={tt}, {row}/{column}");
                }
            }
            let determinant = m[0] * (m[4] * m[8] - m[5] * m[7])
                - m[1] * (m[3] * m[8] - m[5] * m[6])
                + m[2] * (m[3] * m[7] - m[4] * m[6]);
            assert!((determinant - 1.0).abs() <= 2e-15, "tt={tt}");
            assert_eq!(frame.tt.to_bits(), tt.to_bits());
        }
    }

    #[test]
    fn projection_uses_all_rows_in_left_to_right_order() {
        let frame = EclipticFrame {
            tt: 0.0,
            rows: [1.0, 1.0, 1.0, 2.0, -1.0, 0.0, 0.0, 0.0, 0.5],
            tilt: tilt(0.0),
        };
        assert_eq!(mean_ecliptic(&frame, 1e16, -1e16, 1.0), [1.0, 3e16, 0.5]);
    }

    #[test]
    fn true_longitude_adds_nutation_and_latitude_retains_vector_scale() {
        for tt in [-73048.5, 0.0, 73048.5] {
            let frame = ecliptic_frame(tt);
            let [ex, ey, ez] = mean_ecliptic(&frame, -0.3, 0.8, 0.5);
            let mean_lon = ey.atan2(ex) * RAD;
            let actual = ecliptic_of_date(-0.3, 0.8, 0.5, tt).unwrap();
            assert_eq!(
                actual.lon.to_bits(),
                normalize_longitude(mean_lon + frame.tilt.dpsi / 3600.0)
                    .unwrap()
                    .to_bits()
            );
            assert_eq!(
                actual.lat.to_bits(),
                ((ez / hypot3(ex, ey, ez)).asin() * RAD).to_bits()
            );
            let scaled = ecliptic_of_date(-0.3 * 1024.0, 0.8 * 1024.0, 0.5 * 1024.0, tt).unwrap();
            assert_eq!(actual, scaled);
            assert!((0.0..360.0).contains(&actual.lon));
            assert!((-90.0..=90.0).contains(&actual.lat));
        }
    }

    #[test]
    fn norm_scales_large_small_and_nonfinite_inputs() {
        assert_eq!(hypot3(3.0, 4.0, 12.0), 13.0);
        assert!((hypot3(3e300, 4e300, 12e300) / 1e300 - 13.0).abs() <= 4e-15);
        assert!((hypot3(3e-300, 4e-300, 12e-300) / 1e-300 - 13.0).abs() <= 4e-15);
        assert_eq!(hypot3(-0.0, 0.0, -0.0).to_bits(), 0.0_f64.to_bits());
        assert_eq!(hypot3(f64::NAN, f64::NEG_INFINITY, 1.0), f64::INFINITY);
        assert!(hypot3(f64::NAN, 0.0, 1.0).is_nan());
    }

    #[test]
    fn propagates_reference_degenerate_and_nonfinite_behavior() {
        assert!(ecliptic_of_date(0.0, 0.0, 0.0, 0.0).unwrap().lat.is_nan());
        for invalid in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert!(ecliptic_frame(invalid)
                .rows
                .iter()
                .all(|value| value.is_nan()));
            assert_eq!(
                ecliptic_of_date(1.0, 0.0, 0.0, invalid),
                Err(LongitudeError)
            );
            assert_eq!(
                ecliptic_of_date(invalid, 0.0, 0.0, 0.0),
                Err(LongitudeError)
            );
        }
    }
}
