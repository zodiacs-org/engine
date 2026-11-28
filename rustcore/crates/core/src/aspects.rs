//! Legacy and configured longitude aspects translated from the engine's
//! `src/aspects.ts`, `src/synastry.ts`, `src/configured-aspects.ts` and
//! `src/body-label.ts` (MIT). No ephemeris or accuracy reference is involved.
//!
//! Legacy arithmetic retains binary64 evaluation order. Configured decisions
//! retain exact expansions until the reported orb is rounded once. Native
//! labels are Rust strings; the WASM boundary preserves JavaScript UTF-16
//! labels, including lone surrogates, using reversible label tokens.

use crate::exact::{
    absolute, compare_exact, exact_sign, exact_sum, exact_sum_parts, rounded_value, sign_of,
    ExactSum,
};
use std::collections::HashSet;
use std::fmt;

pub const STATIONARY_RELATIVE_SPEED: f64 = 1e-9;
pub const ASPECT_POLICY_SCHEMA: &str = "zodiacs.aspect-policy.v1";
pub const CONFIGURED_ASPECTS_SCHEMA: &str = "zodiacs.configured-aspects.v1";
pub const MAX_BODY_LABEL_LENGTH: usize = 80;

pub const PHYSICAL_BODIES: [&str; 10] = [
    "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AspectMotion {
    Applying,
    Separating,
    Stationary,
}

