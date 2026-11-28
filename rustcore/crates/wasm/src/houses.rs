//! House geometry bindings. All angular calculation stays in the native core.

use wasm_bindgen::prelude::*;
use zodiacs_rustcore::houses::{self, AngleInput, Angles};

fn input(gast_hours: f64, latitude: f64, longitude: f64, obliquity: f64) -> AngleInput {
    AngleInput {
        gast_hours,
        latitude,
        longitude,
        obliquity,
    }
}

fn angles(asc: f64, mc: f64, dsc: f64, ic: f64) -> Angles {
    Angles { asc, mc, dsc, ic }
}

#[wasm_bindgen(js_name = ramcOf)]
pub fn ramc_of(gast_hours: f64, longitude: f64) -> Result<f64, JsValue> {
    houses::ramc_of(&input(gast_hours, 0.0, longitude, 0.0)).map_err(super::longitude_error)
}

#[wasm_bindgen(js_name = computeAngles)]
pub fn compute_angles(
    gast_hours: f64,
    latitude: f64,
    longitude: f64,
    obliquity: f64,
) -> Result<Box<[f64]>, JsValue> {
    let value = houses::compute_angles(&input(gast_hours, latitude, longitude, obliquity))
        .map_err(super::longitude_error)?;
    Ok(Box::new([value.asc, value.mc, value.dsc, value.ic]))
}

#[wasm_bindgen(js_name = wholeSignCusps)]
pub fn whole_sign_cusps(ascendant: f64) -> Result<Box<[f64]>, JsValue> {
    Ok(Box::new(
        houses::whole_sign_cusps(ascendant).map_err(super::longitude_error)?,
    ))
}

#[wasm_bindgen(js_name = equalCusps)]
pub fn equal_cusps(ascendant: f64) -> Result<Box<[f64]>, JsValue> {
    Ok(Box::new(
        houses::equal_cusps(&angles(ascendant, 0.0, 0.0, 0.0)).map_err(super::longitude_error)?,
    ))
}

#[wasm_bindgen(js_name = equalMcCusps)]
pub fn equal_mc_cusps(midheaven: f64) -> Result<Box<[f64]>, JsValue> {
    Ok(Box::new(
        houses::equal_mc_cusps(&angles(0.0, midheaven, 0.0, 0.0))
            .map_err(super::longitude_error)?,
    ))
}

#[wasm_bindgen(js_name = vehlowCusps)]
pub fn vehlow_cusps(ascendant: f64) -> Result<Box<[f64]>, JsValue> {
    Ok(Box::new(
        houses::vehlow_cusps(&angles(ascendant, 0.0, 0.0, 0.0)).map_err(super::longitude_error)?,
    ))
}

#[wasm_bindgen(js_name = porphyryCusps)]
pub fn porphyry_cusps(asc: f64, mc: f64, dsc: f64, ic: f64) -> Result<Box<[f64]>, JsValue> {
    Ok(Box::new(
        houses::porphyry_cusps(&angles(asc, mc, dsc, ic)).map_err(super::longitude_error)?,
    ))
}

#[wasm_bindgen(js_name = meridianCusps)]
pub fn meridian_cusps(
    gast_hours: f64,
    longitude: f64,
    obliquity: f64,
) -> Result<Box<[f64]>, JsValue> {
    Ok(Box::new(
        houses::meridian_cusps(&input(gast_hours, 0.0, longitude, obliquity))
            .map_err(super::longitude_error)?,
    ))
}

#[wasm_bindgen(js_name = morinusCusps)]
pub fn morinus_cusps(
    gast_hours: f64,
    longitude: f64,
    obliquity: f64,
) -> Result<Box<[f64]>, JsValue> {
    Ok(Box::new(
        houses::morinus_cusps(&input(gast_hours, 0.0, longitude, obliquity))
            .map_err(super::longitude_error)?,
    ))
}

