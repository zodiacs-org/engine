//! Complete position rows and clock-aware longitude sampling.
//!
//! Translated from `src/ephemeris.ts` and `src/reference-span.ts` (MIT).
//! This module assembles the native series and rotations; it never calls the
//! TypeScript engine. Parity with that engine is a compatibility check only.

use crate::deltat::DeltaTError;
use crate::frame::{ecliptic_of_date, EclipticAngles};
use crate::lunar::{moon_of_date, true_node_longitude, LunarError};
use crate::planets::{geo_vector, Planet, PlanetError};
use crate::signs::{degree_in_sign, sign_for_longitude};
use crate::time_scales::{elapsed_days, time_basis, TimeBasis, TimeScaleName};
use crate::{normalize_longitude, LongitudeError};
use std::fmt;

pub use crate::lunar::{NODE_SPEED_STEP_DAYS, SPEED_STEP_DAYS};

const DAY: f64 = 86_400_000.0;
pub const EPHEMERIS_SPAN_FROM: f64 = -730_000.0;
pub const EPHEMERIS_SPAN_TO: f64 = 730_000.0;
pub const REFERENCE_SPAN_FROM_MS: f64 = -5_364_662_400_000.0;
pub const REFERENCE_SPAN_TO_MS: f64 = 7_258_118_400_000.0;

/// The bodies returned by the engine's ordinary `positions` function.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Body {
    Sun,
    Moon,
    Mercury,
    Venus,
    Mars,
    Jupiter,
    Saturn,
    Uranus,
    Neptune,
    Pluto,
    NorthNode,
    SouthNode,
}

impl Body {
    pub const fn name(self) -> &'static str {
        match self {
            Self::Sun => "Sun",
            Self::Moon => "Moon",
            Self::Mercury => "Mercury",
            Self::Venus => "Venus",
            Self::Mars => "Mars",
            Self::Jupiter => "Jupiter",
            Self::Saturn => "Saturn",
            Self::Uranus => "Uranus",
            Self::Neptune => "Neptune",
            Self::Pluto => "Pluto",
            Self::NorthNode => "North Node",
            Self::SouthNode => "South Node",
        }
    }

    pub fn from_name(name: &str) -> Option<Self> {
        BODIES.into_iter().find(|body| body.name() == name)
    }

    const fn planet(self) -> Option<Planet> {
        match self {
            Self::Sun => Some(Planet::Sun),
            Self::Mercury => Some(Planet::Mercury),
            Self::Venus => Some(Planet::Venus),
            Self::Mars => Some(Planet::Mars),
            Self::Jupiter => Some(Planet::Jupiter),
            Self::Saturn => Some(Planet::Saturn),
            Self::Uranus => Some(Planet::Uranus),
            Self::Neptune => Some(Planet::Neptune),
            Self::Pluto => Some(Planet::Pluto),
            Self::Moon | Self::NorthNode | Self::SouthNode => None,
        }
    }
}

pub const BODIES: [Body; 12] = [
    Body::Sun,
    Body::Moon,
    Body::Mercury,
    Body::Venus,
    Body::Mars,
    Body::Jupiter,
    Body::Saturn,
    Body::Uranus,
    Body::Neptune,
    Body::Pluto,
    Body::NorthNode,
    Body::SouthNode,
];

const PLANETS: [Body; 9] = [
    Body::Sun,
    Body::Mercury,
    Body::Venus,
    Body::Mars,
    Body::Jupiter,
    Body::Saturn,
    Body::Uranus,
    Body::Neptune,
    Body::Pluto,
];

/// Apparent geocentric tropical coordinates in degrees and speed in degrees
/// per elapsed day, with the reference engine's sign annotations.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BodyPosition {
    pub body: Body,
    pub lon: f64,
    pub lat: f64,
    pub speed: f64,
    pub retrograde: bool,
    pub sign: &'static str,
    pub degree: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum EphemerisError {
    Time(DeltaTError),
    Planet(PlanetError),
    Lunar(LunarError),
    Longitude(LongitudeError),
    OutsideSpan,
}

