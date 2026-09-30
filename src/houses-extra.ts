/**
 * `@zodiacs/engine/houses`: the house position of a body with ecliptic
 * latitude, the co-ascendants and the polar ascendant, and the speeds of the
 * cusps and the angles. Every function takes the `AngleInput` that
 * `computeAngles` and `computeHouses` take. The entry imports no ephemeris
 * and no module of the root entry. docs/houses.md gives each definition and
 * its source.
 *
 * @module
 */
import type { AngleInput } from "./houses.js";
import type { Angles, HouseSystem } from "./types.js";

export type { AngleInput } from "./houses.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/**
 * The rate of sidereal time: degrees of RAMC per day of UT1,
 * 360.98564736629 (J. Meeus, Astronomical Algorithms, 2nd ed., eq. 12.4).
 * Speeds are derivatives with respect to the RAMC times this rate.
 */
export const SIDEREAL_RATE = 360.98564736629;

const SYSTEMS: readonly HouseSystem[] = [
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
];

/** A body's ecliptic longitude and latitude, degrees; the latitude defaults to 0. */
export interface EclipticPosition {
  lon: number;
  lat?: number;
}

/** The four points of Swiss Ephemeris's `ascmc[4]` to `ascmc[7]`, degrees in [0, 360). */
export interface CoAscendants {
  /** The ecliptic point at right ascension RAMC + 90°: the ascendant at latitude 0. */
  equatorialAscendant: number;
  /** Walter Koch's: the ascendant for RAMC + 180° at the latitude, plus 180°. */
  kochCoAscendant: number;
  /** Michael Munkasey's: the ascendant for the RAMC at the colatitude. */
  munkaseyCoAscendant: number;
  /** Michael Munkasey's polar ascendant: the ascendant for RAMC + 180° at the latitude. */
  polarAscendant: number;
}

/** Speeds in degrees per day, at the sidereal rate, with latitude and obliquity fixed. */
export interface HouseSpeeds {
  /** The system of the cusps: the one asked for, or whole sign where Placidus or Koch falls back. */
  system: HouseSystem;
  fellBack: boolean;
  /** In the order of `computeHouses`'s cusps: index 0 is the 1st house. */
  cusps: number[];
  /** The ascendant and descendant share a speed, as do the midheaven and imum coeli. */
  angles: Angles;
}

interface Place {
  ramc: number;
  latitude: number;
  obliquity: number;
}

const normalize = (value: number): number => ((value % 360) + 360) % 360;
/** `normalize`, leaving a value already in [0, 360) as it is: adding 360 would round it. */
const inCircle = (value: number): number => (value >= 0 && value < 360 ? value : normalize(value));

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`${label} must be a finite number.`);
  return value;
}

function placeOf(input: AngleInput): Place {
  if (input === null || typeof input !== "object") throw new RangeError("input must be an AngleInput object.");
  const gastHours = finiteNumber(input.gastHours, "gastHours");
  const longitude = finiteNumber(input.longitude, "longitude");
  const latitude = finiteNumber(input.latitude, "latitude");
  const obliquity = finiteNumber(input.obliquity, "obliquity");
  if (Math.abs(latitude) > 90) throw new RangeError("latitude must be within [-90, 90] degrees.");
  if (!(obliquity > 0 && obliquity < 90)) throw new RangeError("obliquity must be between 0 and 90 degrees.");
  return { ramc: normalize(gastHours * 15 + longitude), latitude, obliquity };
}

function systemOf(system: unknown): HouseSystem {
  if (typeof system === "string" && (SYSTEMS as readonly string[]).includes(system)) return system as HouseSystem;
  throw new RangeError(`Unknown house system ${String(system)}.`);
}

/** The ascendant and midheaven, by the same expressions as `computeAngles`. */
function anglesOf({ ramc, latitude, obliquity }: Place): { asc: number; mc: number } {
  const ra = ramc * DEG;
  const eps = obliquity * DEG;
  const mc = normalize(Math.atan2(Math.sin(ra), Math.cos(ra) * Math.cos(eps)) * RAD);
  let asc = normalize(
    Math.atan2(Math.cos(ra), -(Math.sin(ra) * Math.cos(eps) + Math.tan(latitude * DEG) * Math.sin(eps))) * RAD
  );
  if (normalize(asc - mc) >= 180) asc = normalize(asc + 180);
  return { asc, mc };
}

