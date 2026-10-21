//! Heliocentric vectors and light-travel correction for the Sun and planets.
//!
//! Translated from astronomy-engine 2.1.19, esm/astronomy.js: VsopFormula,
//! VsopDeriv, VsopRotate, CalcVsop, CalcVsopPosVel, CorrectLightTravel,
//! BodyPosition, BackdatePosition, GeoVector and HelioState. Copyright (c)
//! 2019-2023 Don Cross, MIT. See rustcore/NOTICE for the full license.
//! Coefficients come from the pinned local npm source via the checked generator.

use crate::frame::hypot3;
use std::fmt;

#[allow(dead_code)]
mod data {
    include!(concat!(env!("OUT_DIR"), "/planet_data.rs"));
}

/// Speed of light in astronomical units per day, as in the pinned reference.
pub const C_AUDAY: f64 = 173.1446326846693;
const DAYS_PER_MILLENNIUM: f64 = 365250.0;
const TWO_PI: f64 = 2.0 * std::f64::consts::PI;

/// Heliocentric solar and planetary bodies. The Moon has its own module.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Planet {
    Sun,
    Mercury,
    Venus,
    Earth,
    Mars,
    Jupiter,
    Saturn,
    Uranus,
    Neptune,
    Pluto,
}

impl Planet {
    fn model(self) -> Option<&'static [&'static [&'static [[f64; 3]]]]> {
        let index = match self {
            Self::Sun | Self::Pluto => return None,
            Self::Mercury => 0,
            Self::Venus => 1,
            Self::Earth => 2,
            Self::Mars => 3,
            Self::Jupiter => 4,
            Self::Saturn => 5,
            Self::Uranus => 6,
            Self::Neptune => 7,
        };
        Some(data::VSOP[index])
    }
}

/// Position in AU and velocity in AU/day, on the J2000 mean equator.
/// VSOP velocities are analytic; Pluto velocities are separately integrated.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HelioState {
    pub pos: [f64; 3],
    pub vel: [f64; 3],
}

/// Relative vector in AU and the emission clocks in days since J2000.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BackdatedPosition {
    pub vector: [f64; 3],
    pub ut: f64,
    pub tt: f64,
}

/// Failure of the bounded light-travel solver.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PlanetError {
    InvalidClock,
    OutsidePlutoSpan,
    NonFiniteVector,
    TooDistant,
    NonConvergent { delta_days: f64 },
}

impl fmt::Display for PlanetError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidClock => formatter.write_str("Planet clocks must be finite."),
            Self::OutsidePlutoSpan => {
                formatter.write_str("Pluto TT is outside the tabulated ephemeris span.")
            }
            Self::NonFiniteVector => formatter.write_str("Planet vector must be finite."),
            Self::TooDistant => {
                formatter.write_str("Object is too distant for light-travel solver.")
            }
            Self::NonConvergent { delta_days } => write!(
                formatter,
                "Light-travel time solver did not converge: dt = {delta_days}"
            ),
        }
    }
}

impl std::error::Error for PlanetError {}

fn vsop_formula(formula: &[&[[f64; 3]]], t: f64, clamp_angle: bool) -> f64 {
    let mut tpower = 1.0;
    let mut coord = 0.0;
    for series in formula {
        let mut sum = 0.0;
        for [ampl, phas, freq] in *series {
            sum += ampl * (phas + (t * freq)).cos();
        }
        let mut incr = tpower * sum;
        if clamp_angle {
            // Preserve JS remainder, including its sign, for each power.
            incr %= TWO_PI;
        }
        coord += incr;
        tpower *= t;
    }
    coord
}

fn vsop_deriv(formula: &[&[[f64; 3]]], t: f64) -> f64 {
    let mut tpower = 1.0;
    let mut dpower = 0.0;
    let mut deriv = 0.0;
    for (s, series) in formula.iter().enumerate() {
        let mut sin_sum = 0.0;
        let mut cos_sum = 0.0;
        for [ampl, phas, freq] in *series {
            let angle = phas + (t * freq);
            sin_sum += ampl * freq * angle.sin();
            if s > 0 {
                cos_sum += ampl * angle.cos();
            }
        }
        deriv += (s as f64 * dpower * cos_sum) - (tpower * sin_sum);
        dpower = tpower;
        tpower *= t;
    }
    deriv
}