impl fmt::Display for EphemerisError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Time(error) => error.fmt(formatter),
            Self::Planet(error) => error.fmt(formatter),
            Self::Lunar(error) => error.fmt(formatter),
            Self::Longitude(error) => error.fmt(formatter),
            Self::OutsideSpan => formatter.write_str(
                "The instant is outside the ephemeris span: its Terrestrial Time, and that of each speed sample, must lie between 0001-04-30T12:00 and 3998-09-03T12:00 TT, the years astronomy-engine tabulates (EPHEMERIS_SPAN).",
            ),
        }
    }
}

impl std::error::Error for EphemerisError {}

fn checked_basis(
    ms: f64,
    scale: TimeScaleName,
    pin: Option<f64>,
) -> Result<TimeBasis, EphemerisError> {
    time_basis(ms, scale, pin).map_err(EphemerisError::Time)
}

/// Check each outer sample before any ephemeris work, including Pluto's
/// integration. The light-time and lunar-state solvers retain their own
/// short internal samples, exactly as the TypeScript `timeOf` call does.
pub fn check_ephemeris_span(basis: &TimeBasis) -> Result<(), EphemerisError> {
    if basis.tt_days >= EPHEMERIS_SPAN_FROM && basis.tt_days <= EPHEMERIS_SPAN_TO {
        Ok(())
    } else {
        Err(EphemerisError::OutsideSpan)
    }
}

fn coordinates_on(body: Body, basis: &TimeBasis) -> Result<EclipticAngles, EphemerisError> {
    check_ephemeris_span(basis)?;
    // time_basis uses exactly MakeTime's ut + DeltaT / 86400 operation order.
    let (ut, tt, dt) = (basis.ut1_days, basis.tt_days, basis.delta_t.seconds);
    match body {
        Body::Moon => moon_of_date(ut, tt, dt).map_err(EphemerisError::Lunar),
        Body::NorthNode | Body::SouthNode => {
            let north = true_node_longitude(ut, tt, dt).map_err(EphemerisError::Lunar)?;
            Ok(EclipticAngles {
                lon: if body == Body::NorthNode {
                    north
                } else {
                    normalize_longitude(north + 180.0).map_err(EphemerisError::Longitude)?
                },
                lat: 0.0,
            })
        }
        _ => {
            let [x, y, z] = geo_vector(body.planet().unwrap(), ut, tt, dt, true)
                .map_err(EphemerisError::Planet)?;
            ecliptic_of_date(x, y, z, tt).map_err(EphemerisError::Longitude)
        }
    }
}

/// Longitude at epoch milliseconds on the specified input scale, with an
/// optional pinned Delta T in seconds. Milliseconds and the pin are validated
/// by the language boundary; each sample's resulting TT is checked here.
pub fn longitude_at(
    body: Body,
    ms: f64,
    scale: TimeScaleName,
    pin: Option<f64>,
) -> Result<f64, EphemerisError> {
    Ok(coordinates_on(body, &checked_basis(ms, scale, pin)?)?.lon)
}

/// Longitude at a UTC epoch-millisecond instant on the engine's time basis.
pub fn body_longitude(body: Body, ms: f64) -> Result<f64, EphemerisError> {
    longitude_at(body, ms, TimeScaleName::Utc, None)
}

fn central_difference(
    mut longitude_of: impl FnMut(&TimeBasis) -> Result<f64, EphemerisError>,
    ms: f64,
    scale: TimeScaleName,
    pin: Option<f64>,
    step_days: f64,
) -> Result<f64, EphemerisError> {
    let before = checked_basis(ms + (-step_days) * DAY, scale, pin)?;
    let lon_before = longitude_of(&before)?;
    let after = checked_basis(ms + step_days * DAY, scale, pin)?;
    let mut difference = longitude_of(&after)? - lon_before;
    if difference > 180.0 {
        difference -= 360.0;
    }
    if difference < -180.0 {
        difference += 360.0;
    }
    Ok(difference / elapsed_days(&before, &after, 2.0 * step_days))
}

