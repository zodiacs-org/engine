//! Angles and house cusps translated from `src/houses.ts` (MIT).
//!
//! The operation order and lazy validation match the TypeScript helpers.
//! These low-level functions do not validate geographic coordinate ranges.

use crate::{normalize_longitude, LongitudeError};
use std::fmt;

const DEG: f64 = std::f64::consts::PI / 180.0;
const RAD: f64 = 180.0 / std::f64::consts::PI;

/// The chart's apparent sidereal time, coordinates and true obliquity.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AngleInput {
    /// Greenwich apparent sidereal time, in hours.
    pub gast_hours: f64,
    /// Geodetic latitude, in degrees north.
    pub latitude: f64,
    /// Geographic longitude, in degrees east.
    pub longitude: f64,
    /// True obliquity of date, in degrees.
    pub obliquity: f64,
}

/// Ecliptic longitudes in degrees of the four chart angles.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Angles {
    pub asc: f64,
    pub mc: f64,
    pub dsc: f64,
    pub ic: f64,
}

/// House systems currently implemented by this port.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HouseSystem {
    Whole,
    Porphyry,
    Equal,
    EqualMc,
    Vehlow,
    Meridian,
    Morinus,
}

impl HouseSystem {
    pub const fn name(self) -> &'static str {
        match self {
            Self::Whole => "whole",
            Self::Porphyry => "porphyry",
            Self::Equal => "equal",
            Self::EqualMc => "equal-mc",
            Self::Vehlow => "vehlow",
            Self::Meridian => "meridian",
            Self::Morinus => "morinus",
        }
    }

    pub fn from_name(name: &str) -> Option<Self> {
        HOUSE_SYSTEMS
            .into_iter()
            .find(|system| system.name() == name)
    }
}

/// The implemented subset, in the order used by the reference engine.
pub const HOUSE_SYSTEMS: [HouseSystem; 7] = [
    HouseSystem::Whole,
    HouseSystem::Porphyry,
    HouseSystem::Equal,
    HouseSystem::EqualMc,
    HouseSystem::Vehlow,
    HouseSystem::Morinus,
    HouseSystem::Meridian,
];

/// The computed system and its cusps, starting with the first house.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Houses {
    pub system: HouseSystem,
    pub cusps: [f64; 12],
}

/// House dispatch result, retaining the engine's fallback metadata shape.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ComputedHouses {
    pub houses: Houses,
    pub fell_back: bool,
    pub fallback_system: Option<HouseSystem>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HouseError {
    InvalidCuspsLength,
    Longitude(LongitudeError),
}

