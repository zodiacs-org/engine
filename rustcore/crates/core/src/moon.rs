//! Geocentric lunar position series and the reference finite-difference state.
//!
//! Translated from astronomy-engine 2.1.19, esm/astronomy.js: CalcMoon,
//! GeoMoon, GeoMoonState, mean_obliq, precession_rot and rotate. Copyright
//! (c) 2019-2023 Don Cross, MIT. See rustcore/NOTICE for the full license.
//! Coefficients are generated from the digest-checked local npm source.

use crate::planets::{HelioState, PlanetError};

#[allow(dead_code)]
mod data {
    include!(concat!(env!("OUT_DIR"), "/moon_data.rs"));
}

const PI2: f64 = 2.0 * std::f64::consts::PI;
const ARC: f64 = 3600.0 * (180.0 / std::f64::consts::PI);
const DEG2RAD: f64 = std::f64::consts::PI / 180.0;
// Preserve the reference literal and grouping, including its radius conversion.
const ASEC2RAD: f64 = 4.848_136_811_095_36e-6;
const EARTH_EQUATORIAL_RADIUS_AU: f64 = 6378.1366 / 149_597_870.690_989_32;
pub const STATE_STEP_DAYS: f64 = 1.0e-5;

/// Lunar coordinates on the mean ecliptic and equinox of date.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LunarSpherical {
    /// Longitude in radians in [0, 2 pi).
    pub geo_eclip_lon: f64,
    /// Latitude in radians.
    pub geo_eclip_lat: f64,
    /// Geocentric distance in astronomical units.
    pub distance_au: f64,
}

struct Harmonics {
    cosine: [[f64; 4]; 13],
    sine: [[f64; 4]; 13],
}

impl Harmonics {
    fn new(arguments: [(f64, usize, f64); 4]) -> Self {
        let mut result = Self {
            cosine: [[0.0; 4]; 13],
            sine: [[0.0; 4]; 13],
        };
        for (column, (angle, maximum, factor)) in arguments.into_iter().enumerate() {
            result.cosine[6][column] = 1.0;
            result.cosine[7][column] = angle.cos() * factor;
            result.sine[7][column] = angle.sin() * factor;
            for order in 2..=maximum {
                let c1 = result.cosine[6 + order - 1][column];
                let s1 = result.sine[6 + order - 1][column];
                let c2 = result.cosine[7][column];
                let s2 = result.sine[7][column];
                result.cosine[6 + order][column] = c1 * c2 - s1 * s2;
                result.sine[6 + order][column] = s1 * c2 + c1 * s2;
            }
            for order in 1..=maximum {
                result.cosine[6 - order][column] = result.cosine[6 + order][column];
                result.sine[6 - order][column] = -result.sine[6 + order][column];
            }
        }
        result
    }

    fn term(&self, multipliers: [i8; 4]) -> [f64; 2] {
        let mut result = [1.0, 0.0];
        for (column, multiplier) in multipliers.into_iter().enumerate() {
            if multiplier != 0 {
                let row = (multiplier + 6) as usize;
                let c2 = self.cosine[row][column];
                let s2 = self.sine[row][column];
                result = [
                    result[0] * c2 - result[1] * s2,
                    result[1] * c2 + result[0] * s2,
                ];
            }
        }
        result
    }
}

fn sine(phi: f64) -> f64 {
    (PI2 * phi).sin()
}

fn frac(value: f64) -> f64 {
    value - value.floor()
}

