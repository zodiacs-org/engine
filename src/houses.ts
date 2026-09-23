import type { Angles, HouseNumber, Houses, HouseSystem } from "./types.js";
import { normalizeLongitude } from "./signs.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export const HOUSE_SYSTEMS = ["whole", "placidus", "porphyry"] as const satisfies readonly HouseSystem[];

/**
 * The system Placidus falls back to where it is undefined, |latitude| ≥ 90° − ε.
 * The chart then carries the `polar-fallback` flag. Swiss Ephemeris falls back to
 * Porphyry there instead; ask for `"porphyry"` to get that system at any latitude.
 */
export const PLACIDUS_POLAR_FALLBACK = "whole" as const satisfies HouseSystem;

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

export function computeHouses(
  system: HouseSystem,
  input: AngleInput,
  angles: Angles
): { houses: Houses; fellBack: boolean; fallbackSystem: HouseSystem | null } {
  if (system === "porphyry") {
    return {
      houses: { system: "porphyry", cusps: porphyryCusps(angles) },
      fellBack: false,
      fallbackSystem: null
    };
  }
  if (system === "placidus") {
    const cusps = placidusCusps(input, angles);
    if (cusps) {
      return { houses: { system: "placidus", cusps }, fellBack: false, fallbackSystem: null };
    }
    return {
      houses: { system: PLACIDUS_POLAR_FALLBACK, cusps: wholeSignCusps(angles.asc) },
      fellBack: true,
      fallbackSystem: PLACIDUS_POLAR_FALLBACK
    };
  }
  return {
    houses: { system: "whole", cusps: wholeSignCusps(angles.asc) },
    fellBack: false,
    fallbackSystem: null
  };
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
