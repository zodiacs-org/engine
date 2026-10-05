/**
 * Ayanamsas: the arc from the sidereal zero point to the equinox of date.
 *
 * Every definition yields a mean ayanamsa, referred to the mean equinox and
 * ecliptic of date on the engine's own precession (IAU 2006, as
 * astronomy-engine implements it). The true ayanamsa adds the engine's
 * nutation in longitude, the same Δψ that is in every tropical longitude the
 * engine reports, so tropical − true = mean-equinox longitude − mean.
 * docs/vedic.md gives each definition's source and the construction; the
 * measurements are in docs/evidence/vedic-2026-09-28.
 */
import { BaryState, Body, HelioVector } from "astronomy-engine";
import type { AstroTime } from "astronomy-engine";

import { dateFrom } from "../date-input.js";
import type { DeltaT } from "../deltat.js";
import { onChartClock } from "../ephemeris.js";
import { eclipticFrame, meanEcliptic } from "../frame.js";
import type { EclipticFrame } from "../frame.js";
import { REFERENCE_SPAN, outsideReferenceSpan } from "../reference-span.js";
import { TIME_SCALE_NAMES, timeBasis } from "../time-scale.js";
import type { TimeScale, TimeScaleName } from "../time-scale.js";
import type { DateInput } from "../types.js";

const DEG = Math.PI / 180;
const ARCSEC = DEG / 3600;
const MAS = ARCSEC / 1000;
const J2000 = 2_451_545;
const DAY_MS = 86_400_000;
const UNIX_JD = 2_440_587.5;
const JULIAN_YEAR = 365.25;
const AU_KM = 149_597_870.7;
const C_AU_PER_DAY = (299_792.458 * 86_400) / AU_KM;
/** 2GM/c² for the Sun, in au (IERS Conventions 2010, table 1.1). */
const SUN_SCHWARZSCHILD_AU = 1.97412574336e-8;
/** REFERENCE_SPAN as Julian dates. */
const SPAN_FROM_JD = UNIX_JD + Date.parse(REFERENCE_SPAN.from) / DAY_MS;
const SPAN_TO_JD = UNIX_JD + Date.parse(REFERENCE_SPAN.to) / DAY_MS;

/** The precession model of an epoch value: the engine's IAU 2006, Newcomb's (Kinoshita 1975) or IAU 1976. */
export type AyanamsaPrecessionModel = "engine" | "newcomb" | "iau1976";

/** The built-in ayanamsas: the keys of AYANAMSAS. */
export type AyanamsaName =
  | "lahiri"
  | "fagan-bradley"
  | "krishnamurti"
  | "raman"
  | "yukteswar"
  | "true-chitra"
  | "true-revati"
  | "true-pushya"
  | "galactic-center";

interface Definition {
  readonly name: string;
  readonly label: string;
  /** Short citation; docs/vedic.md has the full one. */
  readonly source: string;
}

/**
 * A mean `value` (degrees) at TT Julian date `epochTT`, computed with
 * `model`'s precession. The engine holds the zodiac where that model puts it
 * at J2000.0 and carries it with its own; with an older model its value at
 * the epoch differs from `value`.
 */
export interface EpochAyanamsa extends Definition {
  readonly kind: "epoch";
  readonly epochTT: number;
  readonly value: number;
  readonly model: AyanamsaPrecessionModel;
}

/** `value` degrees at `epochTT` plus `rate` arcseconds per Julian year (365.25 days of TT). */
export interface LinearAyanamsa extends Definition {
  readonly kind: "linear";
  readonly epochTT: number;
  readonly value: number;
  readonly rate: number;
}

/** A catalogue star, ICRS, with its space motion. */
export interface CatalogueStar {
  readonly name: string;
  /** Right ascension and declination at `epochTT`, degrees. */
  readonly ra: number;
  readonly dec: number;
  readonly epochTT: number;
  /** Proper motion, mas/yr; `pmRa` is μα·cos δ. */
  readonly pmRa: number;
  readonly pmDec: number;
  /** Parallax, mas (0: at infinity). */
  readonly parallax: number;
  /** Radial velocity, km/s. */
  readonly radialVelocity: number;
}

/** The star's apparent geocentric place sits at sidereal `longitude` degrees at every instant. */
export interface StarAyanamsa extends Definition {
  readonly kind: "star";
  readonly star: CatalogueStar;
  readonly longitude: number;
}