#[wasm_bindgen(js_name = placidusCusps)]
#[allow(clippy::too_many_arguments)] // Flat scalar ABI preserves all four supplied axes.
pub fn placidus_cusps(
    gast_hours: f64,
    latitude: f64,
    longitude: f64,
    obliquity: f64,
    asc: f64,
    mc: f64,
    dsc: f64,
    ic: f64,
) -> Result<Option<Box<[f64]>>, JsValue> {
    houses::placidus_cusps(
        &input(gast_hours, latitude, longitude, obliquity),
        &angles(asc, mc, dsc, ic),
    )
    .map(|cusps| cusps.map(|values| Box::new(values) as Box<[f64]>))
    .map_err(super::longitude_error)
}

#[wasm_bindgen(js_name = kochCusps)]
pub fn koch_cusps(
    gast_hours: f64,
    latitude: f64,
    longitude: f64,
    obliquity: f64,
    asc: f64,
    mc: f64,
) -> Result<Option<Box<[f64]>>, JsValue> {
    houses::koch_cusps(
        &input(gast_hours, latitude, longitude, obliquity),
        &angles(asc, mc, 0.0, 0.0),
    )
    .map(|cusps| cusps.map(|values| Box::new(values) as Box<[f64]>))
    .map_err(super::longitude_error)
}

#[wasm_bindgen(js_name = regiomontanusCusps)]
pub fn regiomontanus_cusps(
    gast_hours: f64,
    latitude: f64,
    longitude: f64,
    obliquity: f64,
    mc: f64,
) -> Result<Box<[f64]>, JsValue> {
    Ok(Box::new(
        houses::regiomontanus_cusps(
            &input(gast_hours, latitude, longitude, obliquity),
            &angles(0.0, mc, 0.0, 0.0),
        )
        .map_err(super::longitude_error)?,
    ))
}

#[wasm_bindgen(js_name = campanusCusps)]
pub fn campanus_cusps(
    gast_hours: f64,
    latitude: f64,
    longitude: f64,
    obliquity: f64,
    mc: f64,
) -> Result<Box<[f64]>, JsValue> {
    Ok(Box::new(
        houses::campanus_cusps(
            &input(gast_hours, latitude, longitude, obliquity),
            &angles(0.0, mc, 0.0, 0.0),
        )
        .map_err(super::longitude_error)?,
    ))
}

#[wasm_bindgen(js_name = topocentricCusps)]
pub fn topocentric_cusps(
    gast_hours: f64,
    latitude: f64,
    longitude: f64,
    obliquity: f64,
    mc: f64,
) -> Result<Box<[f64]>, JsValue> {
    Ok(Box::new(
        houses::topocentric_cusps(
            &input(gast_hours, latitude, longitude, obliquity),
            &angles(0.0, mc, 0.0, 0.0),
        )
        .map_err(super::longitude_error)?,
    ))
}

#[wasm_bindgen(js_name = alcabitiusCusps)]
pub fn alcabitius_cusps(
    gast_hours: f64,
    latitude: f64,
    longitude: f64,
    obliquity: f64,
    asc: f64,
    mc: f64,
) -> Result<Box<[f64]>, JsValue> {
    Ok(Box::new(
        houses::alcabitius_cusps(
            &input(gast_hours, latitude, longitude, obliquity),
            &angles(asc, mc, 0.0, 0.0),
        )
        .map_err(super::longitude_error)?,
    ))
}

#[wasm_bindgen(js_name = houseOf)]
pub fn house_of(longitude: f64, cusps: &[f64], present: u16) -> Result<u8, JsValue> {
    if cusps.len() != 12 {
        return Err(js_sys::RangeError::new("House cusps must contain 12 longitudes.").into());
    }
    // The JS helper skips edges touching undefined or a hole. A separate bit
    // mask preserves that distinction from a present NaN, which must reject
    // if evaluation reaches it. The native helper also preserves short cuts.
    let values: [Option<f64>; 12] =
        std::array::from_fn(|index| (present & (1 << index) != 0).then_some(cusps[index]));
    houses::house_of_optional(longitude, &values)
        .map_err(|error| js_sys::RangeError::new(&error.to_string()).into())
}
