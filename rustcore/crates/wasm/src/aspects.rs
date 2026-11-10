//! Flat numeric aspect ABI. JS owns labels, snapshots and result allocation;
//! the safe native core owns every numeric decision and result ordering.

use wasm_bindgen::prelude::*;
use zodiacs_rustcore::aspects::{self, AspectMotion, AspectOrbInput, AspectOrbLimits};

const BODIES: [&str; 10] = [
    "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
];
const TYPES: [&str; 5] = ["conjunction", "sextile", "square", "trine", "opposition"];

fn error(message: &str) -> JsValue {
    js_sys::RangeError::new(message).into()
}

fn index(value: f64, length: usize) -> Result<usize, JsValue> {
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value >= length as f64 {
        return Err(error("Invalid aspect transport index."));
    }
    Ok(value as usize)
}

fn width(values: &[f64], stride: usize) -> Result<(), JsValue> {
    if values.len() % stride != 0 {
        return Err(error("Invalid aspect transport length."));
    }
    Ok(())
}

fn motion(value: AspectMotion) -> u8 {
    match value {
        AspectMotion::Applying => 0,
        AspectMotion::Separating => 1,
        AspectMotion::Stationary => 2,
    }
}

fn type_index(value: &str) -> f64 {
    TYPES.iter().position(|name| *name == value).unwrap() as f64
}

fn body_index(value: &str) -> f64 {
    BODIES.iter().position(|name| *name == value).unwrap() as f64
}

#[wasm_bindgen(js_name = aspectMotion)]
pub fn aspect_motion(a_lon: f64, a_speed: f64, b_lon: f64, b_speed: f64, angle: f64) -> u8 {
    motion(aspects::aspect_motion(
        a_lon, a_speed, b_lon, b_speed, angle,
    ))
}

#[wasm_bindgen(js_name = matchAspect)]
pub fn match_aspect(
    a_luminary: bool,
    a_lon: f64,
    b_luminary: bool,
    b_lon: f64,
) -> Option<Box<[f64]>> {
    aspects::match_aspect(
        if a_luminary { "Sun" } else { "other" },
        a_lon,
        if b_luminary { "Sun" } else { "other" },
        b_lon,
    )
    .map(|value| vec![type_index(value.definition.aspect_type), value.orb].into_boxed_slice())
}

#[wasm_bindgen(js_name = findAspects)]
pub fn find_aspects(values: &[f64]) -> Result<Box<[f64]>, JsValue> {
    width(values, 3)?;
    let rows = values
        .chunks_exact(3)
        .map(|row| {
            Ok(aspects::AspectPosition {
                body: BODIES[index(row[0], BODIES.len())?].to_owned(),
                lon: row[1],
                speed: row[2],
            })
        })
        .collect::<Result<Vec<_>, JsValue>>()?;
    Ok(aspects::find_aspects(&rows)
        .into_iter()
        .flat_map(|value| {
            [
                body_index(&value.a),
                body_index(&value.b),
                type_index(value.aspect_type),
                value.orb,
                f64::from(value.applying),
            ]
        })
        .collect::<Vec<_>>()
        .into_boxed_slice())
}

fn minimal_rows(values: &[f64]) -> Result<Vec<aspects::MinimalBody>, JsValue> {
    width(values, 2)?;
    values
        .chunks_exact(2)
        .map(|row| {
            Ok(aspects::MinimalBody {
                body: BODIES[index(row[0], BODIES.len())?].to_owned(),
                lon: row[1],
            })
        })
        .collect()
}

#[wasm_bindgen(js_name = findInterAspects)]
pub fn find_inter_aspects(first: &[f64], second: &[f64]) -> Result<Box<[f64]>, JsValue> {
    Ok(
        aspects::find_inter_aspects(&minimal_rows(first)?, &minimal_rows(second)?)
            .into_iter()
            .flat_map(|value| {
                [
                    body_index(&value.a),
                    value.a_lon,
                    body_index(&value.b),
                    value.b_lon,
                    type_index(value.aspect_type),
                    value.orb,
                ]
            })
            .collect::<Vec<_>>()
            .into_boxed_slice(),
    )
}

fn token(value: f64) -> Result<String, JsValue> {
    // Up to 256 selected and 256 supplied labels, plus reserved Sun/Moon IDs.
    Ok(match index(value, 514)? {
        0 => "Sun".to_owned(),
        1 => "Moon".to_owned(),
        other => format!("b{other}"),
    })
}

fn token_index(value: &str) -> f64 {
    match value {
        "Sun" => 0.0,
        "Moon" => 1.0,
        _ => value[1..].parse::<usize>().unwrap() as f64,
    }
}

fn limits(values: &[f64]) -> AspectOrbInput {
    AspectOrbInput::ByMotion(AspectOrbLimits {
        applying: values[0],
        separating: values[1],
        stationary: values[2],
    })
}

#[wasm_bindgen(js_name = findConfiguredAspects)]
pub fn find_configured_aspects(
    positions: &[f64],
    selected: &[f64],
    rules: &[f64],
    caps: &[f64],
    threshold: f64,
) -> Result<Box<[f64]>, JsValue> {
    width(positions, 3)?;
    width(rules, 8)?;
    width(caps, 4)?;
    if positions.len() > 256 * 3
        || selected.len() > 256
        || rules.len() > 64 * 8
        || caps.len() > 256 * 4
    {
        return Err(error("Invalid aspect transport length."));
    }
    let rows = positions
        .chunks_exact(3)
        .map(|row| {
            Ok(aspects::AspectPosition {
                body: token(row[0])?,
                lon: row[1],
                speed: row[2],
            })
        })
        .collect::<Result<Vec<_>, JsValue>>()?;
    let definitions = rules
        .chunks_exact(8)
        .enumerate()
        .map(|(i, row)| aspects::AspectRuleInput {
            aspect_type: format!("rule-{i}"),
            angle: Some(row[0]),
            orb: limits(&row[1..4]),
            luminary_orb: (row[4] != 0.0).then(|| limits(&row[5..8])),
        })
        .collect();
    let body_orbs = caps
        .chunks_exact(4)
        .map(|row| Ok((token(row[0])?, limits(&row[1..4]))))
        .collect::<Result<Vec<_>, JsValue>>()?;
    let policy = aspects::create_aspect_policy(aspects::AspectPolicyInput {
        aspects: Some(definitions),
        bodies: Some(
            selected
                .iter()
                .map(|value| token(*value))
                .collect::<Result<_, _>>()?,
        ),
        body_orbs: Some(body_orbs),
        stationary_relative_speed: Some(threshold),
    })
    .map_err(|failure| error(&failure.to_string()))?;
    Ok(aspects::find_configured_aspects(&rows, &policy)
        .map_err(|failure| error(&failure.to_string()))?
        .into_iter()
        .flat_map(|value| {
            [
                token_index(&value.a),
                token_index(&value.b),
                value.aspect_type[5..].parse::<usize>().unwrap() as f64,
                value.angle,
                value.orb,
                value.maximum_orb,
                f64::from(motion(value.motion)),
            ]
        })
        .collect::<Vec<_>>()
        .into_boxed_slice())
}