impl fmt::Display for HouseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidCuspsLength => {
                formatter.write_str("House cusps must contain 12 longitudes.")
            }
            Self::Longitude(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for HouseError {}

impl From<LongitudeError> for HouseError {
    fn from(error: LongitudeError) -> Self {
        Self::Longitude(error)
    }
}

fn ecliptic_longitude_of_right_ascension(ra: f64, obliquity: f64) -> Result<f64, LongitudeError> {
    normalize_longitude(
        (ra * DEG)
            .sin()
            .atan2((ra * DEG).cos() * (obliquity * DEG).cos())
            * RAD,
    )
}

fn oblique_longitude(ascension: f64, pole: f64, obliquity: f64) -> Result<f64, LongitudeError> {
    let a = ascension * DEG;
    let e = obliquity * DEG;
    normalize_longitude(
        a.sin()
            .atan2(a.cos() * e.cos() - (pole * DEG).tan() * e.sin())
            * RAD,
    )
}

fn map_cusps(
    mut project: impl FnMut(usize) -> Result<f64, LongitudeError>,
) -> Result<[f64; 12], LongitudeError> {
    let mut cusps = [0.0; 12];
    for (index, cusp) in cusps.iter_mut().enumerate() {
        *cusp = project(index)?;
    }
    Ok(cusps)
}

/// Right ascension of the midheaven in degrees, from sidereal hours.
/// Only the `gast_hours` and `longitude` fields are read.
pub fn ramc_of(input: &AngleInput) -> Result<f64, LongitudeError> {
    normalize_longitude(input.gast_hours * 15.0 + input.longitude)
}

/// Select the eastern horizon intersection before assembling the angles.
/// The helper retains the reference's numerical behavior at degenerate poles.
pub fn compute_angles(input: &AngleInput) -> Result<Angles, LongitudeError> {
    let ramc = ramc_of(input)?;
    let mc = ecliptic_longitude_of_right_ascension(ramc, input.obliquity)?;
    let ra = ramc * DEG;
    let eps = input.obliquity * DEG;
    let phi = input.latitude * DEG;
    let mut asc = normalize_longitude(
        ra.cos()
            .atan2(-(ra.sin() * eps.cos() + phi.tan() * eps.sin()))
            * RAD,
    )?;
    if normalize_longitude(asc - mc)? >= 180.0 {
        asc = normalize_longitude(asc + 180.0)?;
    }
    Ok(Angles {
        asc,
        mc,
        dsc: normalize_longitude(asc + 180.0)?,
        ic: normalize_longitude(mc + 180.0)?,
    })
}

/// Whole signs, starting at the beginning of the ascendant's sign.
pub fn whole_sign_cusps(ascendant: f64) -> Result<[f64; 12], LongitudeError> {
    let first = (normalize_longitude(ascendant)? / 30.0).floor() * 30.0;
    map_cusps(|index| normalize_longitude(first + index as f64 * 30.0))
}

/// Divide each quadrant of ecliptic longitude into three equal arcs.
/// Supplied angle entries are copied as-is, as in the reference helper.
pub fn porphyry_cusps(angles: &Angles) -> Result<[f64; 12], LongitudeError> {
    let upper = normalize_longitude(angles.asc - angles.mc)?;
    let lower = normalize_longitude(angles.ic - angles.asc)?;
    let cusp11 = normalize_longitude(angles.mc + upper / 3.0)?;
    let cusp12 = normalize_longitude(angles.mc + (2.0 * upper) / 3.0)?;
    let cusp2 = normalize_longitude(angles.asc + lower / 3.0)?;
    let cusp3 = normalize_longitude(angles.asc + (2.0 * lower) / 3.0)?;
    Ok([
        angles.asc,
        cusp2,
        cusp3,
        angles.ic,
        normalize_longitude(cusp11 + 180.0)?,
        normalize_longitude(cusp12 + 180.0)?,
        angles.dsc,
        normalize_longitude(cusp2 + 180.0)?,
        normalize_longitude(cusp3 + 180.0)?,
        angles.mc,
        cusp11,
        cusp12,
    ])
}

/// Equal cusps at successive thirty-degree steps from the ascendant.
pub fn equal_cusps(angles: &Angles) -> Result<[f64; 12], LongitudeError> {
    map_cusps(|index| normalize_longitude(angles.asc + index as f64 * 30.0))
}

/// Equal cusps with the tenth cusp at the midheaven.
pub fn equal_mc_cusps(angles: &Angles) -> Result<[f64; 12], LongitudeError> {
    map_cusps(|index| normalize_longitude(angles.mc + (index as f64 - 9.0) * 30.0))
}

/// Equal cusps with the ascendant in the middle of the first house.
pub fn vehlow_cusps(angles: &Angles) -> Result<[f64; 12], LongitudeError> {
    map_cusps(|index| normalize_longitude(angles.asc - 15.0 + index as f64 * 30.0))
}

/// Project equal arcs of right ascension to ecliptic longitude.
pub fn meridian_cusps(input: &AngleInput) -> Result<[f64; 12], LongitudeError> {
    let ramc = ramc_of(input)?;
    map_cusps(|index| oblique_longitude(ramc + 90.0 + index as f64 * 30.0, 0.0, input.obliquity))
}

/// Project equal equatorial arcs to the ecliptic through its poles.
pub fn morinus_cusps(input: &AngleInput) -> Result<[f64; 12], LongitudeError> {
    let e = input.obliquity * DEG;
    let ramc = ramc_of(input)?;
    map_cusps(|index| {
        let ascension = ramc + 90.0 + index as f64 * 30.0;
        normalize_longitude(
            ((ascension * DEG).sin() * e.cos()).atan2((ascension * DEG).cos()) * RAD,
        )
    })
}

/// Dispatch the currently implemented house systems. None of these falls back.
pub fn compute_houses(
    system: HouseSystem,
    input: &AngleInput,
    angles: &Angles,
) -> Result<ComputedHouses, LongitudeError> {
    let cusps = match system {
        HouseSystem::Whole => whole_sign_cusps(angles.asc),
        HouseSystem::Porphyry => porphyry_cusps(angles),
        HouseSystem::Equal => equal_cusps(angles),
        HouseSystem::EqualMc => equal_mc_cusps(angles),
        HouseSystem::Vehlow => vehlow_cusps(angles),
        HouseSystem::Meridian => meridian_cusps(input),
        HouseSystem::Morinus => morinus_cusps(input),
    }?;
    Ok(ComputedHouses {
        houses: Houses { system, cusps },
        fell_back: false,
        fallback_system: None,
    })
}

/// Return the first matching house, with inclusive starts and exclusive ends.
/// Validation proceeds only as far as the first matching house.
pub fn house_of(longitude: f64, cusps: &[f64]) -> Result<u8, HouseError> {
    house_of_slots(longitude, cusps.len(), |index| Some(cusps[index]))
}

/// Preserve JavaScript's missing-cusp behavior: skip an edge if either cusp
/// is absent. `None` represents an undefined or missing array slot, not NaN.
pub fn house_of_optional(longitude: f64, cusps: &[Option<f64>]) -> Result<u8, HouseError> {
    house_of_slots(longitude, cusps.len(), |index| cusps[index])
}

fn house_of_slots(
    longitude: f64,
    length: usize,
    mut get: impl FnMut(usize) -> Option<f64>,
) -> Result<u8, HouseError> {
    if length != 12 {
        return Err(HouseError::InvalidCuspsLength);
    }
    for index in 0..12 {
        let start = get(index);
        let end = get((index + 1) % 12);
        let (Some(start), Some(end)) = (start, end) else {
            continue;
        };
        let span = normalize_longitude(end - start)?;
        let offset = normalize_longitude(longitude - start)?;
        if offset < span || span == 0.0 {
            return Ok((index + 1) as u8);
        }
    }
    Ok(12)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(gast_hours: f64, latitude: f64) -> AngleInput {
        AngleInput {
            gast_hours,
            latitude,
            longitude: 0.0,
            obliquity: 23.4393,
        }
    }

    fn angles(asc: f64, mc: f64) -> Angles {
        Angles {
            asc,
            mc,
            dsc: normalize_longitude(asc + 180.0).unwrap(),
            ic: normalize_longitude(mc + 180.0).unwrap(),
        }
    }

    fn same_bits(left: [f64; 12], right: [f64; 12]) {
        assert_eq!(left.map(f64::to_bits), right.map(f64::to_bits));
    }

    #[test]
    fn ramc_normalizes_hours_and_longitude_without_reading_unused_fields() {
        let base = AngleInput {
            gast_hours: 23.0,
            longitude: 30.0,
            latitude: f64::NAN,
            obliquity: f64::NAN,
        };
        assert_eq!(ramc_of(&base), Ok(15.0));
        assert_eq!(
            ramc_of(&AngleInput {
                gast_hours: -1.0,
                ..base
            }),
            Ok(15.0)
        );
        assert_eq!(
            ramc_of(&AngleInput {
                gast_hours: f64::MAX,
                ..base
            }),
            Err(LongitudeError)
        );
    }

    #[test]
    fn cardinal_equatorial_angles_have_exact_axes() {
        for (hours, asc, mc) in [
            (0.0, 90.0, 0.0),
            (6.0, 180.0, 90.0),
            (12.0, 270.0, 180.0),
            (18.0, 0.0, 270.0),
        ] {
            assert_eq!(compute_angles(&input(hours, 0.0)).unwrap(), angles(asc, mc));
        }
    }

    #[test]
    fn ascendant_is_east_in_both_hemispheres_including_polar_latitudes() {
        for latitude in [-89.999, -80.0, -67.0, -45.0, 0.0, 45.0, 67.0, 80.0, 89.999] {
            for hours in [0.3, 3.1, 6.5, 9.7, 12.2, 15.8, 18.9, 21.6] {
                let observer = input(hours, latitude);
                let result = compute_angles(&observer).unwrap();
                assert!(normalize_longitude(result.asc - result.mc).unwrap() < 180.0);
                let lon = result.asc * DEG;
                let ramc = ramc_of(&observer).unwrap() * DEG;
                let epsilon = observer.obliquity * DEG;
                let phi = latitude * DEG;
                let x = lon.cos();
                let y = lon.sin() * epsilon.cos();
                let z = lon.sin() * epsilon.sin();
                let east = -ramc.sin() * x + ramc.cos() * y;
                let up = phi.cos() * ramc.cos() * x + phi.cos() * ramc.sin() * y + phi.sin() * z;
                assert!(east > 0.0, "latitude {latitude}, hours {hours}");
                assert!(up.abs() < 4e-15, "latitude {latitude}, hours {hours}: {up}");
                assert_eq!(result.dsc, normalize_longitude(result.asc + 180.0).unwrap());
                assert_eq!(result.ic, normalize_longitude(result.mc + 180.0).unwrap());
            }
        }
    }

    #[test]
    fn equal_families_preserve_start_and_operation_order() {
        let a = angles(359.5, 247.25);
        same_bits(
            whole_sign_cusps(a.asc).unwrap(),
            [
                330.0, 0.0, 30.0, 60.0, 90.0, 120.0, 150.0, 180.0, 210.0, 240.0, 270.0, 300.0,
            ],
        );
        same_bits(
            equal_cusps(&a).unwrap(),
            [
                359.5, 29.5, 59.5, 89.5, 119.5, 149.5, 179.5, 209.5, 239.5, 269.5, 299.5, 329.5,
            ],
        );
        same_bits(
            vehlow_cusps(&a).unwrap(),
            [
                344.5, 14.5, 44.5, 74.5, 104.5, 134.5, 164.5, 194.5, 224.5, 254.5, 284.5, 314.5,
            ],
        );
        assert_eq!(equal_mc_cusps(&a).unwrap()[9], a.mc);
        // Pre-normalizing asc before adding offsets would change these cusps.
        let large = angles(9_007_199_254_740_991.0, 0.0);
        assert_eq!(
            equal_cusps(&large).unwrap()[1].to_bits(),
            60.0_f64.to_bits()
        );
        assert_eq!(
            vehlow_cusps(&large).unwrap()[1].to_bits(),
            46.0_f64.to_bits()
        );
    }

    #[test]
    fn whole_sign_keeps_normalizations_boundary_rounding() {
        let before_turn = f64::from_bits(360.0_f64.to_bits() - 1);
        assert_eq!(whole_sign_cusps(before_turn).unwrap()[0], 0.0);
        assert_eq!(whole_sign_cusps(-0.5).unwrap()[0], 330.0);
        assert_eq!(whole_sign_cusps(30.0).unwrap()[0], 30.0);
        assert_eq!(whole_sign_cusps(f64::NAN), Err(LongitudeError));
    }

    #[test]
    fn porphyry_divides_quadrants_and_preserves_supplied_axes() {
        same_bits(
            porphyry_cusps(&angles(100.0, 10.0)).unwrap(),
            [
                100.0, 130.0, 160.0, 190.0, 220.0, 250.0, 280.0, 310.0, 340.0, 10.0, 40.0, 70.0,
            ],
        );
        same_bits(
            porphyry_cusps(&angles(40.0, 10.0)).unwrap(),
            [
                40.0, 90.0, 140.0, 190.0, 200.0, 210.0, 220.0, 270.0, 320.0, 10.0, 20.0, 30.0,
            ],
        );
        let supplied = Angles {
            asc: 400.0,
            mc: 370.0,
            dsc: f64::NAN,
            ic: -170.0,
        };
        let cusps = porphyry_cusps(&supplied).unwrap();
        assert_eq!(cusps[0], 400.0);
        assert_eq!(cusps[3], -170.0);
        assert!(cusps[6].is_nan());
        assert_eq!(cusps[9], 370.0);
    }

    #[test]
    fn meridian_and_morinus_are_latitude_independent_and_have_distinct_projections() {
        let north = input(2.125, 80.0);
        let south = AngleInput {
            latitude: -80.0,
            ..north
        };
        let missing = AngleInput {
            latitude: f64::NAN,
            ..north
        };
        let meridian = meridian_cusps(&north).unwrap();
        let morinus = morinus_cusps(&north).unwrap();
        same_bits(meridian, meridian_cusps(&south).unwrap());
        same_bits(meridian, meridian_cusps(&missing).unwrap());
        same_bits(morinus, morinus_cusps(&south).unwrap());
        same_bits(morinus, morinus_cusps(&missing).unwrap());
        assert!((meridian[9] - compute_angles(&north).unwrap().mc).abs() < 1e-12);
        assert!((morinus[9] - meridian[9]).abs() > 1.0);
        for index in 0..6 {
            assert!(
                (normalize_longitude(meridian[index] + 180.0).unwrap() - meridian[index + 6]).abs()
                    < 1e-12
            );
            assert!(
                (normalize_longitude(morinus[index] + 180.0).unwrap() - morinus[index + 6]).abs()
                    < 1e-12
            );
        }
    }

    #[test]
    fn dispatch_has_no_fallback_including_at_polar_latitudes() {
        for latitude in [-89.999, -70.0, 0.0, 70.0, 89.999] {
            let observer = input(13.75, latitude);
            let a = compute_angles(&observer).unwrap();
            for system in HOUSE_SYSTEMS {
                assert_eq!(HouseSystem::from_name(system.name()), Some(system));
                let result = compute_houses(system, &observer, &a).unwrap();
                assert_eq!(result.houses.system, system);
                assert!(!result.fell_back);
                assert_eq!(result.fallback_system, None);
                let cusps = result.houses.cusps;
                assert!(cusps.iter().all(|cusp| (0.0..360.0).contains(cusp)));
                for index in 0..12 {
                    let span = normalize_longitude(cusps[(index + 1) % 12] - cusps[index]).unwrap();
                    assert!(span > 0.0 && span < 180.0);
                }
            }
        }
        assert_eq!(HouseSystem::from_name("placidus"), None);
        assert_eq!(HouseSystem::from_name("Equal"), None);
    }

    #[test]
    fn house_membership_has_half_open_edges_and_wraps_longitudes() {
        let cusps = whole_sign_cusps(355.0).unwrap();
        for index in 0..12 {
            assert_eq!(house_of(cusps[index], &cusps), Ok(index as u8 + 1));
            assert_eq!(house_of(cusps[index] + 29.5, &cusps), Ok(index as u8 + 1));
            assert_eq!(house_of(cusps[index] - 720.0, &cusps), Ok(index as u8 + 1));
        }
        assert_eq!(house_of(-0.5, &cusps), Ok(1));
        assert_eq!(house_of(0.0, &cusps), Ok(2));
    }

    #[test]
    fn house_membership_preserves_first_match_and_lazy_errors() {
        let mut cusps = [0.0; 12];
        assert_eq!(house_of(123.0, &cusps), Ok(1));
        assert_eq!(
            house_of(f64::NAN, &cusps),
            Err(HouseError::Longitude(LongitudeError))
        );
        cusps[1] = 30.0;
        cusps[2] = f64::NAN;
        assert_eq!(house_of(15.0, &cusps), Ok(1));
        assert_eq!(
            house_of(35.0, &cusps),
            Err(HouseError::Longitude(LongitudeError))
        );
        assert_eq!(house_of(f64::NAN, &[]), Err(HouseError::InvalidCuspsLength));
        assert_eq!(
            HouseError::InvalidCuspsLength.to_string(),
            "House cusps must contain 12 longitudes."
        );
        assert_eq!(
            HouseError::Longitude(LongitudeError).to_string(),
            "Longitude must be finite."
        );
    }

    #[test]
    fn missing_cusps_skip_both_adjacent_edges_and_keep_final_fallback() {
        let mut cusps = whole_sign_cusps(0.0).unwrap().map(Some);
        cusps[1] = None;
        assert_eq!(house_of_optional(15.0, &cusps), Ok(12));
        assert_eq!(house_of_optional(35.0, &cusps), Ok(12));
        assert_eq!(house_of_optional(75.0, &cusps), Ok(3));
        assert_eq!(house_of_optional(f64::NAN, &[None; 12]), Ok(12));
        assert_eq!(
            house_of_optional(0.0, &[None; 11]),
            Err(HouseError::InvalidCuspsLength)
        );
    }

    #[test]
    fn each_helper_validates_only_the_fields_it_uses() {
        let bad = Angles {
            asc: f64::NAN,
            mc: 30.0,
            dsc: f64::NAN,
            ic: f64::NAN,
        };
        assert!(equal_mc_cusps(&bad).is_ok());
        assert_eq!(equal_cusps(&bad), Err(LongitudeError));
        assert_eq!(vehlow_cusps(&bad), Err(LongitudeError));
        assert_eq!(porphyry_cusps(&bad), Err(LongitudeError));
        let bad_input = AngleInput {
            obliquity: f64::INFINITY,
            ..input(3.0, 30.0)
        };
        assert_eq!(compute_angles(&bad_input), Err(LongitudeError));
        assert_eq!(meridian_cusps(&bad_input), Err(LongitudeError));
        assert_eq!(morinus_cusps(&bad_input), Err(LongitudeError));
        assert!(compute_houses(HouseSystem::EqualMc, &bad_input, &bad).is_ok());
        assert!(compute_angles(&input(3.0, 100.0)).is_ok());
    }
}