/// Evaluate the pinned reference's Moon series at TT days from J2000.
///
/// This low-level series expects a validated finite clock. It does not enforce
/// an ephemeris span; nonfinite values propagate through its floating arithmetic.
pub fn calc_moon(tt: f64) -> LunarSpherical {
    let t = tt / 36525.0;
    let t2 = t * t;
    let s1 = sine(0.19833 + 0.05611 * t);
    let s2 = sine(0.27869 + 0.04508 * t);
    let s3 = sine(0.16827 - 0.36903 * t);
    let s4 = sine(0.34734 - 5.37261 * t);
    let s5 = sine(0.10498 - 5.37899 * t);
    let s6 = sine(0.42681 - 0.41855 * t);
    let s7 = sine(0.14943 - 5.37511 * t);
    let dl0 = 0.84 * s1 + 0.31 * s2 + 14.27 * s3 + 7.26 * s4 + 0.28 * s5 + 0.24 * s6;
    let dl = 2.94 * s1 + 0.31 * s2 + 14.27 * s3 + 9.34 * s4 + 1.12 * s5 + 0.83 * s6;
    let dls = -6.40 * s1 - 1.89 * s6;
    let df = 0.21 * s1 + 0.31 * s2 + 14.27 * s3 - 88.70 * s4 - 15.30 * s5 + 0.24 * s6 - 1.86 * s7;
    let dd = dl0 - dls;
    let dgam = -3332e-9 * sine(0.59734 - 5.37261 * t)
        - 539e-9 * sine(0.35498 - 5.37899 * t)
        - 64e-9 * sine(0.39943 - 5.37511 * t);
    let l0 = PI2 * frac(0.60643382 + 1336.85522467 * t - 0.00000313 * t2) + dl0 / ARC;
    let l = PI2 * frac(0.37489701 + 1325.55240982 * t + 0.00002565 * t2) + dl / ARC;
    let ls = PI2 * frac(0.99312619 + 99.99735956 * t - 0.00000044 * t2) + dls / ARC;
    let f = PI2 * frac(0.25909118 + 1342.22782980 * t - 0.00000892 * t2) + df / ARC;
    let d = PI2 * frac(0.82736186 + 1236.85308708 * t - 0.00000397 * t2) + dd / ARC;
    let harmonics = Harmonics::new([
        (l, 4, 1.000002208),
        (ls, 3, 0.997504612 - 0.002495388 * t),
        (f, 4, 1.000002708 + 139.978 * dgam),
        (d, 6, 1.0),
    ]);
    let mut dlam = 0.0;
    let mut ds = 0.0;
    let mut gam1c = 0.0;
    let mut sinpi = 3422.7000;
    for &(coefficients, multipliers) in data::SOLAR {
        let [x, y] = harmonics.term(multipliers);
        dlam += coefficients[0] * y;
        ds += coefficients[1] * y;
        gam1c += coefficients[2] * x;
        sinpi += coefficients[3] * x;
    }
    let mut n = 0.0;
    for &(coefficients, multipliers) in data::LATITUDE {
        n += coefficients[0] * harmonics.term(multipliers)[1];
    }
    dlam += 0.82 * sine(0.7736 - 62.5512 * t)
        + 0.31 * sine(0.0466 - 125.1025 * t)
        + 0.35 * sine(0.5785 - 25.1042 * t)
        + 0.66 * sine(0.4591 + 1335.8075 * t)
        + 0.64 * sine(0.3130 - 91.5680 * t)
        + 1.14 * sine(0.1480 + 1331.2898 * t)
        + 0.21 * sine(0.5918 + 1056.5859 * t)
        + 0.44 * sine(0.5784 + 1322.8595 * t)
        + 0.24 * sine(0.2275 - 5.7374 * t)
        + 0.28 * sine(0.2965 + 2.6929 * t)
        + 0.33 * sine(0.3132 + 6.3368 * t);
    let s = f + ds / ARC;
    let lat_seconds = (1.000002708 + 139.978 * dgam) * (18518.511 + 1.189 + gam1c) * s.sin()
        - 6.24 * (3.0 * s).sin()
        + n;
    LunarSpherical {
        geo_eclip_lon: PI2 * frac((l0 + dlam / ARC) / PI2),
        geo_eclip_lat: (std::f64::consts::PI / (180.0 * 3600.0)) * lat_seconds,
        distance_au: (ARC * EARTH_EQUATORIAL_RADIUS_AU) / (0.999953253 * sinpi),
    }
}

