/** Geometry over full ecliptic positions; no independent ephemeris is implied. */

import { checkedBodyLabel } from "./body-label.js";
import type { DeltaT } from "./deltat.js";
import { absolute, compareExact, exactSum, negated, roundedValue } from "./exact.js";
import type { ExactSum } from "./exact.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Site-compatible maximum orb, in degrees, for a pair without Sun or Moon. */
export const DECLINATION_ORB = 1;
/** Site-compatible maximum orb when either identifier is exactly Sun or Moon. */
export const DECLINATION_ORB_LUMINARY = 1.5;

export interface DeclinationOrbPolicy {
  /** Inclusive maximum difference in degrees for an ordinary pair. */
  orb: number;
  /** Inclusive maximum when Sun or Moon is a member of the pair. */
  luminaryOrb: number;
}

export const DEFAULT_DECLINATION_ORB_POLICY: Readonly<DeclinationOrbPolicy> = Object.freeze({
  orb: DECLINATION_ORB,
  luminaryOrb: DECLINATION_ORB_LUMINARY
});

/**
 * Horizontal unit-vector magnitude below which RA is numerically undefined.
 * This is a floating-point singularity convention, not a physical error bound.
 */
export const RA_POLE_TOLERANCE = 32 * Number.EPSILON;
/** Maximum supplied bodies per derived analysis, bounding the pair count. */
export const MAX_DECLINATION_BODIES = 256;

export interface EquatorialCoordinates {
  /** Right ascension in degrees [0,360), or null at a numerical celestial pole. */
  ra: number | null;
  /** Declination in degrees [-90,90], north positive. */
  dec: number;
  /** False exactly when ra is null; consult RA_POLE_TOLERANCE. */
  raDefined: boolean;
}

export interface DeclinationBody {
  body: string;
  /** Ecliptic longitude in degrees; finite values wrap into [0,360). */
  lon: number;
  /** Full ecliptic latitude in degrees [-90,90], not an assumed zero. */
  lat: number;
}

export interface DeclinationRow extends DeclinationBody, EquatorialCoordinates {
  /**
   * Strictly |declination| > the supplied true obliquity, with no uncertainty
   * allowance. A row labelled exactly "Sun" is never out of bounds: the Sun
   * defines the bound, although its small ecliptic latitude can put its
   * computed declination a fraction of an arcsecond beyond it at a solstice.
   */
  outOfBounds: boolean;
}

export type DeclinationAspectType = "parallel" | "contraparallel";

export interface DeclinationAspect {
  a: string;
  b: string;
  type: DeclinationAspectType;
  /**
   * Degrees from the selected parallel or contraparallel: the exact
   * min(|decA − decB|, |decA + decB|) of the two declination doubles,
   * rounded to the nearest double.
   */
  orb: number;
  /** Inclusive maximum allowed by the explicit pair policy. */
  maximumOrb: number;
  decA: number;
  decB: number;
  /** Ecliptic-longitude separation in degrees [0,180], not sky separation; rounded once. */
  separation: number;
}

export interface Declinations {
  /**
   * True obliquity of date in degrees: the bound for out-of-bounds flags. From
   * chartDeclinations it is astronomy-engine's (IAU 2006 mean obliquity plus
   * IAU 2000B nutation in obliquity) at the chart instant on its TT clock;
   * elsewhere it is the value supplied.
   */
  trueObliquity: number;
  rows: DeclinationRow[];
  aspects: DeclinationAspect[];
  orbPolicy: DeclinationOrbPolicy;
  convention: "true-equator-and-equinox-of-date; full-ecliptic-longitude-and-latitude";
  /** This derived feature is not asserted to be covered by the natal receipt. */
  receiptScope: "not-included-in-natal-receipt";
}

export interface ChartDeclinations extends Declinations {
  /** Observation instant, retaining the engine's UTC-label/UT1 convention. */
  utc: string;
  /** The evaluated provider Delta-T used to obtain true obliquity. */
  deltaT: DeltaT;
}