fn vsop_rotate(eclip: [f64; 3]) -> [f64; 3] {
    [
        eclip[0] + 0.000000440360 * eclip[1] - 0.000000190919 * eclip[2],
        -0.000000479966 * eclip[0] + 0.917482137087 * eclip[1] - 0.397776982902 * eclip[2],
        0.397776982902 * eclip[1] + 0.917482137087 * eclip[2],
    ]
}

fn vsop_sphere_to_rect(lon: f64, lat: f64, radius: f64) -> [f64; 3] {
    let r_coslat = radius * lat.cos();
    let coslon = lon.cos();
    let sinlon = lon.sin();
    [r_coslat * coslon, r_coslat * sinlon, radius * lat.sin()]
}

/// Heliocentric position in AU on the J2000 mean equator, at TT days since J2000.
///
/// This low-level series evaluator does not validate TT or an ephemeris span.
/// Callers must validate clocks before use; nonfinite values can produce NaN.
/// Pluto permits only its table and the adjacent light-time interval; outside
/// that range this unchecked helper returns NaNs rather than crawling.
pub fn helio_vector(body: Planet, tt: f64) -> [f64; 3] {
    if body == Planet::Pluto {
        return helio_state(body, tt).pos;
    }
    let Some(model) = body.model() else {
        return [0.0; 3];
    };
    let t = tt / DAYS_PER_MILLENNIUM;
    let lon = vsop_formula(model[0], t, true);
    let lat = vsop_formula(model[1], t, false);
    let rad = vsop_formula(model[2], t, false);
    vsop_rotate(vsop_sphere_to_rect(lon, lat, rad))
}

/// Heliocentric position and velocity, at TT days since J2000.
///
/// Like [`helio_vector`], this series evaluator expects a validated TT clock.
pub fn helio_state(body: Planet, tt: f64) -> HelioState {
    if body == Planet::Pluto {
        return crate::pluto::helio_state_for_light_time(tt).unwrap_or(HelioState {
            pos: [f64::NAN; 3],
            vel: [f64::NAN; 3],
        });
    }
    let Some(model) = body.model() else {
        return HelioState {
            pos: [0.0; 3],
            vel: [0.0; 3],
        };
    };
    let t = tt / DAYS_PER_MILLENNIUM;
    let lon = vsop_formula(model[0], t, true);
    let lat = vsop_formula(model[1], t, false);
    let rad = vsop_formula(model[2], t, false);
    let dlon_dt = vsop_deriv(model[0], t);
    let dlat_dt = vsop_deriv(model[1], t);
    let drad_dt = vsop_deriv(model[2], t);

    let coslon = lon.cos();
    let sinlon = lon.sin();
    let coslat = lat.cos();
    let sinlat = lat.sin();
    let vx = (drad_dt * coslat * coslon)
        - (rad * sinlat * coslon * dlat_dt)
        - (rad * coslat * sinlon * dlon_dt);
    let vy = (drad_dt * coslat * sinlon) - (rad * sinlat * sinlon * dlat_dt)
        + (rad * coslat * coslon * dlon_dt);
    let vz = (drad_dt * sinlat) + (rad * coslat * dlat_dt);
    HelioState {
        pos: vsop_rotate(vsop_sphere_to_rect(lon, lat, rad)),
        vel: vsop_rotate([
            vx / DAYS_PER_MILLENNIUM,
            vy / DAYS_PER_MILLENNIUM,
            vz / DAYS_PER_MILLENNIUM,
        ]),
    }
}

fn validate_clock(ut: f64, tt: f64, delta_t_seconds: f64) -> Result<(), PlanetError> {
    if ut.is_finite() && tt.is_finite() && delta_t_seconds.is_finite() {
        Ok(())
    } else {
        Err(PlanetError::InvalidClock)
    }
}

