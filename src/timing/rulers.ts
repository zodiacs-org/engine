/*
 * The traditional rulership vocabulary the timing techniques share.
 */
import type { ZodiacSign } from "../types.js";

/** The seven visible planets of the traditional rulership scheme. */
export type TraditionalPlanet = "Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn";

/**
 * The traditional domicile ruler of each sign; the outer planets rule none.
 * The same rulers as @zodiacs/engine/techniques's DOMICILE_RULERS and
 * @zodiacs/engine/vedic's SIGN_LORDS. Each entry point carries its own copy,
 * so that none imports another; a test keeps the three equal.
 */
export const TRADITIONAL_RULERS: Readonly<Record<ZodiacSign, TraditionalPlanet>> = /*#__PURE__*/ Object.freeze({
  aries: "Mars",
  taurus: "Venus",
  gemini: "Mercury",
  cancer: "Moon",
  leo: "Sun",
  virgo: "Mercury",
  libra: "Venus",
  scorpio: "Mars",
  sagittarius: "Jupiter",
  capricorn: "Saturn",
  aquarius: "Saturn",
  pisces: "Jupiter"
});

/** The seven planets in descending order of their spheres, Saturn to the Moon. */
export const CHALDEAN_ORDER: readonly TraditionalPlanet[] = /*#__PURE__*/ Object.freeze([
  "Saturn",
  "Jupiter",
  "Mars",
  "Sun",
  "Venus",
  "Mercury",
  "Moon"
]);
