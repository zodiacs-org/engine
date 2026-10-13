//! Object marshalling only; all time calculations execute in the native crate.
use js_sys::{Object, Reflect};
use wasm_bindgen::prelude::*;
use zodiacs_rustcore::{deltat, time_scales};

fn field(object: &Object, key: &str, value: impl Into<JsValue>) {
    Reflect::set(object, &key.into(), &value.into()).expect("fresh output object");
}

fn delta_record(value: deltat::DeltaT) -> JsValue {
    let object = Object::new();
    field(&object, "seconds", value.seconds);
    field(
        &object,
        "sigma",
        value.sigma.map_or(JsValue::NULL, JsValue::from),
    );
    field(&object, "model", value.model);
    field(
        &object,
        "table",
        value.table.map_or(JsValue::NULL, JsValue::from),
    );
    field(
        &object,
        "tableDigest",
        value.table_digest.map_or(JsValue::NULL, JsValue::from),
    );
    field(&object, "segment", value.segment);
    object.into()
}

fn ut1_record(value: time_scales::Ut1MinusUtc) -> JsValue {
    let object = Object::new();
    field(&object, "seconds", value.seconds);
    field(&object, "sigma", value.sigma);
    field(&object, "source", value.source);
    object.into()
}

fn range_error(error: deltat::DeltaTError) -> JsValue {
    js_sys::RangeError::new(&error.to_string()).into()
}

#[wasm_bindgen(js_name = deltaT)]
pub fn delta_t(ut: f64) -> Result<f64, JsValue> {
    deltat::delta_t(ut).map_err(range_error)
}

#[wasm_bindgen(js_name = deltaTAt)]
pub fn delta_t_at(ut: f64) -> Result<JsValue, JsValue> {
    deltat::delta_t_at(ut)
        .map(delta_record)
        .map_err(range_error)
}

#[wasm_bindgen(js_name = taiMinusUtcAt)]
pub fn tai_minus_utc_at(ms: f64) -> f64 {
    time_scales::tai_minus_utc_at(ms)
}

#[wasm_bindgen(js_name = ut1MinusUtcAt)]
pub fn ut1_minus_utc_at(ms: f64) -> JsValue {
    ut1_record(time_scales::ut1_minus_utc_at(ms))
}

fn scale_name(scale: u32) -> time_scales::TimeScaleName {
    match scale {
        1 => time_scales::TimeScaleName::Ut1,
        2 => time_scales::TimeScaleName::Tt,
        _ => time_scales::TimeScaleName::Utc,
    }
}

#[wasm_bindgen(js_name = timeBasis)]
pub fn time_basis(ms: f64, scale: u32, pin: Option<f64>) -> Result<JsValue, JsValue> {
    let value = time_scales::time_basis(ms, scale_name(scale), pin).map_err(range_error)?;
    let object = Object::new();
    field(&object, "utcMs", value.utc_ms);
    field(&object, "ut1Days", value.ut1_days);
    field(&object, "ttDays", value.tt_days);
    field(&object, "deltaT", delta_record(value.delta_t));
    let time = Object::new();
    field(&time, "input", value.time_scale.input.as_str());
    field(&time, "basis", value.time_scale.basis);
    field(
        &time,
        "ut1MinusUtc",
        value
            .time_scale
            .ut1_minus_utc
            .map_or(JsValue::NULL, ut1_record),
    );
    let leap = value.time_scale.leap_seconds.map_or(JsValue::NULL, |leap| {
        let object = Object::new();
        field(&object, "taiMinusUtc", leap.tai_minus_utc);
        field(&object, "listed", leap.listed);
        object.into()
    });
    field(&time, "leapSeconds", leap);
    field(&object, "timeScale", time);
    Ok(object.into())
}

// elapsedDays reads only these decision fields in the reference. Avoid
// requiring unrelated metadata fields just to marshal its two records.
fn elapsed_record(value: &JsValue) -> Result<time_scales::TimeBasis, JsValue> {
    let get = |object: &JsValue, name: &str| Reflect::get(object, &name.into());
    let number =
        |name: &str| -> Result<f64, JsValue> { Ok(get(value, name)?.as_f64().unwrap_or(f64::NAN)) };
    let time = get(value, "timeScale")?;
    let input = match get(&time, "input")?.as_string().as_deref() {
        Some("ut1") => time_scales::TimeScaleName::Ut1,
        Some("tt") => time_scales::TimeScaleName::Tt,
        _ => time_scales::TimeScaleName::Utc,
    };
    let basis = match get(&time, "basis")?.as_string().as_deref() {
        Some("iers") => "iers",
        Some("pinned") => "pinned",
        _ => "delta-t",
    };
    let delta = get(value, "deltaT")?;
    let model = match get(&delta, "model")?.as_string().as_deref() {
        Some("pinned") => "pinned",
        Some("iers-utc/1") => "iers-utc/1",
        _ => deltat::DELTA_T_MODEL,
    };
    let ut1 = get(&time, "ut1MinusUtc")?;
    let ut1_minus_utc = if ut1.is_null() {
        None
    } else {
        Some(time_scales::Ut1MinusUtc {
            seconds: 0.0,
            sigma: 0.0,
            source: if get(&ut1, "source")?.as_string().as_deref() == Some("fallback") {
                "fallback"
            } else {
                "observed"
            },
        })
    };
    Ok(time_scales::TimeBasis {
        utc_ms: number("utcMs")?,
        ut1_days: number("ut1Days")?,
        tt_days: number("ttDays")?,
        delta_t: deltat::DeltaT {
            seconds: 0.0,
            sigma: None,
            model,
            table: None,
            table_digest: None,
            segment: "pinned",
        },
        time_scale: time_scales::TimeScale {
            input,
            basis,
            ut1_minus_utc,
            leap_seconds: None,
        },
    })
}

#[wasm_bindgen(js_name = elapsedDays)]
pub fn elapsed_days(before: JsValue, after: JsValue, days: f64) -> Result<f64, JsValue> {
    Ok(time_scales::elapsed_days(
        &elapsed_record(&before)?,
        &elapsed_record(&after)?,
        days,
    ))
}
