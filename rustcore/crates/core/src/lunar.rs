//! Lunar ecliptic positions, osculating nodes and longitude finite differences.
//!
//! Translated from the Moon/node path of `src/ephemeris.ts` (repository MIT).
//! Moon vectors come from the separate pinned astronomy-engine translation.
//! Preserve its short state difference and the engine's longer node-speed
//! difference, including their roundoff, rather than smoothing the node.

use crate::deltat::DeltaTError;
use crate::frame::{ecliptic_frame, ecliptic_of_date, mean_ecliptic, EclipticAngles};
use crate::moon::{geo_moon, geo_moon_state};
use crate::planets::{HelioState, PlanetError};
use crate::time_scales::{elapsed_days, time_basis, TimeBasis, TimeScaleName};
use crate::{normalize_longitude, LongitudeError};
use std::fmt;

const RAD: f64 = 180.0 / std::f64::consts::PI;
const DAY: f64 = 86_400_000.0;
pub const SPEED_STEP_DAYS: f64 = 0.001;
pub const NODE_SPEED_STEP_DAYS: f64 = 0.25;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LunarBody {
    Moon,
    NorthNode,
    SouthNode,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum LunarError {
    Clock(PlanetError),
    Longitude(LongitudeError),
    Time(DeltaTError),
    OutsideSpan,
}

impl fmt::Display for LunarError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Clock(error) => error.fmt(formatter),
            Self::Longitude(error) => error.fmt(formatter),
            Self::Time(error) => error.fmt(formatter),
            Self::OutsideSpan => formatter.write_str(
                "The instant is outside the ephemeris span: its Terrestrial Time, and that of each speed sample, must lie between 0001-04-30T12:00 and 3998-09-03T12:00 TT, the years astronomy-engine tabulates (EPHEMERIS_SPAN).",
            ),
        }
    }
}

impl std::error::Error for LunarError {}

fn finite_clock(ut: f64, tt: f64, delta_t: f64) -> Result<(), LunarError> {
    if ut.is_finite() && tt.is_finite() && delta_t.is_finite() {
        Ok(())
    } else {
        Err(LunarError::Clock(PlanetError::InvalidClock))
    }
}

/// The Moon on the true ecliptic of date, in degrees. Clocks are J2000 days
/// with fixed Delta T in seconds. Only TT affects this position; all supplied
/// fields must be finite. This intermediate helper does not impose a span.
pub fn moon_of_date(ut: f64, tt: f64, delta_t: f64) -> Result<EclipticAngles, LunarError> {
    finite_clock(ut, tt, delta_t)?;
    let [x, y, z] = geo_moon(tt);
    ecliptic_of_date(x, y, z, tt).map_err(LunarError::Longitude)
}

fn node_from_state(state: &HelioState, tt: f64) -> Result<f64, LongitudeError> {
    let [x, y, z] = state.pos;
    let [vx, vy, vz] = state.vel;
    let frame = ecliptic_frame(tt);
    let [hx, hy, _] = mean_ecliptic(&frame, y * vz - z * vy, z * vx - x * vz, x * vy - y * vx);
    normalize_longitude(hx.atan2(-hy) * RAD + frame.tilt.dpsi / 3600.0)
}

/// Ascending node of the instantaneous geocentric orbit, in true-ecliptic
/// degrees. The state uses the reference's UT1 steps and fixed Delta T;
/// the plane is rotated with the supplied center TT, even on split clocks.
pub fn true_node_longitude(ut: f64, tt: f64, delta_t: f64) -> Result<f64, LunarError> {
    let state = geo_moon_state(ut, tt, delta_t).map_err(LunarError::Clock)?;
    node_from_state(&state, tt).map_err(LunarError::Longitude)
}

fn longitude_on(body: LunarBody, basis: &TimeBasis) -> Result<f64, LunarError> {
    // Match timeOf: validate the central TT of each outer speed sample. The
    // internal state samples retain astronomy-engine's unchecked small step.
    if !(basis.tt_days >= -730_000.0 && basis.tt_days <= 730_000.0) {
        return Err(LunarError::OutsideSpan);
    }
    let (ut, tt, dt) = (basis.ut1_days, basis.tt_days, basis.delta_t.seconds);
    match body {
        LunarBody::Moon => Ok(moon_of_date(ut, tt, dt)?.lon),
        LunarBody::NorthNode => true_node_longitude(ut, tt, dt),
        LunarBody::SouthNode => normalize_longitude(true_node_longitude(ut, tt, dt)? + 180.0)
            .map_err(LunarError::Longitude),
    }
}