/** A definition; functions accept only AYANAMSAS entries and userAyanamsa results. */
export type AyanamsaDefinition = EpochAyanamsa | LinearAyanamsa | StarAyanamsa;

const DEFINITIONS = new WeakSet<object>();
function registered<T extends AyanamsaDefinition>(definition: T): T {
  const frozen = Object.freeze(definition);
  DEFINITIONS.add(frozen);
  return frozen;
}

const HIPPARCOS_EPOCH = 2_448_349.0625; // J1991.25
const HIP2007 = "Hipparcos 2007 (I/311)";

function star(name: string, ra: number, dec: number, pmRa: number, pmDec: number,
  parallax: number, radialVelocity: number, epochTT = HIPPARCOS_EPOCH): CatalogueStar {
  return Object.freeze({ name, ra, dec, epochTT, pmRa, pmDec, parallax, radialVelocity });
}

/** The built-in definitions. docs/vedic.md cites each in full. */
export const AYANAMSAS: Readonly<Record<AyanamsaName, AyanamsaDefinition>> = Object.freeze({
  lahiri: registered({
    kind: "epoch", name: "lahiri", label: "Lahiri (Chitrapaksha)",
    // True 23°15′00.658″ less the IAU 1980 nutation in longitude at that instant, +16.768927″.
    epochTT: 2_435_553.5, value: 23 + 15 / 60 + (0.658 - 16.768927) / 3600, model: "iau1976",
    source: "Indian Astronomical Ephemeris: 23°15′00.658″ true at 1956-03-21 0h TT (1989, p. 556)"
  }),
  "fagan-bradley": registered({
    kind: "epoch", name: "fagan-bradley", label: "Fagan–Bradley",
    epochTT: 2_433_282.42345905, value: 24 + 2 / 60 + 31.36 / 3600, model: "newcomb",
    source: "Synetic vernal point 335°57′28.64″ at B1950.0 (Astro*Index)"
  }),
  krishnamurti: registered({
    kind: "epoch", name: "krishnamurti", label: "Krishnamurti (KP)",
    epochTT: 2_415_020.5, value: 22.363889, model: "newcomb",
    source: "22°21′50″ at 1900-01-01, fitted to KP Reader 1's table (Hand, Dawson)"
  }),
  raman: registered({
    kind: "linear", name: "raman", label: "Raman",
    epochTT: J2000 + (397 - 2000) * JULIAN_YEAR, value: 0, rate: 50 + 1 / 3,
    source: "B. V. Raman, A Manual of Hindu Astrology (1935) §49"
  }),
  yukteswar: registered({
    kind: "linear", name: "yukteswar", label: "Sri Yukteswar",
    epochTT: 2_412_908.1244, value: 20 + 54 / 60 + 36 / 3600, rate: 54,
    source: "Sri Yukteswar, The Holy Science (1894), Introduction"
  }),
  "true-chitra": registered({
    kind: "star", name: "true-chitra", label: "True Chitra (Spica at 180°)", longitude: 180,
    star: star("Spica (α Vir, HIP 65474)", 201.29835228, -11.16124494, -42.35, -30.67, 13.06, -3.31),
    source: `Surya Siddhanta VIII; ${HIP2007}`
  }),
  "true-revati": registered({
    kind: "star", name: "true-revati", label: "True Revati (ζ Psc at 359°50′)", longitude: 359 + 50 / 60,
    star: star("Revati (ζ Psc A, HIP 5737)", 18.43250842, 7.57548938, 145, -55.69, 18.76, 15),
    source: `Surya Siddhanta VIII; ${HIP2007}`
  }),
  "true-pushya": registered({
    kind: "star", name: "true-pushya", label: "True Pushya (δ Cnc at 106°)", longitude: 106,
    star: star("Pushya (δ Cnc, HIP 42911)", 131.17129191, 18.15486373, -17.67, -229.26, 24.98, 17.14),
    source: `P. V. R. Narasimha Rao (2013); ${HIP2007}`
  }),
  "galactic-center": registered({
    kind: "star", name: "galactic-center", label: "Galactic Center at 0° Sagittarius", longitude: 240,
    star: star("Sgr A*", 266.416816625, -(29 + 28.1699 / 3600), -3.151, -5.547, 0, 0, J2000),
    source: "Sgr A*: SIMBAD ICRS position; Reid & Brunthaler 2004"
  })
});

function requireFinite(value: unknown, low: number, high: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) {
    throw new RangeError(`${label} must be a finite number in [${low}, ${high}].`);
  }
  return value;
}

