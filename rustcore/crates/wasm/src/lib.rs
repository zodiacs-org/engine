//! WebAssembly bindings for the native numeric kernels.

use wasm_bindgen::prelude::*;

/// Normalize a longitude using the native kernel and JavaScript error type.
#[wasm_bindgen(js_name = normalizeLongitude)]
pub fn normalize_longitude(longitude: f64) -> Result<f64, JsValue> {
    zodiacs_rustcore::normalize_longitude(longitude)
        .map_err(|error| js_sys::RangeError::new(&error.to_string()).into())
}