fn correct_light_travel(
    ut: f64,
    tt: f64,
    delta_t_seconds: f64,
    mut position: impl FnMut(f64, f64) -> [f64; 3],
) -> Result<BackdatedPosition, PlanetError> {
    validate_clock(ut, tt, delta_t_seconds)?;
    let mut emission_ut = ut;
    let mut emission_tt = tt;
    let mut delta_days = 0.0;
    for _ in 0..10 {
        let vector = position(emission_ut, emission_tt);
        if !vector.iter().all(|component| component.is_finite()) {
            return Err(PlanetError::NonFiniteVector);
        }
        let light_days = hypot3(vector[0], vector[1], vector[2]) / C_AUDAY;
        if light_days > 1.0 {
            return Err(PlanetError::TooDistant);
        }
        // AstroTime.AddDays adds to the original UT, then recomputes TT.
        // Keep the caller's Delta T fixed as src/ephemeris.ts does throughout
        // its one calculation; adding directly to TT changes rounding.
        let next_ut = ut + (-light_days);
        let next_tt = next_ut + delta_t_seconds / 86400.0;
        validate_clock(next_ut, next_tt, delta_t_seconds)?;
        delta_days = (next_tt - emission_tt).abs();
        if delta_days < 1.0e-9 {
            // Return the vector and time just evaluated, not the next guess.
            return Ok(BackdatedPosition {
                vector,
                ut: emission_ut,
                tt: emission_tt,
            });
        }
        emission_ut = next_ut;
        emission_tt = next_tt;
    }
    Err(PlanetError::NonConvergent { delta_days })
}

/// Relative vector at light emission, on the J2000 mean equator.
///
/// `ut` and `tt` are observation days since J2000. `delta_t_seconds` is frozen
/// for recomputing TT after every UT light-time step. The initial TT is used
/// as supplied, even when its last bits differ from `ut + delta_t/86400`.
/// With aberration, the observer is also backdated; otherwise its position
/// is held at observation time. This is the reference's first-order treatment.
pub fn backdate_position(
    observer: Planet,
    target: Planet,
    ut: f64,
    tt: f64,
    delta_t_seconds: f64,
    aberration: bool,
) -> Result<BackdatedPosition, PlanetError> {
    validate_clock(ut, tt, delta_t_seconds)?;
    if observer == Planet::Pluto || target == Planet::Pluto {
        crate::pluto::validate_table_tt(tt).map_err(|_| PlanetError::OutsidePlutoSpan)?;
    }
    let observer_pos = if aberration {
        [0.0; 3]
    } else {
        helio_vector(observer, tt)
    };
    correct_light_travel(ut, tt, delta_t_seconds, |_, emission_tt| {
        let origin = if aberration {
            helio_vector(observer, emission_tt)
        } else {
            observer_pos
        };
        let destination = helio_vector(target, emission_tt);
        [
            destination[0] - origin[0],
            destination[1] - origin[1],
            destination[2] - origin[2],
        ]
    })
}

