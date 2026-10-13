// JavaScript data-slot validation and immutable policy snapshots translated from
// src/configured-aspects.ts and src/body-label.ts, under the repository MIT licence.
// All aspect geometry, motion, eligibility and ordering execute in Rust.
import type { AspectMotion } from "../../src/aspects.js";

/** The schema of an AspectPolicy. */
export const ASPECT_POLICY_SCHEMA = "zodiacs.aspect-policy.v1" as const;
/** The schema of a ConfiguredAspectResult. */
export const CONFIGURED_ASPECTS_SCHEMA = "zodiacs.configured-aspects.v1" as const;

/**
 * An aspect's motion: AspectMotion under another name.
 * @deprecated Use AspectMotion.
 */
export type ConfiguredAspectMotion = AspectMotion;

/** Degrees of orb, including the boundary, for each instantaneous motion. */
export interface AspectOrbLimits {
  readonly applying: number;
  readonly separating: number;
  readonly stationary: number;
}

/** A number supplies the same limit for all three motions. */
export type AspectOrbInput = number | AspectOrbLimits;

/** Names fix angles only: there is no universally prescribed orb for a minor aspect. */
export const CONFIGURED_ASPECT_ANGLES = /*#__PURE__*/ Object.freeze({
  conjunction: 0,
  semisextile: 30,
  semisquare: 45,
  sextile: 60,
  quintile: 72,
  square: 90,
  trine: 120,
  sesquiquadrate: 135,
  biquintile: 144,
  quincunx: 150,
  opposition: 180
} as const);

export interface AspectRuleInput {
  /** A named angle above, or a custom lowercase identifier with an explicit angle. */
  readonly type: string;
  readonly angle?: number;
  readonly orb: AspectOrbInput;
  /** Optional replacement for orb when either label is exactly Sun or Moon. */
  readonly luminaryOrb?: AspectOrbInput;
}

export interface ResolvedAspectRule {
  readonly type: string;
  readonly angle: number;
  readonly orb: AspectOrbLimits;
  readonly luminaryOrb?: AspectOrbLimits;
}

export interface AspectPolicyInput {
  /** Defaults to the five existing major aspects and their existing orbs. */
  readonly aspects?: readonly AspectRuleInput[];
  /** Exact, case-sensitive labels to include; defaults to the ten physical bodies. */
  readonly bodies?: readonly string[];
  /** Per-body upper bounds. Both members' caps apply after the rule/luminary limit. */
  readonly bodyOrbs?: Readonly<Record<string, AspectOrbInput>>;
  /** Degrees/day; equal speeds are stationary even when this threshold is zero. */
  readonly stationaryRelativeSpeed?: number;
}

export interface AspectPolicy {
  readonly schema: typeof ASPECT_POLICY_SCHEMA;
  readonly aspects: readonly ResolvedAspectRule[];
  readonly bodies: readonly string[];
  readonly bodyOrbs: Readonly<Record<string, AspectOrbLimits>>;
  readonly stationaryRelativeSpeed: number;
  readonly conventions: {
    readonly coordinates: "ecliptic-longitude-degrees-[0,360)";
    readonly speed: "longitude-degrees-per-day;same-time-basis";
    readonly motion: "instantaneous-orb-rate;right-derivative-at-circular-corners;exact-separating-unless-stationary";
    readonly orb: "inclusive;luminary-replaces-rule;minimum-of-rule-and-both-body-caps";
    readonly matching: "one-per-pair;smallest-absolute-orb;definition-order-on-tie";
    readonly ordering: "ascending-orb;input-pair-order-on-tie";
    /**
     * Every input is the exact value of its double; separation, orb, motion,
     * eligibility, matching and ordering are decided exactly, without a
     * tolerance. The reported orb is the exact orb rounded to nearest, ties to even.
     */
    readonly arithmetic: "exact-binary64;reported-orb-rounded-half-even";
  };
}

export interface AspectPosition {
  readonly body: string;
  readonly lon: number;
  /** Required, finite, and on a common time basis. Missing/null speed is rejected. */
  readonly speed: number;
}

export interface ConfiguredAspect {
  readonly a: string;
  readonly b: string;
  readonly type: string;
  readonly angle: number;
  /** |separation − angle|, decided exactly and reported rounded to the nearest double. */
  readonly orb: number;
  readonly maximumOrb: number;
  readonly motion: AspectMotion;
  readonly applying: boolean;
}