/** Input to userAyanamsa. */
export interface UserAyanamsaInput {
  /** Lowercase identifier, at most 64 characters, not a built-in name; default "user". */
  readonly name?: string;
  /** When `value` holds: a TT Julian date within the Date range, or a UTC instant, read on the engine's time basis. */
  readonly epoch: DateInput | { readonly julianDateTT: number };
  /** The mean ayanamsa at `epoch` as `model` computes it, degrees, in [−360, 360]. */
  readonly value: number;
  /** Arcseconds per Julian year, in [−3600, 3600]: a linear ayanamsa. */
  readonly rate?: number;
  /**
   * Without `rate`: the model `value` was computed with, default "engine"
   * (`value` then holds at `epoch`); an older model's zodiac is held at
   * J2000.0, as for the built-ins.
   */
  readonly model?: AyanamsaPrecessionModel;
}

const EPOCH_JD_LIMIT = 1e8; // days either side of 1970-01-01, the Date range

/** A caller's ayanamsa, frozen. Refuses a built-in name, both `rate` and `model`, and out-of-range values. */
export function userAyanamsa(input: UserAyanamsaInput): AyanamsaDefinition {
  if (!input || typeof input !== "object") throw new RangeError("userAyanamsa needs an input object.");
  const name = input.name ?? "user";
  if (typeof name !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(name) || Object.hasOwn(AYANAMSAS, name)) {
    throw new RangeError("Ayanamsa name must be a new lowercase identifier of at most 64 characters.");
  }
  const epoch = input.epoch;
  let epochTT: number;
  if (epoch && typeof epoch === "object" && !(epoch instanceof Date)) {
    epochTT = requireFinite(epoch.julianDateTT, UNIX_JD - EPOCH_JD_LIMIT, UNIX_JD + EPOCH_JD_LIMIT, "epoch.julianDateTT");
  } else {
    const at = dateFrom(epoch as DateInput, "epoch");
    epochTT = J2000 + timeBasis(at.getTime(), "utc").ttDays;
  }
  const value = requireFinite(input.value, -360, 360, "value");
  const common = { name, label: `user: ${name}`, source: "caller-defined", epochTT, value };
  if (input.rate !== undefined) {
    if (input.model !== undefined) throw new RangeError("Give either a rate or a precession model, not both.");
    return registered({ kind: "linear", ...common, rate: requireFinite(input.rate, -3600, 3600, "rate") });
  }
  const model = input.model ?? "engine";
  if (model !== "engine" && model !== "newcomb" && model !== "iau1976") {
    throw new RangeError("model must be engine, newcomb or iau1976.");
  }
  return registered({ kind: "epoch", ...common, model });
}

/** Internal: the definition a name or object stands for; RangeError otherwise. */
export function definitionOf(definition: AyanamsaName | AyanamsaDefinition): AyanamsaDefinition {
  if (typeof definition === "string") {
    if (!Object.hasOwn(AYANAMSAS, definition)) throw new RangeError(`Unknown ayanamsa: ${definition}.`);
    return AYANAMSAS[definition];
  }
  if (!definition || typeof definition !== "object" || !DEFINITIONS.has(definition)) {
    throw new RangeError("An ayanamsa must be a built-in name, an AYANAMSAS entry or a userAyanamsa result.");
  }
  return definition;
}

// ── Frames ──────────────────────────────────────────────────────────────────

/** Longitude (radians) of an EQJ direction on the mean ecliptic and equinox of a frame's date (src/frame.ts). */
function longitudeIn(frame: EclipticFrame, x: number, y: number, z: number): number {
  const [ex, ey] = meanEcliptic(frame, x, y, z);
  return Math.atan2(ey, ex);
}

/**
 * Longitude (radians) of the J2000.0 equinox on the mean ecliptic of `jd`
 * (TT) in an older model: equatorial precession angles ζ, z, θ from J2000.0
 * and that model's obliquity. Newcomb: Kinoshita (1975, SAO Special Report
 * 364) table 3, tropical centuries from B1850.0. IAU 1976: Lieske et al.
 * (1977, A&A 58, 1).
 */
