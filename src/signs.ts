import type { Element, Modality, SignDefinition, ZodiacSign } from "./types.js";

export const ELEMENTS = /*#__PURE__*/ Object.freeze(["fire", "earth", "air", "water"] as const) satisfies readonly Element[];
export const MODALITIES = /*#__PURE__*/ Object.freeze(["cardinal", "fixed", "mutable"] as const) satisfies readonly Modality[];

/** The twelve signs, frozen: signForLongitude returns these objects themselves. */
export const SIGNS = /*#__PURE__*/ Object.freeze([
  /*#__PURE__*/ Object.freeze({
    slug: "aries",
    name: "Aries",
    element: "fire",
    modality: "cardinal",
    polarity: "day",
    naturalHouse: 1
  } as const),
  /*#__PURE__*/ Object.freeze({
    slug: "taurus",
    name: "Taurus",
    element: "earth",
    modality: "fixed",
    polarity: "night",
    naturalHouse: 2
  } as const),
  /*#__PURE__*/ Object.freeze({
    slug: "gemini",
    name: "Gemini",
    element: "air",
    modality: "mutable",
    polarity: "day",
    naturalHouse: 3
  } as const),
  /*#__PURE__*/ Object.freeze({
    slug: "cancer",
    name: "Cancer",
    element: "water",
    modality: "cardinal",
    polarity: "night",
    naturalHouse: 4
  } as const),
  /*#__PURE__*/ Object.freeze({
    slug: "leo",
    name: "Leo",
    element: "fire",
    modality: "fixed",
    polarity: "day",
    naturalHouse: 5
  } as const),
  /*#__PURE__*/ Object.freeze({
    slug: "virgo",
    name: "Virgo",
    element: "earth",
    modality: "mutable",
    polarity: "night",
    naturalHouse: 6
  } as const),
  /*#__PURE__*/ Object.freeze({
    slug: "libra",
    name: "Libra",
    element: "air",
    modality: "cardinal",
    polarity: "day",
    naturalHouse: 7
  } as const),
  /*#__PURE__*/ Object.freeze({
    slug: "scorpio",
    name: "Scorpio",
    element: "water",
    modality: "fixed",
    polarity: "night",
    naturalHouse: 8
  } as const),
  /*#__PURE__*/ Object.freeze({
    slug: "sagittarius",
    name: "Sagittarius",
    element: "fire",
    modality: "mutable",
    polarity: "day",
    naturalHouse: 9
  } as const),
  /*#__PURE__*/ Object.freeze({
    slug: "capricorn",
    name: "Capricorn",
    element: "earth",
    modality: "cardinal",
    polarity: "night",
    naturalHouse: 10
  } as const),
  /*#__PURE__*/ Object.freeze({
    slug: "aquarius",
    name: "Aquarius",
    element: "air",
    modality: "fixed",
    polarity: "day",
    naturalHouse: 11
  } as const),
  /*#__PURE__*/ Object.freeze({
    slug: "pisces",
    name: "Pisces",
    element: "water",
    modality: "mutable",
    polarity: "night",
    naturalHouse: 12
  } as const)
] as const) satisfies readonly SignDefinition[];

/** The twelve signs' slugs, "aries" to "pisces", in zodiac order. */
export const SIGN_SLUGS = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ SIGNS.map((sign) => sign.slug)) as readonly ZodiacSign[];

/**
 * The twelve signs' slugs, as SIGN_SLUGS.
 * @deprecated It holds slugs ("aries"), not names ("Aries"); use SIGN_SLUGS.
 */
export const SIGN_NAMES: readonly ZodiacSign[] = SIGN_SLUGS;

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