/// Geocentric vector in AU, corrected for light travel and optional aberration.
///
/// Clock arguments follow [`backdate_position`]. Earth returns exact zeros.
pub fn geo_vector(
    body: Planet,
    ut: f64,
    tt: f64,
    delta_t_seconds: f64,
    aberration: bool,
) -> Result<[f64; 3], PlanetError> {
    validate_clock(ut, tt, delta_t_seconds)?;
    if body == Planet::Earth {
        return Ok([0.0; 3]);
    }
    Ok(backdate_position(Planet::Earth, body, ut, tt, delta_t_seconds, aberration)?.vector)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PLANETS: [Planet; 10] = [
        Planet::Sun,
        Planet::Mercury,
        Planet::Venus,
        Planet::Earth,
        Planet::Mars,
        Planet::Jupiter,
        Planet::Saturn,
        Planet::Uranus,
        Planet::Neptune,
        Planet::Pluto,
    ];

    #[test]
    fn constant_frequency_series_reduces_to_polynomial_and_its_derivative() {
        let polynomial: &[&[[f64; 3]]] =
            &[&[[2.0, 0.0, 0.0]], &[[3.0, 0.0, 0.0]], &[[5.0, 0.0, 0.0]]];
        for t in [-2.0, 0.0, 0.5, 2.0] {
            assert_eq!(
                vsop_formula(polynomial, t, false),
                2.0 + 3.0 * t + 5.0 * t * t
            );
            assert_eq!(vsop_deriv(polynomial, t), 3.0 + 10.0 * t);
        }
    }

    #[test]
    fn angular_series_takes_signed_remainder_before_adding_each_power() {
        let series: &[&[[f64; 3]]] =
            &[&[[11.0, 0.0, 0.0]], &[[1.0, 0.0, 0.0]], &[[2.75, 0.0, 0.0]]];
        let expected = 11.0 % TWO_PI + (-2.0) % TWO_PI + 11.0 % TWO_PI;
        assert_eq!(
            vsop_formula(series, -2.0, true).to_bits(),
            expected.to_bits()
        );
        assert_ne!(expected.to_bits(), ((11.0 - 2.0 + 11.0) % TWO_PI).to_bits());
    }

    #[test]
    fn derivative_differentiates_both_phase_and_power_at_j2000() {
        let series: &[&[[f64; 3]]] = &[
            &[[2.0, 0.25, 3.0]],
            &[[4.0, 0.75, 5.0]],
            &[[6.0, 1.25, 7.0]],
        ];
        let expected = -(2.0 * 3.0 * 0.25_f64.sin()) + 4.0 * 0.75_f64.cos();
        assert_eq!(vsop_deriv(series, 0.0).to_bits(), expected.to_bits());
    }

    #[test]
    fn rotation_preserves_reference_frame_bias_on_each_basis_vector() {
        assert_eq!(vsop_rotate([1.0, 0.0, 0.0]), [1.0, -0.000000479966, 0.0]);
        assert_eq!(
            vsop_rotate([0.0, 1.0, 0.0]),
            [0.000000440360, 0.917482137087, 0.397776982902]
        );
        assert_eq!(
            vsop_rotate([0.0, 0.0, 1.0]),
            [-0.000000190919, -0.397776982902, 0.917482137087]
        );
    }

    #[test]
    fn position_state_agree_bitwise_and_velocity_matches_finite_difference() {
        for body in PLANETS {
            for tt in [-73048.5, -36524.5, -0.5, 0.0, 18262.75, 73048.5] {
                let state = helio_state(body, tt);
                let position = helio_vector(body, tt);
                let earlier = helio_vector(body, tt - 0.001);
                let later = helio_vector(body, tt + 0.001);
                for axis in 0..3 {
                    assert_eq!(position[axis].to_bits(), state.pos[axis].to_bits());
                    // Pluto blends independently integrated positions and
                    // velocities. Its velocity is not the derivative of the
                    // fade-mixed position; that analytic invariant is VSOP-only.
                    if body == Planet::Pluto {
                        continue;
                    }
                    let numeric_velocity = (later[axis] - earlier[axis]) / 0.002;
                    assert!(
                        (state.vel[axis] - numeric_velocity).abs() < 2.0e-9,
                        "{body:?}, TT {tt}, axis {axis}: {} vs {numeric_velocity}",
                        state.vel[axis]
                    );
                }
            }
        }
    }

    #[test]
    fn sun_origin_and_geocentric_earth_are_positive_zero() {
        for tt in [-73048.5, 0.0, 73048.5] {
            let state = helio_state(Planet::Sun, tt);
            for value in state.pos.into_iter().chain(state.vel) {
                assert_eq!(value.to_bits(), 0.0_f64.to_bits());
            }
            for aberration in [false, true] {
                for value in geo_vector(Planet::Earth, tt, tt, 0.0, aberration).unwrap() {
                    assert_eq!(value.to_bits(), 0.0_f64.to_bits());
                }
            }
        }
    }

    #[test]
    fn sun_without_aberration_is_negative_earth_at_observation() {
        for tt in [-73048.5, 0.0, 73048.5] {
            let earth = helio_vector(Planet::Earth, tt);
            let sun = geo_vector(Planet::Sun, tt, tt, 0.0, false).unwrap();
            for axis in 0..3 {
                assert_eq!(sun[axis].to_bits(), (-earth[axis]).to_bits());
            }
        }
    }

    #[test]
    fn aberration_backdates_observer_and_light_time_equation_converges() {
        for target in PLANETS {
            for aberration in [false, true] {
                let ut = 1234.56789;
                let delta_t = 67.123;
                let tt = ut + delta_t / 86400.0;
                let result =
                    backdate_position(Planet::Earth, target, ut, tt, delta_t, aberration).unwrap();
                let observer_tt = if aberration { result.tt } else { tt };
                let origin = helio_vector(Planet::Earth, observer_tt);
                let destination = helio_vector(target, result.tt);
                for axis in 0..3 {
                    assert_eq!(
                        result.vector[axis].to_bits(),
                        (destination[axis] - origin[axis]).to_bits()
                    );
                }
                let light_days =
                    hypot3(result.vector[0], result.vector[1], result.vector[2]) / C_AUDAY;
                let proposed_tt = (ut + (-light_days)) + delta_t / 86400.0;
                assert!((proposed_tt - result.tt).abs() < 1.0e-9);
                assert!(result.ut <= ut);
                assert_eq!(
                    geo_vector(target, ut, tt, delta_t, aberration).unwrap(),
                    result.vector
                );
            }
        }
    }

    #[test]
    fn light_solver_uses_initial_tt_then_frozen_delta_t_on_ut_steps() {
        let mut evaluated = Vec::new();
        let result = correct_light_travel(10.0, 10.75, 43200.0, |ut, tt| {
            evaluated.push((ut, tt));
            [C_AUDAY / 2.0, 0.0, 0.0]
        })
        .unwrap();
        assert_eq!(evaluated, [(10.0, 10.75), (9.5, 10.0)]);
        assert_eq!((result.ut, result.tt), (9.5, 10.0));
    }

    #[test]
    fn convergence_limit_is_strict_and_returns_evaluated_time() {
        let mut calls = 0;
        let result = correct_light_travel(0.0, 1.0e-9, 0.0, |_, _| {
            calls += 1;
            [0.0; 3]
        })
        .unwrap();
        assert_eq!(calls, 2);
        assert_eq!(result.tt, 0.0);

        let initial_tt = f64::from_bits(1.0e-9_f64.to_bits() - 1);
        let result = correct_light_travel(0.0, initial_tt, 0.0, |_, _| [0.0; 3]).unwrap();
        assert_eq!(result.tt.to_bits(), initial_tt.to_bits());
    }

    #[test]
    fn light_solver_accepts_exactly_one_light_day_and_rejects_more() {
        let result = correct_light_travel(0.0, 0.0, 0.0, |_, _| [C_AUDAY, 0.0, 0.0]).unwrap();
        assert_eq!((result.ut, result.tt), (-1.0, -1.0));
        let more = f64::from_bits(C_AUDAY.to_bits() + 1);
        assert_eq!(
            correct_light_travel(0.0, 0.0, 0.0, |_, _| [more, 0.0, 0.0]),
            Err(PlanetError::TooDistant)
        );
    }

    #[test]
    fn light_solver_stops_after_reference_iteration_budget() {
        let mut calls = 0;
        let result = correct_light_travel(0.0, 0.0, 0.0, |_, _| {
            calls += 1;
            [if calls % 2 == 0 { 0.0 } else { C_AUDAY / 2.0 }, 0.0, 0.0]
        });
        assert_eq!(calls, 10);
        assert_eq!(result, Err(PlanetError::NonConvergent { delta_days: 0.5 }));
    }

    #[test]
    fn pluto_observation_span_does_not_reject_retarded_endpoint_samples() {
        for tt in [-730000.0, 730000.0] {
            let value = backdate_position(Planet::Earth, Planet::Pluto, tt, tt, 0.0, true).unwrap();
            assert!(value.tt < tt);
            assert!(value.vector.iter().all(|axis| axis.is_finite()));
        }
        for tt in [-730000.0000001, 730000.0000001] {
            for (observer, target) in [
                (Planet::Earth, Planet::Pluto),
                (Planet::Pluto, Planet::Earth),
            ] {
                assert_eq!(
                    backdate_position(observer, target, tt, tt, 0.0, true),
                    Err(PlanetError::OutsidePlutoSpan)
                );
            }
            assert_eq!(
                geo_vector(Planet::Pluto, tt, tt, 0.0, false),
                Err(PlanetError::OutsidePlutoSpan)
            );
        }
    }

    #[test]
    fn invalid_clocks_and_nonfinite_vectors_fail_without_hanging() {
        for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            for (ut, tt, delta_t) in [(value, 0.0, 0.0), (0.0, value, 0.0), (0.0, 0.0, value)] {
                assert_eq!(
                    geo_vector(Planet::Earth, ut, tt, delta_t, true),
                    Err(PlanetError::InvalidClock)
                );
                assert_eq!(
                    backdate_position(Planet::Sun, Planet::Sun, ut, tt, delta_t, false),
                    Err(PlanetError::InvalidClock)
                );
            }
            assert_eq!(
                correct_light_travel(0.0, 0.0, 0.0, |_, _| [value, 0.0, 0.0]),
                Err(PlanetError::NonFiniteVector)
            );
        }
        assert_eq!(
            correct_light_travel(f64::MAX, f64::MAX, f64::MAX, |_, _| [0.0; 3]),
            Err(PlanetError::InvalidClock)
        );
    }
}
