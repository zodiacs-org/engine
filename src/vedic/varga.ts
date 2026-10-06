/**
 * The sixteen divisional charts (vargas) of Brihat Parashara Hora Shastra,
 * ch. 6 vv. 2–41 (R. Santhanam's translation, 1984). Each sign is cut into
 * n parts and part k is mapped to a sign; placement is exact on the tick
 * grid (grid.ts), a longitude on a boundary taking the part that starts there.
 */
import { SIGN_TICKS, ticksOf } from "./grid.js";
import { requireSidereal } from "./sidereal.js";
import type { SiderealLongitude } from "./sidereal.js";
import { SIGN_SLUGS } from "../signs.js";
import type { ZodiacSign } from "../types.js";

/** The sixteen vargas of BPHS 6.2–4. */
export type VargaName =
  | "D1" | "D2" | "D3" | "D4" | "D7" | "D9" | "D10" | "D12"
  | "D16" | "D20" | "D24" | "D27" | "D30" | "D40" | "D45" | "D60";

/** "parashari" is BPHS's rule; "cyclic" (parivritti, D2 and D3 only) counts the parts on from Aries. */
export type VargaScheme = "parashari" | "cyclic";

/** A VARGAS entry, frozen. */
export interface VargaDefinition {
  readonly name: VargaName;
  readonly title: string;
  readonly divisions: number;
  /** The Parashari rule in words, with its verse. */
  readonly rule: string;
  /** Schemes this engine computes. */
  readonly schemes: readonly VargaScheme[];
  /** Named variants known from later practice that are not implemented. */
  readonly notImplemented: readonly string[];
}

// Starting sign (0 = Aries) of part 0 for a sign index s; parts then run on in zodiacal order.
type Start = (s: number) => number;
const odd = (s: number) => s % 2 === 0; // Aries (index 0) is the first, odd, sign
const quality = (s: number, movable: number, fixed: number, dual: number) => [movable, fixed, dual][s % 3]!;

interface Rule extends VargaDefinition { readonly start?: Start }

function rule(name: VargaName, title: string, divisions: number, text: string, start?: Start,
  cyclic = false, notImplemented: readonly string[] = []): Rule {
  return Object.freeze({
    name, title, divisions, rule: text, ...(start ? { start } : {}),
    schemes: Object.freeze(cyclic ? ["parashari", "cyclic"] : ["parashari"]) as readonly VargaScheme[],
    notImplemented: Object.freeze([...notImplemented])
  });
}

const RULES: readonly Rule[] = [
  rule("D1", "Rashi", 1, "The sign itself (6.5).", (s) => s),
  rule("D2", "Hora", 2, "Odd signs: Leo, then Cancer; even signs: Cancer, then Leo (6.5–6).",
    undefined, true, ["kashinatha"]),
  rule("D3", "Drekkana", 3, "The sign, the 5th and the 9th (6.7–8).", (s) => s, true,
    ["jagannatha", "somanatha"]),
  rule("D4", "Chaturthamsa", 4, "The sign, the 4th, 7th and 10th (6.9).", (s) => s),
  rule("D7", "Saptamsa", 7, "Odd signs from the sign; even from the 7th (6.10–11).", (s) => (odd(s) ? s : s + 6)),
  rule("D9", "Navamsa", 9, "Movable from the sign, fixed from the 9th, dual from the 5th (6.12).",
    (s) => s + quality(s, 0, 8, 4)),
  rule("D10", "Dasamsa", 10, "Odd signs from the sign; even from the 9th (6.13–14).", (s) => (odd(s) ? s : s + 8)),
  rule("D12", "Dvadasamsa", 12, "From the sign itself (6.15).", (s) => s),
  rule("D16", "Shodasamsa", 16, "Movable from Aries, fixed from Leo, dual from Sagittarius (6.16).",
    (s) => quality(s, 0, 4, 8)),
  rule("D20", "Vimsamsa", 20, "Movable from Aries, fixed from Sagittarius, dual from Leo (6.17–21).",
    (s) => quality(s, 0, 8, 4)),
  rule("D24", "Chaturvimsamsa", 24, "Odd signs from Leo; even from Cancer (6.22–23).", (s) => (odd(s) ? 4 : 3)),
  rule("D27", "Saptavimsamsa", 27, "Fire from Aries, earth from Cancer, air from Libra, water from Capricorn (6.24–26).",
    (s) => [0, 3, 6, 9][s % 4]!),
  rule("D30", "Trimsamsa", 5, "Odd signs: 5° Aries, 5° Aquarius, 8° Sagittarius, 7° Gemini, 5° Libra; even: 5° Taurus, 7° Virgo, 8° Pisces, 5° Capricorn, 5° Scorpio (6.27–28)."),
  rule("D40", "Khavedamsa", 40, "Odd signs from Aries; even from Libra (6.29–30).", (s) => (odd(s) ? 0 : 6)),
  rule("D45", "Akshavedamsa", 45, "Movable from Aries, fixed from Leo, dual from Sagittarius (6.31–32).",
    (s) => quality(s, 0, 4, 8)),
  rule("D60", "Shashtiamsa", 60, "From the sign: twice the degrees, remainder by 12 (6.33).",
    (s) => s)
];

