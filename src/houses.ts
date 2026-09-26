import type { Angles, HouseNumber, Houses, HouseSystem } from "./types.js";
import { normalizeLongitude } from "./signs.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export const HOUSE_SYSTEMS = [
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
] as const satisfies readonly HouseSystem[];

/**
 * The systems that are undefined inside the polar circle, |latitude| ≥ 90° − ε,
 * where part of the ecliptic never rises or sets: Placidus and Koch both divide
 * a semi-arc that no longer exists there.
 */
export const POLAR_UNDEFINED_HOUSE_SYSTEMS = ["placidus", "koch"] as const satisfies readonly HouseSystem[];

/**
 * The system Placidus and Koch fall back to where they are undefined. The chart
 * then carries the `polar-fallback` flag. Swiss Ephemeris falls back to
 * Porphyry there instead; ask for `"porphyry"` to get that system at any latitude.
 */
export const POLAR_FALLBACK = "whole" as const satisfies HouseSystem;

/** The system Placidus falls back to; the same as {@link POLAR_FALLBACK}. */
export const PLACIDUS_POLAR_FALLBACK = POLAR_FALLBACK;

/** Whether `system` is one that falls back inside the polar circle. */
export function isPolarUndefinedHouseSystem(system: HouseSystem): boolean {
  return (POLAR_UNDEFINED_HOUSE_SYSTEMS as readonly HouseSystem[]).includes(system);
}

/** Mean obliquity of the ecliptic (IAU 2006), in degrees. */
export function meanObliquity(julianCenturies: number): number {
  const t = julianCenturies;
  const arcseconds =
    84381.406 -
    46.836769 * t -
    0.0001831 * t * t +
    0.0020034 * t ** 3 -
    0.000000576 * t ** 4 -
    0.0000000434 * t ** 5;
  return arcseconds / 3600;
}

function eclipticLongitudeOfRightAscension(ra: number, obliquity: number): number {
  return normalizeLongitude(
    Math.atan2(Math.sin(ra * DEG), Math.cos(ra * DEG) * Math.cos(obliquity * DEG)) * RAD
  );
}

function declinationOfLongitude(lon: number, obliquity: number): number {
  return Math.asin(Math.sin(obliquity * DEG) * Math.sin(lon * DEG)) * RAD;
}

/**
 * The ecliptic longitude whose oblique ascension under a circle of pole height
 * `pole` is `ascension`. With the pole at the latitude and the ascension at
 * RAMC + 90° this is the ascendant; with the pole at zero it is the ecliptic
 * point of right ascension `ascension`. Every quadrant system below is this
 * one function with its own ascensions and poles.
 */
function obliqueLongitude(ascension: number, pole: number, obliquity: number): number {
  const a = ascension * DEG;
  const e = obliquity * DEG;
  return normalizeLongitude(
    Math.atan2(Math.sin(a), Math.cos(a) * Math.cos(e) - Math.tan(pole * DEG) * Math.sin(e)) * RAD
  );
}

/** Twelve cusps from the four angles and the four intermediate cusps of the eastern quadrants. */
function quadrantCusps(
  asc: number,
  mc: number,
  cusp11: number,
  cusp12: number,
  cusp2: number,
  cusp3: number
): number[] {
  return [
    asc,
    cusp2,
    cusp3,
    mc + 180,
    cusp11 + 180,
    cusp12 + 180,
    asc + 180,
    cusp2 + 180,
    cusp3 + 180,
    mc,
    cusp11,
    cusp12
  ].map(normalizeLongitude);
}

export interface AngleInput {
  /** Greenwich apparent sidereal time, in hours. */
  gastHours: number;
  latitude: number;
  /** East-positive longitude, in degrees. */
  longitude: number;
  obliquity: number;
}

export function ramcOf(input: Pick<AngleInput, "gastHours" | "longitude">): number {
  return normalizeLongitude(input.gastHours * 15 + input.longitude);
}