/** Policy is calculation context, not an authenticated receipt or a physical accuracy bound. */
export interface ConfiguredAspectResult {
  readonly schema: typeof CONFIGURED_ASPECTS_SCHEMA;
  readonly policy: AspectPolicy;
  readonly aspects: readonly ConfiguredAspect[];
}

const PHYSICAL_BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const DEFAULT_RULES: readonly AspectRuleInput[] = [
  { type: "conjunction", orb: 8, luminaryOrb: 10 },
  { type: "sextile", orb: 4, luminaryOrb: 5 },
  { type: "square", orb: 7, luminaryOrb: 8 },
  { type: "trine", orb: 7, luminaryOrb: 8 },
  { type: "opposition", orb: 8, luminaryOrb: 10 }
];
const POLICIES = new WeakSet<object>();
const CONVENTIONS: AspectPolicy["conventions"] = /*#__PURE__*/ Object.freeze({
  coordinates: "ecliptic-longitude-degrees-[0,360)",
  speed: "longitude-degrees-per-day;same-time-basis",
  motion: "instantaneous-orb-rate;right-derivative-at-circular-corners;exact-separating-unless-stationary",
  orb: "inclusive;luminary-replaces-rule;minimum-of-rule-and-both-body-caps",
  matching: "one-per-pair;smallest-absolute-orb;definition-order-on-tie",
  ordering: "ascending-orb;input-pair-order-on-tie",
  arithmetic: "exact-binary64;reported-orb-rounded-half-even"
});

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RangeError(message);
}

/** Copy ordinary data slots without evaluating accessor properties. Not a proxy sandbox. */
function dataObject(value: unknown, allowed?: readonly string[]): Record<string, unknown> {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value), "Expected an ordinary data object.");
  const proto: unknown = Object.getPrototypeOf(value);
  requireValue(proto === Object.prototype || proto === null, "Expected an ordinary data object.");
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    requireValue(typeof key === "string" && (!allowed || allowed.includes(key)), "Unknown configuration field.");
    const slot = Object.getOwnPropertyDescriptor(value, key);
    requireValue(slot && "value" in slot && slot.enumerable, "Expected ordinary enumerable data slots.");
    out[key] = slot.value as unknown;
  }
  return out;
}

function dataArray(value: unknown, maximum: number, label: string): unknown[] {
  requireValue(Array.isArray(value) && value.length <= maximum, `${label} must be an array with at most ${maximum} entries.`);
  const out: unknown[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const slot = Object.getOwnPropertyDescriptor(value, String(i));
    requireValue(slot && "value" in slot, `${label} must not contain holes or accessor slots.`);
    out.push(slot.value as unknown);
  }
  return out;
}

function numberIn(value: unknown, low: number, high: number, label: string): number {
  requireValue(typeof value === "number" && Number.isFinite(value) && value >= low && value <= high, `${label} is outside its finite range.`);
  return value === 0 ? 0 : value;
}

/** Longest body label, in UTF-16 code units, the configured-aspect and declination analyses accept. */
const MAX_BODY_LABEL_LENGTH = 80;

/**
 * One rule for caller-chosen body labels in the configured-aspect and
 * declination analyses: a nonempty string of at most 80 UTF-16 code units
 * (an astral character such as an emoji counts two), that String.prototype.trim
 * leaves unchanged (so no leading or trailing ECMAScript white space or line
 * terminator, U+FEFF included), and that contains no C0 control character
 * (U+0000–U+001F) and no DEL (U+007F). C1 controls (U+0080–U+009F), format
 * characters such as U+200B and lone surrogates are not rejected. Matching is
 * exact and case-sensitive. The message never repeats the label.
 */
function checkedBodyLabel(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_BODY_LABEL_LENGTH ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new RangeError(
      "Body labels must be nonempty, trimmed strings of at most 80 characters, without control characters."
    );
  }
  return value;
}

const bodyLabel = checkedBodyLabel;

function orbLimits(value: unknown): AspectOrbLimits {
  if (typeof value === "number") {
    const limit = numberIn(value, 0, 180, "Orb");
    return Object.freeze({ applying: limit, separating: limit, stationary: limit });
  }
  const object = dataObject(value, ["applying", "separating", "stationary"]);
  return Object.freeze({
    applying: numberIn(object.applying, 0, 180, "Applying orb"),
    separating: numberIn(object.separating, 0, 180, "Separating orb"),
    stationary: numberIn(object.stationary, 0, 180, "Stationary orb")
  });
}