/// Lunar longitude at epoch milliseconds on the input scale, with an optional
/// fixed Delta T in seconds. Each evaluation checks the reference TT span.
/// This native helper expects validated milliseconds and a finite pin.
pub fn lunar_longitude(
    body: LunarBody,
    ms: f64,
    scale: TimeScaleName,
    pin: Option<f64>,
) -> Result<f64, LunarError> {
    let basis = time_basis(ms, scale, pin).map_err(LunarError::Time)?;
    longitude_on(body, &basis)
}

fn central_difference(
    mut longitude_of: impl FnMut(&TimeBasis) -> Result<f64, LunarError>,
    ms: f64,
    scale: TimeScaleName,
    pin: Option<f64>,
    step_days: f64,
) -> Result<f64, LunarError> {
    let before = time_basis(ms + (-step_days) * DAY, scale, pin).map_err(LunarError::Time)?;
    let lon_before = longitude_of(&before)?;
    let after = time_basis(ms + step_days * DAY, scale, pin).map_err(LunarError::Time)?;
    let mut difference = longitude_of(&after)? - lon_before;
    // The strict endpoints and the single-turn correction are intentional.
    if difference > 180.0 {
        difference -= 360.0;
    }
    if difference < -180.0 {
        difference += 360.0;
    }
    Ok(difference / elapsed_days(&before, &after, 2.0 * step_days))
}