export function computeAngles(input: AngleInput): Angles {
  const ramc = ramcOf(input);
  const mc = eclipticLongitudeOfRightAscension(ramc, input.obliquity);
  const ra = ramc * DEG;
  const eps = input.obliquity * DEG;
  const phi = input.latitude * DEG;
  let asc = normalizeLongitude(
    Math.atan2(Math.cos(ra), -(Math.sin(ra) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * RAD
  );
  // atan2 chooses one horizon intersection; at polar latitudes it can be
  // the setting one. Select the eastern half of the meridian before houses
  // are assembled. For nondegenerate inputs this has positive local-east
  // projection and hence increasing altitude under Earth's rotation.
  if (normalizeLongitude(asc - mc) >= 180) asc = normalizeLongitude(asc + 180);

  return {
    asc,
    mc,
    dsc: normalizeLongitude(asc + 180),
    ic: normalizeLongitude(mc + 180)
  };
}

export function wholeSignCusps(ascendant: number): number[] {
  const first = Math.floor(normalizeLongitude(ascendant) / 30) * 30;
  return Array.from({ length: 12 }, (_, index) => normalizeLongitude(first + index * 30));
}

/**
 * Placidus intermediate cusps using iterative semi-arc trisection.
 * Returns `null` inside the polar circle, |latitude| ≥ 90° − ε, where part of
 * the ecliptic never rises or sets and the semi-arcs are undefined.
 */
export function placidusCusps(input: AngleInput, angles: Angles): number[] | null {
  if (Math.abs(input.latitude) >= 90 - input.obliquity) return null;

  const ramc = ramcOf(input);
  const phi = input.latitude * DEG;

  function iterate(offset: number, multiplier: number): number | null {
    let ra = ramc + offset;
    let converged = false;
    for (let index = 0; index < 64; index += 1) {
      const lon = eclipticLongitudeOfRightAscension(normalizeLongitude(ra), input.obliquity);
      const declination = declinationOfLongitude(lon, input.obliquity);
      const argument = Math.tan(phi) * Math.tan(declination * DEG);
      if (Math.abs(argument) >= 1) return null;
      const ascensionalDifference = Math.asin(argument) * RAD;
      const next = ramc + offset + multiplier * ascensionalDifference;
      // Bound the final longitude error as well as the RA iteration step.
      if (Math.abs(normalizeLongitude(next - ra + 180) - 180) < 1e-9) {
        ra = next;
        converged = true;
        break;
      }
      ra = next;
    }
    return converged
      ? eclipticLongitudeOfRightAscension(normalizeLongitude(ra), input.obliquity)
      : null;
  }

  const cusp11 = iterate(30, 1 / 3);
  const cusp12 = iterate(60, 2 / 3);
  const cusp2 = iterate(120, 2 / 3);
  const cusp3 = iterate(150, 1 / 3);
  if (cusp11 === null || cusp12 === null || cusp2 === null || cusp3 === null) {
    return null;
  }

  return [
    angles.asc,
    cusp2,
    cusp3,
    angles.ic,
    normalizeLongitude(cusp11 + 180),
    normalizeLongitude(cusp12 + 180),
    angles.dsc,
    normalizeLongitude(cusp2 + 180),
    normalizeLongitude(cusp3 + 180),
    angles.mc,
    cusp11,
    cusp12
  ];
}

/**
 * Porphyry cusps: each quadrant between the angles, measured in ecliptic
 * longitude, divided into three equal parts. Defined wherever the angles are.
 */
export function porphyryCusps(angles: Angles): number[] {
  // computeAngles puts the ascendant in the eastern half, less than 180° past
  // the midheaven, so the two quadrant arcs are positive and sum to 180°.
  const upper = normalizeLongitude(angles.asc - angles.mc);
  const lower = normalizeLongitude(angles.ic - angles.asc);
  const cusp11 = normalizeLongitude(angles.mc + upper / 3);
  const cusp12 = normalizeLongitude(angles.mc + (2 * upper) / 3);
  const cusp2 = normalizeLongitude(angles.asc + lower / 3);
  const cusp3 = normalizeLongitude(angles.asc + (2 * lower) / 3);
  return [
    angles.asc,
    cusp2,
    cusp3,
    angles.ic,
    normalizeLongitude(cusp11 + 180),
    normalizeLongitude(cusp12 + 180),
    angles.dsc,
    normalizeLongitude(cusp2 + 180),
    normalizeLongitude(cusp3 + 180),
    angles.mc,
    cusp11,
    cusp12
  ];
}

/** Equal houses: thirty degrees each, the first beginning at the ascendant. */
export function equalCusps(angles: Angles): number[] {
  return Array.from({ length: 12 }, (_, index) => normalizeLongitude(angles.asc + index * 30));
}

/**
 * Equal houses from the midheaven: thirty degrees each, the 10th beginning at
 * the midheaven, so the 1st begins 90° past it. Neither the ascendant nor the
 * latitude enters, so the system is the same at every latitude.
 */
export function equalMcCusps(angles: Angles): number[] {
  return Array.from({ length: 12 }, (_, index) => normalizeLongitude(angles.mc + (index - 9) * 30));
}

/** Vehlow's equal houses: thirty degrees each, with the ascendant in the middle of the first. */
export function vehlowCusps(angles: Angles): number[] {
  return Array.from({ length: 12 }, (_, index) => normalizeLongitude(angles.asc - 15 + index * 30));
}

/**
 * Koch (birthplace) cusps: the ascendants at the sidereal times when the
 * midheaven degree has run a third and two thirds of its diurnal semi-arc,
 * before and after culmination. Returns `null` inside the polar circle, where
 * that semi-arc is undefined for part of the ecliptic.
 */
export function kochCusps(input: AngleInput, angles: Angles): number[] | null {
  if (Math.abs(input.latitude) >= 90 - input.obliquity) return null;
  const ramc = ramcOf(input);
  const argument =
    Math.tan(input.latitude * DEG) * Math.tan(declinationOfLongitude(angles.mc, input.obliquity) * DEG);
  // Outside the polar circle |tan φ · tan δ| < tan(90° − ε) · tan ε = 1.
  const third = (90 + Math.asin(argument) * RAD) / 3;
  const at = (offset: number) => obliqueLongitude(ramc + 90 + offset, input.latitude, input.obliquity);
  return quadrantCusps(angles.asc, angles.mc, at(-2 * third), at(-third), at(third), at(2 * third));
}

/**
 * Cusps of a system whose house circles pass through the north and south
 * points of the horizon, each given as an ascension and a pole height for the
 * 11th, 12th, 2nd and 3rd cusps. Inside the polar circle, where the ascendant
 * is taken on the eastern half of the horizon, every cusp turns half a circle
 * with it, so the 10th cusp is then the lower meridian, as in Swiss Ephemeris.
 */
function circleCusps(
  input: AngleInput,
  angles: Angles,
  circles: readonly [ascension: number, pole: number][]
): number[] {
  const ramc = ramcOf(input);
  const [c11, c12, c2, c3] = circles.map(([ascension, pole]) =>
    obliqueLongitude(ramc + ascension, pole, input.obliquity)
  ) as [number, number, number, number];
  const asc = obliqueLongitude(ramc + 90, input.latitude, input.obliquity);
  const cusps = quadrantCusps(asc, angles.mc, c11, c12, c2, c3);
  const turned = normalizeLongitude(asc - angles.mc) >= 180;
  return turned ? cusps.map((cusp) => normalizeLongitude(cusp + 180)) : cusps;
}

/**
 * Regiomontanus cusps: house circles through the north and south points of
 * the horizon that divide the celestial equator into arcs of 30°.
 */
export function regiomontanusCusps(input: AngleInput, angles: Angles): number[] {
  const tangent = Math.tan(input.latitude * DEG);
  const near = Math.atan(tangent * 0.5) * RAD;
  const far = Math.atan(tangent * Math.cos(30 * DEG)) * RAD;
  return circleCusps(input, angles, [
    [30, near],
    [60, far],
    [120, far],
    [150, near]
  ]);
}

/**
 * Campanus cusps: house circles through the north and south points of the
 * horizon that divide the prime vertical into arcs of 30°.
 */
export function campanusCusps(input: AngleInput, angles: Angles): number[] {
  const sine = Math.sin(input.latitude * DEG);
  const cosine = Math.cos(input.latitude * DEG);
  const near = Math.asin(sine / 2) * RAD;
  const far = Math.asin((Math.sqrt(3) / 2) * sine) * RAD;
  const wide = Math.atan(Math.sqrt(3) / cosine) * RAD;
  const narrow = Math.atan(1 / (Math.sqrt(3) * cosine)) * RAD;
  return circleCusps(input, angles, [
    [90 - wide, near],
    [90 - narrow, far],
    [90 + narrow, far],
    [90 + wide, near]
  ]);
}

/**
 * Topocentric (Polich–Page) cusps: the Regiomontanus ascensions with pole
 * heights whose tangents are a third and two thirds of the latitude's.
 */
export function topocentricCusps(input: AngleInput, angles: Angles): number[] {
  const tangent = Math.tan(input.latitude * DEG);
  const near = Math.atan(tangent / 3) * RAD;
  const far = Math.atan((tangent * 2) / 3) * RAD;
  return circleCusps(input, angles, [
    [30, near],
    [60, far],
    [120, far],
    [150, near]
  ]);
}

/**
 * Alcabitius cusps: the ascendant's diurnal and nocturnal semi-arcs, divided
 * into thirds on the equator and carried to the ecliptic along hour circles.
 */
export function alcabitiusCusps(input: AngleInput, angles: Angles): number[] {
  const ramc = ramcOf(input);
  const declination = declinationOfLongitude(angles.asc, input.obliquity);
  const argument = -Math.tan(input.latitude * DEG) * Math.tan(declination * DEG);
  // Inside the polar circle the ascendant can be circumpolar; clamp as Swiss does.
  const day = Math.acos(Math.min(1, Math.max(-1, argument))) * RAD;
  const night = 180 - day;
  const at = (ascension: number) => obliqueLongitude(ramc + ascension, 0, input.obliquity);
  return quadrantCusps(
    angles.asc,
    angles.mc,
    at(day / 3),
    at((2 * day) / 3),
    at(180 - (2 * night) / 3),
    at(180 - night / 3)
  );
}

/** The right ascensions RAMC + 90°, RAMC + 120° … of the first to twelfth cusps. */
function equatorialCusps(input: AngleInput, project: (ascension: number) => number): number[] {
  const ramc = ramcOf(input);
  return Array.from({ length: 12 }, (_, index) => project(ramc + 90 + index * 30));
}

/**
 * Meridian (axial rotation) cusps: the ecliptic points whose right ascensions
 * divide the equator into 30° arcs from the midheaven's. The 10th cusp is the
 * midheaven; the 1st is the equatorial ascendant, not the ascendant.
 */
export function meridianCusps(input: AngleInput): number[] {
  return equatorialCusps(input, (ascension) => obliqueLongitude(ascension, 0, input.obliquity));
}

/**
 * Morinus cusps: the equator divided into 30° arcs from the midheaven's right
 * ascension, each point carried to the ecliptic along a circle through the
 * ecliptic poles. Neither the ascendant nor the midheaven is a cusp.
 */
export function morinusCusps(input: AngleInput): number[] {
  const e = input.obliquity * DEG;
  return equatorialCusps(input, (ascension) =>
    normalizeLongitude(
      Math.atan2(Math.sin(ascension * DEG) * Math.cos(e), Math.cos(ascension * DEG)) * RAD
    )
  );
}

/**
 * The East Point, or equatorial ascendant: the ecliptic point rising where the
 * celestial equator meets the eastern horizon, with right ascension RAMC + 90°.
 * It depends on the sidereal time and the obliquity, not on the latitude.
 */
export function eastPointOf(input: AngleInput): number {
  return obliqueLongitude(ramcOf(input) + 90, 0, input.obliquity);
}

/**
 * The Vertex: where the prime vertical, the great circle through the zenith
 * and the east and west points, meets the ecliptic in the west. It is the
 * descendant of the colatitude, taken on the western side of the meridian. At
 * the equator the prime vertical is the celestial equator, and the Vertex is
 * the equinox west of the meridian. Where the ecliptic passes through the
 * zenith, the two circles meet on the meridian and neither point is west.
 */
export function vertexOf(input: AngleInput, angles: Angles): number {
  const colatitude = input.latitude >= 0 ? 90 - input.latitude : -90 - input.latitude;
  const vertex = obliqueLongitude(ramcOf(input) - 90, colatitude, input.obliquity);
  return normalizeLongitude(vertex - angles.mc) >= 180 ? vertex : normalizeLongitude(vertex + 180);
}

export function computeHouses(
  system: HouseSystem,
  input: AngleInput,
  angles: Angles
): { houses: Houses; fellBack: boolean; fallbackSystem: HouseSystem | null } {
  const as = (cusps: number[]) => ({
    houses: { system, cusps },
    fellBack: false,
    fallbackSystem: null
  });
  const polar = (cusps: number[] | null) =>
    cusps
      ? as(cusps)
      : {
          houses: { system: POLAR_FALLBACK, cusps: wholeSignCusps(angles.asc) },
          fellBack: true,
          fallbackSystem: POLAR_FALLBACK
        };
  switch (system) {
    case "placidus":
      return polar(placidusCusps(input, angles));
    case "koch":
      return polar(kochCusps(input, angles));
    case "porphyry":
      return as(porphyryCusps(angles));
    case "equal":
      return as(equalCusps(angles));
    case "equal-mc":
      return as(equalMcCusps(angles));
    case "vehlow":
      return as(vehlowCusps(angles));
    case "regiomontanus":
      return as(regiomontanusCusps(input, angles));
    case "campanus":
      return as(campanusCusps(input, angles));
    case "topocentric":
      return as(topocentricCusps(input, angles));
    case "alcabitius":
      return as(alcabitiusCusps(input, angles));
    case "morinus":
      return as(morinusCusps(input));
    case "meridian":
      return as(meridianCusps(input));
    case "whole":
      return as(wholeSignCusps(angles.asc));
    default:
      throw new RangeError(`Unknown house system ${String(system satisfies never)}.`);
  }
}

export function houseOf(longitude: number, cusps: readonly number[]): HouseNumber {
  if (cusps.length !== 12) throw new RangeError("House cusps must contain 12 longitudes.");
  for (let index = 0; index < 12; index += 1) {
    const start = cusps[index];
    const end = cusps[(index + 1) % 12];
    if (start === undefined || end === undefined) continue;
    const span = normalizeLongitude(end - start);
    const offset = normalizeLongitude(longitude - start);
    if (offset < span || span === 0) return (index + 1) as HouseNumber;
  }
  return 12;
}