/** The ecliptic longitude of oblique ascension `ascension` under pole height `pole`, as in houses.ts. */
function obliqueLongitude(ascension: number, pole: number, obliquity: number): number {
  const a = ascension * DEG;
  const e = obliquity * DEG;
  return normalize(Math.atan2(Math.sin(a), Math.cos(a) * Math.cos(e) - Math.tan(pole * DEG) * Math.sin(e)) * RAD);
}

// ---------------------------------------------------------------------------
// House positions
// ---------------------------------------------------------------------------

/** A body's right ascension less the RAMC, in [0, 360), and its declination. */
function equatorialOf(place: Place, body: EclipticPosition): { md: number; dec: number } {
  if (body === null || typeof body !== "object") throw new RangeError("body must be an object with lon and lat.");
  const lon = finiteNumber(body.lon, "body lon");
  const lat = body.lat === undefined ? 0 : finiteNumber(body.lat, "body lat");
  if (Math.abs(lat) > 90) throw new RangeError("body lat must be within [-90, 90] degrees.");
  const l = lon * DEG;
  const b = lat * DEG;
  const e = place.obliquity * DEG;
  const x = Math.cos(b) * Math.cos(l);
  const y = Math.cos(b) * Math.sin(l) * Math.cos(e) - Math.sin(b) * Math.sin(e);
  const z = Math.cos(b) * Math.sin(l) * Math.sin(e) + Math.sin(b) * Math.cos(e);
  return { md: normalize(Math.atan2(y, x) * RAD - place.ramc), dec: Math.atan2(z, Math.hypot(x, y)) * RAD };
}

/**
 * The diurnal semi-arc, degrees, of a point with tan φ tan δ = `a`. A point
 * that never sets has 180° and one that never rises 0°: the diurnal arc of a
 * circumpolar point runs from its lower culmination (Otto Ludwig's convention).
 */
function semiArc(a: number): number {
  return a >= 1 ? 180 : a <= -1 ? 0 : 90 + Math.asin(a) * RAD;
}

const diurnalSemiArc = (tanLatitude: number, dec: number): number => semiArc(tanLatitude * Math.tan(dec * DEG));

/** A position east of the meridian (md in [0, 180)); the western half is the antipode's plus 180°. */
type EastPosition = (md: number, dec: number) => number | null;

function byQuadrants(md: number, dec: number, east: EastPosition): number | null {
  if (md < 180) return east(md, dec);
  const opposite = east(md - 180, -dec);
  return opposite === null ? null : opposite + 180;
}

/** Placidus: the fraction of its own diurnal or nocturnal semi-arc the body has run. */
function placidusEast(tanLatitude: number): EastPosition {
  return (md, dec) => {
    const day = diurnalSemiArc(tanLatitude, dec);
    return md < day ? 270 + (90 * md) / day : (90 * (md - day)) / (180 - day);
  };
}

/**
 * Koch: the house circles are the horizons of the sidereal times from the
 * rising of the midheaven's degree to the rising of the imum coeli's, RAMC −
 * D to RAMC + D, with D the midheaven's diurnal semi-arc; the time, in thirds
 * of D, is the house. A body east of the meridian lies on the horizon of the
 * time it rises, its oblique ascension under the latitude less 90°; west of
 * it, of the time it sets. Semi-arcs follow Ludwig's convention, so a body or
 * midheaven that never sets has 180°. Undefined where that time falls outside
 * the house circles, or where the midheaven never rises (D = 0).
 */
