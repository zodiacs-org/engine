import { dateFrom } from "./date-input.js";
import { ASPECTS, ASPECT_TYPES, ASPECT_BODIES, aspectMotion } from "./aspects.js";
import { SIGNS } from "./signs.js";
import { parseReceiptJson } from "./receipt-json.js";
import { DELTA_T_MODEL, DELTA_T_TABLE, deltaTAt } from "./deltat.js";
import { julianToGregorian, parseCalendarDate } from "./civil-calendar.js";
import { outsideReferenceSpan } from "./reference-span.js";
import { compareVersions, isVersion } from "./semver.js";
import { DELTA_T_IERS_MODEL, TIME_SCALE_NAMES, UT1_DATA, timeBasis } from "./time-scale.js";
import type { TimeScale, TimeScaleName } from "./time-scale.js";
import { EPHEMERIS } from "./types.js";
import type { BirthInput, Chart, ChartFlag, HouseSystem } from "./types.js";

/** Zodiacs-owned draft vocabulary; not an industry interoperability standard. */
export const NATAL_ENVELOPE_SCHEMA = "zodiacs.natal-envelope.draft-v1";
export const NATAL_RECEIPT_SCHEMA = "zodiacs.calculation-receipt.draft-v1";
export const NATAL_DIAGNOSTIC_SCHEMA = "zodiacs.natal-diagnostic.draft-v1";
export const NATAL_ENVELOPE_LIMITS = Object.freeze({ bytes: 65_536, depth: 12, nodes: 4096 });

export type NatalEnvelopeErrorCode =
  | "invalid_json"
  | "invalid_shape"
  | "invalid_value"
  | "inconsistent_result"
  | "invalid_context"
  | "size_limit"
  | "complexity_limit"
  | "unsupported_version"
  | "unsupported_feature";

const ERROR_CODES = new Set<NatalEnvelopeErrorCode>([
  "invalid_json",
  "invalid_shape",
  "invalid_value",
  "inconsistent_result",
  "invalid_context",
  "size_limit",
  "complexity_limit",
  "unsupported_version",
  "unsupported_feature"
]);
const ERROR_BRAND = new WeakMap<object, NatalEnvelopeErrorCode>();

export class NatalEnvelopeError extends Error {
  readonly code: NatalEnvelopeErrorCode;
  constructor(code: NatalEnvelopeErrorCode) {
    const fixed = ERROR_CODES.has(code) ? code : "invalid_shape";
    super(`Natal envelope rejected: ${fixed}.`);
    this.code = fixed;
    this.name = "NatalEnvelopeError";
    ERROR_BRAND.set(this, fixed);
  }
}

export type NatalJsonValue = null | boolean | number | string | NatalJsonValue[] | NatalJsonObject;
export interface NatalJsonObject {
  [key: string]: NatalJsonValue;
}
export type NatalReference = "supplied-instant" | "utc-noon" | "local-noon";

/** A clock change a local resolution records. */
export interface NatalZoneTransition {
  at: string;
  offsetBeforeMinutes: number;
  offsetAfterMinutes: number;
  cause: "dst" | "legal-change" | "date-line";
}

/**
 * Captured assertions, checked arithmetically without consulting today's
 * Intl/tzdb. The fields after `policy` are optional from the time-basis
 * conventions set on, so a record in rc.14's shape is accepted, and absent
 * before it; each one given is checked. `resolveLocalToUtc` returns the whole
 * object as `localResolution` (docs/time.md).
 */
export interface NatalLocalResolution {
  /** The proleptic Gregorian date resolved. */
  date: string;
  time: string;
  timeZone: string;
  /** Offset at the resolved instant, minutes east of UTC; may be fractional. */
  offsetMinutes: number;
  /** Forward wall-clock shift; positive only for a reported gap. */
  gapShiftMinutes: number;
  policy: { fold: "earlier"; gap: "shift-forward" };
  calendar?: "gregorian" | "julian";
  writtenDate?: string;
  tzdbVersion?: string | null;
  dataForm?: "main+backzone" | "main" | "host";
  clock?: "local-mean-time" | "legal";
  transition?: NatalZoneTransition | null;
  localMeanTime?: { longitude: number; zoneOffsetMinutes: number } | null;
}

/** Supplied facts are claims, including hashes. This codec authenticates none of them. */
export interface NatalProvenanceClaims {
  source?: { repository: string; commit: string };
  artifact?: {
    sha256: string;
    packageVersion: string;
    distributionRepository?: string;
    distributionCommit?: string;
  };
  runtime?: { name: string; version?: string; icuVersion?: string; tzdbVersion?: string };
  ephemeris?: { name: "astronomy-engine"; version: string };
}

export interface NatalEnvelopeContext {
  /** Omission never infers noon, including when timeKnown is false. */
  reference?: NatalReference;
  /** Original validated ISO spelling when captured; no zone/offset meaning is inferred. */
  sourceInstant?: string | null;
  localResolution?: NatalLocalResolution | null;
  provenance?: NatalProvenanceClaims;
  /** Optional JSON data only. Never executed, rendered, fetched or used for replay. */
  extensions?: NatalJsonObject;
}

/** The conventions engine versions 0.1.1-rc.3 to rc.6 recorded. Their receipts stay readable. */
const CONVENTIONS_RC3 = Object.freeze({
  calendar: "proleptic-gregorian",
  zodiac: "tropical",
  planetPositions: "apparent-geocentric-ecliptic-of-date",
  moonPosition: "astronomy-engine-ecliptic-geo-moon",
  moonNodes: "instantaneous-geocentric-moon-orbit-plane",
  angles: "gast-and-mean-obliquity",
  longitudeUnit: "degrees-[0,360)",
  speed: "degrees-per-day;central-difference-plus-minus-0.25-day",
  aspects: "major-aspects;sun-moon-eight-planets;no-nodes"
} as const);
/** The conventions engine version 0.1.1-rc.7 recorded. Its receipts stay readable. */
const CONVENTIONS_RC7 = Object.freeze({
  ...CONVENTIONS_RC3,
  angles: "gast-and-true-obliquity",
  speed: "degrees-per-day;central-difference-plus-minus-0.001-day;nodes-plus-minus-0.25-day",
  aspects: "major-aspects;sun-moon-eight-planets;no-nodes;applying-instantaneous-orb-rate"
} as const);
/**
 * The conventions engine versions 0.1.1-rc.8 to rc.14 recorded: the planets
 * corrected for light time and aberration but not for gravitational
 * deflection, the Moon's series for neither, and the instant read as UT1.
 * Their receipts stay readable.
 */
