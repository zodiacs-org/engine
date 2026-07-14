import type { Angles, HouseNumber, Houses, HouseSystem } from "./types.js";
import { normalizeLongitude } from "./signs.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export const HOUSE_SYSTEMS = ["whole", "placidus"] as const satisfies readonly HouseSystem[];

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
  const asc = normalizeLongitude(
    Math.atan2(Math.cos(ra), -(Math.sin(ra) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * RAD
  );

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
 * Returns `null` when the construction is undefined in polar regions.
 */
export function placidusCusps(input: AngleInput, angles: Angles): number[] | null {
  if (Math.abs(input.latitude) > 66) return null;

  const ramc = ramcOf(input);
  const phi = input.latitude * DEG;

  function iterate(offset: number, multiplier: number): number | null {
    let ra = ramc + offset;
    for (let index = 0; index < 24; index += 1) {
      const lon = eclipticLongitudeOfRightAscension(normalizeLongitude(ra), input.obliquity);
      const declination = declinationOfLongitude(lon, input.obliquity);
      const argument = Math.tan(phi) * Math.tan(declination * DEG);
      if (Math.abs(argument) >= 1) return null;
      const ascensionalDifference = Math.asin(argument) * RAD;
      const next = ramc + offset + multiplier * ascensionalDifference;
      if (Math.abs(normalizeLongitude(next - ra + 180) - 180) < 1e-7) {
        ra = next;
        break;
      }
      ra = next;
    }
    return eclipticLongitudeOfRightAscension(normalizeLongitude(ra), input.obliquity);
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

export function computeHouses(
  system: HouseSystem,
  input: AngleInput,
  angles: Angles
): { houses: Houses; fellBack: boolean } {
  if (system === "placidus") {
    const cusps = placidusCusps(input, angles);
    if (cusps) {
      return { houses: { system: "placidus", cusps }, fellBack: false };
    }
    return {
      houses: { system: "whole", cusps: wholeSignCusps(angles.asc) },
      fellBack: true
    };
  }
  return {
    houses: { system: "whole", cusps: wholeSignCusps(angles.asc) },
    fellBack: false
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
