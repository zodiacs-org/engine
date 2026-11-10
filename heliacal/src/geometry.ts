import type { CalcPosition, CalcRefusal } from "../../src/calc.js";
import { gastHours, onChartClock } from "../../src/ephemeris.js";
import { optionsOf } from "../../src/sky/riseset.js";
import { enginePosition } from "./engine.js";
import { instant, observer, visibilityBody } from "./inputs.js";
import type { DateInput, ObservationBody, Observer, VisibilityBody } from "./inputs.js";

const RAD = Math.PI / 180;
// Resolve roundoff at a vertical direction, not a physical uncertainty band.
const AXIS_TOLERANCE = 32 * Number.EPSILON;

export interface SphericalDirection {
  readonly longitudeDeg: number;
  readonly latitudeDeg: number;
}

export interface HorizontalCoordinates {
  /** Airless centre altitude above the geodetic tangent plane, in [-90, 90]. */
  readonly altitudeDeg: number;
  /** North through east in [0, 360); null at the vertical or a geographic pole. */
  readonly azimuthDeg: number | null;
  /** West-positive in [-180, 180); null at a celestial pole. */
  readonly hourAngleDeg: number | null;
}

function numberIn(value: unknown, low: number, high: number, label: string, excludeHigh = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high || (excludeHigh && value === high)) {
    throw new RangeError(`${label} must be a finite number in [${low}, ${high}${excludeHigh ? ")" : "]"}.`);
  }
  return value;
}

function wrap360(degrees: number): number {
  const remainder = degrees % 360;
  // Avoid adding 360 to a small positive number and losing its low bits.
  const wrapped = remainder < 0 ? remainder + 360 : remainder;
  return wrapped === 360 || wrapped === 0 ? 0 : wrapped;
}

function latitudeTrig(degrees: number): readonly [number, number] {
  // At a pole, longitude has no effect on the direction.
  if (degrees === 90) return [1, 0];
  if (degrees === -90) return [-1, 0];
  return [Math.sin(degrees * RAD), Math.cos(degrees * RAD)];
}

function unitDirection(value: SphericalDirection): readonly [number, number, number] {
  const input = optionsOf(value, ["longitudeDeg", "latitudeDeg"], "direction");
  const longitude = numberIn(input.longitudeDeg, 0, 360, "longitudeDeg", true) * RAD;
  const latitude = numberIn(input.latitudeDeg, -90, 90, "latitudeDeg");
  const [sinLat, cosLat] = latitudeTrig(latitude);
  return [cosLat * Math.cos(longitude), cosLat * Math.sin(longitude), sinLat];
}

/**
 * Smallest angle between two directions in the same frame and at the same
 * origin, degrees in [0, 180]. atan2(cross magnitude, dot) retains precision
 * near coincidence and opposition. No ephemeris or atmospheric model is used.
 */
export function angularSeparation(a: SphericalDirection, b: SphericalDirection): number {
  const [ax, ay, az] = unitDirection(a);
  const [bx, by, bz] = unitDirection(b);
  const cross = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  return Math.atan2(cross, ax * bx + ay * by + az * bz) / RAD;
}

/**
 * Project true-of-date equatorial coordinates onto the geodetic local frame.
 * All inputs are degrees, including right ascension and apparent sidereal time.
 * This rotates a direction only: it adds no parallax, refraction or horizon
 * dip. Supply a topocentric direction for an observer's horizontal place.
 * The north/east convention is checked against ERFA hd2ae in the tests.
 */
export function equatorialToHorizontal(
  rightAscensionDeg: number,
  declinationDeg: number,
  latitudeDeg: number,
  localApparentSiderealTimeDeg: number
): Readonly<HorizontalCoordinates> {
  const ra = numberIn(rightAscensionDeg, 0, 360, "rightAscensionDeg", true);
  const dec = numberIn(declinationDeg, -90, 90, "declinationDeg");
  const latitude = numberIn(latitudeDeg, -90, 90, "latitudeDeg");
  const lst = numberIn(localApparentSiderealTimeDeg, 0, 360, "localApparentSiderealTimeDeg", true);
  let hourAngle = lst - ra;
  if (hourAngle < -180) hourAngle += 360;
  if (hourAngle >= 180) hourAngle -= 360;
  const [sinDec, cosDec] = latitudeTrig(dec);
  const [sinLat, cosLat] = latitudeTrig(latitude);
  const radial = cosDec * Math.cos(hourAngle * RAD);
  const east = -cosDec * Math.sin(hourAngle * RAD);
  const north = cosLat * sinDec - sinLat * radial;
  const up = sinLat * sinDec + cosLat * radial;
  const horizontal = Math.hypot(east, north);
  return Object.freeze({
    altitudeDeg: Math.atan2(up, horizontal) / RAD,
    azimuthDeg: horizontal <= AXIS_TOLERANCE || Math.abs(latitude) === 90
      ? null : wrap360(Math.atan2(east, north) / RAD),
    hourAngleDeg: Math.abs(dec) === 90 ? null : hourAngle === 0 ? 0 : hourAngle
  });
}