const CONVENTIONS_RC8 = Object.freeze({
  ...CONVENTIONS_RC7,
  planetPositions: "aberrated-geocentric-ecliptic-of-date;no-deflection",
  moonPosition: "astronomy-engine-ecliptic-geo-moon;no-light-time;no-aberration",
  deltaT: "tt-minus-ut1;ut1-read-as-utc;value-in-result"
} as const);
/**
 * The conventions engine version 0.1.1-rc.15 recorded: the rc.8 set, with the
 * time basis in the result (`result.timeScale`, docs/time.md) and local times
 * resolved on the shipped tzdb history before 1970, their flags from its
 * records. Its engine took astronomy-engine's nutation, the five largest terms
 * of IAU 2000B, which the set does not name. Its receipts stay readable.
 */
const CONVENTIONS_RC15 = Object.freeze({
  ...CONVENTIONS_RC8,
  deltaT: "tt-minus-ut1;value-in-result",
  timeScale: "tt-from-leap-seconds-and-ut1-from-iers-1972-to-table-end;delta-t-model-otherwise;in-result",
  localTime: "tzdb-shards-before-1970;host-intl-from-1970;flags-from-transition-record"
} as const);
/**
 * The conventions this engine records: the rc.15 set, naming the nutation,
 * the engine's own IAU 2000B series (all 77 luni-solar terms and the planetary
 * offsets, src/nutation.ts) with the two largest complementary terms of the
 * equation of the equinoxes, and the Moon as astronomy-engine's geocentric
 * series (GeoMoon) turned to the ecliptic of date by it.
 */
const CONVENTIONS = Object.freeze({
  ...CONVENTIONS_RC15,
  moonPosition: "astronomy-engine-geo-moon;no-light-time;no-aberration",
  nutation: "iau2000b;equation-of-equinoxes-with-two-complementary-terms"
} as const);
type ConventionSet =
  | typeof CONVENTIONS
  | typeof CONVENTIONS_RC15
  | typeof CONVENTIONS_RC8
  | typeof CONVENTIONS_RC7
  | typeof CONVENTIONS_RC3;
// Typed by name, so the declarations name each set instead of spelling it out again.
/** Every conventions set a receipt may carry, the current one first. */
export const NATAL_RECEIPT_CONVENTION_SETS: readonly [
  typeof CONVENTIONS,
  typeof CONVENTIONS_RC15,
  typeof CONVENTIONS_RC8,
  typeof CONVENTIONS_RC7,
  typeof CONVENTIONS_RC3
] = Object.freeze([CONVENTIONS, CONVENTIONS_RC15, CONVENTIONS_RC8, CONVENTIONS_RC7, CONVENTIONS_RC3] as const);
// The released versions that wrote each earlier set, with any build metadata:
// exact lists, not ranges, so no other spelling passes them.
const RC3_TO_RC6 = /^0\.1\.1-rc\.[3-6](?:\+[A-Za-z0-9.-]+)?$/;
const RC7 = /^0\.1\.1-rc\.7(?:\+[A-Za-z0-9.-]+)?$/;
const RC8_TO_RC14 = /^0\.1\.1-rc\.(?:[89]|1[0-4])(?:\+[A-Za-z0-9.-]+)?$/;
const RC15 = /^0\.1\.1-rc\.15(?:\+[A-Za-z0-9.-]+)?$/;
/**
 * Whether an engine version comes before `release` in SemVer 2.0.0 precedence
 * (src/semver.ts): 0.1.1-rc.15.1, 0.1.1-beta and 0.1.1-rc come before
 * 0.1.1-rc.16, and build metadata changes nothing.
 */
const before = (version: string, release: string): boolean => compareVersions(version, release) < 0;
/** 0.1.1-rc.16 released the set that names the nutation. */
const NUTATION_RELEASE = "0.1.1-rc.16";
/** Engines before 0.1.1-rc.9 offered only three house systems. */
const RC9_RELEASE = "0.1.1-rc.9";
/** Engines before 0.1.1-rc.10 did not offer Equal houses from the midheaven. */
const RC10_RELEASE = "0.1.1-rc.10";
const COVERAGE = Object.freeze({
  assessment: "finite-reference-cases-only",
  broadDateRange: "not-certified",
  angleExclusions: "exact-geographic-poles-and-ecliptic-horizon-coincidence",
  inputSyntax: "not-an-astronomical-accuracy-guarantee"
} as const);

export interface NatalReceipt {
  schema: typeof NATAL_RECEIPT_SCHEMA;
  /** On the scale `timeScale` names; UTC before the time-basis set. */
  instant: string;
  timeScale?: TimeScaleName;
  sourceInstant: string | null;
  /** Caller declaration, not verification of a human birth time's precision. */
  timeKnown: boolean;
  reference: NatalReference;
  localResolution: NatalLocalResolution | null;
  coordinates: { latitude: number; longitude: number } | null;
  houses: {
    requested: HouseSystem;
    actual: HouseSystem | null;
    absenceReason: "unknown-time" | "missing-location" | null;
  };
  /** Only time-resolution assertions may be supplied to this draft's creator. */
  inputFlags: ChartFlag[];
  resultFlags: ChartFlag[];
  /** From the current conventions set on, the engine also names its ephemeris. */
  engine: {
    name: "@zodiacs/engine";
    version: string;
    ephemeris?: { name: "astronomy-engine"; version: string };
  };
  provenance: (NatalProvenanceClaims & { status: "claimed" }) | null;
  conventions: ConventionSet;
  coverage: typeof COVERAGE;
}

export interface NatalEnvelope {
  schema: typeof NATAL_ENVELOPE_SCHEMA;
  /** This draft implements no optional required features; unknown ones fail closed. */
  requiredFeatures: string[];
  receipt: NatalReceipt;
  /** `deltaT` from the rc.8 set on, `timeScale` from the time-basis set on. */
  result: Pick<Chart, "bodies" | "angles" | "houses" | "aspects"> & Partial<Pick<Chart, "deltaT" | "timeScale">>;
  extensions?: NatalJsonObject;
}

export type NatalEnvelopeParseResult =
  | { ok: true; envelope: NatalEnvelope }
  | { ok: false; code: NatalEnvelopeErrorCode };

export interface NatalDiagnostic {
  schema: typeof NATAL_DIAGNOSTIC_SCHEMA;
  status: "redacted-not-anonymous";
  timeKnown: boolean;
  houses: NatalReceipt["houses"];
  inputFlags: ChartFlag[];
  resultFlags: ChartFlag[];
}