function finite(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`);
  }
}

function obliquity(value: number): void {
  finite(value, "true obliquity");
  if (value < 0 || value > 90) throw new RangeError("true obliquity must be in [0,90] degrees.");
}

function normalize(value: number): number {
  const remainder = value % 360;
  if (remainder === 0) return 0;
  return remainder > 0 ? remainder : Math.min(remainder + 360, 359.99999999999994);
}

function policyOf(policy: Readonly<DeclinationOrbPolicy>): DeclinationOrbPolicy {
  const fields = dataFields(policy, "declination orb policy");
  if (Object.keys(fields).length !== 2 || !Object.hasOwn(fields, "orb") || !Object.hasOwn(fields, "luminaryOrb")) {
    throw new RangeError("declination orb policy requires only orb and luminaryOrb.");
  }
  const checked = { orb: fields.orb!.value as number, luminaryOrb: fields.luminaryOrb!.value as number };
  for (const key of ["orb", "luminaryOrb"] as const) {
    finite(checked[key], `declination policy ${key}`);
    if (checked[key] < 0 || checked[key] > 90) throw new RangeError("declination orbs must be in [0,90] degrees.");
  }
  return checked;
}

function dataFields(value: unknown, label: string): Record<string, PropertyDescriptor> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new RangeError(`${label} must be a plain data object.`);
  }
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== Object.keys(fields).length ||
      Object.values(fields).some(field => !Object.hasOwn(field, "value") || !field.enumerable)) {
    throw new RangeError(`${label} must contain only enumerable data properties.`);
  }
  return fields;
}

/** The configured-aspect label rule: nonempty, trimmed, at most 80 characters, no control characters. */
function bodyName(body: string): void {
  checkedBodyLabel(body);
}

/**
 * Rotate full ecliptic longitude/latitude into the equator associated with the
 * explicitly supplied true obliquity. Both angles and the obliquity are degrees.
 * The source frame/corrections must already be appropriate: this rotation does
 * not add light time, aberration, precession or an ephemeris precision guarantee.
 */
export function eclipticToEquatorial(
  longitudeDeg: number,
  latitudeDeg: number,
  trueObliquityDeg: number
): EquatorialCoordinates {
  finite(longitudeDeg, "ecliptic longitude");
  finite(latitudeDeg, "ecliptic latitude");
  if (latitudeDeg < -90 || latitudeDeg > 90) throw new RangeError("ecliptic latitude must be in [-90,90] degrees.");
  obliquity(trueObliquityDeg);
  const lon = normalize(longitudeDeg) * DEG;
  const lat = latitudeDeg * DEG;
  const tilt = trueObliquityDeg * DEG;
  const cosLat = Math.cos(lat);
  const x = cosLat * Math.cos(lon);
  const y = cosLat * Math.sin(lon) * Math.cos(tilt) - Math.sin(lat) * Math.sin(tilt);
  const z = cosLat * Math.sin(lon) * Math.sin(tilt) + Math.sin(lat) * Math.cos(tilt);
  const horizontal = Math.hypot(x, y);
  const raDefined = horizontal > RA_POLE_TOLERANCE;
  let dec = trueObliquityDeg === 0 ? latitudeDeg : Math.atan2(z, horizontal) * RAD;
  // Exact geometric envelope for points on the ecliptic. Prevent one-ULP
  // roundoff at a solstice from falsely producing an out-of-bounds flag.
  if (latitudeDeg === 0) dec = Math.max(-trueObliquityDeg, Math.min(trueObliquityDeg, dec));
  return {
    ra: raDefined ? (trueObliquityDeg === 0 ? normalize(longitudeDeg) : normalize(Math.atan2(y, x) * RAD)) : null,
    dec: dec === 0 ? 0 : dec,
    raDefined
  };
}

/** Declination from full longitude/latitude and explicitly supplied obliquity. */
export function declinationOf(lon: number, lat: number, trueObliquity: number): number {
  return eclipticToEquatorial(lon, lat, trueObliquity).dec;
}

/** Inclusive pair allowance; the returned value makes the applied policy explicit. */
export function declinationOrb(
  a: string,
  b: string,
  policy: Readonly<DeclinationOrbPolicy> = DEFAULT_DECLINATION_ORB_POLICY
): number {
  bodyName(a);
  bodyName(b);
  const checked = policyOf(policy);
  return a === "Sun" || a === "Moon" || b === "Sun" || b === "Moon" ? checked.luminaryOrb : checked.orb;
}

function placeBodies(bodies: readonly DeclinationBody[], trueObliquity: number): DeclinationRow[] {
  obliquity(trueObliquity);
  if (!Array.isArray(bodies) || Object.getPrototypeOf(bodies) !== Array.prototype) {
    throw new RangeError("declination bodies must be a standard array.");
  }
  const fields: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(bodies as object);
  const length = fields.length!.value as number;
  if (length > MAX_DECLINATION_BODIES || Reflect.ownKeys(bodies).length !== length + 1) {
    throw new RangeError("declination bodies must be dense, undecorated, and contain at most 256 entries.");
  }
  const seen = new Set<string>();
  const placed: DeclinationRow[] = [];
  for (let index = 0; index < length; index += 1) {
    const field = fields[String(index)];
    if (!field || !Object.hasOwn(field, "value") || !field.enumerable) {
      throw new RangeError("declination bodies must contain only enumerable data entries.");
    }
    const source = dataFields(field.value, "declination body");
    const body = {body: source.body?.value as string, lon: source.lon?.value as number, lat: source.lat?.value as number};
    bodyName(body.body);
    if (seen.has(body.body)) throw new RangeError("duplicate declination body identifier.");
    seen.add(body.body);
    const position = eclipticToEquatorial(body.lon, body.lat, trueObliquity);
    // The obliquity is the Sun's own greatest declination on the ecliptic, so
    // the Sun defines the bound and is never beyond it.
    placed.push({ body: body.body, lon: normalize(body.lon), lat: body.lat, ...position,
      outOfBounds: body.body !== "Sun" && Math.abs(position.dec) > trueObliquity });
  }
  return placed;
}

/** Exact |a − b| of two longitudes in [0,360), taken the short way round and rounded once. */
function longitudeSeparation(a: number, b: number): number {
  const difference = absolute(exactSum(a, -b));
  return roundedValue(compareExact(difference, 180) > 0 ? exactSum(360, negated(difference)) : difference);
}

/**
 * Each declination double is taken as exact. The parallel and contraparallel
 * distances, the choice between them, the inclusive orb test and the order
 * are decided on exact values; only the reported orb is rounded.
 */
function aspectsFor(rows: readonly DeclinationRow[], policy: Readonly<DeclinationOrbPolicy>): DeclinationAspect[] {
  const found: { aspect: DeclinationAspect; exactOrb: ExactSum }[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i]!;
      const b = rows[j]!;
      const parallel = absolute(exactSum(a.dec, -b.dec));
      const contraparallel = absolute(exactSum(a.dec, b.dec));
      const isParallel = compareExact(parallel, contraparallel) <= 0;
      const exactOrb = isParallel ? parallel : contraparallel;
      const maximumOrb = declinationOrb(a.body, b.body, policy);
      if (compareExact(exactOrb, maximumOrb) > 0) continue;
      found.push({exactOrb, aspect: {a: a.body, b: b.body, type: isParallel ? "parallel" : "contraparallel",
        orb: roundedValue(exactOrb), maximumOrb, decA: a.dec, decB: b.dec, separation: longitudeSeparation(a.lon, b.lon)}});
    }
  }
  // Array sort is stable: equal exact orbs keep input pair order.
  return found.sort((x, y) => compareExact(x.exactOrb, y.exactOrb)).map(entry => entry.aspect);
}

/**
 * Site-compatible nearest declination aspect for each supplied pair. Inclusive
 * orbs, decided exactly on the declination doubles; a parallel wins an exact
 * tie at the equator. Every supplied body is eligible, including nodes; no
 * longitude-aspect body filter is inferred.
 */
export function findDeclinationAspects(
  bodies: readonly DeclinationBody[],
  trueObliquity: number,
  policy: Readonly<DeclinationOrbPolicy> = DEFAULT_DECLINATION_ORB_POLICY
): DeclinationAspect[] {
  const checked = policyOf(policy);
  return aspectsFor(placeBodies(bodies, trueObliquity), checked);
}

/** Pure derived output; the chart wrapper supplies a provider obliquity of date. */
export function declinationsForBodies(
  bodies: readonly DeclinationBody[],
  trueObliquity: number,
  policy: Readonly<DeclinationOrbPolicy> = DEFAULT_DECLINATION_ORB_POLICY
): Declinations {
  const checked = policyOf(policy);
  const rows = placeBodies(bodies, trueObliquity);
  return {trueObliquity, rows, aspects: aspectsFor(rows, checked), orbPolicy: checked,
    convention: "true-equator-and-equinox-of-date; full-ecliptic-longitude-and-latitude",
    receiptScope: "not-included-in-natal-receipt"};
}