// Unlike the engine's expanded polynomial, astronomy-engine's GeoMoon uses
// this Horner grouping. A last-bit difference in the position can be magnified
// in GeoMoonState's short finite difference, so retain both rotation stages.
fn mean_obliquity(tt: f64) -> f64 {
    let t = tt / 36525.0;
    let asec = ((((-0.0000000434 * t - 0.000000576) * t + 0.00200340) * t - 0.0001831) * t
        - 46.836769)
        * t
        + 84381.406;
    asec / 3600.0
}

// `frame::ecliptic_frame` combines the forward precession and obliquity
// rotations. Transposing that combined matrix would change the operation
// order here. This is the same precession polynomial, applied Into2000
// after the reference's separate mean ecliptic-to-equator rotation.
fn precess_into_2000(tt: f64, pos: [f64; 3]) -> [f64; 3] {
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
    [
        xx * pos[0] + xy * pos[1] + xz * pos[2],
        yx * pos[0] + yy * pos[1] + yz * pos[2],
        zx * pos[0] + zy * pos[1] + zz * pos[2],
    ]
}

/// Moon EQJ geocentric Cartesian position in AU, without aberration or light time.
pub fn geo_moon(tt: f64) -> [f64; 3] {
    let moon = calc_moon(tt);
    let dist_cos_lat = moon.distance_au * moon.geo_eclip_lat.cos();
    let gepos = [
        dist_cos_lat * moon.geo_eclip_lon.cos(),
        dist_cos_lat * moon.geo_eclip_lon.sin(),
        moon.distance_au * moon.geo_eclip_lat.sin(),
    ];
    let obl = mean_obliquity(tt) * DEG2RAD;
    let cos_obl = obl.cos();
    let sin_obl = obl.sin();
    let mean_equatorial = [
        gepos[0],
        gepos[1] * cos_obl - gepos[2] * sin_obl,
        gepos[1] * sin_obl + gepos[2] * cos_obl,
    ];
    precess_into_2000(tt, mean_equatorial)
}

