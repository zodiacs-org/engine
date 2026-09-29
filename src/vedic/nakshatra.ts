/**
 * The 27 nakshatras of 13°20′ from 0° sidereal Aries, their Vimshottari
 * lords, and the four padas of 3°20′. BPHS ch. 46 vv. 12–15 (Santhanam 1984):
 * from Krittika the lords run Sun, Moon, Mars, Rahu, Jupiter, Saturn,
 * Mercury, Ketu, Venus, so Ashwini, the first, is Ketu's.
 */
import { NAKSHATRA_TICKS, PADA_TICKS, ticksOf } from "./grid.js";
import { requireSidereal } from "./sidereal.js";
import type { SiderealLongitude } from "./sidereal.js";

/** The nine lords in Vimshottari order, from Ketu, Ashwini's lord. */
export const VIMSHOTTARI_LORDS = Object.freeze([
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"
] as const);
/** A Vimshottari lord. */
export type VimshottariLord = (typeof VIMSHOTTARI_LORDS)[number];

/** Mahadasha years, BPHS 46.15; they total 120. */
export const VIMSHOTTARI_YEARS: Readonly<Record<VimshottariLord, number>> = Object.freeze({
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17
});

/** The 27 nakshatras of 13°20′ from 0° sidereal Aries. */
export const NAKSHATRAS = Object.freeze([
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha",
  "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
  "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada",
  "Uttara Bhadrapada", "Revati"
] as const);
/** A nakshatra's name. */
export type NakshatraName = (typeof NAKSHATRAS)[number];

/** nakshatraOf's result, frozen. */
export interface NakshatraPosition {
  /** 0 for Ashwini through 26 for Revati. */
  readonly index: number;
  readonly name: NakshatraName;
  readonly lord: VimshottariLord;
  readonly pada: 1 | 2 | 3 | 4;
  /** Where the nakshatra starts, sidereal degrees (index × 40/3). */
  readonly start: number;
  /** The fraction of the nakshatra traversed, in [0, 1). */
  readonly elapsed: number;
}

/**
 * The nakshatra and pada of a sidereal longitude, placed exactly on the
 * double's binary value: on a boundary, the part that begins there. Most
 * boundaries are not doubles; 93 + 20/60 lies below 93°20′ (Punarvasu).
 */
export function nakshatraOf(position: SiderealLongitude): NakshatraPosition {
  const { lon } = requireSidereal(position);
  const ticks = ticksOf(lon);
  const index = Math.floor(ticks / NAKSHATRA_TICKS);
  const start = (index * 40) / 3;
  return Object.freeze({
    index,
    name: NAKSHATRAS[index]!,
    lord: VIMSHOTTARI_LORDS[index % 9]!,
    pada: (Math.floor((ticks - index * NAKSHATRA_TICKS) / PADA_TICKS) + 1) as 1 | 2 | 3 | 4,
    start,
    elapsed: Math.min(Math.max(((lon - start) * 3) / 40, 0), 1 - Number.EPSILON / 2)
  });
}