const BODIES = [
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto",
  "North Node",
  "South Node"
] as const;
const FLAGS_RC7 = ["dst-gap", "dst-fold", "lmt", "no-time", "polar-fallback"] as const;
const FLAGS = [...FLAGS_RC7, "outside-reference-span"] as const;
const TIME_FLAGS = ["dst-gap", "dst-fold", "lmt"] as const;
const HOUSE_SYSTEMS = [
  "whole",
  "placidus",
  "porphyry",
  "equal",
  "equal-mc",
  "vehlow",
  "koch",
  "regiomontanus",
  "campanus",
  "topocentric",
  "alcabitius",
  "morinus",
  "meridian"
] as const;
/** The systems engine versions before 0.1.1-rc.9 offered. */
const HOUSE_SYSTEMS_BEFORE_RC9: readonly string[] = ["whole", "placidus", "porphyry"];
/** The systems engine versions before 0.1.1-rc.10 offered: all but Equal from the midheaven. */
const HOUSE_SYSTEMS_BEFORE_RC10: readonly string[] = HOUSE_SYSTEMS.filter(
  (system) => system !== "equal-mc"
);
/** The systems that fall back to whole sign inside the polar circle. */
const POLAR_UNDEFINED: readonly string[] = ["placidus", "koch"];
/** The systems whose cusps turn with the ascendant inside the polar circle. */
const TURNING_WITH_ASCENDANT: readonly string[] = ["regiomontanus", "campanus", "topocentric"];
const HOSTILE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
type RecordValue = Record<string, unknown>;

function fail(code: NatalEnvelopeErrorCode): never {
  throw new NatalEnvelopeError(code);
}
function guarded<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    // Never expose parser, proxy, Date, or caller-generated exception text.
    return fail(errorCode(error));
  }
}
function errorCode(error: unknown): NatalEnvelopeErrorCode {
  return (
    (error !== null && typeof error === "object" ? ERROR_BRAND.get(error) : undefined) ??
    "invalid_shape"
  );
}

/** Inspect descriptors before reading values: accessors/toJSON are never called. */
function cloneData(value: unknown, allowDates = false): unknown {
  const seen = new Set<object>();
  let nodes = 0;
  let stringBytes = 0;
  const countString = (text: string) => {
    if (text.length > NATAL_ENVELOPE_LIMITS.bytes) fail("size_limit");
    stringBytes += new TextEncoder().encode(text).length;
    if (stringBytes > NATAL_ENVELOPE_LIMITS.bytes) fail("size_limit");
  };
  const visit = (item: unknown, depth: number): unknown => {
    if (++nodes > NATAL_ENVELOPE_LIMITS.nodes || depth > NATAL_ENVELOPE_LIMITS.depth)
      fail("complexity_limit");
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "string") {
      countString(item);
      return item;
    }
    if (typeof item === "number") {
      if (!Number.isFinite(item)) fail("invalid_value");
      return Object.is(item, -0) ? 0 : item;
    }
    if (typeof item !== "object") fail("invalid_shape");
    if (seen.has(item)) fail("invalid_shape");
    const prototype = Object.getPrototypeOf(item);
    const keys = Reflect.ownKeys(item);
    if (keys.length > NATAL_ENVELOPE_LIMITS.nodes) fail("complexity_limit");
    if (allowDates && prototype === Date.prototype) {
      if (keys.length !== 0) fail("invalid_shape");
      const ms = Date.prototype.getTime.call(item);
      if (!Number.isFinite(ms)) fail("invalid_value");
      return new Date(ms);
    }
    const array = Array.isArray(item);
    if (
      prototype !== (array ? Array.prototype : Object.prototype) &&
      !(prototype === null && !array)
    )
      fail("invalid_shape");
    seen.add(item);
    const out: RecordValue | unknown[] = array ? [] : {};
    const length = array ? (Object.getOwnPropertyDescriptor(item, "length")?.value as number) : 0;
    if (array && (length > NATAL_ENVELOPE_LIMITS.nodes || keys.length !== length + 1))
      fail("invalid_shape");
    if (keys.some((key) => typeof key !== "string" || HOSTILE_KEYS.has(key))) fail("invalid_shape");
    for (const key of (keys as string[]).sort()) {
      if (array && key === "length") continue;
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length)) fail("invalid_shape");
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("invalid_shape");
      countString(key);
      Object.defineProperty(out, key, {
        value: visit(descriptor.value, depth + 1),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
    seen.delete(item);
    return out;
  };
  return visit(value, 0);
}

function record(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Date)
    fail("invalid_shape");
  return value as RecordValue;
}
function fields(
  value: RecordValue,
  required: readonly string[],
  optional: readonly string[] = []
): void {
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))
  )
    fail("invalid_shape");
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) fail("invalid_value");
  return value as T;
}
function number(value: unknown, min: number, max: number, exclusiveMax = false): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    (exclusiveMax ? value >= max : value > max)
  )
    fail("invalid_value");
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") fail("invalid_shape");
  return value;
}
function text(value: unknown, maximum = 128): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    /[\p{Cc}\p{Cf}]/u.test(value)
  )
    fail("invalid_value");
  return value;
}
/** A SemVer 2.0.0 version, which the version gates can order. */
function version(value: unknown): string {
  const parsed = text(value, 64);
  if (!isVersion(parsed)) fail("invalid_value");
  return parsed;
}
function canonicalInstant(value: unknown): string {
  if (typeof value !== "string" || value.length > 32) fail("invalid_value");
  try {
    if (dateFrom(value, "instant").toISOString() !== value) fail("invalid_value");
  } catch {
    fail("invalid_value");
  }
  return value;
}
function flagList(value: unknown, allowed: readonly ChartFlag[]): ChartFlag[] {
  if (!Array.isArray(value) || value.length > allowed.length) fail("invalid_value");
  const flags = value.map((flag) => choice(flag, allowed));
  if (
    new Set(flags).size !== flags.length ||
    (flags.includes("dst-gap") && flags.includes("dst-fold"))
  )
    fail("inconsistent_result");
  return flags;
}
function sameFlags(a: ChartFlag[], b: ChartFlag[]): boolean {
  return a.length === b.length && a.every((flag) => b.includes(flag));
}
function fixedFields(value: unknown, expected: Record<string, string>): void {
  const actual = record(value);
  fields(actual, Object.keys(expected));
  if (Object.keys(expected).some((key) => actual[key] !== expected[key]))
    fail("unsupported_feature");
}
/** The conventions set a receipt carries, matched exactly, keys and values; any other set is unsupported. */
function conventionSet(value: unknown): ConventionSet {
  const actual = record(value);
  const keys = Object.keys(actual);
  const match = NATAL_RECEIPT_CONVENTION_SETS.find(
    (set) =>
      keys.length === Object.keys(set).length &&
      Object.entries(set).every(([key, expected]) => Object.hasOwn(actual, key) && actual[key] === expected)
  );
  if (!match) fail("unsupported_feature");
  return match;
}
function longitude(value: unknown): number {
  return number(value, 0, 360, true);
}
function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-8;
}
function wrap(value: number): number {
  return ((value % 360) + 360) % 360;
}
function angularClose(a: number, b: number): boolean {
  return Math.min(wrap(a - b), wrap(b - a)) <= 1e-8;
}