function olderModelLongitude(model: "newcomb" | "iau1976", jd: number): number {
  let zeta: number, z: number, theta: number, eps: number;
  if (model === "newcomb") {
    const B1850 = 2_396_758.20358095;
    const CENTURY = 36_524.2198781;
    const t = (J2000 - B1850) / CENTURY;
    const h = (jd - J2000) / CENTURY;
    const sum = ((4607.1096 + t * (2.7944 + 0.000118 * t)) + (1.3972 + 0.000118 * t + 0.03632 * h) * h) * h;
    const diff = ((0.79236 + 0.000656 * t) + 0.000328 * h) * h * h;
    zeta = (sum - diff) / 2;
    z = (sum + diff) / 2;
    theta = ((2005.1125 - t * (0.85294 + 0.000365 * t)) + (-0.42647 - 0.000365 * t - 0.041802 * h) * h) * h;
    const e = (jd - B1850) / CENTURY;
    eps = 84_451.68 + e * (-46.837 + e * (-0.008752 + 0.00183 * e));
  } else {
    const t = (jd - J2000) / 36_525;
    zeta = t * (2306.2181 + t * (0.30188 + 0.017998 * t));
    z = t * (2306.2181 + t * (1.09468 + 0.018203 * t));
    theta = t * (2004.3109 + t * (-0.42665 - 0.041833 * t));
    eps = 84_381.448 + t * (-46.815 + t * (-0.00059 + 0.001813 * t));
  }
  [zeta, z, theta, eps] = [zeta * ARCSEC, z * ARCSEC, theta * ARCSEC, eps * ARCSEC];
  // (R3(−z) R2(θ) R3(−ζ)) x̂, then onto the ecliptic with R1(ε).
  const x = Math.cos(z) * Math.cos(zeta) * Math.cos(theta) - Math.sin(z) * Math.sin(zeta);
  const y = Math.sin(z) * Math.cos(zeta) * Math.cos(theta) + Math.cos(z) * Math.sin(zeta);
  const w = Math.cos(zeta) * Math.sin(theta);
  return Math.atan2(Math.cos(eps) * y + Math.sin(eps) * w, x);
}

interface EpochFrame {
  /** EQJ → mean ecliptic of the epoch. */
  readonly frame: EclipticFrame;
  /** The J2000.0 hold: the engine's minus the model's longitude of the J2000.0 equinox, radians. */
  readonly correction: number;
}

const FRAMES = new WeakMap<object, EpochFrame>();

/** The epoch's frame depends on its TT alone, and is built once per definition. */
function epochFrame(definition: EpochAyanamsa): EpochFrame {
  let epoch = FRAMES.get(definition);
  if (epoch === undefined) {
    const frame = eclipticFrame(definition.epochTT - J2000);
    const correction = definition.model === "engine" ? 0
      : longitudeIn(frame, 1, 0, 0) - olderModelLongitude(definition.model, definition.epochTT);
    epoch = Object.freeze({ frame, correction });
    FRAMES.set(definition, epoch);
  }
  return epoch;
}

type V3 = [number, number, number];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a: V3): V3 => scale(a, 1 / Math.sqrt(dot(a, a)));

/** Frame bias ICRS → J2000 mean equator: R1(−η0) R2(ξ0) R3(dα0), IERS Conventions 2010 eq. 5.21. */
function bias(v: V3): V3 {
  const [xi, eta, alpha] = [-16.617 * MAS, -6.8192 * MAS, -14.6 * MAS];
  const x1 = v[0] + alpha * v[1];
  const y1 = v[1] - alpha * v[0];
  const x2 = x1 - xi * v[2];
  const z2 = v[2] + xi * x1;
  return [x2, y1 - eta * z2, z2 + eta * y1];
}

/**
 * Apparent geocentric direction of a catalogue star, EQJ axes, and the star's
 * angle from the Sun before the deflection and aberration, degrees.
 */
