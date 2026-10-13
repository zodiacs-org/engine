//! WebAssembly bindings for the native numeric kernels.

mod ephemeris;
mod frame;
mod houses;
mod moon;
mod planets;
mod time;

use wasm_bindgen::prelude::*;
use zodiacs_rustcore::{angles, calendar, date_input, signs, LongitudeError};

fn longitude_error(error: LongitudeError) -> JsValue {
    js_sys::RangeError::new(&error.to_string()).into()
}

/// Normalize a longitude using the native kernel and JavaScript error type.
#[wasm_bindgen(js_name = normalizeLongitude)]
pub fn normalize_longitude(longitude: f64) -> Result<f64, JsValue> {
    zodiacs_rustcore::normalize_longitude(longitude).map_err(longitude_error)
}

#[wasm_bindgen(js_name = signIndexForLongitude)]
pub fn sign_index_for_longitude(longitude: f64) -> Result<usize, JsValue> {
    signs::sign_index_for_longitude(longitude).map_err(longitude_error)
}

#[wasm_bindgen(js_name = degreeInSign)]
pub fn degree_in_sign(longitude: f64) -> Result<f64, JsValue> {
    signs::degree_in_sign(longitude).map_err(longitude_error)
}

#[wasm_bindgen]
pub fn separation(a: f64, b: f64) -> f64 {
    angles::separation(a, b)
}

#[wasm_bindgen]
pub fn wrap360(value: f64) -> f64 {
    angles::wrap360(value)
}

#[wasm_bindgen(js_name = signedDelta)]
pub fn signed_delta(from: f64, to: f64) -> f64 {
    angles::signed_delta(from, to)
}

#[wasm_bindgen]
pub fn advance(from: f64, to: f64) -> f64 {
    angles::advance(from, to)
}

#[wasm_bindgen]
pub fn antiscion(longitude: f64) -> Result<f64, JsValue> {
    angles::antiscion(longitude).map_err(longitude_error)
}

#[wasm_bindgen(js_name = contraAntiscion)]
pub fn contra_antiscion(longitude: f64) -> Result<f64, JsValue> {
    angles::contra_antiscion(longitude).map_err(longitude_error)
}

#[wasm_bindgen]
pub fn midpoint(first: f64, second: f64) -> Result<f64, JsValue> {
    angles::midpoint(first, second).map_err(longitude_error)
}

#[wasm_bindgen(js_name = dateFromMillis)]
pub fn date_from_millis(value: f64) -> Option<f64> {
    date_input::date_from_millis(value).ok()
}

#[wasm_bindgen(js_name = dateFromIso)]
pub fn date_from_iso(value: &str) -> Option<f64> {
    date_input::date_from_iso(value).ok()
}

fn calendar_kind(julian: bool) -> calendar::Calendar {
    if julian {
        calendar::Calendar::Julian
    } else {
        calendar::Calendar::Gregorian
    }
}

fn civil_fields(date: calendar::CivilDate) -> Box<[f64]> {
    Box::new([date.year, date.month, date.day])
}

#[wasm_bindgen(js_name = parseCalendarDate)]
pub fn parse_calendar_date(value: &str, julian: bool) -> Option<Box<[f64]>> {
    calendar::parse_calendar_date(value, calendar_kind(julian)).map(civil_fields)
}

#[wasm_bindgen(js_name = julianDayNumber)]
pub fn julian_day_number(year: f64, month: f64, day: f64, julian: bool) -> f64 {
    calendar::julian_day_number(
        calendar::CivilDate { year, month, day },
        calendar_kind(julian),
    )
}

#[wasm_bindgen(js_name = civilDateOf)]
pub fn civil_date_of(jdn: f64, julian: bool) -> Box<[f64]> {
    civil_fields(calendar::civil_date_of(jdn, calendar_kind(julian)))
}

#[wasm_bindgen(js_name = julianToGregorian)]
pub fn julian_to_gregorian(value: &str) -> Option<String> {
    calendar::julian_to_gregorian(value)
}

#[wasm_bindgen(js_name = gregorianToJulian)]
pub fn gregorian_to_julian(value: &str) -> Option<String> {
    calendar::gregorian_to_julian(value)
}