/// Moon EQJ state in AU and AU/day using the reference's symmetric difference.
///
/// `ut` and `tt` are days from J2000, with Delta T in seconds fixed for this
/// call. As in AstroTime.AddDays, both samples reconstruct TT from the stepped
/// UT and the fixed Delta T. The supplied center TT is validated but is not
/// used to evaluate the samples. Position is their average, not GeoMoon(tt).
pub fn geo_moon_state(ut: f64, tt: f64, delta_t_seconds: f64) -> Result<HelioState, PlanetError> {
    if !ut.is_finite() || !tt.is_finite() || !delta_t_seconds.is_finite() {
        return Err(PlanetError::InvalidClock);
    }
    let t1 = (ut - STATE_STEP_DAYS) + delta_t_seconds / 86400.0;
    let t2 = (ut + STATE_STEP_DAYS) + delta_t_seconds / 86400.0;
    if !t1.is_finite() || !t2.is_finite() {
        return Err(PlanetError::InvalidClock);
    }
    let r1 = geo_moon(t1);
    let r2 = geo_moon(t2);
    let result = HelioState {
        pos: std::array::from_fn(|index| (r1[index] + r2[index]) / 2.0),
        vel: std::array::from_fn(|index| (r2[index] - r1[index]) / (2.0 * STATE_STEP_DAYS)),
    };
    if !result.pos.iter().chain(&result.vel).all(|v| v.is_finite()) {
        return Err(PlanetError::NonFiniteVector);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frame::{ecliptic_frame, hypot3, mean_ecliptic};

    #[test]
    fn fractional_turns_are_positive_for_negative_epochs() {
        assert_eq!(frac(-1.25), 0.75);
        assert_eq!(frac(3.25), 0.25);
        assert_eq!(frac(-2.0), 0.0);
    }

    #[test]
    fn harmonic_recurrence_preserves_phase_sign_and_amplitude_power() {
        let h = Harmonics::new([(0.3, 4, 0.75), (0.2, 3, 0.5), (0.1, 4, 1.0), (0.4, 6, 1.0)]);
        assert_eq!(h.term([0, 0, 0, 0]), [1.0, 0.0]);
        for multipliers in [[4_i8, -3, 2, -6], [-1, 1, -4, 6], [0, 0, 0, -6]] {
            let phase = multipliers[0] as f64 * 0.3
                + multipliers[1] as f64 * 0.2
                + multipliers[2] as f64 * 0.1
                + multipliers[3] as f64 * 0.4;
            let amplitude = 0.75_f64.powi(multipliers[0].abs() as i32)
                * 0.5_f64.powi(multipliers[1].abs() as i32);
            let [cosine, sine] = h.term(multipliers);
            assert!((cosine - amplitude * phase.cos()).abs() < 1e-15);
            assert!((sine - amplitude * phase.sin()).abs() < 1e-15);
        }
    }

    #[test]
    fn lunar_spherical_and_eqj_round_trip_through_existing_frame() {
        for index in 0..=400 {
            let tt = -73048.5 + f64::from(index) * (146097.0 / 400.0);
            let spherical = calc_moon(tt);
            assert!((0.0..PI2).contains(&spherical.geo_eclip_lon));
            assert!(spherical.geo_eclip_lat.abs() < 0.1);
            assert!((0.002..0.003).contains(&spherical.distance_au));
            let [x, y, z] = geo_moon(tt);
            assert!((hypot3(x, y, z) - spherical.distance_au).abs() < 3e-18);
            let [ex, ey, ez] = mean_ecliptic(&ecliptic_frame(tt), x, y, z);
            let latitude = (ez / spherical.distance_au).asin();
            let longitude = ey.atan2(ex);
            let difference = longitude - spherical.geo_eclip_lon;
            assert!(difference.sin().abs() < 2e-15);
            assert!((latitude - spherical.geo_eclip_lat).abs() < 2e-15);
        }
    }

    #[test]
    fn state_uses_stepped_ut_and_frozen_delta_t_instead_of_center_tt() {
        for ut in [-73048.5, -1.0, 0.0, 9123.25, 73048.5] {
            for delta_t in [-1234.5, 0.0, 86400.0] {
                let tt = ut + delta_t / 86400.0;
                let state = geo_moon_state(ut, tt, delta_t).unwrap();
                // The metadata TT does not control the reference's AddDays.
                assert_eq!(state, geo_moon_state(ut, tt + 42.0, delta_t).unwrap());
                let before = geo_moon((ut - STATE_STEP_DAYS) + delta_t / 86400.0);
                let after = geo_moon((ut + STATE_STEP_DAYS) + delta_t / 86400.0);
                for axis in 0..3 {
                    assert_eq!(
                        state.pos[axis].to_bits(),
                        ((before[axis] + after[axis]) / 2.0).to_bits()
                    );
                    assert_eq!(
                        state.vel[axis].to_bits(),
                        ((after[axis] - before[axis]) / (2.0 * STATE_STEP_DAYS)).to_bits()
                    );
                }
            }
        }
    }

    #[test]
    fn short_state_difference_agrees_with_a_longer_position_difference() {
        for tt in [-73048.5, 0.0, 73048.5] {
            let state = geo_moon_state(tt, tt, 0.0).unwrap();
            let before = geo_moon(tt - 0.001);
            let after = geo_moon(tt + 0.001);
            for axis in 0..3 {
                let slope = (after[axis] - before[axis]) / 0.002;
                assert!((state.vel[axis] - slope).abs() < 5e-9);
            }
            assert!(hypot3(state.vel[0], state.vel[1], state.vel[2]) > 1e-4);
        }
    }

    #[test]
    fn state_rejects_nonfinite_clocks_and_nonfinite_output() {
        for invalid in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert_eq!(
                geo_moon_state(invalid, 0.0, 0.0),
                Err(PlanetError::InvalidClock)
            );
            assert_eq!(
                geo_moon_state(0.0, invalid, 0.0),
                Err(PlanetError::InvalidClock)
            );
            assert_eq!(
                geo_moon_state(0.0, 0.0, invalid),
                Err(PlanetError::InvalidClock)
            );
            assert!(geo_moon(invalid).iter().all(|value| value.is_nan()));
        }
        assert_eq!(
            geo_moon_state(f64::MAX, 0.0, 0.0),
            Err(PlanetError::NonFiniteVector)
        );
    }
}
