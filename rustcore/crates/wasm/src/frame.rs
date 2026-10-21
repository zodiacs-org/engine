//! Numeric frame bindings. Arrays are copied at the JS boundary; calculation
//! uses only the native Rust kernels, with no JavaScript math callbacks.

use wasm_bindgen::prelude::*;
use zodiacs_rustcore::{equator, frame, nutation};

fn tilt_fields(value: nutation::Tilt) -> [f64; 5] {
    [value.dpsi, value.deps, value.mobl, value.tobl, value.ee]
}

#[wasm_bindgen(js_name = nutationArguments)]
pub fn nutation_arguments() -> Box<[f64]> {
    Box::new(nutation::ARGUMENTS)
}

#[wasm_bindgen(js_name = nutationMultipliers)]
pub fn nutation_multipliers() -> String {
    nutation::MULTIPLIERS.into()
}

#[wasm_bindgen(js_name = nutationOffsets)]
pub fn nutation_offsets() -> Box<[f64]> {
    Box::new(nutation::OFFSETS)
}

#[wasm_bindgen(js_name = nutationTerms)]
pub fn nutation_terms() -> usize {
    nutation::NUTATION_TERMS
}

#[wasm_bindgen]
pub fn coefficients() -> Box<[f64]> {
    Box::new(nutation::COEFFICIENTS)
}

#[wasm_bindgen]
pub fn nutation(t: f64, terms: f64) -> Result<Box<[f64]>, JsValue> {
    // The reference loops forever for +Infinity. Refuse that unsupported
    // count; retain the finite and NaN cases without wasm-bindgen coercing
    // a fractional or negative count into an unsigned integer.
    if terms == f64::INFINITY {
        return Err(
            js_sys::RangeError::new("Nutation term count must not be positive infinity.").into(),
        );
    }
    let value = nutation::nutation_with_terms(t, terms);
    Ok(Box::new([value.dpsi, value.deps, value.om]))
}

#[wasm_bindgen]
pub fn tilt(tt: f64) -> Box<[f64]> {
    Box::new(tilt_fields(nutation::tilt(tt)))
}

#[wasm_bindgen(js_name = meanObliquity)]
pub fn mean_obliquity(t: f64) -> f64 {
    nutation::mean_obliquity(t)
}

#[wasm_bindgen(js_name = gastHours)]
pub fn gast_hours(ut: f64, tt: f64) -> f64 {
    nutation::gast_hours(ut, tt)
}

#[wasm_bindgen(js_name = eclipticFrame)]
pub fn ecliptic_frame(tt: f64) -> Box<[f64]> {
    let value = frame::ecliptic_frame(tt);
    let mut fields = Vec::with_capacity(14);
    fields.extend(value.rows);
    fields.extend(tilt_fields(value.tilt));
    fields.into_boxed_slice()
}

fn matrix(rows: &[f64]) -> [f64; 9] {
    // The TS signatures require a complete matrix. Missing entries still
    // become NaN as undefined operands do in the unchecked reference.
    std::array::from_fn(|index| rows.get(index).copied().unwrap_or(f64::NAN))
}

#[wasm_bindgen(js_name = meanEcliptic)]
pub fn mean_ecliptic(rows: &[f64], x: f64, y: f64, z: f64) -> Box<[f64]> {
    // meanEcliptic and turn have identical scalar operation order. Only the
    // supplied rows are used; no frame needs to be recomputed here.
    Box::new(equator::turn(&matrix(rows), x, y, z))
}

#[wasm_bindgen(js_name = eclipticOfDate)]
pub fn ecliptic_of_date(x: f64, y: f64, z: f64, tt: f64) -> Result<Box<[f64]>, JsValue> {
    let value = frame::ecliptic_of_date(x, y, z, tt).map_err(super::longitude_error)?;
    Ok(Box::new([value.lon, value.lat]))
}

fn kind(mean: bool) -> equator::FrameKind {
    if mean {
        equator::FrameKind::Mean
    } else {
        equator::FrameKind::True
    }
}

#[wasm_bindgen(js_name = eclipticRows)]
pub fn ecliptic_rows(tt: f64, mean: bool) -> Box<[f64]> {
    Box::new(equator::ecliptic_rows(tt, kind(mean)))
}

#[wasm_bindgen(js_name = equatorRows)]
pub fn equator_rows(tt: f64, mean: bool) -> Box<[f64]> {
    Box::new(equator::equator_rows(tt, kind(mean)))
}

#[wasm_bindgen]
pub fn turn(rows: &[f64], x: f64, y: f64, z: f64) -> Box<[f64]> {
    Box::new(equator::turn(&matrix(rows), x, y, z))
}