export interface BodyGeometry {
  /** Original engine result, including its bounds and receipt. lon is RA in degrees. */
  readonly equatorial: CalcPosition;
  /** Original engine result, including its bounds and receipt. */
  readonly ecliptic: CalcPosition;
  readonly horizontal: Readonly<HorizontalCoordinates>;
}

export interface SunBodyPair {
  readonly sun: BodyGeometry;
  readonly target: BodyGeometry;
  /** True angular Sun/body separation, not a difference of ecliptic longitudes. */
  readonly elongationDeg: number;
}

const UNITS = Object.freeze({ angles: "degrees", distances: "au", observerHeight: "metres" } as const);
const CONVENTIONS = Object.freeze({
  positions: "apparent;true-of-date;tropical",
  observerEllipsoid: "iers2003",
  horizontal: "geodetic-tangent-plane;centre;no-refraction;no-dip",
  azimuth: "north-through-east;null-at-vertical-or-geographic-pole",
  hourAngle: "west-positive;[-180,180);null-at-celestial-pole",
  siderealTime: "engine-gast-plus-east-longitude"
} as const);

export interface SunBodyGeometry {
  readonly status: "ok";
  readonly body: VisibilityBody;
  readonly at: string;
  readonly observer: Readonly<Required<Observer>>;
  readonly localApparentSiderealTimeDeg: number;
  readonly units: typeof UNITS;
  readonly conventions: typeof CONVENTIONS;
  /** Receipts record only the engine position requests, not derived geometry. */
  readonly receiptScope: "positions";
  /** Geocentric directions projected onto the site's local axes, without parallax. */
  readonly geocentric: SunBodyPair;
  readonly topocentric: SunBodyPair;
}

export type GeometryResult = SunBodyGeometry | CalcRefusal;

function bodyAt(
  body: ObservationBody, at: Date, site: Readonly<Required<Observer>>, sidereal: number, topocentric: boolean,
  equatorialPosition?: CalcPosition
): BodyGeometry | CalcRefusal {
  const center = topocentric ? { observer: site } : {};
  const equatorial = equatorialPosition ?? enginePosition(body, at, { ...center, frame: "equatorial-true-of-date" });
  if (equatorial.status === "refused") return equatorial;
  const ecliptic = enginePosition(body, at, { ...center, frame: "ecliptic-true-of-date" });
  if (ecliptic.status === "refused") return ecliptic;
  return Object.freeze({
    equatorial,
    ecliptic,
    horizontal: equatorialToHorizontal(equatorial.lon, equatorial.lat, site.latitude, sidereal)
  });
}

function pairAt(
  body: VisibilityBody, at: Date, site: Readonly<Required<Observer>>, sidereal: number, topocentric: boolean,
  sunEquatorial?: CalcPosition
): SunBodyPair | CalcRefusal {
  const sun = bodyAt("Sun", at, site, sidereal, topocentric, sunEquatorial);
  if ("status" in sun) return sun;
  const target = bodyAt(body, at, site, sidereal, topocentric);
  if ("status" in target) return target;
  return Object.freeze({
    sun,
    target,
    elongationDeg: angularSeparation(
      { longitudeDeg: sun.equatorial.lon, latitudeDeg: sun.equatorial.lat },
      { longitudeDeg: target.equatorial.lon, latitudeDeg: target.equatorial.lat }
    )
  });
}

/**
 * Sun/body directions at a resolved UTC input instant, from the geocentre and
 * from an observer. Engine refusals are returned whole without partial geometry.
 * The engine computes positions, frames, time scales and sidereal time.
 * Site numbers are interpreted on calc's IERS2003 ellipsoid, without a datum
 * conversion from the WGS84 convention used by the shared Observer type.
 * The calc observer/correction conventions differ from sky's horizon solver;
 * a projected altitude here does not reproduce a sky crossing exactly.
 */
export function sunBodyGeometry(body: VisibilityBody, at: DateInput, site: Observer): GeometryResult {
  const name = visibilityBody(body);
  const date = instant(at);
  const place = observer(site);
  // Ask calc first so dates outside its coverage preserve its typed refusal,
  // including dates too far out for onChartClock to evaluate at all.
  const check = enginePosition("Sun", date, { frame: "equatorial-true-of-date" });
  if (check.status === "refused") return check;
  const sidereal = onChartClock(date.getTime(), "utc", undefined,
    (time) => wrap360(gastHours(time) * 15 + place.longitude));
  const geocentric = pairAt(name, date, place, sidereal, false, check);
  if ("status" in geocentric) return geocentric;
  const topocentric = pairAt(name, date, place, sidereal, true);
  if ("status" in topocentric) return topocentric;
  return Object.freeze({
    status: "ok", body: name, at: date.toISOString(), observer: place,
    localApparentSiderealTimeDeg: sidereal, units: UNITS, conventions: CONVENTIONS,
    receiptScope: "positions", geocentric, topocentric
  });
}