const DELTA_T_SEGMENTS = [
  "long-term",
  "reconstructed",
  "observed",
  "predicted",
  "extrapolated"
] as const;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

const IERS_SEGMENTS = ["observed", "predicted", "fallback"] as const;

/**
 * The ΔT a receipt records from the rc.8 set on. A pin carries no band or
 * table. The time-basis set also allows "iers-utc/1", derived from the leap
 * seconds and IERS UT1 − UTC. Under the rc.8 set a model value from this
 * engine's own table must be the model's value at the receipt's instant (the
 * time-basis set checks it with the whole basis); one from another release's
 * table is a claim.
 */
function validateDeltaT(value: unknown, instant: string, timeBasis: boolean): RecordValue {
  const deltaT = record(value);
  fields(deltaT, ["seconds", "sigma", "model", "table", "tableDigest", "segment"]);
  const seconds = number(deltaT.seconds, -1e10, 1e10);
  if (deltaT.model === "pinned") {
    if (
      deltaT.sigma !== null ||
      deltaT.table !== null ||
      deltaT.tableDigest !== null ||
      deltaT.segment !== "pinned"
    )
      fail("inconsistent_result");
    return deltaT;
  }
  const iers = timeBasis && deltaT.model === DELTA_T_IERS_MODEL;
  if (!iers && deltaT.model !== DELTA_T_MODEL) fail("unsupported_feature");
  number(deltaT.sigma, 0, 1e10);
  if (typeof deltaT.table !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(deltaT.table))
    fail("invalid_value");
  if (typeof deltaT.tableDigest !== "string" || !/^[a-f0-9]{16}$/.test(deltaT.tableDigest))
    fail("invalid_value");
  const segment = choice(deltaT.segment, iers ? IERS_SEGMENTS : DELTA_T_SEGMENTS);
  if (!timeBasis && deltaT.tableDigest === DELTA_T_TABLE.digest) {
    const expected = deltaTAt((Date.parse(instant) - J2000_MS) / 86_400_000);
    if (
      deltaT.table !== expected.table ||
      segment !== expected.segment ||
      Math.abs(seconds - expected.seconds) > 1e-9 ||
      Math.abs((deltaT.sigma as number) - (expected.sigma as number)) > 1e-9
    )
      fail("inconsistent_result");
  }
  return deltaT;
}

/** Numbers within 1e-9, records key by key, anything else identical. */
function same(actual: unknown, expected: unknown): boolean {
  if (typeof expected === "number") return typeof actual === "number" && Math.abs(actual - expected) <= 1e-9;
  if (!expected || typeof expected !== "object") return actual === expected;
  const keys = Object.keys(expected);
  return (
    !!actual &&
    typeof actual === "object" &&
    keys.length === Object.keys(actual).length &&
    keys.every((key) => same((actual as RecordValue)[key], (expected as RecordValue)[key]))
  );
}

/**
 * The time-basis set's `timeScale`: its shape, its agreement with the ΔT
 * beside it and, where that ΔT names one of this engine's tables, the basis
 * this engine gives at the instant.
 */
function validateTimeScale(value: unknown, deltaT: RecordValue, instant: string, scale: TimeScaleName): void {
  const timeScale = record(value);
  fields(timeScale, ["input", "basis", "ut1MinusUtc", "leapSeconds"]);
  const basis = choice(timeScale.basis, ["iers", "delta-t", "pinned"] as const);
  const { ut1MinusUtc, leapSeconds } = timeScale;
  if (ut1MinusUtc !== null) {
    const ut1 = record(ut1MinusUtc);
    fields(ut1, ["seconds", "sigma", "source"]);
    number(ut1.seconds, -1, 1);
    number(ut1.sigma, 0, 1);
    choice(ut1.source, IERS_SEGMENTS);
  }
  if (leapSeconds !== null) {
    const leap = record(leapSeconds);
    fields(leap, ["taiMinusUtc", "listed"]);
    if (!Number.isInteger(number(leap.taiMinusUtc, 10, 100))) fail("invalid_value");
    bool(leap.listed);
  }
  const iers = deltaT.model === DELTA_T_IERS_MODEL;
  if (
    timeScale.input !== scale ||
    (basis === "pinned") !== (deltaT.model === "pinned") ||
    (basis === "iers") !== iers ||
    (iers && (ut1MinusUtc === null || leapSeconds === null))
  )
    fail("inconsistent_result");
  if (deltaT.tableDigest === UT1_DATA.digest || deltaT.tableDigest === DELTA_T_TABLE.digest) {
    const expected = timeBasis(Date.parse(instant), scale);
    if (!same(deltaT, expected.deltaT) || !same(timeScale, expected.timeScale)) fail("inconsistent_result");
  }
}

