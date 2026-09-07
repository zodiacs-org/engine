import { dateFrom } from "./date-input.js";
import { ASPECTS, ASPECT_TYPES, ASPECT_BODIES } from "./aspects.js";
import { SIGNS } from "./signs.js";
import { parseReceiptJson } from "./receipt-json.js";
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

/** Captured assertions, checked arithmetically without consulting today's Intl/tzdb. */
export interface NatalLocalResolution {
  date: string;
  time: string;
  timeZone: string;
  /** Offset at the resolved instant, minutes east of UTC; fractional for LMT. */
  offsetMinutes: number;
  /** Forward wall-clock shift; positive only for a reported DST gap. */
  gapShiftMinutes: number;
  policy: { fold: "earlier"; gap: "shift-forward" };
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

const CONVENTIONS = Object.freeze({
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
const COVERAGE = Object.freeze({
  assessment: "finite-reference-cases-only",
  broadDateRange: "not-certified",
  angleExclusions: "exact-geographic-poles-and-ecliptic-horizon-coincidence",
  inputSyntax: "not-an-astronomical-accuracy-guarantee"
} as const);

export interface NatalReceipt {
  schema: typeof NATAL_RECEIPT_SCHEMA;
  instant: string;
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
  engine: { name: "@zodiacs/engine"; version: string };
  provenance: (NatalProvenanceClaims & { status: "claimed" }) | null;
  conventions: typeof CONVENTIONS;
  coverage: typeof COVERAGE;
}

export interface NatalEnvelope {
  schema: typeof NATAL_ENVELOPE_SCHEMA;
  /** This draft implements no optional required features; unknown ones fail closed. */
  requiredFeatures: string[];
  receipt: NatalReceipt;
  result: Pick<Chart, "bodies" | "angles" | "houses" | "aspects">;
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
const FLAGS = ["dst-gap", "dst-fold", "lmt", "no-time", "polar-fallback"] as const;
const TIME_FLAGS = ["dst-gap", "dst-fold", "lmt"] as const;
const HOUSE_SYSTEMS = ["whole", "placidus"] as const;
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
function version(value: unknown): string {
  const parsed = text(value, 64);
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/.test(parsed))
    fail("invalid_value");
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

function validateResult(value: unknown): NatalEnvelope["result"] {
  const result = record(value);
  fields(result, ["bodies", "angles", "houses", "aspects"]);
  if (!Array.isArray(result.bodies) || result.bodies.length !== 12) fail("invalid_shape");
  const names = new Set<string>();
  const longitudes = new Map<string, number>();
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
    choice(houses.system, HOUSE_SYSTEMS);
    if (!Array.isArray(houses.cusps) || houses.cusps.length !== 12) fail("invalid_shape");
    const cusps = houses.cusps.map(longitude);
    if (new Set(cusps).size !== 12) fail("inconsistent_result");
    if (houses.system === "whole") {
      const first = Math.floor((angles.asc as number) / 30) * 30;
      if (cusps.some((cusp, index) => !angularClose(cusp, first + index * 30)))
        fail("inconsistent_result");
    } else if (
      !angularClose(cusps[0]!, angles.asc as number) ||
      !angularClose(cusps[9]!, angles.mc as number) ||
      cusps.slice(0, 6).some((cusp, index) => !angularClose(cusps[index + 6]!, cusp + 180))
    )
      fail("inconsistent_result");
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
    bool(aspect.applying);
  }
  return result as unknown as NatalEnvelope["result"];
}

function validateLocal(value: unknown, receipt: NatalReceipt): void {
  if (value === null) {
    if (receipt.reference === "local-noon") fail("invalid_context");
    return;
  }
  const local = record(value);
  fields(local, ["date", "time", "timeZone", "offsetMinutes", "gapShiftMinutes", "policy"]);
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
  if (
    receipt.inputFlags.includes("dst-gap") !== shift > 0 ||
    receipt.inputFlags.includes("lmt") !== Math.abs(offset % 1) > 1e-9
  )
    fail("invalid_context");
  if (receipt.reference === "local-noon" && time !== "12:00") fail("invalid_context");
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
  ]);
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
  const result = validateResult(envelope.result);
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
  if (requested === "whole" && result.houses?.system === "placidus") fail("inconsistent_result");
  const inputFlags = flagList(receipt.inputFlags, TIME_FLAGS);
  const resultFlags = flagList(receipt.resultFlags, FLAGS);
  const expected = [...inputFlags];
  if (!timeKnown) expected.push("no-time");
  if (requested === "placidus" && result.houses?.system === "whole")
    expected.push("polar-fallback");
  if (!sameFlags(expected, resultFlags)) fail("inconsistent_result");
  const engine = record(receipt.engine);
  fields(engine, ["name", "version"]);
  if (engine.name !== "@zodiacs/engine") fail("unsupported_feature");
  const engineVersion = version(engine.version);
  validateProvenance(receipt.provenance, engineVersion);
  validateLocal(receipt.localResolution, receipt as unknown as NatalReceipt);
  fixedFields(receipt.conventions, CONVENTIONS);
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
    fields(source, ["input", "bodies", "angles", "houses", "aspects", "flags", "engineVersion"]);
    const input = record(source.input);
    fields(input, ["utc", "houseSystem", "timeKnown"], ["latitude", "longitude", "flags"]);
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
        engine: { name: "@zodiacs/engine", version: source.engineVersion },
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
        aspects: source.aspects
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
    const { receipt } = checked(envelope);
    return {
      utc: receipt.instant,
      houseSystem: receipt.houses.requested,
      timeKnown: receipt.timeKnown,
      flags: [...receipt.inputFlags],
      ...(receipt.coordinates === null ? {} : { ...receipt.coordinates })
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
