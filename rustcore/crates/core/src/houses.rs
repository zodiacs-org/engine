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

/// The reference engine's house systems.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HouseSystem {
    Whole,
    Placidus,
    Porphyry,
    Equal,
    EqualMc,
    Vehlow,
    Koch,
    Regiomontanus,
    Campanus,
    Topocentric,
    Alcabitius,
    Meridian,
    Morinus,
}

impl HouseSystem {
    pub const fn name(self) -> &'static str {
        match self {
            Self::Whole => "whole",
            Self::Placidus => "placidus",
            Self::Porphyry => "porphyry",
            Self::Equal => "equal",
            Self::EqualMc => "equal-mc",
            Self::Vehlow => "vehlow",
            Self::Koch => "koch",
            Self::Regiomontanus => "regiomontanus",
            Self::Campanus => "campanus",
            Self::Topocentric => "topocentric",
            Self::Alcabitius => "alcabitius",
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

/// Every supported system, in the order used by the reference engine.
pub const HOUSE_SYSTEMS: [HouseSystem; 13] = [
    HouseSystem::Whole,
    HouseSystem::Placidus,
    HouseSystem::Porphyry,
    HouseSystem::Equal,
    HouseSystem::EqualMc,
    HouseSystem::Vehlow,
    HouseSystem::Koch,
    HouseSystem::Regiomontanus,
    HouseSystem::Campanus,
    HouseSystem::Topocentric,
    HouseSystem::Alcabitius,
    HouseSystem::Morinus,
    HouseSystem::Meridian,
];

/// Systems whose semi-arcs are undefined at or inside the polar circle.
pub const POLAR_UNDEFINED_HOUSE_SYSTEMS: [HouseSystem; 2] =
    [HouseSystem::Placidus, HouseSystem::Koch];

/// Actual system returned when a polar semi-arc construction is undefined.
pub const POLAR_FALLBACK: HouseSystem = HouseSystem::Whole;

/// Historical alias of the shared Placidus and Koch fallback.
pub const PLACIDUS_POLAR_FALLBACK: HouseSystem = POLAR_FALLBACK;

pub fn is_polar_undefined_house_system(system: HouseSystem) -> bool {
    POLAR_UNDEFINED_HOUSE_SYSTEMS.contains(&system)
}

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

fn declination_of_longitude(longitude: f64, obliquity: f64) -> f64 {
    ((obliquity * DEG).sin() * (longitude * DEG).sin()).asin() * RAD
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

fn quadrant_cusps(
    asc: f64,
    mc: f64,
    cusp11: f64,
    cusp12: f64,
    cusp2: f64,
    cusp3: f64,
) -> Result<[f64; 12], LongitudeError> {
    let cusps = [
        asc,
        cusp2,
        cusp3,
        mc + 180.0,
        cusp11 + 180.0,
        cusp12 + 180.0,
        asc + 180.0,
        cusp2 + 180.0,
        cusp3 + 180.0,
        mc,
        cusp11,
        cusp12,
    ];
    map_cusps(|index| normalize_longitude(cusps[index]))
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

fn placidus_iterated_ra(
    ramc: f64,
    phi: f64,
    obliquity: f64,
    offset: f64,
    multiplier: f64,
) -> Result<Option<f64>, LongitudeError> {
    let mut ra = ramc + offset;
    for _ in 0..64 {
        let longitude = ecliptic_longitude_of_right_ascension(normalize_longitude(ra)?, obliquity)?;
        let declination = declination_of_longitude(longitude, obliquity);
        let argument = phi.tan() * (declination * DEG).tan();
        if argument.abs() >= 1.0 {
            break;
        }
        let ascensional_difference = argument.asin() * RAD;
        let next = ramc + offset + multiplier * ascensional_difference;
        if (normalize_longitude(next - ra + 180.0)? - 180.0).abs() < 1e-9 {
            return Ok(Some(next));
        }
        ra = next;
    }
    Ok(None)
}

fn placidus_bracketed_ra(
    ramc: f64,
    phi: f64,
    obliquity: f64,
    offset: f64,
    multiplier: f64,
) -> Result<f64, LongitudeError> {
    let centre = ramc + offset;
    let mut low = centre - 90.0 * multiplier - 1.0;
    let mut high = centre + 90.0 * multiplier + 1.0;
    for _ in 0..128 {
        let middle = (low + high) / 2.0;
        if !(middle > low && middle < high) {
            break;
        }
        let longitude =
            ecliptic_longitude_of_right_ascension(normalize_longitude(middle)?, obliquity)?;
        let declination = declination_of_longitude(longitude, obliquity);
        // Unlike f64::min/max, clamp retains NaN like JavaScript's Math.min/max.
        let argument = (phi.tan() * (declination * DEG).tan()).clamp(-1.0, 1.0);
        if centre + multiplier * argument.asin() * RAD > middle {
            low = middle;
        } else {
            high = middle;
        }
    }
    Ok((low + high) / 2.0)
}

/// Divide the semi-arcs of intermediate degrees, with bounded iteration and
/// bisection if it does not converge. Return None at or inside the polar circle.
/// Supplied angles are copied as-is, including the independent IC and DSC.
pub fn placidus_cusps(
    input: &AngleInput,
    angles: &Angles,
) -> Result<Option<[f64; 12]>, LongitudeError> {
    if input.latitude.abs() >= 90.0 - input.obliquity {
        return Ok(None);
    }
    let ramc = ramc_of(input)?;
    let phi = input.latitude * DEG;
    let iterate = |offset, multiplier| {
        let ra = match placidus_iterated_ra(ramc, phi, input.obliquity, offset, multiplier)? {
            Some(ra) => ra,
            None => placidus_bracketed_ra(ramc, phi, input.obliquity, offset, multiplier)?,
        };
        ecliptic_longitude_of_right_ascension(normalize_longitude(ra)?, input.obliquity)
    };
    let cusp11 = iterate(30.0, 1.0 / 3.0)?;
    let cusp12 = iterate(60.0, 2.0 / 3.0)?;
    let cusp2 = iterate(120.0, 2.0 / 3.0)?;
    let cusp3 = iterate(150.0, 1.0 / 3.0)?;
    Ok(Some([
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
    ]))
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

/// Ascendants at thirds of the midheaven degree's diurnal semi-arc.
/// Return None at or inside the polar circle before reading any other inputs.
pub fn koch_cusps(
    input: &AngleInput,
    angles: &Angles,
) -> Result<Option<[f64; 12]>, LongitudeError> {
    if input.latitude.abs() >= 90.0 - input.obliquity {
        return Ok(None);
    }
    let ramc = ramc_of(input)?;
    let argument = (input.latitude * DEG).tan()
        * (declination_of_longitude(angles.mc, input.obliquity) * DEG).tan();
    // The reference intentionally does not clamp Koch's argument.
    let third = (90.0 + argument.asin() * RAD) / 3.0;
    let at = |offset| oblique_longitude(ramc + 90.0 + offset, input.latitude, input.obliquity);
    quadrant_cusps(
        angles.asc,
        angles.mc,
        at(-2.0 * third)?,
        at(-third)?,
        at(third)?,
        at(2.0 * third)?,
    )
    .map(Some)
}

fn circle_cusps(
    input: &AngleInput,
    angles: &Angles,
    circles: [(f64, f64); 4],
) -> Result<[f64; 12], LongitudeError> {
    let ramc = ramc_of(input)?;
    let mut intermediates = [0.0; 4];
    for (cusp, (ascension, pole)) in intermediates.iter_mut().zip(circles) {
        *cusp = oblique_longitude(ramc + ascension, pole, input.obliquity)?;
    }
    let [cusp11, cusp12, cusp2, cusp3] = intermediates;
    let asc = oblique_longitude(ramc + 90.0, input.latitude, input.obliquity)?;
    let cusps = quadrant_cusps(asc, angles.mc, cusp11, cusp12, cusp2, cusp3)?;
    let turned = normalize_longitude(asc - angles.mc)? >= 180.0;
    if turned {
        map_cusps(|index| normalize_longitude(cusps[index] + 180.0))
    } else {
        Ok(cusps)
    }
}

/// House circles through the horizon's north and south points, dividing the
/// celestial equator into equal arcs. Polar cusps turn with the ascendant.
pub fn regiomontanus_cusps(
    input: &AngleInput,
    angles: &Angles,
) -> Result<[f64; 12], LongitudeError> {
    let tangent = (input.latitude * DEG).tan();
    let near = (tangent * 0.5).atan() * RAD;
    let far = (tangent * (30.0 * DEG).cos()).atan() * RAD;
    circle_cusps(
        input,
        angles,
        [(30.0, near), (60.0, far), (120.0, far), (150.0, near)],
    )
}

/// House circles through the horizon's north and south points, dividing the
/// prime vertical into equal arcs. Polar cusps turn with the ascendant.
pub fn campanus_cusps(input: &AngleInput, angles: &Angles) -> Result<[f64; 12], LongitudeError> {
    let sine = (input.latitude * DEG).sin();
    let cosine = (input.latitude * DEG).cos();
    let near = (sine / 2.0).asin() * RAD;
    let far = ((3.0_f64.sqrt() / 2.0) * sine).asin() * RAD;
    let wide = (3.0_f64.sqrt() / cosine).atan() * RAD;
    let narrow = (1.0 / (3.0_f64.sqrt() * cosine)).atan() * RAD;
    circle_cusps(
        input,
        angles,
        [
            (90.0 - wide, near),
            (90.0 - narrow, far),
            (90.0 + narrow, far),
            (90.0 + wide, near),
        ],
    )
}

/// Regiomontanus ascensions with pole tangents at thirds of the latitude's.
/// Polar cusps turn with the ascendant.
pub fn topocentric_cusps(input: &AngleInput, angles: &Angles) -> Result<[f64; 12], LongitudeError> {
    let tangent = (input.latitude * DEG).tan();
    let near = (tangent / 3.0).atan() * RAD;
    let far = ((tangent * 2.0) / 3.0).atan() * RAD;
    circle_cusps(
        input,
        angles,
        [(30.0, near), (60.0, far), (120.0, far), (150.0, near)],
    )
}

/// Divide the ascendant's diurnal and nocturnal semi-arcs into thirds along
/// hour circles. Clamp circumpolar arguments as the TypeScript helper does.
pub fn alcabitius_cusps(input: &AngleInput, angles: &Angles) -> Result<[f64; 12], LongitudeError> {
    let ramc = ramc_of(input)?;
    let declination = declination_of_longitude(angles.asc, input.obliquity);
    let argument = -(input.latitude * DEG).tan() * (declination * DEG).tan();
    // f64::clamp propagates NaN; min/max would instead accept invalid input.
    let day = argument.clamp(-1.0, 1.0).acos() * RAD;
    let night = 180.0 - day;
    let at = |ascension| oblique_longitude(ramc + ascension, 0.0, input.obliquity);
    quadrant_cusps(
        angles.asc,
        angles.mc,
        at(day / 3.0)?,
        at((2.0 * day) / 3.0)?,
        at(180.0 - (2.0 * night) / 3.0)?,
        at(180.0 - night / 3.0)?,
    )
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

/// Dispatch every supported system, preserving whole-sign polar fallback
/// metadata for Placidus and Koch.
pub fn compute_houses(
    system: HouseSystem,
    input: &AngleInput,
    angles: &Angles,
) -> Result<ComputedHouses, LongitudeError> {
    if is_polar_undefined_house_system(system) {
        let cusps = if system == HouseSystem::Placidus {
            placidus_cusps(input, angles)?
        } else {
            koch_cusps(input, angles)?
        };
        return match cusps {
            Some(cusps) => Ok(ComputedHouses {
                houses: Houses { system, cusps },
                fell_back: false,
                fallback_system: None,
            }),
            None => Ok(ComputedHouses {
                houses: Houses {
                    system: POLAR_FALLBACK,
                    cusps: whole_sign_cusps(angles.asc)?,
                },
                fell_back: true,
                fallback_system: Some(POLAR_FALLBACK),
            }),
        };
    }
    let cusps = match system {
        HouseSystem::Whole => whole_sign_cusps(angles.asc),
        HouseSystem::Placidus | HouseSystem::Koch => unreachable!("handled above"),
        HouseSystem::Porphyry => porphyry_cusps(angles),
        HouseSystem::Equal => equal_cusps(angles),
        HouseSystem::EqualMc => equal_mc_cusps(angles),
        HouseSystem::Vehlow => vehlow_cusps(angles),
        HouseSystem::Regiomontanus => regiomontanus_cusps(input, angles),
        HouseSystem::Campanus => campanus_cusps(input, angles),
        HouseSystem::Topocentric => topocentric_cusps(input, angles),
        HouseSystem::Alcabitius => alcabitius_cusps(input, angles),
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
    fn direct_systems_have_no_fallback_including_at_polar_latitudes() {
        for latitude in [-89.999, -70.0, 0.0, 70.0, 89.999] {
            let observer = input(13.75, latitude);
            let a = compute_angles(&observer).unwrap();
            for system in [
                HouseSystem::Whole,
                HouseSystem::Porphyry,
                HouseSystem::Equal,
                HouseSystem::EqualMc,
                HouseSystem::Vehlow,
                HouseSystem::Meridian,
                HouseSystem::Morinus,
            ] {
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
        assert_eq!(HouseSystem::from_name("Equal"), None);
    }

    fn separation(left: f64, right: f64) -> f64 {
        (normalize_longitude(left - right + 180.0).unwrap() - 180.0).abs()
    }

    fn right_ascension(longitude: f64, obliquity: f64) -> f64 {
        normalize_longitude(
            ((longitude * DEG).sin() * (obliquity * DEG).cos()).atan2((longitude * DEG).cos())
                * RAD,
        )
        .unwrap()
    }

    fn assert_ordered(cusps: &[f64; 12]) {
        let mut sum = 0.0;
        for index in 0..12 {
            let gap = normalize_longitude(cusps[(index + 1) % 12] - cusps[index]).unwrap();
            assert!(gap > 0.0, "cusps coincide at index {index}: {cusps:?}");
            sum += gap;
        }
        assert!((sum - 360.0).abs() < 1e-9, "cusps out of order: {cusps:?}");
    }

    #[test]
    fn complete_system_catalog_and_nonpolar_cusp_order() {
        assert_eq!(
            HOUSE_SYSTEMS.map(HouseSystem::name),
            [
                "whole",
                "placidus",
                "porphyry",
                "equal",
                "equal-mc",
                "vehlow",
                "koch",
                "regiomontanus",
                "campanus",
                "topocentric",
                "alcabitius",
                "morinus",
                "meridian",
            ]
        );
        for system in HOUSE_SYSTEMS {
            assert_eq!(HouseSystem::from_name(system.name()), Some(system));
        }
        assert_eq!(HouseSystem::from_name("unknown"), None);
        assert_eq!(PLACIDUS_POLAR_FALLBACK, POLAR_FALLBACK);
        for latitude in [-60.0, -40.0, -20.0, 0.0, 20.0, 40.0, 60.0] {
            for column in 0..24 {
                let observer = input(column as f64 + 0.5, latitude);
                let a = compute_angles(&observer).unwrap();
                for system in HOUSE_SYSTEMS {
                    let result = compute_houses(system, &observer, &a).unwrap();
                    assert_eq!(result.houses.system, system);
                    assert!(!result.fell_back);
                    assert_eq!(result.fallback_system, None);
                    assert_ordered(&result.houses.cusps);
                }
            }
        }
    }

    #[test]
    fn semi_arc_systems_fall_back_exactly_at_the_polar_limit_before_other_validation() {
        let limit = 90.0 - input(0.0, 0.0).obliquity;
        let below = f64::from_bits(limit.to_bits() - 1);
        for sign in [-1.0, 1.0] {
            for magnitude in [below, limit, 80.0, 90.0] {
                let observer = input(2.125, sign * magnitude);
                let a = compute_angles(&observer).unwrap();
                for system in POLAR_UNDEFINED_HOUSE_SYSTEMS {
                    assert!(is_polar_undefined_house_system(system));
                    let result = compute_houses(system, &observer, &a).unwrap();
                    assert_eq!(result.fell_back, magnitude >= limit);
                    if result.fell_back {
                        assert_eq!(result.houses.system, POLAR_FALLBACK);
                        assert_eq!(result.fallback_system, Some(POLAR_FALLBACK));
                        same_bits(result.houses.cusps, whole_sign_cusps(a.asc).unwrap());
                    } else {
                        assert_eq!(result.houses.system, system);
                        assert_eq!(result.fallback_system, None);
                    }
                }
            }
        }
        let observer = AngleInput {
            gast_hours: f64::NAN,
            longitude: f64::NAN,
            ..input(0.0, limit)
        };
        let supplied = Angles {
            asc: 123.0,
            mc: f64::NAN,
            ic: f64::NAN,
            dsc: f64::NAN,
        };
        assert_eq!(placidus_cusps(&observer, &supplied), Ok(None));
        assert_eq!(koch_cusps(&observer, &supplied), Ok(None));
        for system in POLAR_UNDEFINED_HOUSE_SYSTEMS {
            let result = compute_houses(system, &observer, &supplied).unwrap();
            same_bits(result.houses.cusps, whole_sign_cusps(123.0).unwrap());
        }
    }

    #[test]
    fn placidus_intermediate_cusps_satisfy_the_semi_arc_equation() {
        for latitude in [-65.0, -35.0, 0.0, 35.0, 65.0] {
            for hours in [0.5, 4.7, 8.9, 13.1, 17.3, 21.5] {
                let observer = input(hours, latitude);
                let ramc = ramc_of(&observer).unwrap();
                let cusps = placidus_cusps(&observer, &compute_angles(&observer).unwrap())
                    .unwrap()
                    .unwrap();
                for (offset, multiplier, index) in [
                    (30.0, 1.0 / 3.0, 10),
                    (60.0, 2.0 / 3.0, 11),
                    (120.0, 2.0 / 3.0, 1),
                    (150.0, 1.0 / 3.0, 2),
                ] {
                    let alpha = right_ascension(cusps[index], observer.obliquity);
                    // tan(delta) = tan(epsilon) sin(alpha), independently of
                    // the longitude-to-declination path used by the solver.
                    let argument = (latitude * DEG).tan()
                        * (observer.obliquity * DEG).tan()
                        * (alpha * DEG).sin();
                    let expected = ramc + offset + multiplier * argument.asin() * RAD;
                    assert!(separation(alpha, expected) < 2e-9);
                }
            }
        }
    }

    #[test]
    fn placidus_uses_bisection_when_iteration_does_not_settle_near_the_limit() {
        let mut bracketed = 0;
        for obliquity in [23.4392911_f64, 23.4271_f64] {
            let limit = 90.0 - obliquity;
            let latitude = f64::from_bits(limit.to_bits() - 1);
            for hemisphere in [-1.0, 1.0] {
                for ramc in [30.0, 90.0, 150.0, 210.0, 270.0, 330.0] {
                    for step in [-0.0002, -0.0001, 0.0, 0.0001, 0.0002] {
                        let observer = AngleInput {
                            obliquity,
                            ..input((ramc + step) / 15.0, hemisphere * latitude)
                        };
                        let a = compute_angles(&observer).unwrap();
                        let cusps = placidus_cusps(&observer, &a).unwrap().unwrap();
                        assert_ordered(&cusps);
                        let actual_ramc = ramc_of(&observer).unwrap();
                        for (offset, multiplier, index) in [
                            (30.0, 1.0 / 3.0, 10),
                            (60.0, 2.0 / 3.0, 11),
                            (120.0, 2.0 / 3.0, 1),
                            (150.0, 1.0 / 3.0, 2),
                        ] {
                            if placidus_iterated_ra(
                                actual_ramc,
                                observer.latitude * DEG,
                                obliquity,
                                offset,
                                multiplier,
                            )
                            .unwrap()
                            .is_some()
                            {
                                continue;
                            }
                            bracketed += 1;
                            let alpha = right_ascension(cusps[index], obliquity);
                            let argument = ((observer.latitude * DEG).tan()
                                * (obliquity * DEG).tan()
                                * (alpha * DEG).sin())
                            .clamp(-1.0, 1.0);
                            assert!(
                                separation(
                                    alpha,
                                    actual_ramc + offset + multiplier * argument.asin() * RAD
                                ) < 2e-6
                            );
                        }
                    }
                }
            }
        }
        assert!(bracketed > 0, "the grid must exercise the bisection path");
    }

    #[test]
    fn koch_cusps_are_rising_degrees_at_thirds_of_the_mid_heaven_semi_arc() {
        for latitude in [-60.0, -25.0, 0.0, 25.0, 60.0] {
            for hours in [0.7, 3.9, 7.1, 10.3, 13.5, 16.7, 19.9, 23.1] {
                let observer = input(hours, latitude);
                let a = compute_angles(&observer).unwrap();
                let cusps = koch_cusps(&observer, &a).unwrap().unwrap();
                let delta = declination_of_longitude(a.mc, observer.obliquity) * DEG;
                let semi_arc = 90.0 + ((latitude * DEG).tan() * delta.tan()).asin() * RAD;
                for (index, third) in [(10, -2.0), (11, -1.0), (1, 1.0), (2, 2.0)] {
                    let shifted = AngleInput {
                        gast_hours: hours + (third * semi_arc) / 3.0 / 15.0,
                        ..observer
                    };
                    assert!(
                        separation(cusps[index], compute_angles(&shifted).unwrap().asc) < 1e-10
                    );
                }
            }
        }
    }

    #[test]
    fn regiomontanus_and_campanus_cusps_lie_on_the_defining_great_circles() {
        let cross = |a: [f64; 3], b: [f64; 3]| {
            [
                a[1] * b[2] - a[2] * b[1],
                a[2] * b[0] - a[0] * b[2],
                a[0] * b[1] - a[1] * b[0],
            ]
        };
        for latitude in [-60.0, -25.0, 0.0, 25.0, 60.0] {
            for hours in [0.5, 4.5, 8.5, 12.5, 16.5, 20.5] {
                let observer = input(hours, latitude);
                let a = compute_angles(&observer).unwrap();
                let theta = ramc_of(&observer).unwrap() * DEG;
                let phi = latitude * DEG;
                let north = [
                    -phi.sin() * theta.cos(),
                    -phi.sin() * theta.sin(),
                    phi.cos(),
                ];
                let zenith = [phi.cos() * theta.cos(), phi.cos() * theta.sin(), phi.sin()];
                let east = [-theta.sin(), theta.cos(), 0.0];
                for system in [HouseSystem::Regiomontanus, HouseSystem::Campanus] {
                    let cusps = compute_houses(system, &observer, &a).unwrap().houses.cusps;
                    for (index, offset) in [(10, 30.0), (11, 60.0), (1, 120.0), (2, 150.0)] {
                        let point = if system == HouseSystem::Regiomontanus {
                            let ra = theta + offset * DEG;
                            [ra.cos(), ra.sin(), 0.0]
                        } else {
                            let arc = offset * DEG;
                            std::array::from_fn(|axis| {
                                zenith[axis] * arc.cos() + east[axis] * arc.sin()
                            })
                        };
                        let normal = cross(north, point);
                        let lon = cusps[index] * DEG;
                        let epsilon = observer.obliquity * DEG;
                        let ecliptic = [
                            lon.cos(),
                            lon.sin() * epsilon.cos(),
                            lon.sin() * epsilon.sin(),
                        ];
                        let residual = normal[0] * ecliptic[0]
                            + normal[1] * ecliptic[1]
                            + normal[2] * ecliptic[2];
                        assert!(residual.abs() < 1e-12);
                    }
                }
            }
        }
    }

    #[test]
    fn topocentric_cusps_are_ascendants_under_the_prescribed_pole_heights() {
        for latitude in [-60.0, -25.0, 0.0, 25.0, 60.0] {
            for hours in [0.5, 4.5, 8.5, 12.5, 16.5, 20.5] {
                let observer = input(hours, latitude);
                let a = compute_angles(&observer).unwrap();
                let cusps = topocentric_cusps(&observer, &a).unwrap();
                for (index, shift, share) in [
                    (10, -60.0, 1.0 / 3.0),
                    (11, -30.0, 2.0 / 3.0),
                    (1, 30.0, 2.0 / 3.0),
                    (2, 60.0, 1.0 / 3.0),
                ] {
                    let pole = ((latitude * DEG).tan() * share).atan() * RAD;
                    let rising = compute_angles(&AngleInput {
                        gast_hours: hours + shift / 15.0,
                        latitude: pole,
                        ..observer
                    })
                    .unwrap()
                    .asc;
                    assert!(separation(cusps[index], rising) < 1e-10);
                }
            }
        }
    }

    #[test]
    fn circle_systems_turn_the_ascendant_and_tenth_cusp_together_inside_polar_regions() {
        let mut turned = 0;
        for latitude in [-85.0, -72.0, 70.0, 78.0, 89.0] {
            for column in 0..36 {
                let observer = input((column as f64 * 10.0 + 3.0) / 15.0, latitude);
                let a = compute_angles(&observer).unwrap();
                for system in [
                    HouseSystem::Regiomontanus,
                    HouseSystem::Campanus,
                    HouseSystem::Topocentric,
                ] {
                    let result = compute_houses(system, &observer, &a).unwrap();
                    assert!(!result.fell_back);
                    assert_eq!(result.houses.system, system);
                    let cusps = result.houses.cusps;
                    assert!(separation(cusps[0], a.asc) < 1e-9);
                    if separation(cusps[9], a.ic) < 1e-9 {
                        turned += 1;
                    } else {
                        assert!(separation(cusps[9], a.mc) < 1e-9);
                    }
                    for index in 0..6 {
                        assert!(separation(cusps[index] + 180.0, cusps[index + 6]) < 1e-9);
                    }
                }
                let alcabitius = compute_houses(HouseSystem::Alcabitius, &observer, &a).unwrap();
                assert!(!alcabitius.fell_back);
                assert!(separation(alcabitius.houses.cusps[0], a.asc) < 1e-9);
                assert!(separation(alcabitius.houses.cusps[9], a.mc) < 1e-9);
            }
        }
        assert!(turned > 0);
    }

    #[test]
    fn alcabitius_cusps_divide_the_ascendants_day_and_night_arcs() {
        for latitude in [-60.0, -30.0, 0.0, 30.0, 60.0] {
            for hours in [0.7, 5.9, 10.1, 15.3, 20.5] {
                let observer = input(hours, latitude);
                let a = compute_angles(&observer).unwrap();
                let cusps = alcabitius_cusps(&observer, &a).unwrap();
                let ramc = ramc_of(&observer).unwrap();
                let day =
                    normalize_longitude(right_ascension(a.asc, observer.obliquity) - ramc).unwrap();
                let night = 180.0 - day;
                for (index, ascension) in [
                    (10, day / 3.0),
                    (11, 2.0 * day / 3.0),
                    (1, 180.0 - 2.0 * night / 3.0),
                    (2, 180.0 - night / 3.0),
                ] {
                    assert!(
                        separation(
                            right_ascension(cusps[index], observer.obliquity),
                            ramc + ascension
                        ) < 1e-10
                    );
                }
            }
        }
        // A supplied circumpolar ascendant clamps the day arc to zero/180,
        // yielding coincident intermediate cusps rather than an error.
        for asc in [90.0, 270.0] {
            let observer = input(2.0, 80.0);
            let a = angles(asc, 30.0);
            let cusps = alcabitius_cusps(&observer, &a).unwrap();
            assert!(cusps.iter().all(|value| value.is_finite()));
            assert!(cusps[10] == cusps[11] || cusps[1] == cusps[2]);
        }
    }

    #[test]
    fn quadrant_helpers_keep_distinct_axis_and_nan_validation_behavior() {
        let observer = input(2.0, 45.0);
        let supplied = Angles {
            asc: 400.0,
            mc: 370.0,
            dsc: f64::NAN,
            ic: -170.0,
        };
        let placidus = placidus_cusps(&observer, &supplied).unwrap().unwrap();
        assert_eq!(placidus[0], 400.0);
        assert_eq!(placidus[3], -170.0);
        assert!(placidus[6].is_nan());
        assert_eq!(placidus[9], 370.0);
        for cusps in [
            koch_cusps(&observer, &supplied).unwrap().unwrap(),
            alcabitius_cusps(&observer, &supplied).unwrap(),
        ] {
            assert_eq!(cusps[0], 40.0);
            assert_eq!(cusps[3], 190.0);
            assert_eq!(cusps[6], 220.0);
            assert_eq!(cusps[9], 10.0);
        }
        let a = compute_angles(&observer).unwrap();
        for helper in [regiomontanus_cusps, campanus_cusps, topocentric_cusps] {
            same_bits(
                helper(&observer, &a).unwrap(),
                helper(
                    &observer,
                    &Angles {
                        asc: f64::NAN,
                        dsc: f64::NAN,
                        ic: f64::NAN,
                        ..a
                    },
                )
                .unwrap(),
            );
        }
        let bad = AngleInput {
            latitude: f64::NAN,
            ..observer
        };
        assert_eq!(alcabitius_cusps(&bad, &a), Err(LongitudeError));
        assert_eq!(placidus_cusps(&bad, &a), Err(LongitudeError));
        assert_eq!(koch_cusps(&bad, &a), Err(LongitudeError));
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