function kochEast(place: Place, tanLatitude: number): EastPosition | null {
  const day = semiArc(tanLatitude * Math.tan(place.obliquity * DEG) * Math.sin(place.ramc * DEG));
  if (!(day > 0)) return null;
  return (md, dec) => {
    const position = (90 * (md - diurnalSemiArc(tanLatitude, dec))) / day;
    // The midheaven's and imum coeli's own degrees lie on the outermost
    // circles; rounding within 1e-9° of them counts as on them.
    if (!(Math.abs(position) <= 90 + 1e-9)) return null;
    return Math.min(90, Math.max(-90, position));
  };
}

/** The root of `f` on [low, high] by bisection, when f changes sign there (or is 0 at an end). */
function root(f: (x: number) => number, low: number, high: number): number | null {
  const atLow = f(low);
  const atHigh = f(high);
  if (atLow === 0) return low;
  if (atHigh === 0) return high;
  if (!(Math.sign(atLow) === -Math.sign(atHigh))) return null;
  let lower = low;
  let upper = high;
  for (let step = 0; step < 200; step += 1) {
    const middle = (lower + upper) / 2;
    if (!(middle > lower && middle < upper)) break;
    if (Math.sign(f(middle)) === Math.sign(atLow)) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

/**
 * Topocentric (Polich–Page): the circle at fraction s of a quadrant has the
 * oblique ascension RAMC + 90° s (RAMC + 90° + 90° s below the horizon) under
 * the pole whose tangent is s tan φ ((1 − s) tan φ below); the cusps are
 * s = 1/3 and 2/3. The body's position is the circle through it. A body that
 * never rises or sets reaches only the circles with |s tan φ tan δ| ≤ 1, and
 * where none of them passes through it the position is undefined.
 */
function topocentricEast(tanLatitude: number): EastPosition {
  return (md, dec) => {
    const a = tanLatitude * Math.tan(dec * DEG);
    const asin = (x: number) => Math.asin(Math.min(1, Math.max(-1, x))) * RAD;
    const circumpolar = Math.abs(a) > 1;
    const reach = circumpolar ? 1 / Math.abs(a) : 1;
    const above = md < diurnalSemiArc(tanLatitude, dec);
    const s = above
      ? root((t) => md - 90 * t - asin(t * a), 0, reach)
      : root((t) => md - 90 - 90 * t - asin((1 - t) * a), 1 - reach, 1);
    // Outside the circumpolar case a root always exists; at the horizon itself
    // rounding can hide it, and the circle is the horizon.
    const circle = s ?? (circumpolar ? null : above ? 1 : 0);
    if (circle === null) return null;
    return above ? 270 + 90 * circle : 90 * circle;
  };
}

/** Alcabitius: the body's right ascension against the ascendant's semi-arcs, trisected on the equator. */
function alcabitiusEast(place: Place, asc: number, tanLatitude: number): EastPosition {
  const declination = Math.asin(Math.sin(place.obliquity * DEG) * Math.sin(asc * DEG)) * RAD;
  const day = Math.acos(Math.min(1, Math.max(-1, -tanLatitude * Math.tan(declination * DEG)))) * RAD;
  return (md) => (md < day ? 270 + (90 * md) / day : (90 * (md - day)) / (180 - day));
}

/** Porphyry: the body's longitude against the quadrants between the angles, each in three equal arcs. */
function porphyryPosition(lon: number, asc: number, mc: number): number {
  const upper = normalize(asc - mc);
  const lower = normalize(normalize(mc + 180) - asc);
  const fromMc = normalize(lon - mc);
  if (fromMc < upper) return 270 + (90 * fromMc) / upper;
  if (fromMc < 180) return (90 * (fromMc - upper)) / lower;
  if (fromMc < 180 + upper) return 90 + (90 * (fromMc - 180)) / upper;
  return 180 + (90 * (fromMc - 180 - upper)) / lower;
}

/**
 * The house position of a body in `system`, as Swiss Ephemeris's
 * `swe_house_pos` defines it: a number in [1, 13) whose integer part is the
 * house and whose fraction is how far through the house the body is, so that
 * (position − 1) × 30 is its mundane position in degrees. The body's ecliptic
 * latitude enters through the system's own house circles (docs/houses.md).
 * `null` where the system does not define a position: Koch, where the body
 * lies outside the house circles of its half of the sky or the midheaven
 * never rises; Topocentric, where no circle passes through a body that never
 * rises or sets. Invalid input throws RangeError.
 */
export function housePosition(system: HouseSystem, input: AngleInput, body: EclipticPosition): number | null {
  const name = systemOf(system);
  const place = placeOf(input);
  const { asc, mc } = anglesOf(place);
  const { md, dec } = equatorialOf(place, body);
  const lon = inCircle(body.lon);
  const tanLatitude = Math.tan(place.latitude * DEG);
  let mundane: number | null;
  switch (name) {
    case "whole":
      mundane = lon - Math.floor(asc / 30) * 30;
      break;
    case "equal":
      mundane = lon - asc;
      break;
    case "vehlow":
      mundane = lon - asc + 15;
      break;
    case "equal-mc":
      mundane = lon - mc - 90;
      break;
    case "porphyry":
      mundane = porphyryPosition(lon, asc, mc);
      break;
    case "morinus": {
      const e = place.obliquity * DEG;
      mundane = Math.atan2(Math.sin(lon * DEG), Math.cos(lon * DEG) * Math.cos(e)) * RAD - place.ramc - 90;
      break;
    }
    case "meridian":
      mundane = md - 90;
      break;
    case "campanus":
    case "regiomontanus": {
      // Horizon coordinates: the east point's component and the zenith's.
      const phi = place.latitude * DEG;
      const east = Math.cos(dec * DEG) * Math.sin(md * DEG);
      const zenith = Math.cos(phi) * Math.cos(dec * DEG) * Math.cos(md * DEG) + Math.sin(phi) * Math.sin(dec * DEG);
      mundane = Math.atan2(name === "campanus" ? east : east * Math.cos(phi), zenith) * RAD - 90;
      break;
    }
    case "placidus":
      mundane = byQuadrants(md, dec, placidusEast(tanLatitude));
      break;
    case "koch": {
      const east = kochEast(place, tanLatitude);
      mundane = east === null ? null : byQuadrants(md, dec, east);
      break;
    }
    case "topocentric":
      mundane = byQuadrants(md, dec, topocentricEast(tanLatitude));
      break;
    case "alcabitius":
      mundane = byQuadrants(md, dec, alcabitiusEast(place, asc, tanLatitude));
      break;
    default:
      throw new RangeError(`Unknown house system ${String(name satisfies never)}.`);
  }
  return mundane === null ? null : inCircle(mundane) / 30 + 1;
}

// ---------------------------------------------------------------------------
// Co-ascendants
// ---------------------------------------------------------------------------

/**
 * The equatorial ascendant, Koch's and Munkasey's co-ascendants and
 * Munkasey's polar ascendant (Swiss Ephemeris's `ascmc[4]` to `ascmc[7]`).
 * Each is the ecliptic point of an oblique ascension under a pole, taken as
 * the formula gives it: inside the polar circle (and, for Munkasey's
 * co-ascendant, within 90° − ε of the equator) it can lie west of the
 * meridian, and it is not turned east as the ascendant is.
 */
export function coAscendants(input: AngleInput): CoAscendants {
  const { ramc, latitude, obliquity } = placeOf(input);
  const polar = obliqueLongitude(ramc + 270, latitude, obliquity);
  return {
    equatorialAscendant: obliqueLongitude(ramc + 90, 0, obliquity),
    kochCoAscendant: normalize(polar + 180),
    munkaseyCoAscendant: obliqueLongitude(ramc + 90, latitude >= 0 ? 90 - latitude : -90 - latitude, obliquity),
    polarAscendant: polar
  };
}

// ---------------------------------------------------------------------------
// Speeds
// ---------------------------------------------------------------------------

/** d/dA of `obliqueLongitude(A, pole)`, for a pole of tangent `tanPole`: (cos ε − k cos A) / (sin² A + (cos A cos ε − k)²), k = tan(pole) sin ε. */
function obliqueRate(ascension: number, tanPole: number, obliquity: number): number {
  const a = ascension * DEG;
  const e = obliquity * DEG;
  const k = tanPole * Math.sin(e);
  const across = Math.cos(a) * Math.cos(e) - k;
  return (Math.cos(e) - k * Math.cos(a)) / (Math.sin(a) ** 2 + across * across);
}

/** The derivative of asin(q sin x) with respect to x (radians over radians). */
function ascensionalRate(q: number, x: number): number {
  const sine = Math.sin(x * DEG);
  return (q * Math.cos(x * DEG)) / Math.sqrt(1 - q * q * sine * sine);
}

/** Twelve cusp rates from the angles' and the 11th, 12th, 2nd and 3rd cusps', as quadrantCusps orders them. */
function quadrantRates(asc: number, mc: number, c11: number, c12: number, c2: number, c3: number): number[] {
  return [asc, c2, c3, mc, c11, c12, asc, c2, c3, mc, c11, c12];
}

/**
 * The Placidus cusp's right ascension: α = RAMC + offset + m asin(q sin α),
 * by bisection on the bracket RAMC + offset ± (90° m + 1°), across which the
 * residual increases strictly outside the polar circle (houses.ts).
 */
function placidusAscension(ramc: number, offset: number, m: number, q: number): number {
  const low = ramc + offset - 90 * m - 1;
  const high = ramc + offset + 90 * m + 1;
  const found = root(
    (alpha) => alpha - ramc - offset - m * Math.asin(Math.min(1, Math.max(-1, q * Math.sin(alpha * DEG)))) * RAD,
    low,
    high
  );
  return found ?? (low + high) / 2;
}

/** Cusp rates, degrees of longitude per degree of RAMC; null where the system is undefined. */
function cuspRates(system: HouseSystem, place: Place, asc: number, ascRate: number, mcRate: number): number[] | null {
  const { ramc, latitude, obliquity } = place;
  const tanLatitude = Math.tan(latitude * DEG);
  const q = tanLatitude * Math.tan(obliquity * DEG);
  const circles = (ascensions: readonly number[], tanPoles: readonly number[]) => {
    const [c11, c12, c2, c3] = ascensions.map((offset, index) => obliqueRate(ramc + offset, tanPoles[index]!, obliquity)) as [
      number,
      number,
      number,
      number
    ];
    return quadrantRates(ascRate, mcRate, c11, c12, c2, c3);
  };
  switch (system) {
    case "whole":
      return Array.from({ length: 12 }, () => 0);
    case "equal":
    case "vehlow":
      return Array.from({ length: 12 }, () => ascRate);
    case "equal-mc":
      return Array.from({ length: 12 }, () => mcRate);
    case "porphyry": {
      const third = (ascRate - mcRate) / 3;
      return quadrantRates(ascRate, mcRate, mcRate + third, mcRate + 2 * third, ascRate - third, ascRate - 2 * third);
    }
    case "meridian":
      return Array.from({ length: 12 }, (_, index) => obliqueRate(ramc + 90 + index * 30, 0, obliquity));
    case "morinus": {
      const cosine = Math.cos(obliquity * DEG);
      return Array.from({ length: 12 }, (_, index) => {
        const a = (ramc + 90 + index * 30) * DEG;
        return cosine / (Math.cos(a) ** 2 + Math.sin(a) ** 2 * cosine * cosine);
      });
    }
    case "regiomontanus": {
      const near = tanLatitude * 0.5;
      const far = tanLatitude * Math.cos(30 * DEG);
      return circles([30, 60, 120, 150], [near, far, far, near]);
    }
    case "topocentric": {
      const near = tanLatitude / 3;
      const far = (tanLatitude * 2) / 3;
      return circles([30, 60, 120, 150], [near, far, far, near]);
    }
    case "campanus": {
      const sine = Math.sin(latitude * DEG);
      const cosine = Math.cos(latitude * DEG);
      const near = Math.tan(Math.asin(sine / 2));
      const far = Math.tan(Math.asin((Math.sqrt(3) / 2) * sine));
      const wide = Math.atan(Math.sqrt(3) / cosine) * RAD;
      const narrow = Math.atan(1 / (Math.sqrt(3) * cosine)) * RAD;
      return circles([90 - wide, 90 - narrow, 90 + narrow, 90 + wide], [near, far, far, near]);
    }
    case "alcabitius": {
      // D = acos(−tan φ tan δ) with δ the ascendant's declination; clamped, D is constant.
      const e = obliquity * DEG;
      const declination = Math.asin(Math.sin(e) * Math.sin(asc * DEG));
      const u = -tanLatitude * Math.tan(declination);
      const day = Math.acos(Math.min(1, Math.max(-1, u))) * RAD;
      const tanRate = (Math.sin(e) * Math.cos(asc * DEG) * ascRate) / Math.cos(declination) ** 3;
      const dayRate = Math.abs(u) < 1 ? (tanLatitude * tanRate) / Math.sqrt(1 - u * u) : 0;
      const at = (ascension: number, share: number) => obliqueRate(ramc + ascension, 0, obliquity) * (1 + share * dayRate);
      return quadrantRates(
        ascRate,
        mcRate,
        at(day / 3, 1 / 3),
        at((2 * day) / 3, 2 / 3),
        at(60 + (2 * day) / 3, 2 / 3),
        at(120 + day / 3, 1 / 3)
      );
    }
    case "koch": {
      if (Math.abs(latitude) >= 90 - obliquity) return null;
      const third = (90 + Math.asin(q * Math.sin(ramc * DEG)) * RAD) / 3;
      const thirdRate = ascensionalRate(q, ramc) / 3;
      const at = (thirds: number) => obliqueRate(ramc + 90 + thirds * third, tanLatitude, obliquity) * (1 + thirds * thirdRate);
      return quadrantRates(ascRate, mcRate, at(-2), at(-1), at(1), at(2));
    }
    case "placidus": {
      if (Math.abs(latitude) >= 90 - obliquity) return null;
      const cosine = Math.cos(obliquity * DEG);
      const at = (offset: number, m: number) => {
        const alpha = placidusAscension(ramc, offset, m, q);
        const a = alpha * DEG;
        const longitudeRate = cosine / (Math.sin(a) ** 2 + Math.cos(a) ** 2 * cosine * cosine);
        return longitudeRate / (1 - m * ascensionalRate(q, alpha));
      };
      return quadrantRates(ascRate, mcRate, at(30, 1 / 3), at(60, 2 / 3), at(120, 2 / 3), at(150, 1 / 3));
    }
    default:
      throw new RangeError(`Unknown house system ${String(system satisfies never)}.`);
  }
}

/**
 * The speeds of the cusps `computeHouses(system, input, …)` returns and of
 * the four angles, in degrees per day: each derivative with respect to the
 * RAMC, found analytically, times {@link SIDEREAL_RATE}, with the latitude
 * and the obliquity held fixed. Where Placidus or Koch falls back to whole
 * signs, the cusps are whole-sign cusps, whose speed is 0 except where the
 * ascendant changes sign. A speed is not defined at the instants where a cusp
 * jumps: whole-sign cusps at a change of sign, and every cusp that turns with
 * the ascendant inside the polar circle. Invalid input throws RangeError.
 */
export function houseSpeeds(system: HouseSystem, input: AngleInput): HouseSpeeds {
  const name = systemOf(system);
  const place = placeOf(input);
  const { asc } = anglesOf(place);
  const ascRate = obliqueRate(place.ramc + 90, Math.tan(place.latitude * DEG), place.obliquity);
  const mcRate = obliqueRate(place.ramc, 0, place.obliquity);
  const rates = cuspRates(name, place, asc, ascRate, mcRate);
  const perDay = (rate: number) => rate * SIDEREAL_RATE;
  const ascSpeed = perDay(ascRate);
  const mcSpeed = perDay(mcRate);
  return {
    system: rates === null ? "whole" : name,
    fellBack: rates === null,
    cusps: rates === null ? Array.from({ length: 12 }, () => 0) : rates.map(perDay),
    angles: { asc: ascSpeed, mc: mcSpeed, dsc: ascSpeed, ic: mcSpeed }
  };
}
