/**
 * Krishnamurti Paddhati sub-lords. Each nakshatra is cut into nine subs in
 * the Vimshottari proportions (a lord's years / 120 of 13°20′), starting with
 * the nakshatra's own lord; each sub is cut the same way into nine sub-subs
 * starting with the sub's lord. Cutting the 243 subs where signs change
 * gives the 249 numbered subs of KP horary. All boundaries are exact ticks.
 */
import { NAKSHATRA_TICKS, SIGN_TICKS, TICKS_PER_DEGREE, YEAR_TICKS, ticksOf } from "./grid.js";
import { NAKSHATRAS, VIMSHOTTARI_LORDS, VIMSHOTTARI_YEARS } from "./nakshatra.js";
import type { NakshatraName, VimshottariLord } from "./nakshatra.js";
import { requireSidereal } from "./sidereal.js";
import type { SiderealLongitude } from "./sidereal.js";
import { SIGN_SLUGS } from "../signs.js";
import type { ZodiacSign } from "../types.js";

/**
 * Traditional sign rulers, Aries to Pisces (BPHS 4, Santhanam 1984): the same
 * rulers as @zodiacs/engine/techniques's DOMICILE_RULERS and
 * @zodiacs/engine/timing's TRADITIONAL_RULERS. Each entry point carries its
 * own copy, so that none imports another; a test keeps the three equal.
 */
export const SIGN_LORDS = Object.freeze([
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter"
] as const);
/** A traditional sign ruler. */
export type SignLord = (typeof SIGN_LORDS)[number];

/** One of the 249 numbered KP subs, frozen. */
export interface KpSub {
  /** 1 to 249 from 0° Aries. */
  readonly number: number;
  readonly sign: ZodiacSign;
  readonly signLord: SignLord;
  readonly star: NakshatraName;
  readonly starLord: VimshottariLord;
  readonly subLord: VimshottariLord;
  /** Sidereal degrees; start inclusive, end exclusive. */
  readonly start: number;
  readonly end: number;
}

interface Segment extends KpSub {
  readonly startTicks: number;
  readonly endTicks: number;
  /** The whole (uncut) sub's start, for its sub-subs. */
  readonly subTicks: number;
  readonly lord: number;
}

const years = (lord: number): number => VIMSHOTTARI_YEARS[VIMSHOTTARI_LORDS[lord % 9]!];

const SEGMENTS: readonly Segment[] = (() => {
  const out: Segment[] = [];
  for (let n = 0; n < 27; n += 1) {
    let at = n * NAKSHATRA_TICKS;
    for (let k = 0; k < 9; k += 1) {
      const lord = (n + k) % 9;
      const end = at + years(lord) * YEAR_TICKS;
      for (let from = at; from < end;) {
        const to = Math.min(end, (Math.floor(from / SIGN_TICKS) + 1) * SIGN_TICKS);
        const sign = Math.floor(from / SIGN_TICKS);
        out.push({
          number: out.length + 1, sign: SIGN_SLUGS[sign]!, signLord: SIGN_LORDS[sign]!,
          star: NAKSHATRAS[n]!, starLord: VIMSHOTTARI_LORDS[n % 9]!, subLord: VIMSHOTTARI_LORDS[lord]!,
          start: from / TICKS_PER_DEGREE, end: to / TICKS_PER_DEGREE,
          startTicks: from, endTicks: to, subTicks: at, lord
        });
        from = to;
      }
      at = end;
    }
  }
  return out;
})();

/** The 249 KP subs from 0° Aries, frozen. */
export const KP_SUBS: readonly KpSub[] = Object.freeze(SEGMENTS.map(
  ({ number, sign, signLord, star, starLord, subLord, start, end }) =>
    Object.freeze({ number, sign, signLord, star, starLord, subLord, start, end })
));

/** kpLordsOf's result, frozen. */
export interface KpLords {
  readonly sub: KpSub;
  readonly sign: ZodiacSign;
  readonly signLord: SignLord;
  readonly star: NakshatraName;
  readonly starLord: VimshottariLord;
  readonly subLord: VimshottariLord;
  readonly subSubLord: VimshottariLord;
}

/**
 * The sign lord, star lord, sub-lord and sub-sub-lord of a sidereal
 * longitude, with its numbered sub; a longitude on a boundary takes the part
 * that starts there. It uses whatever ayanamsa the argument carries.
 */
export function kpLordsOf(position: SiderealLongitude): KpLords {
  const ticks = ticksOf(requireSidereal(position).lon);
  let low = 0;
  let high = SEGMENTS.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (SEGMENTS[mid]!.startTicks <= ticks) low = mid;
    else high = mid - 1;
  }
  const segment = SEGMENTS[low]!;
  let offset = ticks - segment.subTicks;
  let j = 0;
  // A sub-sub is (sub years × its years × 7) ticks: 840 × Ys × Yss / 120.
  for (; j < 8; j += 1) {
    const length = years(segment.lord) * years(segment.lord + j) * 7;
    if (offset < length) break;
    offset -= length;
  }
  return Object.freeze({
    sub: KP_SUBS[low]!,
    sign: segment.sign,
    signLord: segment.signLord,
    star: segment.star,
    starLord: segment.starLord,
    subLord: segment.subLord,
    subSubLord: VIMSHOTTARI_LORDS[(segment.lord + j) % 9]!
  });
}
