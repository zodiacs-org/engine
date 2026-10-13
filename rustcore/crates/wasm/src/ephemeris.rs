//! Complete ephemeris bindings. Position assembly and sampling run in Rust.

use wasm_bindgen::prelude::*;
use zodiacs_rustcore::{
    ephemeris,
    time_scales::{time_basis, TimeScaleName},
};

fn range_error(message: &str) -> JsValue {
    js_sys::RangeError::new(message).into()
}

fn body_name(name: &str) -> Result<ephemeris::Body, JsValue> {
    ephemeris::Body::from_name(name).ok_or_else(|| range_error(&format!("Unknown body: {name}")))
}

fn scale_name(scale: &str) -> Result<TimeScaleName, JsValue> {
    match scale {
        "utc" => Ok(TimeScaleName::Utc),
        "ut1" => Ok(TimeScaleName::Ut1),
        "tt" => Ok(TimeScaleName::Tt),
        _ => Err(range_error("Time scale must be utc, ut1 or tt.")),
    }
}

fn row(value: &ephemeris::BodyPosition) -> Result<JsValue, JsValue> {
    let object = js_sys::Object::new();
    for (key, field) in [
        ("body", JsValue::from_str(value.body.name())),
        ("lon", JsValue::from_f64(value.lon)),
        ("lat", JsValue::from_f64(value.lat)),
        ("speed", JsValue::from_f64(value.speed)),
        ("retrograde", JsValue::from_bool(value.retrograde)),
        ("sign", JsValue::from_str(value.sign)),
        ("degree", JsValue::from_f64(value.degree)),
    ] {
        js_sys::Reflect::set(&object, &JsValue::from_str(key), &field)?;
    }
    Ok(object.into())
}

#[wasm_bindgen(js_name = positionsOn)]
pub fn positions_on(ms: f64, scale: &str, pin: Option<f64>) -> Result<JsValue, JsValue> {
    let rows = ephemeris::positions_on(ms, scale_name(scale)?, pin)
        .map_err(|error| range_error(&error.to_string()))?;
    let result = js_sys::Array::new();
    for value in &rows {
        result.push(&row(value)?);
    }
    Ok(result.into())
}

#[wasm_bindgen(js_name = bodyLongitudeOn)]
pub fn body_longitude_on(
    body: &str,
    ms: f64,
    scale: &str,
    pin: Option<f64>,
) -> Result<f64, JsValue> {
    ephemeris::longitude_at(body_name(body)?, ms, scale_name(scale)?, pin)
        .map_err(|error| range_error(&error.to_string()))
}

#[wasm_bindgen(js_name = longitudeSpeedOn)]
pub fn longitude_speed_on(
    body: &str,
    ms: f64,
    scale: &str,
    pin: Option<f64>,
) -> Result<f64, JsValue> {
    ephemeris::longitude_speed_on(body_name(body)?, ms, scale_name(scale)?, pin)
        .map_err(|error| range_error(&error.to_string()))
}

#[wasm_bindgen(js_name = outsideReferenceSpan)]
pub fn outside_reference_span(ms: f64) -> bool {
    ephemeris::outside_reference_span(ms)
}

/// Unknown body names are rejected in TypeScript, before crossing the string
/// ABI. The reference checks the first sampled clock before rejecting the
/// name, so keep that error order without evaluating an unrelated body.
#[wasm_bindgen(js_name = validateEphemerisBodyTime)]
pub fn validate_ephemeris_body_time(ms: f64, speed: bool) -> Result<(), JsValue> {
    let sampled_ms = if speed {
        ms + (-ephemeris::SPEED_STEP_DAYS) * 86_400_000.0
    } else {
        ms
    };
    let basis = time_basis(sampled_ms, TimeScaleName::Utc, None)
        .map_err(|error| range_error(&error.to_string()))?;
    ephemeris::check_ephemeris_span(&basis).map_err(|error| range_error(&error.to_string()))
}