/** The sixteen Parashari vargas, their rules, schemes and unimplemented variants. */
export const VARGAS: readonly VargaDefinition[] = Object.freeze(RULES.map(
  ({ name, title, divisions, rule: text, schemes, notImplemented }) =>
    Object.freeze({ name, title, divisions, rule: text, schemes, notImplemented })
));

/** vargaOf's result, frozen. */
export interface VargaPosition {
  readonly varga: VargaName;
  readonly scheme: VargaScheme;
  /** Which part of the natal sign, from 1 (the D30 has five, of 5°, 5°, 8°, 7°, 5°). */
  readonly part: number;
  readonly sign: ZodiacSign;
  /** 0 for Aries through 11 for Pisces. */
  readonly signIndex: number;
}

// Trimsamsa parts in degree order: their ends (degrees) and signs, odd and even signs.
const TRIMSAMSA = [
  { ends: [5, 10, 18, 25, 30], signs: [0, 10, 8, 2, 6] },
  { ends: [5, 12, 20, 25, 30], signs: [1, 5, 11, 9, 7] }
].map(({ ends, signs }) => ({ ends: ends.map((d) => d * 7560), signs }));

/**
 * The sign a sidereal longitude occupies in varga `varga`, by the Parashari
 * rule or, for D2 and D3, the cyclic count (BPHS 6.6–7). An unknown varga or
 * scheme, or an unimplemented variant, is a RangeError.
 */
export function vargaOf(position: SiderealLongitude, varga: VargaName, scheme: VargaScheme = "parashari"): VargaPosition {
  const found = RULES.find((candidate) => candidate.name === varga);
  if (!found) throw new RangeError(`Unknown varga: ${String(varga)}.`);
  if (!found.schemes.includes(scheme)) {
    throw new RangeError(found.notImplemented.includes(scheme) || scheme === "cyclic"
      ? `The ${String(scheme)} ${varga} is not implemented.` : `Unknown varga scheme: ${String(scheme)}.`);
  }
  const ticks = ticksOf(requireSidereal(position).lon);
  const s = Math.floor(ticks / SIGN_TICKS);
  const within = ticks - s * SIGN_TICKS;
  let part: number;
  let sign: number;
  if (varga === "D30") {
    const table = TRIMSAMSA[odd(s) ? 0 : 1]!;
    part = table.ends.findIndex((end) => within < end);
    sign = table.signs[part]!;
  } else {
    part = Math.floor(within / (SIGN_TICKS / found.divisions));
    if (scheme === "cyclic") sign = s * found.divisions + part;
    else if (varga === "D2") sign = (odd(s) ? part === 0 : part === 1) ? 4 : 3;
    else sign = found.start!(s) + (varga === "D3" ? 4 * part : varga === "D4" ? 3 * part : part);
  }
  const signIndex = ((sign % 12) + 12) % 12;
  return Object.freeze({ varga, scheme, part: part + 1, sign: SIGN_SLUGS[signIndex]!, signIndex });
}