impl AspectMotion {
    pub const fn name(self) -> &'static str {
        match self {
            Self::Applying => "applying",
            Self::Separating => "separating",
            Self::Stationary => "stationary",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AspectDefinition {
    pub aspect_type: &'static str,
    pub angle: f64,
    pub orb: f64,
    pub luminary_orb: f64,
}

pub const ASPECTS: [AspectDefinition; 5] = [
    AspectDefinition {
        aspect_type: "conjunction",
        angle: 0.0,
        orb: 8.0,
        luminary_orb: 10.0,
    },
    AspectDefinition {
        aspect_type: "sextile",
        angle: 60.0,
        orb: 4.0,
        luminary_orb: 5.0,
    },
    AspectDefinition {
        aspect_type: "square",
        angle: 90.0,
        orb: 7.0,
        luminary_orb: 8.0,
    },
    AspectDefinition {
        aspect_type: "trine",
        angle: 120.0,
        orb: 7.0,
        luminary_orb: 8.0,
    },
    AspectDefinition {
        aspect_type: "opposition",
        angle: 180.0,
        orb: 8.0,
        luminary_orb: 10.0,
    },
];

pub const CONFIGURED_ASPECT_ANGLES: [(&str, f64); 11] = [
    ("conjunction", 0.0),
    ("semisextile", 30.0),
    ("semisquare", 45.0),
    ("sextile", 60.0),
    ("quintile", 72.0),
    ("square", 90.0),
    ("trine", 120.0),
    ("sesquiquadrate", 135.0),
    ("biquintile", 144.0),
    ("quincunx", 150.0),
    ("opposition", 180.0),
];

#[derive(Clone, Debug, PartialEq)]
pub struct AspectPosition {
    pub body: String,
    pub lon: f64,
    pub speed: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MinimalBody {
    pub body: String,
    pub lon: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AspectMatch {
    pub definition: &'static AspectDefinition,
    pub orb: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Aspect {
    pub a: String,
    pub b: String,
    pub aspect_type: &'static str,
    pub orb: f64,
    pub applying: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct InterAspect {
    pub a: String,
    pub a_lon: f64,
    pub b: String,
    pub b_lon: f64,
    pub aspect_type: &'static str,
    pub orb: f64,
}

fn is_luminary(body: &str) -> bool {
    body == "Sun" || body == "Moon"
}

/// The legacy separation, including its intermediate rounding and NaN behavior.
pub fn separation(a: f64, b: f64) -> f64 {
    let difference = ((((a - b) % 360.0) + 360.0) % 360.0).abs();
    if difference > 180.0 {
        360.0 - difference
    } else {
        difference
    }
}

fn js_sign(value: f64) -> f64 {
    if value == 0.0 || value.is_nan() {
        value
    } else {
        value.signum()
    }
}

/// Legacy instantaneous motion with longitude in degrees and speed in degrees/day.
pub fn aspect_motion(
    a_lon: f64,
    a_speed: f64,
    b_lon: f64,
    b_speed: f64,
    angle: f64,
) -> AspectMotion {
    let relative = a_speed - b_speed;
    // The source's negated comparison also treats NaN as stationary.
    if relative.is_nan() || relative.abs() < STATIONARY_RELATIVE_SPEED {
        return AspectMotion::Stationary;
    }
    let wrapped = (((a_lon - b_lon) % 360.0) + 360.0) % 360.0;
    let signed = if wrapped > 180.0 {
        wrapped - 360.0
    } else {
        wrapped
    };
    let deviation = signed.abs() - angle;
    if deviation == 0.0 {
        return AspectMotion::Separating;
    }
    if js_sign(deviation) * js_sign(signed) * relative < 0.0 {
        AspectMotion::Applying
    } else {
        AspectMotion::Separating
    }
}

pub fn match_aspect(a_body: &str, a_lon: f64, b_body: &str, b_lon: f64) -> Option<AspectMatch> {
    let distance = separation(a_lon, b_lon);
    let luminary = is_luminary(a_body) || is_luminary(b_body);
    let mut best: Option<AspectMatch> = None;
    for definition in &ASPECTS {
        let orb = (distance - definition.angle).abs();
        let maximum = if luminary {
            definition.luminary_orb
        } else {
            definition.orb
        };
        if orb <= maximum && best.as_ref().is_none_or(|previous| orb < previous.orb) {
            best = Some(AspectMatch { definition, orb });
        }
    }
    best
}

pub fn find_aspects(bodies: &[AspectPosition]) -> Vec<Aspect> {
    let candidates: Vec<_> = bodies
        .iter()
        .filter(|row| PHYSICAL_BODIES.contains(&row.body.as_str()))
        .collect();
    let mut found = Vec::new();
    for (index, a) in candidates.iter().enumerate() {
        for b in &candidates[index + 1..] {
            if let Some(matched) = match_aspect(&a.body, a.lon, &b.body, b.lon) {
                found.push(Aspect {
                    a: a.body.clone(),
                    b: b.body.clone(),
                    aspect_type: matched.definition.aspect_type,
                    orb: matched.orb,
                    applying: aspect_motion(
                        a.lon,
                        a.speed,
                        b.lon,
                        b.speed,
                        matched.definition.angle,
                    ) == AspectMotion::Applying,
                });
            }
        }
    }
    // Stable sort: equal rounded legacy orbs keep input pair order.
    found.sort_by(|a, b| {
        a.orb
            .partial_cmp(&b.orb)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    found
}

pub fn find_inter_aspects(first: &[MinimalBody], second: &[MinimalBody]) -> Vec<InterAspect> {
    let mut found = Vec::new();
    for a in first
        .iter()
        .filter(|row| PHYSICAL_BODIES.contains(&row.body.as_str()))
    {
        for b in second
            .iter()
            .filter(|row| PHYSICAL_BODIES.contains(&row.body.as_str()))
        {
            if let Some(matched) = match_aspect(&a.body, a.lon, &b.body, b.lon) {
                found.push(InterAspect {
                    a: a.body.clone(),
                    a_lon: a.lon,
                    b: b.body.clone(),
                    b_lon: b.lon,
                    aspect_type: matched.definition.aspect_type,
                    orb: matched.orb,
                });
            }
        }
    }
    found.sort_by(|a, b| {
        a.orb
            .partial_cmp(&b.orb)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    found
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AspectOrbLimits {
    pub applying: f64,
    pub separating: f64,
    pub stationary: f64,
}

impl AspectOrbLimits {
    pub const fn get(self, motion: AspectMotion) -> f64 {
        match motion {
            AspectMotion::Applying => self.applying,
            AspectMotion::Separating => self.separating,
            AspectMotion::Stationary => self.stationary,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum AspectOrbInput {
    Uniform(f64),
    ByMotion(AspectOrbLimits),
}

#[derive(Clone, Debug, PartialEq)]
pub struct AspectRuleInput {
    pub aspect_type: String,
    pub angle: Option<f64>,
    pub orb: AspectOrbInput,
    pub luminary_orb: Option<AspectOrbInput>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct AspectPolicyInput {
    pub aspects: Option<Vec<AspectRuleInput>>,
    pub bodies: Option<Vec<String>>,
    pub body_orbs: Option<Vec<(String, AspectOrbInput)>>,
    pub stationary_relative_speed: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ResolvedAspectRule {
    pub aspect_type: String,
    pub angle: f64,
    pub orb: AspectOrbLimits,
    pub luminary_orb: Option<AspectOrbLimits>,
}

/// Only the factory constructs policies. Getters borrow immutable snapshots.
#[derive(Clone, Debug, PartialEq)]
pub struct AspectPolicy {
    aspects: Vec<ResolvedAspectRule>,
    bodies: Vec<String>,
    body_orbs: Vec<(String, AspectOrbLimits)>,
    stationary_relative_speed: f64,
}

impl AspectPolicy {
    pub fn aspects(&self) -> &[ResolvedAspectRule] {
        &self.aspects
    }
    pub fn bodies(&self) -> &[String] {
        &self.bodies
    }
    pub fn body_orbs(&self) -> &[(String, AspectOrbLimits)] {
        &self.body_orbs
    }
    pub fn stationary_relative_speed(&self) -> f64 {
        self.stationary_relative_speed
    }

    fn body_cap(&self, body: &str, motion: AspectMotion) -> f64 {
        self.body_orbs
            .iter()
            .find(|(name, _)| name == body)
            .map_or(180.0, |(_, limits)| limits.get(motion))
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ConfiguredAspect {
    pub a: String,
    pub b: String,
    pub aspect_type: String,
    pub angle: f64,
    pub orb: f64,
    pub maximum_orb: f64,
    pub motion: AspectMotion,
    pub applying: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AspectError(pub &'static str);

impl fmt::Display for AspectError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.0)
    }
}
impl std::error::Error for AspectError {}

fn require(condition: bool, message: &'static str) -> Result<(), AspectError> {
    if condition {
        Ok(())
    } else {
        Err(AspectError(message))
    }
}

fn number_in(value: f64, low: f64, high: f64, message: &'static str) -> Result<f64, AspectError> {
    require(value.is_finite() && value >= low && value <= high, message)?;
    Ok(if value == 0.0 { 0.0 } else { value })
}

fn ecmascript_whitespace(character: char) -> bool {
    matches!(character, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}'
        | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}'
        | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

pub fn checked_body_label(label: &str) -> Result<(), AspectError> {
    require(
        !label.is_empty() && label.encode_utf16().count() <= MAX_BODY_LABEL_LENGTH
            && !label.starts_with(ecmascript_whitespace) && !label.ends_with(ecmascript_whitespace)
            && !label.chars().any(|character| character <= '\u{001f}' || character == '\u{007f}'),
        "Body labels must be nonempty, trimmed strings of at most 80 characters, without control characters.",
    )
}

fn orb_limits(input: AspectOrbInput) -> Result<AspectOrbLimits, AspectError> {
    match input {
        AspectOrbInput::Uniform(value) => {
            let value = number_in(value, 0.0, 180.0, "Orb is outside its finite range.")?;
            Ok(AspectOrbLimits {
                applying: value,
                separating: value,
                stationary: value,
            })
        }
        AspectOrbInput::ByMotion(value) => Ok(AspectOrbLimits {
            applying: number_in(
                value.applying,
                0.0,
                180.0,
                "Applying orb is outside its finite range.",
            )?,
            separating: number_in(
                value.separating,
                0.0,
                180.0,
                "Separating orb is outside its finite range.",
            )?,
            stationary: number_in(
                value.stationary,
                0.0,
                180.0,
                "Stationary orb is outside its finite range.",
            )?,
        }),
    }
}

pub fn create_aspect_policy(input: AspectPolicyInput) -> Result<AspectPolicy, AspectError> {
    let bodies = input.bodies.unwrap_or_else(|| {
        PHYSICAL_BODIES
            .iter()
            .map(|name| (*name).to_owned())
            .collect()
    });
    require(
        bodies.len() <= 256,
        "Bodies must be an array with at most 256 entries.",
    )?;
    for body in &bodies {
        checked_body_label(body)?;
    }
    require(
        bodies.iter().collect::<HashSet<_>>().len() == bodies.len(),
        "Body selection contains duplicate labels.",
    )?;
    let rules = input.aspects.unwrap_or_else(|| {
        ASPECTS
            .iter()
            .map(|rule| AspectRuleInput {
                aspect_type: rule.aspect_type.to_owned(),
                angle: None,
                orb: AspectOrbInput::Uniform(rule.orb),
                luminary_orb: Some(AspectOrbInput::Uniform(rule.luminary_orb)),
            })
            .collect()
    });
    require(
        rules.len() <= 64,
        "Aspects must be an array with at most 64 entries.",
    )?;
    let mut seen = HashSet::new();
    let mut aspects = Vec::with_capacity(rules.len());
    for rule in rules {
        let bytes = rule.aspect_type.as_bytes();
        require(
            !bytes.is_empty()
                && bytes.len() <= 64
                && bytes[0].is_ascii_lowercase()
                && bytes[1..].iter().all(|byte| {
                    byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'-'
                }),
            "Aspect type must be a lowercase identifier of at most 64 characters.",
        )?;
        require(
            seen.insert(rule.aspect_type.clone()),
            "Aspect types must be unique.",
        )?;
        let named = CONFIGURED_ASPECT_ANGLES
            .iter()
            .find(|(name, _)| *name == rule.aspect_type)
            .map(|(_, angle)| *angle);
        let angle = number_in(
            rule.angle.or(named).unwrap_or(f64::NAN),
            0.0,
            180.0,
            "Aspect angle is outside its finite range.",
        )?;
        require(
            named.is_none_or(|named| angle == named),
            "A named aspect must keep its named angle.",
        )?;
        aspects.push(ResolvedAspectRule {
            aspect_type: rule.aspect_type,
            angle,
            orb: orb_limits(rule.orb)?,
            luminary_orb: rule.luminary_orb.map(orb_limits).transpose()?,
        });
    }
    let mut body_orbs = Vec::new();
    let mut cap_names = HashSet::new();
    for (name, value) in input.body_orbs.unwrap_or_default() {
        checked_body_label(&name)?;
        require(
            bodies.contains(&name),
            "A body orb cap must name a selected body.",
        )?;
        require(
            cap_names.insert(name.clone()),
            "Body orb caps contain duplicate labels.",
        )?;
        body_orbs.push((name, orb_limits(value)?));
    }
    let stationary_relative_speed = number_in(
        input
            .stationary_relative_speed
            .unwrap_or(STATIONARY_RELATIVE_SPEED),
        0.0,
        f64::MAX,
        "Stationary relative speed is outside its finite range.",
    )?;
    Ok(AspectPolicy {
        aspects,
        bodies,
        body_orbs,
        stationary_relative_speed,
    })
}

fn signed_separation(a: f64, b: f64) -> ExactSum {
    let difference = exact_sum(&[a, -b]);
    if compare_exact(&difference, &[180.0]) > 0 {
        return exact_sum_parts(&[&difference, &[-360.0]]);
    }
    if compare_exact(&difference, &[-180.0]) <= 0 {
        return exact_sum_parts(&[&difference, &[360.0]]);
    }
    difference
}

fn relative_speed_sign(a: f64, b: f64, threshold: f64) -> i8 {
    if a == b {
        return 0;
    }
    let sign = if a > b { 1 } else { -1 };
    if exact_sign(&[threshold, -f64::from(sign) * a, f64::from(sign) * b]) > 0 {
        0
    } else {
        sign
    }
}

fn distance_rate_sign(signed: &[f64], distance: &[f64], relative: i8) -> i8 {
    if sign_of(distance) == 0 {
        return 1;
    }
    if compare_exact(distance, &[180.0]) == 0 {
        return -1;
    }
    if sign_of(signed) * relative > 0 {
        1
    } else {
        -1
    }
}

fn motion_of(deviation: &[f64], rate: Option<i8>) -> AspectMotion {
    let Some(rate) = rate else {
        return AspectMotion::Stationary;
    };
    let deviation_sign = sign_of(deviation);
    if deviation_sign == 0 {
        return AspectMotion::Separating;
    }
    if deviation_sign * rate < 0 {
        AspectMotion::Applying
    } else {
        AspectMotion::Separating
    }
}

pub fn find_configured_aspects(
    positions: &[AspectPosition],
    policy: &AspectPolicy,
) -> Result<Vec<ConfiguredAspect>, AspectError> {
    require(
        positions.len() <= 256,
        "Positions must be an array with at most 256 entries.",
    )?;
    let mut labels = HashSet::new();
    for row in positions {
        checked_body_label(&row.body)?;
        require(
            labels.insert(&row.body),
            "Positions contain duplicate body labels.",
        )?;
        number_in(
            row.lon,
            0.0,
            360.0,
            "Longitude is outside its finite range.",
        )?;
        require(row.lon < 360.0, "Longitude must be in [0,360).")?;
        require(
            row.speed.is_finite(),
            "Every position requires a finite longitude speed.",
        )?;
    }
    let selected: HashSet<_> = policy.bodies.iter().collect();
    let candidates: Vec<_> = positions
        .iter()
        .filter(|row| selected.contains(&row.body))
        .collect();
    let mut found: Vec<(ExactSum, ConfiguredAspect)> = Vec::new();
    for (index, a) in candidates.iter().enumerate() {
        for b in &candidates[index + 1..] {
            let signed = signed_separation(a.lon, b.lon);
            let distance = absolute(&signed);
            let relative = relative_speed_sign(a.speed, b.speed, policy.stationary_relative_speed);
            let rate = if relative == 0 {
                None
            } else {
                Some(distance_rate_sign(&signed, &distance, relative))
            };
            let luminary = is_luminary(&a.body) || is_luminary(&b.body);
            let mut best: Option<(&ResolvedAspectRule, ExactSum, f64, AspectMotion)> = None;
            for definition in &policy.aspects {
                let deviation = exact_sum_parts(&[&distance, &[-definition.angle]]);
                let exact_orb = absolute(&deviation);
                let motion = motion_of(&deviation, rate);
                let limits = if luminary {
                    definition.luminary_orb.unwrap_or(definition.orb)
                } else {
                    definition.orb
                };
                let maximum_orb = limits
                    .get(motion)
                    .min(policy.body_cap(&a.body, motion))
                    .min(policy.body_cap(&b.body, motion));
                if compare_exact(&exact_orb, &[maximum_orb]) <= 0
                    && best
                        .as_ref()
                        .is_none_or(|(_, previous, _, _)| compare_exact(&exact_orb, previous) < 0)
                {
                    best = Some((definition, exact_orb, maximum_orb, motion));
                }
            }
            if let Some((definition, exact_orb, maximum_orb, motion)) = best {
                let orb = rounded_value(&exact_orb);
                found.push((
                    exact_orb,
                    ConfiguredAspect {
                        a: a.body.clone(),
                        b: b.body.clone(),
                        aspect_type: definition.aspect_type.clone(),
                        angle: definition.angle,
                        orb,
                        maximum_orb,
                        motion,
                        applying: motion == AspectMotion::Applying,
                    },
                ));
            }
        }
    }
    // Compare exact values, even when the reported doubles tie. Rust's stable
    // sort preserves the original nested-loop pair order only on an exact tie.
    found.sort_by(|(a, _), (b, _)| compare_exact(a, b).cmp(&0));
    Ok(found.into_iter().map(|(_, aspect)| aspect).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn position(body: &str, lon: f64, speed: f64) -> AspectPosition {
        AspectPosition {
            body: body.to_owned(),
            lon,
            speed,
        }
    }

    fn pair(a: f64, b: f64, speed_a: f64, speed_b: f64) -> [AspectPosition; 2] {
        [position("A", a, speed_a), position("B", b, speed_b)]
    }

    fn rule(aspect_type: &str, angle: Option<f64>, orb: f64) -> AspectRuleInput {
        AspectRuleInput {
            aspect_type: aspect_type.to_owned(),
            angle,
            orb: AspectOrbInput::Uniform(orb),
            luminary_orb: None,
        }
    }

    fn policy(rules: Vec<AspectRuleInput>) -> AspectPolicy {
        create_aspect_policy(AspectPolicyInput {
            bodies: Some(vec!["A".into(), "B".into(), "C".into()]),
            aspects: Some(rules),
            ..Default::default()
        })
        .unwrap()
    }

    #[test]
    fn legacy_matches_luminary_limits_and_rejects_nonfinite_separations() {
        assert!(match_aspect("Mars", 0.0, "Saturn", 9.0).is_none());
        let found = match_aspect("Sun", 0.0, "Saturn", 10.0).unwrap();
        assert_eq!(found.definition.aspect_type, "conjunction");
        assert_eq!(found.orb, 10.0);
        assert!(match_aspect("sun", 0.0, "Saturn", 9.0).is_none());
        for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert!(separation(bad, 0.0).is_nan());
            assert!(match_aspect("Sun", bad, "Moon", 0.0).is_none());
        }
        assert_eq!(separation(359.0, 1.0), 2.0);
        assert_eq!(separation(-0.0, 0.0).to_bits(), 0.0_f64.to_bits());
        assert_eq!(
            separation(f64::from_bits(1), 0.0).to_bits(),
            0.0_f64.to_bits()
        );
    }

    #[test]
    fn legacy_motion_preserves_stationary_and_nan_semantics() {
        assert_eq!(
            aspect_motion(88.0, 1.0, 0.0, 0.0, 90.0),
            AspectMotion::Applying
        );
        assert_eq!(
            aspect_motion(88.0, -1.0, 0.0, 0.0, 90.0),
            AspectMotion::Separating
        );
        assert_eq!(
            aspect_motion(90.0, -1.0, 0.0, 0.0, 90.0),
            AspectMotion::Separating
        );
        assert_eq!(
            aspect_motion(1.0, STATIONARY_RELATIVE_SPEED, 0.0, 0.0, 0.0),
            AspectMotion::Separating
        );
        assert_eq!(
            aspect_motion(1.0, STATIONARY_RELATIVE_SPEED / 2.0, 0.0, 0.0, 0.0),
            AspectMotion::Stationary
        );
        assert_eq!(
            aspect_motion(1.0, f64::NAN, 0.0, 0.0, 0.0),
            AspectMotion::Stationary
        );
        assert_eq!(
            aspect_motion(f64::NAN, 1.0, 0.0, 0.0, 0.0),
            AspectMotion::Separating
        );
        // The legacy corner rule keeps sign(0) equal to zero.
        assert_eq!(
            aspect_motion(0.0, 1.0, 0.0, 0.0, 30.0),
            AspectMotion::Separating
        );
    }

    #[test]
    fn legacy_filtering_and_both_pair_orders_remain_stable() {
        let rows = [
            position("Sun", 0.0, 0.0),
            position("North Node", 0.0, 0.0),
            position("Mars", 2.0, 0.0),
            position("Moon", 4.0, 0.0),
        ];
        let found = find_aspects(&rows);
        assert_eq!(
            found
                .iter()
                .map(|row| (row.a.as_str(), row.b.as_str(), row.orb))
                .collect::<Vec<_>>(),
            vec![
                ("Sun", "Mars", 2.0),
                ("Mars", "Moon", 2.0),
                ("Sun", "Moon", 4.0)
            ]
        );
        let minimal: Vec<_> = rows
            .iter()
            .map(|row| MinimalBody {
                body: row.body.clone(),
                lon: row.lon,
            })
            .collect();
        let inter = find_inter_aspects(&minimal, &minimal);
        assert_eq!(inter.len(), 9);
        assert_eq!(
            inter
                .iter()
                .take(3)
                .map(|row| (row.a.as_str(), row.b.as_str()))
                .collect::<Vec<_>>(),
            vec![("Sun", "Sun"), ("Mars", "Mars"), ("Moon", "Moon")]
        );
        assert_eq!(inter[3].a_lon, 0.0);
        assert_eq!(inter[3].b_lon, 2.0);
    }

    #[test]
    fn default_policy_resolves_and_named_minors_need_no_explicit_angle() {
        let defaults = create_aspect_policy(AspectPolicyInput::default()).unwrap();
        assert_eq!(defaults.bodies().len(), PHYSICAL_BODIES.len());
        for (resolved, original) in defaults.aspects().iter().zip(ASPECTS) {
            assert_eq!(resolved.angle, original.angle);
            assert_eq!(resolved.orb.applying, original.orb);
            assert_eq!(
                resolved.luminary_orb.unwrap().stationary,
                original.luminary_orb
            );
        }
        for (name, angle) in CONFIGURED_ASPECT_ANGLES {
            let configured = policy(vec![rule(name, None, 0.0)]);
            let found = find_configured_aspects(&pair(angle, 0.0, 1.0, 0.0), &configured).unwrap();
            assert_eq!(found.len(), 1, "{name}");
            assert_eq!(found[0].aspect_type, name);
            assert_eq!(found[0].orb.to_bits(), 0.0_f64.to_bits());
            assert_eq!(found[0].motion, AspectMotion::Separating);
        }
    }

    #[test]
    fn exact_boundaries_preserve_subnormals_and_decimal_cancellation() {
        let zero = policy(vec![rule("conjunction", None, 0.0)]);
        assert!(
            find_configured_aspects(&pair(f64::from_bits(1), 0.0, 1.0, 0.0), &zero)
                .unwrap()
                .is_empty()
        );
        let zero_square = policy(vec![rule("square", None, 0.0)]);
        let rows = pair(188.86, 98.86, 0.0, 0.0);
        assert!(find_configured_aspects(&rows, &zero_square)
            .unwrap()
            .is_empty());
        let tiny_square = policy(vec![rule("square", None, 2.0_f64.powi(-46))]);
        assert_eq!(
            find_configured_aspects(&rows, &tiny_square).unwrap()[0].orb,
            2.0_f64.powi(-46)
        );
        let semisquare = policy(vec![rule("semisquare", None, 7.3)]);
        let mut rows = pair(6.3, 314.0, 0.0, 0.0);
        for _ in 0..2 {
            let found = find_configured_aspects(&rows, &semisquare).unwrap();
            assert_eq!(found[0].orb.to_bits(), 7.3_f64.to_bits());
            rows.reverse();
        }
        let conjunction = policy(vec![rule("conjunction", None, 8.0)]);
        assert!(
            find_configured_aspects(&pair(7.6999999999999895, 359.7, 1.0, 0.0), &conjunction)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            find_configured_aspects(&pair(359.7 - 352.0, 359.7, 1.0, 0.0), &conjunction).unwrap()
                [0]
            .orb,
            8.0
        );
    }

    #[test]
    fn custom_angles_and_inclusive_limits_do_not_round_before_matching() {
        for angle in [0.1_f64, 0.3, 360.0 / 7.0, 179.9] {
            let configured = policy(vec![rule("custom", Some(angle), 0.0)]);
            assert_eq!(
                find_configured_aspects(&pair(angle, 0.0, 1.0, 0.0), &configured)
                    .unwrap()
                    .len(),
                1
            );
            let outside = f64::from_bits(angle.to_bits() + 1);
            assert!(
                find_configured_aspects(&pair(outside, 0.0, 1.0, 0.0), &configured)
                    .unwrap()
                    .is_empty()
            );
        }
        let configured = policy(vec![rule("square", None, 7.0)]);
        assert_eq!(
            find_configured_aspects(&pair(97.0, 0.0, 1.0, 0.0), &configured)
                .unwrap()
                .len(),
            1
        );
        assert!(find_configured_aspects(
            &pair(f64::from_bits(97.0_f64.to_bits() + 1), 0.0, 1.0, 0.0),
            &configured
        )
        .unwrap()
        .is_empty());
    }

    #[test]
    fn exact_rule_ranking_and_sort_order_distinguish_reported_orb_ties() {
        // 1.1 - 0.1 = 1 + 3 * 2^-55, so angle 2 is closer than angle 0.
        let configured = policy(vec![
            rule("low", Some(0.0), 2.0),
            rule("high", Some(2.0), 2.0),
        ]);
        let found = find_configured_aspects(&pair(1.1, 0.1, 0.0, 0.0), &configured).unwrap();
        assert_eq!(found[0].aspect_type, "high");
        let conjunction = policy(vec![rule("conjunction", None, 3.0)]);
        let rows = [
            position("A", 0.1, 0.0),
            position("B", 1.1, 0.0),
            position("C", 2.1, 0.0),
        ];
        let found = find_configured_aspects(&rows, &conjunction).unwrap();
        assert_eq!(found[0].orb.to_bits(), found[1].orb.to_bits());
        assert_eq!((&*found[0].a, &*found[0].b), ("B", "C"));
        assert_eq!((&*found[1].a, &*found[1].b), ("A", "B"));
        // At exact ties, definition order and then input pair order still win.
        let tie = policy(vec![
            rule("first", Some(0.0), 10.0),
            rule("second", Some(0.0), 10.0),
        ]);
        let found = find_configured_aspects(
            &[
                position("C", 4.0, 0.0),
                position("A", 0.0, 0.0),
                position("B", 2.0, 0.0),
            ],
            &tie,
        )
        .unwrap();
        assert!(found.iter().all(|row| row.aspect_type == "first"));
        assert_eq!((&*found[0].a, &*found[0].b), ("C", "B"));
        assert_eq!((&*found[1].a, &*found[1].b), ("A", "B"));
    }

    #[test]
    fn eligibility_precedes_closest_rule_ranking() {
        let configured = policy(vec![
            rule("near", Some(70.0), 0.25),
            rule("far", Some(72.0), 2.0),
        ]);
        let found = find_configured_aspects(&pair(70.5, 0.0, 1.0, 0.0), &configured).unwrap();
        assert_eq!(found[0].aspect_type, "far");
    }

    #[test]
    fn configured_circular_corners_use_the_right_derivative() {
        for speed in [-1.0, 1.0] {
            for (longitude, angle, expected) in [
                (0.0, 30.0, AspectMotion::Applying),
                (180.0, 150.0, AspectMotion::Applying),
                (0.0, 0.0, AspectMotion::Separating),
                (180.0, 180.0, AspectMotion::Separating),
            ] {
                let configured = policy(vec![rule("custom", Some(angle), 180.0)]);
                let mut rows = pair(longitude, 0.0, speed, 0.0);
                for _ in 0..2 {
                    assert_eq!(
                        find_configured_aspects(&rows, &configured).unwrap()[0].motion,
                        expected
                    );
                    rows.reverse();
                }
            }
        }
    }

    #[test]
    fn exact_speed_comparison_survives_overflow_and_subtraction_rounding() {
        assert_eq!(relative_speed_sign(f64::MAX, -f64::MAX, f64::MAX), 1);
        assert_eq!(relative_speed_sign(-f64::MAX, f64::MAX, f64::MAX), -1);
        assert_eq!(
            relative_speed_sign(f64::MAX, f64::from_bits(1), f64::MAX),
            0
        );
        assert_eq!(
            relative_speed_sign(f64::MAX, -f64::from_bits(1), f64::MAX),
            1
        );
        assert_eq!(relative_speed_sign(0.7, 0.1, 0.6), 0);
        assert_eq!(relative_speed_sign(0.6, 0.0, 0.6), 1);
        assert_eq!(relative_speed_sign(0.0, -0.0, 0.0), 0);
        assert_eq!(relative_speed_sign(f64::from_bits(1), 0.0, 0.0), 1);
        let configured = policy(vec![rule("conjunction", None, 8.0)]);
        let rows = pair(1.0, 0.0, -f64::MAX, f64::MAX);
        assert_eq!(
            find_configured_aspects(&rows, &configured).unwrap()[0].motion,
            AspectMotion::Applying
        );
    }

    #[test]
    fn luminary_replacement_and_both_caps_apply_by_motion() {
        let configured = create_aspect_policy(AspectPolicyInput {
            bodies: Some(vec!["Sun".into(), "Mars".into()]),
            aspects: Some(vec![AspectRuleInput {
                luminary_orb: Some(AspectOrbInput::Uniform(10.0)),
                ..rule("conjunction", None, 8.0)
            }]),
            body_orbs: Some(vec![
                ("Sun".into(), AspectOrbInput::Uniform(4.0)),
                (
                    "Mars".into(),
                    AspectOrbInput::ByMotion(AspectOrbLimits {
                        applying: 3.0,
                        separating: 2.0,
                        stationary: 1.0,
                    }),
                ),
            ]),
            ..Default::default()
        })
        .unwrap();
        for (longitude, speed, motion, maximum) in [
            (3.0, -1.0, AspectMotion::Applying, 3.0),
            (2.0, 1.0, AspectMotion::Separating, 2.0),
            (1.0, 0.0, AspectMotion::Stationary, 1.0),
        ] {
            let mut rows = [
                position("Sun", 0.0, 0.0),
                position("Mars", longitude, speed),
            ];
            for _ in 0..2 {
                let found = find_configured_aspects(&rows, &configured).unwrap();
                assert_eq!((found[0].maximum_orb, found[0].motion), (maximum, motion));
                rows.reverse();
            }
            rows[1].lon = f64::from_bits(longitude.to_bits() + 1);
            assert!(find_configured_aspects(&rows, &configured)
                .unwrap()
                .is_empty());
        }
    }

    #[test]
    fn validation_rejects_bad_policy_ranges_names_and_duplicates() {
        for bad_rule in [
            rule("Upper", None, 1.0),
            rule("custom", None, 1.0),
            rule("square", Some(91.0), 1.0),
            rule("custom", Some(181.0), 1.0),
            rule("square", None, -1.0),
            rule("square", None, f64::NAN),
            rule("square", None, f64::INFINITY),
        ] {
            assert!(create_aspect_policy(AspectPolicyInput {
                aspects: Some(vec![bad_rule]),
                ..Default::default()
            })
            .is_err());
        }
        let duplicate = vec![rule("square", None, 1.0), rule("square", None, 2.0)];
        assert_eq!(
            create_aspect_policy(AspectPolicyInput {
                aspects: Some(duplicate),
                ..Default::default()
            })
            .unwrap_err()
            .0,
            "Aspect types must be unique."
        );
        assert!(create_aspect_policy(AspectPolicyInput {
            bodies: Some(vec!["A".into(), "A".into()]),
            ..Default::default()
        })
        .is_err());
        assert!(create_aspect_policy(AspectPolicyInput {
            body_orbs: Some(vec![("Missing".into(), AspectOrbInput::Uniform(1.0))]),
            ..Default::default()
        })
        .is_err());
        for threshold in [-1.0, f64::INFINITY, f64::NAN] {
            assert!(create_aspect_policy(AspectPolicyInput {
                stationary_relative_speed: Some(threshold),
                ..Default::default()
            })
            .is_err());
        }
    }

    #[test]
    fn labels_follow_utf16_lengths_and_ecmascript_trim() {
        assert!(checked_body_label(&"\u{1f30c}".repeat(40)).is_ok());
        assert!(checked_body_label(&"\u{1f30c}".repeat(41)).is_err());
        for value in [
            "",
            " A",
            "A ",
            "\u{3000}A",
            "A\u{feff}",
            "A\u{0000}B",
            "A\u{007f}B",
        ] {
            assert!(checked_body_label(value).is_err());
        }
        for value in [
            "__proto__",
            "constructor",
            "\u{0080}A",
            "\u{0085}",
            "\u{200b}A",
            "A\u{200b}",
        ] {
            assert!(checked_body_label(value).is_ok(), "{value:?}");
        }
    }

    #[test]
    fn all_rows_are_validated_even_with_no_selected_bodies() {
        let empty = create_aspect_policy(AspectPolicyInput {
            bodies: Some(vec![]),
            ..Default::default()
        })
        .unwrap();
        for row in [
            position("A", 360.0, 0.0),
            position("A", -1.0, 0.0),
            position("A", f64::NAN, 0.0),
            position("A", 0.0, f64::INFINITY),
            position("A", 0.0, f64::NAN),
        ] {
            assert!(find_configured_aspects(&[row], &empty).is_err());
        }
        assert!(find_configured_aspects(
            &[position("A", 0.0, 0.0), position("A", 0.0, 0.0)],
            &empty
        )
        .is_err());
        assert!(find_configured_aspects(&pair(0.0, 0.0, 1.0, 1.0), &empty)
            .unwrap()
            .is_empty());
        let no_rules = policy(vec![]);
        assert!(
            find_configured_aspects(&pair(0.0, 0.0, 1.0, 1.0), &no_rules)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn validation_enforces_array_caps_and_canonical_positive_zero() {
        assert!(create_aspect_policy(AspectPolicyInput {
            bodies: Some((0..257).map(|i| format!("B{i}")).collect()),
            ..Default::default()
        })
        .is_err());
        assert!(create_aspect_policy(AspectPolicyInput {
            aspects: Some(
                (0..65)
                    .map(|i| rule(&format!("r{i}"), Some(0.0), 0.0))
                    .collect()
            ),
            ..Default::default()
        })
        .is_err());
        let configured = create_aspect_policy(AspectPolicyInput {
            stationary_relative_speed: Some(-0.0),
            aspects: Some(vec![rule("custom", Some(-0.0), -0.0)]),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(
            configured.stationary_relative_speed().to_bits(),
            0.0_f64.to_bits()
        );
        assert_eq!(configured.aspects()[0].angle.to_bits(), 0.0_f64.to_bits());
        assert_eq!(
            configured.aspects()[0].orb.stationary.to_bits(),
            0.0_f64.to_bits()
        );
        let rows: Vec<_> = (0..257)
            .map(|i| position(&format!("B{i}"), 0.0, 0.0))
            .collect();
        assert!(find_configured_aspects(&rows, &configured).is_err());
    }
}
