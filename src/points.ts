/**
 * Chart points that are not bodies: the Moon's mean node and mean apogee
 * (Black Moon Lilith), the Hellenistic lots, and the antiscia and midpoints of
 * any two longitudes. The Vertex and the East Point, which follow from the
 * sidereal time like the angles, are in houses.ts.
 *
 * Nothing here reads an ephemeris: the node and the apogee come from mean
 * elements, polynomials in time, and the lots from longitudes the chart
 * already has.
 */
import { normalizeLongitude } from "./signs.js";
import type { PointName, Sect } from "./types.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const ARCSEC = 1 / 3600;

/**
 * The Moon's mean anomaly l, mean argument of latitude F and mean longitude of
 * the ascending node Ω, in degrees, for Julian centuries of TT from J2000.
 * These are the fundamental arguments of the IERS Conventions (2003, 2010),
 * eq. 5.43, from Simon et al. (1994), referred to the mean ecliptic and
 * equinox of date.
 */
export function lunarMeanArguments(centuries: number): { l: number; F: number; node: number } {
  const t = centuries;
  const l = 485868.249036 + t * (1717915923.2178 + t * (31.8792 + t * (0.051635 + t * -0.0002447)));
  const F = 335779.526232 + t * (1739527262.8478 + t * (-12.7512 + t * (-0.001037 + t * 0.00000417)));
  const node = 450160.398036 + t * (-6962890.5431 + t * (7.4722 + t * (0.007702 + t * -0.00005939)));
  return { l: l * ARCSEC, F: F * ARCSEC, node: node * ARCSEC };
}

/** The Moon's mean orbital inclination to the ecliptic, 5°08′43.4″. */
export const MEAN_LUNAR_INCLINATION = 5.1453964;

/**
 * The mean ascending node of the Moon: Ω of {@link lunarMeanArguments}, plus
 * the nutation in longitude `nutation` (degrees) to refer it to the true
 * equinox of date like every other longitude the engine reports.
 */
export function meanNodeLongitude(centuries: number, nutation: number): number {
  return normalizeLongitude(lunarMeanArguments(centuries).node + nutation);
}

/**
 * The mean lunar apogee, Black Moon Lilith: the point of the mean lunar orbit
 * 180° from the mean perigee. Its argument of latitude is F − l + 180°, and it
 * is carried from the orbit, inclined at {@link MEAN_LUNAR_INCLINATION}, to
 * the ecliptic, so it has a latitude of up to about 5°. The nutation in
 * longitude `nutation` (degrees) refers it to the true equinox of date.
 */
export function meanApogee(centuries: number, nutation: number): { lon: number; lat: number } {
  const { l, F, node } = lunarMeanArguments(centuries);
  const u = (F - l + 180) * DEG;
  const i = MEAN_LUNAR_INCLINATION * DEG;
  const lon = node + Math.atan2(Math.cos(i) * Math.sin(u), Math.cos(u)) * RAD + nutation;
  return { lon: normalizeLongitude(lon), lat: Math.asin(Math.sin(i) * Math.sin(u)) * RAD };
}

/**
 * Day or night: day when the Sun is above the horizon, which on the ecliptic
 * is the half from the descendant through the midheaven to the ascendant
 * (houses 7 to 12 counted from the ascendant). A Sun exactly on the ascendant
 * counts as below the horizon, and one exactly on the descendant as above it.
 */
export function sectOf(ascendant: number, sun: number): Sect {
  return normalizeLongitude(sun - ascendant) >= 180 ? "day" : "night";
}

/** The longitudes the lots are taken from. */
export interface LotInputs {
  ascendant: number;
  sun: number;
  moon: number;
  mercury: number;
  venus: number;
  mars: number;
  jupiter: number;
  saturn: number;
}

/** The lots, in the order {@link hellenisticLots} returns them. */
export const LOTS = [
  "Lot of Fortune",
  "Lot of Spirit",
  "Lot of Eros",
  "Lot of Necessity",
  "Lot of Courage",
  "Lot of Victory",
  "Lot of Nemesis"
] as const satisfies readonly PointName[];

/**
 * The seven lots of Paulus Alexandrinus, *Introductory Matters* (378 CE),
 * ch. 23. Each is the ascendant plus the arc from one point to another, taken
 * by day as given and reversed by night:
 *
 * - Fortune: from the Sun to the Moon.
 * - Spirit: from the Moon to the Sun.
 * - Eros: from Spirit to Venus.
 * - Necessity: from Mercury to Fortune.
 * - Courage: from Mars to Fortune.
 * - Victory: from Spirit to Jupiter.
 * - Nemesis: from Saturn to Fortune.
 *
 * Ptolemy (*Tetrabiblos* III.10) takes Fortune by the day formula at night
 * too; that variant is `ascendant + moon − sun` whatever the sect.
 */
export function hellenisticLots(
  inputs: LotInputs,
  sect: Sect
): { point: (typeof LOTS)[number]; lon: number }[] {
  const lot = (from: number, to: number) =>
    normalizeLongitude(inputs.ascendant + (sect === "day" ? to - from : from - to));
  const fortune = lot(inputs.sun, inputs.moon);
  const spirit = lot(inputs.moon, inputs.sun);
  return [
    { point: "Lot of Fortune", lon: fortune },
    { point: "Lot of Spirit", lon: spirit },
    { point: "Lot of Eros", lon: lot(spirit, inputs.venus) },
    { point: "Lot of Necessity", lon: lot(inputs.mercury, fortune) },
    { point: "Lot of Courage", lon: lot(inputs.mars, fortune) },
    { point: "Lot of Victory", lon: lot(spirit, inputs.jupiter) },
    { point: "Lot of Nemesis", lon: lot(inputs.saturn, fortune) }
  ];
}

/**
 * The antiscion of a longitude: its mirror image across the solstitial axis,
 * 0° Cancer to 0° Capricorn, so that the two points have the same declination
 * on the ecliptic. 10° Taurus (40°) and 20° Leo (140°) are antiscia.
 */
export function antiscion(longitude: number): number {
  return normalizeLongitude(180 - longitude);
}

/**
 * The contra-antiscion: the mirror image across the equinoctial axis, 0° Aries
 * to 0° Libra, the antiscion's opposite point.
 */
export function contraAntiscion(longitude: number): number {
  return normalizeLongitude(-longitude);
}

/**
 * The nearer midpoint of two longitudes, halfway along the shorter arc between
 * them. When the two are exactly opposite, both midpoints are equally near;
 * this returns the one 90° past the first.
 */
export function midpoint(first: number, second: number): number {
  const arc = normalizeLongitude(second - first);
  return normalizeLongitude(first + (arc > 180 ? arc - 360 : arc) / 2);
}