function validateResult(
  value: unknown,
  instantaneousApplying: boolean,
  instant: string | null,
  scale: TimeScaleName | null
): NatalEnvelope["result"] {
  const result = record(value);
  fields(result, [
    "bodies",
    "angles",
    "houses",
    "aspects",
    ...(instant === null ? [] : ["deltaT"]),
    ...(scale === null ? [] : ["timeScale"])
  ]);
  if (instant !== null) {
    const deltaT = validateDeltaT(result.deltaT, instant, scale !== null);
    if (scale !== null) validateTimeScale(result.timeScale, deltaT, instant, scale);
  }
  if (!Array.isArray(result.bodies) || result.bodies.length !== 12) fail("invalid_shape");
  const names = new Set<string>();
  const longitudes = new Map<string, number>();
  const speeds = new Map<string, number>();
  for (const item of result.bodies) {
    const body = record(item);
    fields(body, ["body", "lon", "lat", "speed", "retrograde", "sign", "degree"]);
    const name = choice(body.body, BODIES);
    if (names.has(name)) fail("invalid_value");
    names.add(name);
    const lon = longitude(body.lon);
    longitudes.set(name, lon);
    number(body.lat, -90, 90);
    const speed = number(body.speed, -Number.MAX_VALUE, Number.MAX_VALUE);
    speeds.set(name, speed);
    const degree = number(body.degree, 0, 30, true);
    if (
      bool(body.retrograde) !== speed < 0 ||
      body.sign !== SIGNS[Math.floor(lon / 30)]?.slug ||
      !close(degree, lon % 30)
    )
      fail("inconsistent_result");
  }
  if ((result.angles === null) !== (result.houses === null)) fail("inconsistent_result");
  if (result.angles !== null) {
    const angles = record(result.angles);
    fields(angles, ["asc", "mc", "dsc", "ic"]);
    for (const angle of Object.values(angles)) longitude(angle);
    if (
      !angularClose(angles.dsc as number, (angles.asc as number) + 180) ||
      !angularClose(angles.ic as number, (angles.mc as number) + 180)
    )
      fail("inconsistent_result");
    const houses = record(result.houses);
    fields(houses, ["system", "cusps"]);
    const system = choice(houses.system, HOUSE_SYSTEMS);
    if (!Array.isArray(houses.cusps) || houses.cusps.length !== 12) fail("invalid_shape");
    const cusps = houses.cusps.map(longitude);
    if (new Set(cusps).size !== 12) fail("inconsistent_result");
    const asc = angles.asc as number;
    const mc = angles.mc as number;
    const opposite = cusps
      .slice(0, 6)
      .every((cusp, index) => angularClose(cusps[index + 6]!, cusp + 180));
    const thirtyFrom = (start: number) =>
      cusps.every((cusp, index) => angularClose(cusp, start + index * 30));
    let consistent: boolean;
    switch (system) {
      case "whole":
        consistent = thirtyFrom(Math.floor(asc / 30) * 30);
        break;
      case "equal":
        consistent = thirtyFrom(asc);
        break;
      // The 10th cusp is the midheaven, so the 1st is 90° past it.
      case "equal-mc":
        consistent = thirtyFrom(mc + 90);
        break;
      case "vehlow":
        consistent = thirtyFrom(asc - 15);
        break;
      // Neither angle is a Morinus cusp; the meridian system keeps the midheaven.
      case "morinus":
        consistent = opposite;
        break;
      case "meridian":
        consistent = opposite && angularClose(cusps[9]!, mc);
        break;
      default:
        // The quadrant systems start at the ascendant and put the midheaven on
        // the 10th cusp. Inside the polar circle, Regiomontanus, Campanus and
        // Topocentric cusps turn with the ascendant, and the 10th cusp is then
        // the lower meridian.
        consistent =
          opposite &&
          angularClose(cusps[0]!, asc) &&
          (angularClose(cusps[9]!, mc) ||
            (TURNING_WITH_ASCENDANT.includes(system) && angularClose(cusps[9]!, mc + 180)));
    }
    if (!consistent) fail("inconsistent_result");
    if (system === "porphyry") {
      // Porphyry is fixed by the angles: each quadrant in three equal parts,
      // with the ascendant less than 180° past the midheaven.
      const upper = wrap((angles.asc as number) - (angles.mc as number));
      const lower = 180 - upper;
      if (
        upper >= 180 ||
        !angularClose(cusps[10]!, (angles.mc as number) + upper / 3) ||
        !angularClose(cusps[11]!, (angles.mc as number) + (2 * upper) / 3) ||
        !angularClose(cusps[1]!, (angles.asc as number) + lower / 3) ||
        !angularClose(cusps[2]!, (angles.asc as number) + (2 * lower) / 3)
      )
        fail("inconsistent_result");
    }
  }
  if (!Array.isArray(result.aspects) || result.aspects.length > 45) fail("invalid_shape");
  const pairs = new Set<string>();
  for (const item of result.aspects) {
    const aspect = record(item);
    fields(aspect, ["a", "b", "type", "orb", "applying"]);
    const a = choice(
      aspect.a,
      BODIES.filter((body) => ASPECT_BODIES.has(body))
    );
    const b = choice(
      aspect.b,
      BODIES.filter((body) => ASPECT_BODIES.has(body))
    );
    const key = [a, b].sort().join("/");
    if (a === b || pairs.has(key)) fail("inconsistent_result");
    pairs.add(key);
    const type = choice(aspect.type, ASPECT_TYPES);
    const definition = ASPECTS.find((aspect) => aspect.type === type)!;
    const luminary = a === "Sun" || a === "Moon" || b === "Sun" || b === "Moon";
    const orb = number(aspect.orb, 0, luminary ? definition.luminaryOrb : definition.orb);
    const distance = Math.abs(longitudes.get(a)! - longitudes.get(b)!);
    if (!close(orb, Math.abs(Math.min(distance, 360 - distance) - definition.angle)))
      fail("inconsistent_result");
    const applying = bool(aspect.applying);
    // Receipts from before the instantaneous rule are not judged by it.
    if (
      instantaneousApplying &&
      applying !==
        (aspectMotion(
          { lon: longitudes.get(a)!, speed: speeds.get(a)! },
          { lon: longitudes.get(b)!, speed: speeds.get(b)! },
          definition.angle
        ) ===
          "applying")
    )
      fail("inconsistent_result");
  }
  return result as unknown as NatalEnvelope["result"];
}

const LOCAL_FIELDS = ["date", "time", "timeZone", "offsetMinutes", "gapShiftMinutes", "policy"];
const LOCAL_TIME_BASIS_FIELDS = [
  "calendar",
  "writtenDate",
  "tzdbVersion",
  "dataForm",
  "clock",
  "transition",
  "localMeanTime"
];

/** Minutes of UTC offset: within a day, in whole seconds. */
function offsetMinutes(value: unknown): number {
  const minutes = number(value, -1440, 1440);
  if (Math.abs(minutes * 60_000 - Math.round(minutes * 60_000)) > 1e-6) fail("invalid_context");
  return minutes;
}