/// Central-difference longitude speed in degrees per elapsed day. Each
/// sample resolves its own time basis, including UTC leap/model handoffs.
pub fn longitude_speed_on(
    body: Body,
    ms: f64,
    scale: TimeScaleName,
    pin: Option<f64>,
) -> Result<f64, EphemerisError> {
    let step_days = match body {
        Body::NorthNode | Body::SouthNode => NODE_SPEED_STEP_DAYS,
        _ => SPEED_STEP_DAYS,
    };
    central_difference(
        |basis| Ok(coordinates_on(body, basis)?.lon),
        ms,
        scale,
        pin,
        step_days,
    )
}

/// Longitude speed at a UTC epoch-millisecond instant.
pub fn longitude_speed(body: Body, ms: f64) -> Result<f64, EphemerisError> {
    longitude_speed_on(body, ms, TimeScaleName::Utc, None)
}

fn position(body: Body, lon: f64, lat: f64, speed: f64) -> Result<BodyPosition, EphemerisError> {
    Ok(BodyPosition {
        body,
        lon,
        lat,
        speed,
        retrograde: speed < 0.0,
        sign: sign_for_longitude(lon)
            .map_err(EphemerisError::Longitude)?
            .slug,
        degree: degree_in_sign(lon).map_err(EphemerisError::Longitude)?,
    })
}

/// Complete position rows in engine order on the chosen input clock.
/// The south node shares the north node's sampled speed, while an independent
/// `longitude_speed_on(SouthNode, ...)` samples south-node longitudes.
pub fn positions_on(
    ms: f64,
    scale: TimeScaleName,
    pin: Option<f64>,
) -> Result<Vec<BodyPosition>, EphemerisError> {
    let basis = checked_basis(ms, scale, pin)?;
    let mut bodies = Vec::with_capacity(BODIES.len());
    // Preserve the reference evaluation order as well as the returned order.
    for body in PLANETS {
        let coordinates = coordinates_on(body, &basis)?;
        bodies.push(position(
            body,
            coordinates.lon,
            coordinates.lat,
            longitude_speed_on(body, ms, scale, pin)?,
        )?);
    }
    let moon = coordinates_on(Body::Moon, &basis)?;
    bodies.insert(
        1,
        position(
            Body::Moon,
            moon.lon,
            moon.lat,
            longitude_speed_on(Body::Moon, ms, scale, pin)?,
        )?,
    );
    let north = coordinates_on(Body::NorthNode, &basis)?.lon;
    let node_speed = longitude_speed_on(Body::NorthNode, ms, scale, pin)?;
    bodies.push(position(Body::NorthNode, north, 0.0, node_speed)?);
    bodies.push(position(
        Body::SouthNode,
        normalize_longitude(north + 180.0).map_err(EphemerisError::Longitude)?,
        0.0,
        node_speed,
    )?);
    Ok(bodies)
}

/// Complete position rows at UTC epoch milliseconds, as `positions` reads it.
pub fn positions(ms: f64) -> Result<Vec<BodyPosition>, EphemerisError> {
    positions_on(ms, TimeScaleName::Utc, None)
}