function apparentStar(s: CatalogueStar, time: AstroTime): { readonly direction: V3; readonly elongation: number } {
  const ra = s.ra * DEG;
  const dec = s.dec * DEG;
  const p0 = bias([Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]);
  const east = bias([-Math.sin(ra), Math.cos(ra), 0]);
  const north = bias([-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)]);
  const days = time.tt + J2000 - s.epochTT;
  const pm = (k: number): number => (k * MAS) / JULIAN_YEAR; // rad/day
  const bary = BaryState(Body.Earth, time);
  let q: V3;
  if (s.parallax > 0) {
    const d = 1 / (s.parallax * MAS); // au
    const rv = (s.radialVelocity * 86_400) / AU_KM; // au/day
    q = [0, 1, 2].map((i) => d * p0[i]! + days * (d * (pm(s.pmRa) * east[i]! + pm(s.pmDec) * north[i]!) + rv * p0[i]!)) as V3;
    q = [q[0] - bary.x, q[1] - bary.y, q[2] - bary.z];
  } else {
    q = [0, 1, 2].map((i) => p0[i]! + days * (pm(s.pmRa) * east[i]! + pm(s.pmDec) * north[i]!)) as V3;
  }
  let p = unit(q);
  // Deflection by the Sun: p + (2GM/c²E)(e − (p·e)p)/(1 + p·e), e from Sun to Earth.
  const helio = HelioVector(Body.Earth, time);
  const em = Math.hypot(helio.x, helio.y, helio.z);
  const e: V3 = [helio.x / em, helio.y / em, helio.z / em];
  const pe = dot(p, e);
  // The Sun is at −e from the Earth.
  const elongation = Math.acos(Math.min(1, Math.max(-1, -pe))) / DEG;
  const w = SUN_SCHWARZSCHILD_AU / em / Math.max(1 + pe, 1e-6 / Math.max(em * em, 1));
  p = unit([p[0] + w * (e[0] - pe * p[0]), p[1] + w * (e[1] - pe * p[1]), p[2] + w * (e[2] - pe * p[2])]);
  // Annual aberration, relativistic: p√(1−v²) + (1 + p·v/(1 + √(1−v²)))v, normalised.
  const v: V3 = [bary.vx / C_AU_PER_DAY, bary.vy / C_AU_PER_DAY, bary.vz / C_AU_PER_DAY];
  const root = Math.sqrt(1 - dot(v, v));
  const k = 1 + dot(p, v) / (1 + root);
  return { direction: unit([p[0] * root + k * v[0], p[1] * root + k * v[1], p[2] * root + k * v[2]]), elongation };
}

/** The mean ayanamsa, degrees, not yet wrapped; and for a star definition, the star's angle from the Sun. */
function meanAyanamsa(
  definition: AyanamsaDefinition,
  time: AstroTime,
  frame: EpochFrame | undefined
): { readonly value: number; readonly elongation: number | null } {
  switch (definition.kind) {
    case "epoch": {
      // The mean equinox of date, as an EQJ direction, is the first row of its frame.
      const { frame: at, correction } = frame!;
      const [x, y, z] = eclipticFrame(time.tt).rows;
      return { value: definition.value + (correction - longitudeIn(at, x!, y!, z!)) / DEG, elongation: null };
    }
    case "linear":
      // Days from the epoch counted from TT days since J2000.0: a Julian date near 2.4 million rebuilt
      // from them is held only to about 5e-10 day, which a rate of 3,600″ a year turns into 2e-6″ a day.
      return {
        value: definition.value + (definition.rate * (time.tt - (definition.epochTT - J2000))) / JULIAN_YEAR / 3600,
        elongation: null
      };
    case "star": {
      const { direction: [x, y, z], elongation } = apparentStar(definition.star, time);
      return { value: longitudeIn(eclipticFrame(time.tt), x, y, z) / DEG - definition.longitude, elongation };
    }
  }
}

/** Wrap degrees into (−180, 180]. */
function wrap(value: number): number {
  const r = value % 360;
  return r > 180 ? r - 360 : r <= -180 ? r + 360 : r;
}

/**
 * Internal: a resolved definition's mean ayanamsa, the nutation in longitude
 * and the true ayanamsa, degrees, at an astronomy-engine time, exactly as
 * `ayanamsa` computes them; and for a star definition, the star's angle from
 * the Sun, degrees, null otherwise. The calc entry subtracts them on its own
 * clock, and takes the angle for the ayanamsa's bound.
 */
export function ayanamsaAt(
  definition: AyanamsaDefinition,
  time: AstroTime
): { readonly mean: number; readonly nutation: number; readonly true: number; readonly elongation: number | null } {
  const frame = definition.kind === "epoch" ? epochFrame(definition) : undefined;
  const { value, elongation } = meanAyanamsa(definition, time, frame);
  const mean = wrap(value);
  const nutation = eclipticFrame(time.tt).tilt.dpsi / 3600;
  return { mean, nutation, true: wrap(mean + nutation), elongation };
}