function validateLocal(value: unknown, receipt: NatalReceipt, timeBasis: boolean): void {
  if (value === null) {
    if (receipt.reference === "local-noon") fail("invalid_context");
    return;
  }
  const local = record(value);
  // The time-basis fields are optional, as the types say: a record in rc.14's
  // shape, the six fields before them, stays acceptable. Older sets have none.
  fields(local, LOCAL_FIELDS, timeBasis ? LOCAL_TIME_BASIS_FIELDS : []);
  const date = text(local.date, 10),
    time = text(local.time, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    fail("invalid_context");
  let wall: number;
  try {
    wall = dateFrom(`${date}T${time}:00Z`, "wall").getTime();
  } catch {
    fail("invalid_context");
  }
  const zone = text(local.timeZone, 128);
  if (!/^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+){0,3}$/.test(zone)) fail("invalid_context");
  const offset = number(local.offsetMinutes, -1440, 1440);
  const shift = number(local.gapShiftMinutes, 0, 2880);
  const offsetMs = offset * 60_000,
    shiftMs = shift * 60_000;
  // Permit normal floating representation of historical seconds, not sub-ms claims.
  if (
    Math.abs(offsetMs - Math.round(offsetMs)) > 1e-6 ||
    Math.abs(shiftMs - Math.round(shiftMs)) > 1e-6
  )
    fail("invalid_context");
  if (
    wall + Math.round(shiftMs) - Math.round(offsetMs) !==
    dateFrom(receipt.instant, "instant").getTime()
  )
    fail("invalid_context");
  fixedFields(local.policy, { fold: "earlier", gap: "shift-forward" });
  if (receipt.inputFlags.includes("dst-gap") !== shift > 0) fail("invalid_context");
  if (receipt.reference === "local-noon" && time !== "12:00") fail("invalid_context");
  // Before the time-basis set, lmt meant an offset with seconds.
  if (!timeBasis) {
    if (receipt.inputFlags.includes("lmt") !== Math.abs(offset % 1) > 1e-9) fail("invalid_context");
    return;
  }
  validateLocalRecord(local, receipt, date, offset, shift);
}

/**
 * The time-basis set's local record: the calendar as written, the tzdb that
 * answered, the clock, the transition behind the offset and the birthplace's
 * mean time. Each field is optional, so a record in rc.14's shape passes;
 * each one present is checked against the offsets and flags arithmetically,
 * and against the other fields present. A date without `calendar` was written
 * in the Gregorian calendar, as before rc.15.
 */
function validateLocalRecord(local: RecordValue, receipt: NatalReceipt, date: string, offset: number, shift: number): void {
  const has = (key: string): boolean => Object.hasOwn(local, key);
  const calendar = has("calendar") ? choice(local.calendar, ["gregorian", "julian"] as const) : "gregorian";
  const written = has("writtenDate") ? text(local.writtenDate, 10) : null;
  const version = has("tzdbVersion") ? local.tzdbVersion : undefined;
  if (version !== undefined && version !== null && (typeof version !== "string" || !/^\d{4}[a-z]$/.test(version)))
    fail("invalid_value");
  const form = has("dataForm") ? choice(local.dataForm, ["main+backzone", "main", "host"] as const) : undefined;
  const flags = receipt.inputFlags;
  // Without a clock, the lmt flag is the record's only claim of one.
  const lmt = has("clock")
    ? choice(local.clock, ["local-mean-time", "legal"] as const) === "local-mean-time"
    : flags.includes("lmt");
  const gap = flags.includes("dst-gap");
  const fold = flags.includes("dst-fold");
  if (
    // A local time resolves to UTC.
    receipt.timeScale !== "utc" ||
    (written !== null &&
      (!parseCalendarDate(written, calendar) ||
        (calendar === "gregorian" ? written : julianToGregorian(written)) !== date)) ||
    (form !== undefined && form !== "host" && version === null) ||
    flags.includes("lmt") !== lmt ||
    (local.transition === null && (gap || fold))
  )
    fail("invalid_context");
  let before: number | null = null;
  if (has("transition") && local.transition !== null) {
    const transition = record(local.transition);
    fields(transition, ["at", "offsetBeforeMinutes", "offsetAfterMinutes", "cause"]);
    const at = Date.parse(canonicalInstant(transition.at));
    const instant = Date.parse(receipt.instant);
    before = offsetMinutes(transition.offsetBeforeMinutes);
    const after = offsetMinutes(transition.offsetAfterMinutes);
    const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9;
    if (
      // A change of half a day or more moves the date: a move across the date line.
      (choice(transition.cause, ["dst", "legal-change", "date-line"] as const) === "date-line") !==
        Math.abs(after - before) >= 720 ||
      !(gap
        ? after > before && near(after - before, shift) && near(offset, after) && at <= instant
        : fold
          ? after < before && near(offset, before) && at > instant
          : near(offset, after) && at <= instant)
    )
      fail("invalid_context");
  }
  if (has("localMeanTime") && local.localMeanTime !== null) {
    const mean = record(local.localMeanTime);
    fields(mean, ["longitude", "zoneOffsetMinutes"]);
    const seconds = Math.round(number(mean.longitude, -180, 180) * 240);
    offsetMinutes(mean.zoneOffsetMinutes);
    // The birthplace's mean time read the wall time: at the instant, or just
    // before a gap out of it, which only a recorded transition can show.
    const read = lmt ? offset : gap ? before : null;
    if (read === null ? !(gap && !has("transition")) : (Math.round(read * 60) - seconds) % 86_400 !== 0)
      fail("invalid_context");
  }
}

function repository(value: unknown): void {
  const input = text(value, 256);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return fail("invalid_value");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    fail("invalid_value");
}
function commit(value: unknown): void {
  if (typeof value !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value))
    fail("invalid_value");
}
function validateProvenance(value: unknown, engineVersion: string): void {
  if (value === null) return;
  const facts = record(value);
  fields(facts, ["status"], ["source", "artifact", "runtime", "ephemeris"]);
  if (facts.status !== "claimed" || Object.keys(facts).length === 1) fail("invalid_shape");
  if (facts.source !== undefined) {
    const source = record(facts.source);
    fields(source, ["repository", "commit"]);
    repository(source.repository);
    commit(source.commit);
  }
  if (facts.artifact !== undefined) {
    const artifact = record(facts.artifact);
    fields(
      artifact,
      ["sha256", "packageVersion"],
      ["distributionRepository", "distributionCommit"]
    );
    if (typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.sha256))
      fail("invalid_value");
    if (version(artifact.packageVersion) !== engineVersion) fail("invalid_context");
    if (
      (artifact.distributionRepository === undefined) !==
      (artifact.distributionCommit === undefined)
    )
      fail("invalid_context");
    if (artifact.distributionRepository !== undefined) {
      repository(artifact.distributionRepository);
      commit(artifact.distributionCommit);
    }
  }
  if (facts.runtime !== undefined) {
    const runtime = record(facts.runtime);
    fields(runtime, ["name"], ["version", "icuVersion", "tzdbVersion"]);
    for (const item of Object.values(runtime)) text(item, 64);
  }
  if (facts.ephemeris !== undefined) {
    const ephemeris = record(facts.ephemeris);
    fields(ephemeris, ["name", "version"]);
    if (ephemeris.name !== "astronomy-engine") fail("unsupported_feature");
    version(ephemeris.version);
  }
}

