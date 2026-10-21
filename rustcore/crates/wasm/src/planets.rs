//! Planet series bindings. All ephemeris and light-time arithmetic runs in Rust.

use wasm_bindgen::prelude::*;
use zodiacs_rustcore::planets::{self, Planet};

fn range_error(message: &str) -> JsValue {
    js_sys::RangeError::new(message).into()
}

fn planet(body: &str) -> Result<Planet, JsValue> {
    match body {
        "Sun" => Ok(Planet::Sun),
        "Mercury" => Ok(Planet::Mercury),
        "Venus" => Ok(Planet::Venus),
        "Earth" => Ok(Planet::Earth),
        "Mars" => Ok(Planet::Mars),
        "Jupiter" => Ok(Planet::Jupiter),
        "Saturn" => Ok(Planet::Saturn),
        "Uranus" => Ok(Planet::Uranus),
        "Neptune" => Ok(Planet::Neptune),
        "Pluto" => Ok(Planet::Pluto),
        _ => Err(range_error(
            "Body is not supported by the planetary series kernel.",
        )),
    }
}

fn finite_tt(tt: f64) -> Result<(), JsValue> {
    if tt.is_finite() {
        Ok(())
    } else {
        Err(range_error(
            "Planetary series require finite TT days since J2000.",
        ))
    }
}

#[wasm_bindgen(js_name = helioVector)]
pub fn helio_vector(body: &str, tt: f64) -> Result<Box<[f64]>, JsValue> {
    let body = planet(body)?;
    finite_tt(tt)?;
    if body == Planet::Pluto {
        zodiacs_rustcore::pluto::validate_table_tt(tt)
            .map_err(|error| range_error(&error.to_string()))?;
    }
    Ok(Box::new(planets::helio_vector(body, tt)))
}

#[wasm_bindgen(js_name = helioState)]
pub fn helio_state(body: &str, tt: f64) -> Result<Box<[f64]>, JsValue> {
    let body = planet(body)?;
    finite_tt(tt)?;
    if body == Planet::Pluto {
        zodiacs_rustcore::pluto::validate_table_tt(tt)
            .map_err(|error| range_error(&error.to_string()))?;
    }
    let value = planets::helio_state(body, tt);
    Ok(Box::new([
        value.pos[0],
        value.pos[1],
        value.pos[2],
        value.vel[0],
        value.vel[1],
        value.vel[2],
    ]))
}

#[wasm_bindgen(js_name = backdatePosition)]
pub fn backdate_position(
    observer: &str,
    target: &str,
    ut: f64,
    tt: f64,
    delta_t: f64,
    aberration: bool,
) -> Result<Box<[f64]>, JsValue> {
    let value = planets::backdate_position(
        planet(observer)?,
        planet(target)?,
        ut,
        tt,
        delta_t,
        aberration,
    )
    .map_err(|error| range_error(&error.to_string()))?;
    Ok(Box::new([
        value.vector[0],
        value.vector[1],
        value.vector[2],
        value.ut,
        value.tt,
    ]))
}

#[wasm_bindgen(js_name = geoVector)]
pub fn geo_vector(
    body: &str,
    ut: f64,
    tt: f64,
    delta_t: f64,
    aberration: bool,
) -> Result<Box<[f64]>, JsValue> {
    let value = planets::geo_vector(planet(body)?, ut, tt, delta_t, aberration)
        .map_err(|error| range_error(&error.to_string()))?;
    Ok(Box::new(value))
}