/**
 * Resolve, snapshot and deeply freeze a policy. No caller object is retained.
 * Named types cannot be assigned a different angle. Custom types need an angle
 * in [0,180]. Empty aspect/body selections intentionally return no matches.
 * Body caps can tighten, never widen, the selected rule/luminary allowance.
 */
export function createAspectPolicy(input: AspectPolicyInput = {}): AspectPolicy {
  const options = dataObject(input, ["aspects", "bodies", "bodyOrbs", "stationaryRelativeSpeed"]);
  const bodyValues = options.bodies === undefined ? PHYSICAL_BODIES : options.bodies;
  const bodies = dataArray(bodyValues, 256, "Bodies").map(bodyLabel);
  requireValue(new Set(bodies).size === bodies.length, "Body selection contains duplicate labels.");
  const rules = dataArray(options.aspects === undefined ? DEFAULT_RULES : options.aspects, 64, "Aspects");
  const seen = new Set<string>();
  const aspects = rules.map(value => {
    const rule = dataObject(value, ["type", "angle", "orb", "luminaryOrb"]);
    requireValue(typeof rule.type === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(rule.type), "Aspect type must be a lowercase identifier of at most 64 characters.");
    const type = rule.type;
    requireValue(!seen.has(type), "Aspect types must be unique."); seen.add(type);
    const named = Object.hasOwn(CONFIGURED_ASPECT_ANGLES, type)
      ? CONFIGURED_ASPECT_ANGLES[type as keyof typeof CONFIGURED_ASPECT_ANGLES]
      : undefined;
    const angle = numberIn(rule.angle === undefined ? named : rule.angle, 0, 180, "Aspect angle");
    requireValue(named === undefined || angle === named, "A named aspect must keep its named angle.");
    return Object.freeze({ type, angle, orb: orbLimits(rule.orb),
      ...(rule.luminaryOrb === undefined ? {} : { luminaryOrb: orbLimits(rule.luminaryOrb) }) });
  });
  const caps = options.bodyOrbs === undefined ? {} : dataObject(options.bodyOrbs);
  const bodyOrbs: Record<string, AspectOrbLimits> = Object.create(null) as Record<string, AspectOrbLimits>;
  for (const [name, value] of Object.entries(caps)) {
    bodyLabel(name);
    requireValue(bodies.includes(name), "A body orb cap must name a selected body.");
    bodyOrbs[name] = orbLimits(value);
  }
  const stationaryRelativeSpeed = options.stationaryRelativeSpeed === undefined ? 1e-9
    : numberIn(options.stationaryRelativeSpeed, 0, Number.MAX_VALUE, "Stationary relative speed");
  const policy: AspectPolicy = Object.freeze({
    schema: ASPECT_POLICY_SCHEMA, aspects: Object.freeze(aspects), bodies: Object.freeze(bodies),
    bodyOrbs: Object.freeze(bodyOrbs), stationaryRelativeSpeed, conventions: CONVENTIONS
  });
  POLICIES.add(policy);
  return policy;
}

/** Independent immutable copy of the historical five-aspect/ten-body defaults. */
export const DEFAULT_ASPECT_POLICY: AspectPolicy = /*#__PURE__*/ createAspectPolicy();

export function checkedAspectPositions(positions: readonly AspectPosition[], policy: AspectPolicy): AspectPosition[] {
  requireValue(policy !== null && typeof policy === "object" && POLICIES.has(policy), "Policy must be made by createAspectPolicy.");
  const labels = new Set<string>();
  const all = dataArray(positions, 256, "Positions").map(value => {
    const row = dataObject(value);
    const body = bodyLabel(row.body);
    requireValue(!labels.has(body), "Positions contain duplicate body labels."); labels.add(body);
    const lon = numberIn(row.lon, 0, 360, "Longitude");
    requireValue(lon < 360, "Longitude must be in [0,360).");
    requireValue(typeof row.speed === "number" && Number.isFinite(row.speed), "Every position requires a finite longitude speed.");
    return { body, lon, speed: row.speed };
  });
  return all;
}