/// Central-difference longitude speed in degrees per elapsed day. Each outer
/// sample resolves its own time basis; leap/model handoffs use elapsed TT.
/// South-node speed is evaluated independently, as longitudeSpeed does; the
/// future position-row assembler will copy the north-node speed to both rows.
pub fn lunar_longitude_speed(
    body: LunarBody,
    ms: f64,
    scale: TimeScaleName,
    pin: Option<f64>,
) -> Result<f64, LunarError> {
    let step_days = match body {
        LunarBody::Moon => SPEED_STEP_DAYS,
        LunarBody::NorthNode | LunarBody::SouthNode => NODE_SPEED_STEP_DAYS,
    };
    central_difference(|basis| longitude_on(body, basis), ms, scale, pin, step_days)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::date_input::date_from_iso;

    #[test]
    fn angular_momentum_selects_ascending_node_and_adds_nutation() {
        // At J2000, rotate a simple prograde inclined orbit from mean ecliptic
        // into EQJ. Its ascending node is the positive x axis.
        let obliquity = crate::nutation::tilt(0.0).mobl / RAD;
        let inclination = 0.1_f64;
        let state = HelioState {
            pos: [1.0, 0.0, 0.0],
            vel: [
                0.0,
                inclination.cos() * obliquity.cos() - inclination.sin() * obliquity.sin(),
                inclination.cos() * obliquity.sin() + inclination.sin() * obliquity.cos(),
            ],
        };
        let expected = normalize_longitude(crate::nutation::tilt(0.0).dpsi / 3600.0).unwrap();
        assert_eq!(
            node_from_state(&state, 0.0).unwrap().to_bits(),
            expected.to_bits()
        );
        let reversed = HelioState {
            vel: state.vel.map(|v| -v),
            ..state
        };
        let opposite = node_from_state(&reversed, 0.0).unwrap();
        assert!((opposite - normalize_longitude(expected + 180.0).unwrap()).abs() < 1e-13);
    }

    #[test]
    fn node_uses_state_average_and_finite_difference_on_supplied_clock() {
        for ut in [-73048.5, 0.0, 73048.5] {
            let tt = ut + 70.0 / 86400.0;
            let state = geo_moon_state(ut, tt, 70.0).unwrap();
            let expected = node_from_state(&state, tt).unwrap();
            assert_eq!(
                true_node_longitude(ut, tt, 70.0).unwrap().to_bits(),
                expected.to_bits()
            );
            assert!((0.0..360.0).contains(&expected));
        }
    }

    #[test]
    fn differences_wrap_once_and_keep_antipodal_endpoint_signs() {
        for (first, last, expected) in [
            (359.75, 0.25, 1.0),
            (0.25, 359.75, -1.0),
            (0.0, 180.0, 360.0),
            (180.0, 0.0, -360.0),
            (1.0, 1.0, 0.0),
        ] {
            let mut calls = 0;
            let actual = central_difference(
                |_| {
                    calls += 1;
                    Ok(if calls == 1 { first } else { last })
                },
                946_728_000_000.0,
                TimeScaleName::Ut1,
                Some(0.0),
                0.25,
            )
            .unwrap();
            assert_eq!(calls, 2);
            assert_eq!(actual, expected);
        }
    }

    #[test]
    fn central_difference_resolves_each_sample_and_uses_elapsed_time_across_seams() {
        for iso in [
            "1940-12-31T18:00:00Z",
            "1972-01-01",
            "2017-01-01",
            "2027-10-02",
        ] {
            let at = date_from_iso(iso).unwrap();
            for scale in [TimeScaleName::Utc, TimeScaleName::Ut1, TimeScaleName::Tt] {
                for pin in [None, Some(-123.5)] {
                    for step in [SPEED_STEP_DAYS, NODE_SPEED_STEP_DAYS] {
                        let before = time_basis(at - step * DAY, scale, pin).unwrap();
                        let after = time_basis(at + step * DAY, scale, pin).unwrap();
                        let expected = 1.0 / elapsed_days(&before, &after, 2.0 * step);
                        let mut seen = Vec::new();
                        let actual = central_difference(
                            |basis| {
                                seen.push(*basis);
                                Ok(seen.len() as f64)
                            },
                            at,
                            scale,
                            pin,
                            step,
                        )
                        .unwrap();
                        assert_eq!(seen, [before, after]);
                        assert_eq!(actual.to_bits(), expected.to_bits());
                    }
                }
            }
        }
    }

    #[test]
    fn lunar_speeds_use_their_own_steps_and_south_node_wrap() {
        for iso in ["1800-01-01", "2000-01-01T12:00:00Z", "2200-01-01"] {
            let at = date_from_iso(iso).unwrap();
            for body in [LunarBody::Moon, LunarBody::NorthNode, LunarBody::SouthNode] {
                let step = if body == LunarBody::Moon { 0.001 } else { 0.25 };
                let before =
                    lunar_longitude(body, at - step * DAY, TimeScaleName::Utc, None).unwrap();
                let after =
                    lunar_longitude(body, at + step * DAY, TimeScaleName::Utc, None).unwrap();
                let speed = lunar_longitude_speed(body, at, TimeScaleName::Utc, None).unwrap();
                assert_eq!(speed.to_bits(), ((after - before) / (2.0 * step)).to_bits());
                assert!(speed.is_finite());
            }
            let north =
                lunar_longitude(LunarBody::NorthNode, at, TimeScaleName::Utc, None).unwrap();
            let south =
                lunar_longitude(LunarBody::SouthNode, at, TimeScaleName::Utc, None).unwrap();
            assert_eq!(
                south.to_bits(),
                normalize_longitude(north + 180.0).unwrap().to_bits()
            );
        }
    }

    #[test]
    fn longitude_span_is_inclusive_and_speed_checks_each_outer_sample() {
        for edge in [-730_000.0, 730_000.0] {
            let at = 946_728_000_000.0 + edge * DAY;
            for body in [LunarBody::Moon, LunarBody::NorthNode, LunarBody::SouthNode] {
                assert!(lunar_longitude(body, at, TimeScaleName::Tt, Some(0.0)).is_ok());
                assert_eq!(
                    lunar_longitude_speed(body, at, TimeScaleName::Tt, Some(0.0)),
                    Err(LunarError::OutsideSpan)
                );
                let outside = at + edge.signum() * DAY;
                assert_eq!(
                    lunar_longitude(body, outside, TimeScaleName::Tt, Some(0.0)),
                    Err(LunarError::OutsideSpan)
                );
            }
        }
    }

    #[test]
    fn nonfinite_clocks_are_refused_and_interleaved_calls_have_no_shared_state() {
        for invalid in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            for (ut, tt, dt) in [
                (invalid, 0.0, 0.0),
                (0.0, invalid, 0.0),
                (0.0, 0.0, invalid),
            ] {
                assert_eq!(
                    moon_of_date(ut, tt, dt),
                    Err(LunarError::Clock(PlanetError::InvalidClock))
                );
                assert_eq!(
                    true_node_longitude(ut, tt, dt),
                    Err(LunarError::Clock(PlanetError::InvalidClock))
                );
            }
        }
        let first = true_node_longitude(-123.5, -123.49, 72.0).unwrap();
        true_node_longitude(41234.5, 41234.6, -500.0).unwrap();
        assert_eq!(
            first.to_bits(),
            true_node_longitude(-123.5, -123.49, 72.0)
                .unwrap()
                .to_bits()
        );
    }
}