/** An ayanamsa at an instant; made only by `ayanamsa`. Degrees throughout. */
export interface AyanamsaValue {
  /** The definition's name. */
  readonly ayanamsa: string;
  /** The instant as given, ISO 8601, on the scale `timeScale.input` names (UTC unless the options say otherwise). */
  readonly utc: string;
  /** How the instant became UT1 and TT, as a chart's `timeScale` (docs/time.md). */
  readonly timeScale: TimeScale;
  readonly julianDateTT: number;
  /** The ΔT (TT − UT1) the instant was read with: its time basis's, or the pin. */
  readonly deltaT: DeltaT;
  /** Referred to the mean equinox and ecliptic of date, in (−180, 180]. */
  readonly mean: number;
  /** The engine's nutation in longitude Δψ. */
  readonly nutation: number;
  /** mean + nutation: subtract it from the engine's tropical longitudes. */
  readonly true: number;
  /** "outside-reference-span" when the instant, or an epoch definition's epoch, is outside REFERENCE_SPAN. */
  readonly flags: readonly "outside-reference-span"[];
}

/** Internal: true for an epoch definition whose epoch is outside REFERENCE_SPAN. */
export function outsideSpanEpoch(definition: AyanamsaDefinition): boolean {
  return definition.kind === "epoch" && !(definition.epochTT >= SPAN_FROM_JD && definition.epochTT < SPAN_TO_JD);
}

/** Each value `ayanamsa` made, with the UTC instant of its time basis (ms). */
const VALUES = new WeakMap<object, number>();

/** True for an AyanamsaValue made by `ayanamsa`. */
export function isAyanamsaValue(value: unknown): value is AyanamsaValue {
  return typeof value === "object" && value !== null && VALUES.has(value);
}

/**
 * Internal: the UTC instant of a value's time basis, ISO 8601, whole
 * milliseconds, as the timing entry reads a chart's instant (`utcOf`). For a
 * value on UTC it is `utc`; on UT1 or TT, the UTC instant the basis gives.
 */
export function utcInstantOf(value: AyanamsaValue): string {
  const ms = VALUES.get(value);
  if (ms === undefined) throw new RangeError("ayanamsa must be a value returned by ayanamsa().");
  return new Date(Math.round(ms)).toISOString();
}

/** Options for ayanamsa. */
export interface AyanamsaOptions {
  /** A fixed ΔT (TT − UT1) in seconds, as BirthInput.deltaT; the engine's time basis when absent. */
  readonly deltaT?: number;
  /** The scale the instant is on, as BirthInput.timeScale: "utc" (default), "ut1" or "tt". */
  readonly timeScale?: TimeScaleName;
}

/**
 * The mean and true ayanamsa of a definition at an instant, read as a chart
 * reads its own: on the engine's time basis, or a pinned ΔT, and refused
 * outside EPHEMERIS_SPAN. `true` adds the engine's nutation in longitude (IAU
 * 2000B, all 77 terms), which cancels from sidereal longitudes.
 */
export function ayanamsa(
  definition: AyanamsaName | AyanamsaDefinition,
  at: DateInput,
  options: AyanamsaOptions = {}
): AyanamsaValue {
  const resolved = definitionOf(definition);
  const date = dateFrom(at, "at");
  const pin = options?.deltaT;
  if (pin !== undefined) requireFinite(pin, -1e10, 1e10, "deltaT");
  const scale: unknown = options?.timeScale;
  if (scale !== undefined && !TIME_SCALE_NAMES.includes(scale as never)) {
    throw new RangeError('timeScale must be "utc", "ut1" or "tt".');
  }
  // Built here, outside the clock, as before; ayanamsaAt finds it in the cache.
  if (resolved.kind === "epoch") epochFrame(resolved);
  const outside = outsideReferenceSpan(date) || outsideSpanEpoch(resolved);
  return onChartClock(date.getTime(), (scale ?? "utc") as TimeScaleName, pin, (time, basis) => {
    const { mean, nutation, true: trueValue } = ayanamsaAt(resolved, time);
    const { ut1MinusUtc, leapSeconds } = basis.timeScale;
    const value: AyanamsaValue = Object.freeze({
      ayanamsa: resolved.name,
      utc: date.toISOString(),
      timeScale: Object.freeze({
        ...basis.timeScale,
        ut1MinusUtc: ut1MinusUtc && Object.freeze({ ...ut1MinusUtc }),
        leapSeconds: leapSeconds && Object.freeze({ ...leapSeconds })
      }),
      julianDateTT: time.tt + J2000,
      deltaT: Object.freeze({ ...basis.deltaT }),
      mean,
      nutation,
      true: trueValue,
      flags: Object.freeze(outside ? ["outside-reference-span" as const] : [])
    });
    VALUES.set(value, basis.utcMs);
    return value;
  });
}