function validateEnvelope(input: unknown): NatalEnvelope {
  const envelope = record(input);
  if (envelope.schema !== NATAL_ENVELOPE_SCHEMA) fail("unsupported_version");
  fields(envelope, ["schema", "requiredFeatures", "receipt", "result"], ["extensions"]);
  if (!Array.isArray(envelope.requiredFeatures)) fail("invalid_shape");
  if (envelope.requiredFeatures.length !== 0) fail("unsupported_feature");
  const receipt = record(envelope.receipt);
  if (receipt.schema !== NATAL_RECEIPT_SCHEMA) fail("unsupported_version");
  fields(receipt, [
    "schema",
    "instant",
    "sourceInstant",
    "timeKnown",
    "reference",
    "localResolution",
    "coordinates",
    "houses",
    "inputFlags",
    "resultFlags",
    "engine",
    "provenance",
    "conventions",
    "coverage"
  ], ["timeScale"]);
  canonicalInstant(receipt.instant);
  if (receipt.sourceInstant !== null) {
    if (typeof receipt.sourceInstant !== "string" || receipt.sourceInstant.length > 40)
      fail("invalid_context");
    try {
      if (dateFrom(receipt.sourceInstant, "source").toISOString() !== receipt.instant)
        fail("invalid_context");
    } catch {
      fail("invalid_context");
    }
  }
  const timeKnown = bool(receipt.timeKnown);
  const reference = choice(receipt.reference, ["supplied-instant", "utc-noon", "local-noon"]);
  if (reference !== "supplied-instant" && timeKnown) fail("invalid_context");
  if (reference === "utc-noon" && !(receipt.instant as string).endsWith("T12:00:00.000Z"))
    fail("invalid_context");
  if (receipt.coordinates !== null) {
    const coords = record(receipt.coordinates);
    fields(coords, ["latitude", "longitude"]);
    number(coords.latitude, -90, 90);
    number(coords.longitude, -180, 180);
    if (timeKnown && Math.abs(coords.latitude as number) === 90) fail("unsupported_feature");
  }
  const conventions = conventionSet(receipt.conventions);
  // The rc.8 set on records ΔT; the time-basis sets (rc.15 on) also the instant's scale and basis.
  const timeBasis = conventions === CONVENTIONS || conventions === CONVENTIONS_RC15;
  const current = timeBasis || conventions === CONVENTIONS_RC8;
  if (timeBasis !== Object.hasOwn(receipt, "timeScale")) fail("invalid_shape");
  const scale = timeBasis ? choice(receipt.timeScale, TIME_SCALE_NAMES) : null;
  const result = validateResult(
    envelope.result,
    conventions !== CONVENTIONS_RC3,
    current ? (receipt.instant as string) : null,
    scale
  );
  const house = record(receipt.houses);
  fields(house, ["requested", "actual", "absenceReason"]);
  const requested = choice(house.requested, HOUSE_SYSTEMS);
  const reason = !timeKnown
    ? "unknown-time"
    : receipt.coordinates === null
      ? "missing-location"
      : null;
  if (
    house.absenceReason !== reason ||
    (result.houses === null) !== (reason !== null) ||
    house.actual !== (result.houses?.system ?? null)
  )
    fail("inconsistent_result");
  // Each system is computed as asked, except Placidus and Koch, which fall
  // back to whole sign inside the polar circle. rc.3 to rc.6 never offered
  // Porphyry.
  const actual = result.houses?.system;
  if (
    (actual !== undefined &&
      actual !== requested &&
      !(POLAR_UNDEFINED.includes(requested) && actual === "whole")) ||
    (conventions === CONVENTIONS_RC3 && requested === "porphyry")
  )
    fail("inconsistent_result");
  // Cusps turn with the ascendant only where the ascendant can have been
  // taken from the other side of the horizon: inside the polar circle, and
  // the obliquity never reaches 25°.
  if (
    result.houses &&
    result.angles &&
    TURNING_WITH_ASCENDANT.includes(result.houses.system) &&
    !angularClose(result.houses.cusps[9]!, result.angles.mc) &&
    Math.abs((receipt.coordinates as { latitude: number }).latitude) < 65
  )
    fail("inconsistent_result");
  const inputFlags = flagList(receipt.inputFlags, TIME_FLAGS);
  const resultFlags = flagList(receipt.resultFlags, current ? FLAGS : FLAGS_RC7);
  const expected = [...inputFlags];
  if (!timeKnown) expected.push("no-time");
  if (POLAR_UNDEFINED.includes(requested) && result.houses?.system === "whole")
    expected.push("polar-fallback");
  if (current && outsideReferenceSpan(new Date(receipt.instant as string)))
    expected.push("outside-reference-span");
  if (!sameFlags(expected, resultFlags)) fail("inconsistent_result");
  const engine = record(receipt.engine);
  // Receipts in the current set must say which ephemeris computed them.
  fields(engine, current ? ["name", "version", "ephemeris"] : ["name", "version"]);
  if (engine.name !== "@zodiacs/engine") fail("unsupported_feature");
  const engineVersion = version(engine.version);
  if (current) {
    const ephemeris = record(engine.ephemeris);
    fields(ephemeris, ["name", "version"]);
    if (ephemeris.name !== "astronomy-engine") fail("unsupported_feature");
    version(ephemeris.version);
  }
  validateProvenance(receipt.provenance, engineVersion);
  validateLocal(receipt.localResolution, receipt as unknown as NatalReceipt, timeBasis);
  if (
    (conventions === CONVENTIONS_RC3 && !RC3_TO_RC6.test(engineVersion)) ||
    (conventions === CONVENTIONS_RC7 && !RC7.test(engineVersion)) ||
    (conventions === CONVENTIONS_RC8 && !RC8_TO_RC14.test(engineVersion)) ||
    (conventions === CONVENTIONS_RC15 && !RC15.test(engineVersion)) ||
    (conventions === CONVENTIONS && before(engineVersion, NUTATION_RELEASE)) ||
    (!HOUSE_SYSTEMS_BEFORE_RC9.includes(requested) && before(engineVersion, RC9_RELEASE)) ||
    (!HOUSE_SYSTEMS_BEFORE_RC10.includes(requested) && before(engineVersion, RC10_RELEASE))
  )
    fail("inconsistent_result");
  fixedFields(receipt.coverage, COVERAGE);
  if (envelope.extensions !== undefined) record(envelope.extensions);
  return envelope as unknown as NatalEnvelope;
}

