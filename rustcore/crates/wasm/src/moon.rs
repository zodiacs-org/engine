//! Lunar series and engine longitude bindings. Numeric work stays in Rust.

use wasm_bindgen::prelude::*;
use zodiacs_rustcore::{lunar, moon, time_scales::TimeScaleName};

fn range_error(message: &str) -> JsValue {
    js_sys::RangeError::new(message).into()
}

fn lunar_body(body: &str) -> Result<lunar::LunarBody, JsValue> {
    match body {
        "Moon" => Ok(lunar::LunarBody::Moon),
        "North Node" => Ok(lunar::LunarBody::NorthNode),
        "South Node" => Ok(lunar::LunarBody::SouthNode),
        _ => Err(range_error("Body is not supported by the lunar kernel.")),
    }
}

fn scale_name(scale: &str) -> Result<TimeScaleName, JsValue> {
    match scale {
        "utc" => Ok(TimeScaleName::Utc),
        "ut1" => Ok(TimeScaleName::Ut1),
        "tt" => Ok(TimeScaleName::Tt),
        _ => Err(range_error("Time scale must be utc, ut1 or tt.")),
    }
}

#[wasm_bindgen(js_name = geoMoon)]
pub fn geo_moon(tt: f64) -> Result<Box<[f64]>, JsValue> {
    if !tt.is_finite() {
        return Err(range_error(
            "Lunar series require finite TT days since J2000.",
        ));
    }
    Ok(Box::new(moon::geo_moon(tt)))
}

#[wasm_bindgen(js_name = geoMoonState)]
pub fn geo_moon_state(ut: f64, tt: f64, delta_t: f64) -> Result<Box<[f64]>, JsValue> {
    let value =
        moon::geo_moon_state(ut, tt, delta_t).map_err(|error| range_error(&error.to_string()))?;
    Ok(Box::new([
        value.pos[0],
        value.pos[1],
        value.pos[2],
        value.vel[0],
        value.vel[1],
        value.vel[2],
    ]))
}

#[wasm_bindgen(js_name = moonOfDate)]
pub fn moon_of_date(ut: f64, tt: f64, delta_t: f64) -> Result<Box<[f64]>, JsValue> {
    let value =
        lunar::moon_of_date(ut, tt, delta_t).map_err(|error| range_error(&error.to_string()))?;
    Ok(Box::new([value.lon, value.lat]))
}

#[wasm_bindgen(js_name = trueNodeLongitude)]
pub fn true_node_longitude(ut: f64, tt: f64, delta_t: f64) -> Result<f64, JsValue> {
    lunar::true_node_longitude(ut, tt, delta_t).map_err(|error| range_error(&error.to_string()))
}

#[wasm_bindgen(js_name = lunarLongitude)]
pub fn lunar_longitude(body: &str, ms: f64, scale: &str, pin: Option<f64>) -> Result<f64, JsValue> {
    lunar::lunar_longitude(lunar_body(body)?, ms, scale_name(scale)?, pin)
        .map_err(|error| range_error(&error.to_string()))
}

#[wasm_bindgen(js_name = lunarLongitudeSpeed)]
pub fn lunar_longitude_speed(
    body: &str,
    ms: f64,
    scale: &str,
    pin: Option<f64>,
) -> Result<f64, JsValue> {
    lunar::lunar_longitude_speed(lunar_body(body)?, ms, scale_name(scale)?, pin)
        .map_err(|error| range_error(&error.to_string()))
}
