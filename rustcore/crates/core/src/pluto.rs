//! Pluto integration from the pinned astronomy-engine 2.1.19 local source.
//!
//! Translates TerseVector, major_bodies_t, GravFromState, GravSim, GetSegment,
//! CalcPlutoOneWay and CalcPluto. Copyright (c) 2019-2023 Don Cross, MIT.
//! See rustcore/NOTICE for the full license and PROVENANCE.md for input pins.
//! The finite state table is generated into Cargo's ignored OUT_DIR.

use crate::planets::{self, HelioState, Planet};
use std::{cell::RefCell, fmt};

#[allow(dead_code)]
mod data {
    include!(concat!(env!("OUT_DIR"), "/pluto_data.rs"));
}

pub const TABLE_START_TT: f64 = -730000.0;
pub const TABLE_END_TT: f64 = 730000.0;
// CorrectLightTravel accepts at most one light day. This adjacent interval
// preserves its endpoint samples without the reference's unbounded crawl.
const LIGHT_TIME_EXTENSION_DAYS: f64 = 1.0;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PlutoError {
    InvalidClock,
    OutsideTableSpan,
}

impl fmt::Display for PlutoError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::InvalidClock => "Pluto requires finite TT days since J2000.",
            Self::OutsideTableSpan => "Pluto TT is outside the tabulated ephemeris span.",
        })
    }
}
impl std::error::Error for PlutoError {}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Vector([f64; 3]);