function encoded(envelope: NatalEnvelope): string {
  // Only descriptor-inspected, semantically validated clones reach JSON.stringify.
  const json = JSON.stringify(envelope);
  if (new TextEncoder().encode(json).length > NATAL_ENVELOPE_LIMITS.bytes) fail("size_limit");
  return json;
}
function checked(input: unknown): NatalEnvelope {
  const envelope = validateEnvelope(cloneData(input));
  encoded(envelope);
  return envelope;
}

/**
 * Capture a fresh full Chart, not a legacy summary. Checks declared consistency,
 * not ephemeris accuracy, historical timezone truth, origin, or authenticity.
 * Optional properties must be omitted rather than set to undefined.
 */
export function createNatalEnvelope(
  chart: Chart,
  context: NatalEnvelopeContext = {}
): NatalEnvelope {
  return guarded(() => {
    const source = record(cloneData(chart, true));
    fields(source, [
      "input",
      "bodies",
      "angles",
      "houses",
      "aspects",
      "flags",
      "deltaT",
      "timeScale",
      "engineVersion"
    ]);
    const input = record(source.input);
    fields(
      input,
      ["utc", "houseSystem", "timeKnown"],
      ["latitude", "longitude", "flags", "deltaT", "timeScale"]
    );
    if (!(input.utc instanceof Date)) fail("invalid_value");
    const supplied = record(cloneData(context));
    fields(
      supplied,
      [],
      ["reference", "sourceInstant", "localResolution", "provenance", "extensions"]
    );
    if (supplied.provenance !== undefined)
      fields(record(supplied.provenance), [], ["source", "artifact", "runtime", "ephemeris"]);
    if ((input.latitude === undefined) !== (input.longitude === undefined)) fail("invalid_value");
    const houses = source.houses === null ? null : record(source.houses);
    const envelope = {
      schema: NATAL_ENVELOPE_SCHEMA,
      requiredFeatures: [],
      receipt: {
        schema: NATAL_RECEIPT_SCHEMA,
        instant: Date.prototype.toISOString.call(input.utc),
        timeScale: input.timeScale ?? "utc",
        sourceInstant: supplied.sourceInstant === undefined ? null : supplied.sourceInstant,
        timeKnown: input.timeKnown,
        reference: supplied.reference === undefined ? "supplied-instant" : supplied.reference,
        localResolution: supplied.localResolution ?? null,
        coordinates:
          input.latitude === undefined
            ? null
            : { latitude: input.latitude, longitude: input.longitude },
        houses: {
          requested: input.houseSystem,
          actual: houses?.system ?? null,
          absenceReason: !input.timeKnown
            ? "unknown-time"
            : input.latitude === undefined
              ? "missing-location"
              : null
        },
        inputFlags: input.flags ?? [],
        resultFlags: source.flags,
        engine: {
          name: "@zodiacs/engine",
          version: source.engineVersion,
          ephemeris: { ...EPHEMERIS }
        },
        provenance:
          supplied.provenance === undefined
            ? null
            : { ...record(supplied.provenance), status: "claimed" },
        conventions: { ...CONVENTIONS },
        coverage: { ...COVERAGE }
      },
      result: {
        bodies: source.bodies,
        angles: source.angles,
        houses: source.houses,
        aspects: source.aspects,
        deltaT: source.deltaT,
        timeScale: source.timeScale
      },
      ...(supplied.extensions === undefined ? {} : { extensions: supplied.extensions })
    };
    return checked(envelope);
  });
}

/** Bounded JSON entry point. Unknown versions/features never become calculation input. */
export function parseNatalEnvelope(json: string): NatalEnvelopeParseResult {
  try {
    if (typeof json !== "string") fail("invalid_shape");
    if (
      json.length > NATAL_ENVELOPE_LIMITS.bytes ||
      new TextEncoder().encode(json).length > NATAL_ENVELOPE_LIMITS.bytes
    )
      fail("size_limit");
    const parsed = parseReceiptJson(json, {
      depth: NATAL_ENVELOPE_LIMITS.depth,
      nodes: NATAL_ENVELOPE_LIMITS.nodes
    });
    if (!parsed.ok) return parsed;
    return { ok: true, envelope: guarded(() => checked(parsed.value)) };
  } catch (error) {
    return { ok: false, code: errorCode(error) };
  }
}

export function serializeNatalEnvelope(envelope: NatalEnvelope): string {
  return guarded(() => encoded(checked(envelope)));
}

/** Replay the recorded request/instant, never a fallback house system or today's tzdb. */
export function natalReplayInput(envelope: NatalEnvelope): BirthInput {
  return guarded(() => {
    const { receipt, result } = checked(envelope);
    // A pinned ΔT and a scale other than UTC were part of the request, so the replay asks again.
    return {
      utc: receipt.instant,
      ...(receipt.timeScale === undefined || receipt.timeScale === "utc" ? {} : { timeScale: receipt.timeScale }),
      houseSystem: receipt.houses.requested,
      timeKnown: receipt.timeKnown,
      flags: [...receipt.inputFlags],
      ...(receipt.coordinates === null ? {} : { ...receipt.coordinates }),
      ...(result.deltaT?.model === "pinned" ? { deltaT: result.deltaT.seconds } : {})
    };
  });
}

/** A fresh fixed allowlist: no claimed identifiers, versions, hashes, or input/result values. */
export function redactNatalEnvelope(envelope: NatalEnvelope): NatalDiagnostic {
  return guarded(() => {
    const { receipt } = checked(envelope);
    return {
      schema: NATAL_DIAGNOSTIC_SCHEMA,
      status: "redacted-not-anonymous",
      timeKnown: receipt.timeKnown,
      houses: { ...receipt.houses },
      inputFlags: [...receipt.inputFlags],
      resultFlags: [...receipt.resultFlags]
    };
  });
}