/// Whether UTC milliseconds are outside the half-open reference interval.
/// NaN, including an invalid JavaScript Date, is outside.
pub fn outside_reference_span(ms: f64) -> bool {
    !(REFERENCE_SPAN_FROM_MS..REFERENCE_SPAN_TO_MS).contains(&ms)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::date_input::date_from_iso;

    const J2000_MS: f64 = 946_728_000_000.0;

    #[test]
    fn exact_body_names_and_reference_boundaries_are_preserved() {
        for body in BODIES {
            assert_eq!(Body::from_name(body.name()), Some(body));
        }
        for invalid in ["Earth", "moon", "NorthNode", " Moon", ""] {
            assert_eq!(Body::from_name(invalid), None);
        }
        assert_eq!(REFERENCE_SPAN_FROM_MS, date_from_iso("1800-01-01").unwrap());
        assert_eq!(REFERENCE_SPAN_TO_MS, date_from_iso("2200-01-01").unwrap());
        assert!(outside_reference_span(REFERENCE_SPAN_FROM_MS - 1.0));
        assert!(!outside_reference_span(REFERENCE_SPAN_FROM_MS));
        assert!(!outside_reference_span(REFERENCE_SPAN_TO_MS - 1.0));
        assert!(outside_reference_span(REFERENCE_SPAN_TO_MS));
        for invalid in [f64::NAN, f64::NEG_INFINITY, f64::INFINITY] {
            assert!(outside_reference_span(invalid));
        }
    }

    #[test]
    fn reconstructed_ephemeris_tt_matches_the_basis_bitwise_on_every_clock() {
        for iso in ["1800-01-01", "1972-01-01", "2017-01-01", "2200-01-01"] {
            for scale in [TimeScaleName::Utc, TimeScaleName::Ut1, TimeScaleName::Tt] {
                for pin in [None, Some(0.0), Some(-123.456), Some(1e10)] {
                    let basis = time_basis(date_from_iso(iso).unwrap(), scale, pin).unwrap();
                    let made_tt = basis.ut1_days + basis.delta_t.seconds / 86400.0;
                    assert_eq!(basis.tt_days.to_bits(), made_tt.to_bits());
                }
            }
        }
    }

    #[test]
    fn metadata_keeps_longitude_and_speed_bits_but_normalizes_sign_annotations() {
        for (lon, sign, degree) in [
            (-0.5, "pisces", 29.5),
            (30.25, "taurus", 0.25),
            (360.0, "aries", 0.0),
        ] {
            for speed in [-0.25_f64, -0.0, 0.0, 0.25] {
                let row = position(Body::Sun, lon, -0.125, speed).unwrap();
                assert_eq!(row.lon.to_bits(), lon.to_bits());
                assert_eq!(row.lat.to_bits(), (-0.125_f64).to_bits());
                assert_eq!(row.speed.to_bits(), speed.to_bits());
                assert_eq!(row.sign, sign);
                assert_eq!(row.degree, degree);
                assert_eq!(row.retrograde, speed < 0.0);
            }
        }
    }

    #[test]
    fn differences_use_one_wrap_and_keep_antipodal_endpoint_signs() {
        for (first, last, expected) in [
            (359.75, 0.25, 250.0),
            (0.25, 359.75, -250.0),
            (0.0, 180.0, 90000.0),
            (180.0, 0.0, -90000.0),
        ] {
            let mut calls = 0;
            let value = central_difference(
                |_| {
                    calls += 1;
                    Ok(if calls == 1 { first } else { last })
                },
                J2000_MS,
                TimeScaleName::Ut1,
                Some(0.0),
                SPEED_STEP_DAYS,
            )
            .unwrap();
            assert_eq!(calls, 2);
            assert_eq!(value, expected);
        }
    }

    #[test]
    fn differences_resolve_each_sample_and_use_elapsed_tt_at_clock_handoffs() {
        for iso in [
            "1940-12-31T18:00:00Z",
            "1972-01-01",
            "2017-01-01",
            "2027-10-02",
        ] {
            let ms = date_from_iso(iso).unwrap();
            for scale in [TimeScaleName::Utc, TimeScaleName::Ut1, TimeScaleName::Tt] {
                for pin in [None, Some(-123.5)] {
                    for step in [SPEED_STEP_DAYS, NODE_SPEED_STEP_DAYS] {
                        let before = time_basis(ms - step * DAY, scale, pin).unwrap();
                        let after = time_basis(ms + step * DAY, scale, pin).unwrap();
                        let mut seen = Vec::new();
                        let actual = central_difference(
                            |basis| {
                                seen.push(*basis);
                                Ok(seen.len() as f64)
                            },
                            ms,
                            scale,
                            pin,
                            step,
                        )
                        .unwrap();
                        assert_eq!(seen, [before, after]);
                        assert_eq!(
                            actual.to_bits(),
                            (1.0 / elapsed_days(&before, &after, 2.0 * step)).to_bits()
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn rows_keep_engine_order_and_copy_the_north_node_speed() {
        for iso in ["1800-01-01", "2000-01-01T12:00:00Z", "2200-01-01"] {
            let ms = date_from_iso(iso).unwrap();
            let rows = positions(ms).unwrap();
            assert_eq!(rows.iter().map(|row| row.body).collect::<Vec<_>>(), BODIES);
            for row in &rows {
                assert_eq!(
                    row.lon.to_bits(),
                    body_longitude(row.body, ms).unwrap().to_bits()
                );
                assert!((0.0..360.0).contains(&row.lon));
                assert!((-90.0..=90.0).contains(&row.lat));
                assert!(row.speed.is_finite());
                assert_eq!(row.sign, sign_for_longitude(row.lon).unwrap().slug);
                assert_eq!(
                    row.degree.to_bits(),
                    degree_in_sign(row.lon).unwrap().to_bits()
                );
                if row.body != Body::SouthNode {
                    assert_eq!(
                        row.speed.to_bits(),
                        longitude_speed(row.body, ms).unwrap().to_bits()
                    );
                }
            }
            assert_eq!(rows[10].lat.to_bits(), 0.0_f64.to_bits());
            assert_eq!(rows[11].lat.to_bits(), 0.0_f64.to_bits());
            assert_eq!(rows[10].speed.to_bits(), rows[11].speed.to_bits());
            assert_eq!(
                rows[11].lon.to_bits(),
                normalize_longitude(rows[10].lon + 180.0).unwrap().to_bits()
            );
        }
    }

    #[test]
    fn longitude_span_is_inclusive_and_speed_checks_every_outer_sample() {
        for edge in [EPHEMERIS_SPAN_FROM, EPHEMERIS_SPAN_TO] {
            let ms = J2000_MS + edge * DAY;
            for body in BODIES {
                assert!(
                    longitude_at(body, ms, TimeScaleName::Tt, Some(0.0)).is_ok(),
                    "{body:?} at {edge}"
                );
                assert_eq!(
                    longitude_speed_on(body, ms, TimeScaleName::Tt, Some(0.0)),
                    Err(EphemerisError::OutsideSpan)
                );
                assert_eq!(
                    longitude_at(body, ms + edge.signum() * DAY, TimeScaleName::Tt, Some(0.0)),
                    Err(EphemerisError::OutsideSpan)
                );
            }
            assert_eq!(
                positions_on(ms, TimeScaleName::Tt, Some(0.0)),
                Err(EphemerisError::OutsideSpan)
            );
            let inside = ms - edge.signum() * NODE_SPEED_STEP_DAYS * DAY;
            assert!(positions_on(inside, TimeScaleName::Tt, Some(0.0)).is_ok());
        }
    }

    #[test]
    fn invalid_tt_is_refused_before_any_series_or_integration_work() {
        for pin in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert_eq!(
                positions_on(J2000_MS, TimeScaleName::Ut1, Some(pin)),
                Err(EphemerisError::OutsideSpan)
            );
            for body in BODIES {
                assert_eq!(
                    longitude_at(body, J2000_MS, TimeScaleName::Ut1, Some(pin)),
                    Err(EphemerisError::OutsideSpan)
                );
            }
        }
        for body in BODIES {
            assert_eq!(
                longitude_at(body, J2000_MS, TimeScaleName::Ut1, Some(1e20)),
                Err(EphemerisError::OutsideSpan)
            );
        }
    }
}