impl Vector {
    fn add(self, other: Self) -> Self {
        Self(std::array::from_fn(|i| self.0[i] + other.0[i]))
    }
    fn sub(self, other: Self) -> Self {
        Self(std::array::from_fn(|i| self.0[i] - other.0[i]))
    }
    fn mul(self, scalar: f64) -> Self {
        // The reference's TerseVector.mul multiplies scalar first.
        Self(self.0.map(|value| scalar * value))
    }
    fn mean(self, other: Self) -> Self {
        Self(std::array::from_fn(|i| (self.0[i] + other.0[i]) / 2.0))
    }
    fn quadrature(self) -> f64 {
        self.0[0] * self.0[0] + self.0[1] * self.0[1] + self.0[2] * self.0[2]
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct State {
    r: Vector,
    v: Vector,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct GravState {
    tt: f64,
    r: Vector,
    v: Vector,
    a: Vector,
}

struct MajorBodies {
    sun: State,
    planets: [State; 4],
}

const MASSES: [f64; 4] = [
    data::JUPITER_GM,
    data::SATURN_GM,
    data::URANUS_GM,
    data::NEPTUNE_GM,
];

impl MajorBodies {
    fn new(tt: f64) -> Self {
        let mut ssb = State::default();
        let mut planets = [State::default(); 4];
        for (i, body) in [
            Planet::Jupiter,
            Planet::Saturn,
            Planet::Uranus,
            Planet::Neptune,
        ]
        .into_iter()
        .enumerate()
        {
            let value = planets::helio_state(body, tt);
            planets[i] = State {
                r: Vector(value.pos),
                v: Vector(value.vel),
            };
            let shift = MASSES[i] / (MASSES[i] + data::SUN_GM);
            ssb.r = ssb.r.add(planets[i].r.mul(shift));
            ssb.v = ssb.v.add(planets[i].v.mul(shift));
        }
        for planet in &mut planets {
            planet.r = planet.r.sub(ssb.r);
            planet.v = planet.v.sub(ssb.v);
        }
        Self {
            sun: State {
                r: ssb.r.mul(-1.0),
                v: ssb.v.mul(-1.0),
            },
            planets,
        }
    }

    fn acceleration(&self, pos: Vector) -> Vector {
        let mut acceleration = acceleration_increment(pos, data::SUN_GM, self.sun.r);
        for (i, body) in self.planets.iter().enumerate() {
            acceleration = acceleration.add(acceleration_increment(pos, MASSES[i], body.r));
        }
        acceleration
    }
}

fn acceleration_increment(pos: Vector, gm: f64, major_pos: Vector) -> Vector {
    let delta = major_pos.sub(pos);
    let r2 = delta.quadrature();
    delta.mul(gm / (r2 * r2.sqrt()))
}

fn update_position(dt: f64, r: Vector, v: Vector, a: Vector) -> Vector {
    Vector(std::array::from_fn(|i| {
        r.0[i] + dt * (v.0[i] + dt * a.0[i] / 2.0)
    }))
}

fn update_velocity(dt: f64, v: Vector, a: Vector) -> Vector {
    Vector(std::array::from_fn(|i| v.0[i] + dt * a.0[i]))
}

fn grav_sim(tt: f64, previous: GravState) -> (MajorBodies, GravState) {
    let dt = tt - previous.tt;
    let bary = MajorBodies::new(tt);
    let approx_pos = update_position(dt, previous.r, previous.v, previous.a);
    let mean_acc = bary.acceleration(approx_pos).mean(previous.a);
    let r = update_position(dt, previous.r, previous.v, mean_acc);
    let v = previous.v.add(mean_acc.mul(dt));
    let a = bary.acceleration(r);
    (bary, GravState { tt, r, v, a })
}

fn grav_from_state(index: usize) -> GravState {
    let (tt, r, v) = data::STATES[index];
    let bary = MajorBodies::new(tt);
    let r = Vector(r).add(bary.sun.r);
    let v = Vector(v).add(bary.sun.v);
    let a = bary.acceleration(r);
    GravState { tt, r, v, a }
}

fn build_segment(index: usize) -> Box<[GravState]> {
    let mut segment = vec![GravState::default(); data::NSTEPS];
    let last = data::NSTEPS - 1;
    segment[0] = grav_from_state(index);
    segment[last] = grav_from_state(index + 1);
    let mut step_tt = segment[0].tt;
    for i in 1..last {
        step_tt += data::DT;
        segment[i] = grav_sim(step_tt, segment[i - 1]).1;
    }
    let mut reverse = vec![GravState::default(); data::NSTEPS];
    reverse[last] = segment[last];
    step_tt = segment[last].tt;
    for i in (1..last).rev() {
        step_tt -= data::DT;
        reverse[i] = grav_sim(step_tt, reverse[i + 1]).1;
    }
    for i in (1..last).rev() {
        let ramp = i as f64 / last as f64;
        segment[i].r = segment[i].r.mul(1.0 - ramp).add(reverse[i].r.mul(ramp));
        segment[i].v = segment[i].v.mul(1.0 - ramp).add(reverse[i].v.mul(ramp));
        segment[i].a = segment[i].a.mul(1.0 - ramp).add(reverse[i].a.mul(ramp));
    }
    segment.into_boxed_slice()
}

fn clamp_index(fraction: f64, steps: usize) -> usize {
    // Inputs have already passed finite-clock and table-span checks.
    fraction.floor().max(0.0).min((steps - 1) as f64) as usize
}

fn interpolate(tt: f64, segment: &[GravState]) -> State {
    let left = clamp_index((tt - segment[0].tt) / data::DT, data::NSTEPS - 1);
    let s1 = segment[left];
    let s2 = segment[left + 1];
    let acc = s1.a.mean(s2.a);
    let ra = update_position(tt - s1.tt, s1.r, s1.v, acc);
    let va = update_velocity(tt - s1.tt, s1.v, acc);
    let rb = update_position(tt - s2.tt, s2.r, s2.v, acc);
    let vb = update_velocity(tt - s2.tt, s2.v, acc);
    let ramp = (tt - s1.tt) / data::DT;
    State {
        r: ra.mul(1.0 - ramp).add(rb.mul(ramp)),
        v: va.mul(1.0 - ramp).add(vb.mul(ramp)),
    }
}

struct PlutoCache {
    segments: [Option<Box<[GravState]>>; data::NUM_STATES - 1],
}

impl Default for PlutoCache {
    fn default() -> Self {
        Self {
            segments: std::array::from_fn(|_| None),
        }
    }
}

impl PlutoCache {
    fn interpolate(&mut self, tt: f64) -> State {
        let index = clamp_index(
            (tt - TABLE_START_TT) / data::TIME_STEP,
            data::NUM_STATES - 1,
        );
        let segment = self.segments[index].get_or_insert_with(|| build_segment(index));
        interpolate(tt, segment)
    }
}

thread_local! {
    // Thread-local ownership makes the native cache safe without global mutable
    // state or locks; WASM uses the same path. Segments never depend on callers'
    // Delta T, prior times, or query order. There are finitely many table spans.
    static CACHE: RefCell<PlutoCache> = RefCell::new(PlutoCache::default());
}

fn validate_tt(tt: f64, extension: f64) -> Result<(), PlutoError> {
    if !tt.is_finite() {
        return Err(PlutoError::InvalidClock);
    }
    if !(TABLE_START_TT - extension..=TABLE_END_TT + extension).contains(&tt) {
        return Err(PlutoError::OutsideTableSpan);
    }
    Ok(())
}

/// Validate a Pluto clock against the closed source-table span in TT days.
pub fn validate_table_tt(tt: f64) -> Result<(), PlutoError> {
    validate_tt(tt, 0.0)
}

/// Pluto heliocentric position in AU and velocity in AU/day on J2000's equator.
///
/// TT is days since J2000 and must lie within the finite source table. The
/// cache affects only repeated work, never the calculation's operation order.
pub fn helio_state(tt: f64) -> Result<HelioState, PlutoError> {
    validate_table_tt(tt)?;
    helio_state_for_light_time(tt)
}

pub(crate) fn helio_state_for_light_time(tt: f64) -> Result<HelioState, PlutoError> {
    validate_tt(tt, LIGHT_TIME_EXTENSION_DAYS)?;
    let (state, bary) = if (TABLE_START_TT..=TABLE_END_TT).contains(&tt) {
        (
            CACHE.with(|cache| cache.borrow_mut().interpolate(tt)),
            MajorBodies::new(tt),
        )
    } else {
        // CalcPlutoOneWay needs exactly one step for this bounded adjacent
        // interval, since its source step exceeds the allowed extension.
        let index = if tt < TABLE_START_TT {
            0
        } else {
            data::NUM_STATES - 1
        };
        let (bary, grav) = grav_sim(tt, grav_from_state(index));
        (
            State {
                r: grav.r,
                v: grav.v,
            },
            bary,
        )
    };
    Ok(HelioState {
        pos: state.r.sub(bary.sun.r).0,
        vel: state.v.sub(bary.sun.v).0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_bits(left: State, right: State) {
        for (a, b) in left
            .r
            .0
            .into_iter()
            .chain(left.v.0)
            .zip(right.r.0.into_iter().chain(right.v.0))
        {
            assert_eq!(a.to_bits(), b.to_bits());
        }
    }

    #[test]
    fn gravity_and_constant_acceleration_follow_component_order() {
        let pos = Vector([1.0, 0.0, 0.0]);
        assert_eq!(
            acceleration_increment(pos, 4.0, Vector([3.0, 0.0, 0.0])),
            Vector([1.0, 0.0, 0.0])
        );
        let velocity = Vector([0.5, -0.25, 2.0]);
        let acceleration = Vector([0.25, 1.0, -0.5]);
        assert_eq!(
            update_position(2.0, pos, velocity, acceleration),
            Vector([2.5, 1.5, 3.0])
        );
        assert_eq!(
            update_velocity(-2.0, velocity, acceleration),
            Vector([0.0, -2.25, 3.0])
        );
    }

    #[test]
    fn table_endpoints_keep_exact_source_state_after_barycentric_roundtrip() {
        let mut cache = PlutoCache::default();
        for index in [0, 22, 23, 24, 25, 26, 27, 28, 50] {
            let (tt, r, v) = data::STATES[index];
            let value = cache.interpolate(tt);
            let expected = grav_from_state(index);
            assert_bits(
                value,
                State {
                    r: expected.r,
                    v: expected.v,
                },
            );
            let bary = MajorBodies::new(tt);
            // Heliocentric -> barycentric -> heliocentric retains source
            // rounding, so compare those operations rather than table literals.
            assert_bits(
                State {
                    r: value.r.sub(bary.sun.r),
                    v: value.v.sub(bary.sun.v),
                },
                State {
                    r: Vector(r).add(bary.sun.r).sub(bary.sun.r),
                    v: Vector(v).add(bary.sun.v).sub(bary.sun.v),
                },
            );
        }
    }

    #[test]
    fn segment_cache_is_reused_and_independent_of_lookup_order() {
        let times = [
            -58400.0000001,
            -58400.0,
            -58399.9999999,
            -146.0,
            0.0,
            146.0,
            29200.0,
            730000.0,
        ];
        let mut forward = PlutoCache::default();
        let expected: Vec<_> = times.iter().map(|tt| forward.interpolate(*tt)).collect();
        let count = forward.segments.iter().flatten().count();
        for (i, tt) in times.iter().enumerate().rev() {
            assert_bits(forward.interpolate(*tt), expected[i]);
        }
        assert_eq!(forward.segments.iter().flatten().count(), count);
        let mut backward = PlutoCache::default();
        for (i, tt) in times.iter().enumerate().rev() {
            assert_bits(backward.interpolate(*tt), expected[i]);
        }
    }

    #[test]
    fn interpolation_hits_each_integration_knot_and_clamps_last_interval() {
        let segment = build_segment(25);
        for step in 0..data::NSTEPS {
            let knot = segment[step];
            assert_bits(
                interpolate(knot.tt, &segment),
                State {
                    r: knot.r,
                    v: knot.v,
                },
            );
        }
        for step in [0, 1, 99, 199, 200] {
            let tt = segment[step].tt;
            for nearby in [tt - 1.0e-8, tt + 1.0e-8] {
                if !(segment[0].tt..=segment[data::NSTEPS - 1].tt).contains(&nearby) {
                    continue;
                }
                let value = interpolate(nearby, &segment);
                for axis in 0..3 {
                    assert!((value.r.0[axis] - segment[step].r.0[axis]).abs() < 1.0e-10);
                    assert!((value.v.0[axis] - segment[step].v.0[axis]).abs() < 1.0e-12);
                }
            }
        }
        assert_eq!(clamp_index(200.0, 200), 199);
        assert_eq!(clamp_index(-1.0, 200), 0);
    }

    #[test]
    fn adjacent_light_time_extension_is_exactly_one_integration_step() {
        for (index, sign) in [(0, -1.0), (data::NUM_STATES - 1, 1.0)] {
            for offset in [0.000001, 0.25, 1.0] {
                let tt = data::STATES[index].0 + sign * offset;
                assert_eq!(helio_state(tt), Err(PlutoError::OutsideTableSpan));
                let expected = grav_sim(tt, grav_from_state(index));
                let value = helio_state_for_light_time(tt).unwrap();
                assert_eq!(value.pos, expected.1.r.sub(expected.0.sun.r).0);
                assert_eq!(value.vel, expected.1.v.sub(expected.0.sun.v).0);
            }
        }
    }

    #[test]
    fn guard_rejects_unbounded_crawls_and_nonfinite_clocks() {
        for tt in [f64::NAN, f64::NEG_INFINITY, f64::INFINITY] {
            assert_eq!(helio_state(tt), Err(PlutoError::InvalidClock));
            assert_eq!(
                helio_state_for_light_time(tt),
                Err(PlutoError::InvalidClock)
            );
        }
        for tt in [-730001.0000001, 730001.0000001, -1.0e30, 1.0e30] {
            assert_eq!(
                helio_state_for_light_time(tt),
                Err(PlutoError::OutsideTableSpan)
            );
        }
        assert!(helio_state(TABLE_START_TT).is_ok());
        assert!(helio_state(TABLE_END_TT).is_ok());
    }

    #[test]
    fn native_threads_calculate_identical_cold_and_warm_states() {
        let tt = 12345.6789;
        let here = helio_state(tt).unwrap();
        let elsewhere = std::thread::spawn(move || {
            let first = helio_state(tt).unwrap();
            assert_eq!(first, helio_state(tt).unwrap());
            first
        })
        .join()
        .unwrap();
        assert_eq!(here, elsewhere);
    }
}
