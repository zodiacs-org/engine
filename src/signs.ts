import type { Element, Modality, SignDefinition, ZodiacSign } from "./types.js";

export const ELEMENTS = ["fire", "earth", "air", "water"] as const satisfies readonly Element[];
export const MODALITIES = ["cardinal", "fixed", "mutable"] as const satisfies readonly Modality[];

export const SIGNS = [
  {
    slug: "aries",
    name: "Aries",
    element: "fire",
    modality: "cardinal",
    polarity: "day",
    naturalHouse: 1
  },
  {
    slug: "taurus",
    name: "Taurus",
    element: "earth",
    modality: "fixed",
    polarity: "night",
    naturalHouse: 2
  },
  {
    slug: "gemini",
    name: "Gemini",
    element: "air",
    modality: "mutable",
    polarity: "day",
    naturalHouse: 3
  },
  {
    slug: "cancer",
    name: "Cancer",
    element: "water",
    modality: "cardinal",
    polarity: "night",
    naturalHouse: 4
  },
  {
    slug: "leo",
    name: "Leo",
    element: "fire",
    modality: "fixed",
    polarity: "day",
    naturalHouse: 5
  },
  {
    slug: "virgo",
    name: "Virgo",
    element: "earth",
    modality: "mutable",
    polarity: "night",
    naturalHouse: 6
  },
  {
    slug: "libra",
    name: "Libra",
    element: "air",
    modality: "cardinal",
    polarity: "day",
    naturalHouse: 7
  },
  {
    slug: "scorpio",
    name: "Scorpio",
    element: "water",
    modality: "fixed",
    polarity: "night",
    naturalHouse: 8
  },
  {
    slug: "sagittarius",
    name: "Sagittarius",
    element: "fire",
    modality: "mutable",
    polarity: "day",
    naturalHouse: 9
  },
  {
    slug: "capricorn",
    name: "Capricorn",
    element: "earth",
    modality: "cardinal",
    polarity: "night",
    naturalHouse: 10
  },
  {
    slug: "aquarius",
    name: "Aquarius",
    element: "air",
    modality: "fixed",
    polarity: "day",
    naturalHouse: 11
  },
  {
    slug: "pisces",
    name: "Pisces",
    element: "water",
    modality: "mutable",
    polarity: "night",
    naturalHouse: 12
  }
] as const satisfies readonly SignDefinition[];

export const SIGN_NAMES = SIGNS.map((sign) => sign.slug) as readonly ZodiacSign[];

export function normalizeLongitude(lon: number): number {
  if (!Number.isFinite(lon)) throw new RangeError("Longitude must be finite.");
  return ((lon % 360) + 360) % 360;
}

export function signIndexForLongitude(lon: number): number {
  return Math.floor(normalizeLongitude(lon) / 30);
}

export function signForLongitude(lon: number): SignDefinition {
  const sign = SIGNS[signIndexForLongitude(lon)];
  if (!sign) throw new RangeError("Could not resolve zodiac sign.");
  return sign;
}

export function degreeInSign(lon: number): number {
  return normalizeLongitude(lon) % 30;
}
