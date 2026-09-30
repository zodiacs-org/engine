/*
 * The void-of-course Moon. William Lilly, Christian Astrology (1647), p. 112
 * (long s printed as s): "A Planet is voyd of course, when he is seperated
 * from a Planet, nor doth forthwith, during his being in that Signe, apply to
 * any other: This is most usually in the ☽". Ported from the Zodiacs.org site
 * (src/lib/engine/void-of-course.ts); VOID_OF_COURSE_CONVENTION names the
 * convention and docs/techniques.md describes it.
 */
import { findLongitudeCrossingsWith } from "../crossings.js";
import { dateFrom } from "../date-input.js";
import { bodyLongitude } from "../ephemeris.js";
import { SIGN_NAMES } from "../signs.js";
import type { AspectType, DateInput, ZodiacSign } from "../types.js";
import { DAY_MS, oneOf, readOptions } from "./shared.js";

/** A body whose aspect to the Moon can end a void period. */
export type VoidBody = "Sun" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn" | "Uranus" | "Neptune" | "Pluto";

/** `"modern"`: the Sun and the eight planets. `"traditional"`: the Sun to Saturn. */
export type VoidBodies = "modern" | "traditional";

export const VOID_BODIES: Readonly<Record<VoidBodies, readonly VoidBody[]>> = /*#__PURE__*/ Object.freeze({
  modern: Object.freeze(["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"] as const),
  traditional: Object.freeze(["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"] as const)
});

/**
 * A void period runs from the Moon's last exact aspect in a sign (one of
 * `aspects`, in ecliptic longitude, to one of the chosen bodies) to its entry
 * into the next sign; with none, from its entry into the sign. No orbs, no
 * latitude, no nodes, angles or points; an aspect perfected in the next sign
 * does not count.
 */
export const VOID_OF_COURSE_CONVENTION = /*#__PURE__*/ Object.freeze({
  name: "last-exact-ptolemaic-aspect-to-sign-exit",
  aspects: Object.freeze(["conjunction", "sextile", "square", "trine", "opposition"] as const),
  defaultBodies: "modern" as VoidBodies,
  source: "Lilly, Christian Astrology (1647), p. 112"
});

/** Each aspect as the Moon meets it from either side: a sextile perfects at +60° and at 300°. */
const OFFSETS: readonly [AspectType, number][] = [
  ["conjunction", 0], ["sextile", 60], ["sextile", 300], ["square", 90], ["square", 270], ["trine", 120], ["trine", 240], ["opposition", 180]
];

export interface MoonIngress {
  readonly at: Date;
  readonly sign: ZodiacSign;
}

export interface MoonAspect {
  readonly at: Date;
  readonly body: VoidBody;
  readonly aspect: AspectType;
  /** The Moon's longitude at `at`, degrees. */
  readonly moonLon: number;
}

export interface VoidOfCourseWindow {
  /** The last aspect in the sign, or the entry into it when `lastAspect` is null. */
  readonly from: Date;
  /** The entry into `nextSign`. */
  readonly to: Date;
  readonly lastAspect: MoonAspect | null;
  readonly sign: ZodiacSign;
  readonly nextSign: ZodiacSign;
}

export interface VoidOfCourseStatus {
  readonly at: Date;
  readonly isVoid: boolean;
  /** The period in progress at `at`. */
  readonly current: VoidOfCourseWindow | null;
  /** The next period to begin after `at`. */
  readonly next: VoidOfCourseWindow | null;
}

export interface VoidOfCourseOptions {
  /** `"modern"` by default. */
  bodies?: VoidBodies | undefined;
}

/** The longest window the scans accept, days. */
export const VOID_OF_COURSE_MAX_DAYS = 3660;

const BODY_SETS: readonly VoidBodies[] = ["modern", "traditional"];

const bodiesOf = (options: unknown): readonly VoidBody[] =>
  VOID_BODIES[oneOf(readOptions(options, ["bodies"], "void-of-course options").bodies, BODY_SETS, "modern", "bodies")];

function span(from: DateInput, to: DateInput): [number, number] {
  const start = dateFrom(from, "from").getTime();
  const end = dateFrom(to, "to").getTime();
  if (start > end) throw new RangeError("from must not be after to.");
  if (end - start > VOID_OF_COURSE_MAX_DAYS * DAY_MS) throw new RangeError(`The window must not exceed ${VOID_OF_COURSE_MAX_DAYS} days.`);
  return [start, end];
}

/** Signed shortest angular distance a→b, degrees in (−180, 180]. */
function delta(a: number, b: number): number {
  const d = (((b - a) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

function ingresses(fromT: number, toT: number): { at: Date; signIndex: number }[] {
  const out: { at: Date; signIndex: number }[] = [];
  if (!(toT > fromT)) return out;
  for (let signIndex = 0; signIndex < 12; signIndex += 1) {
    // Six-hour steps: the Moon covers at most about 4° in six hours.
    for (const crossing of findLongitudeCrossingsWith(bodyLongitude, "Moon", signIndex * 30, new Date(fromT), new Date(toT), 0.25)) {
      if (!crossing.retrograde) out.push({ at: crossing.at, signIndex });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function aspects(fromT: number, toT: number, bodies: readonly VoidBody[]): MoonAspect[] {
  if (!(toT > fromT)) return [];
  const pairs = bodies.flatMap((body) => OFFSETS.map(([type, offset]) => ({ body, type, offset })));
  const separation = (body: VoidBody, angle: number, t: number): number =>
    delta(bodyLongitude(body, new Date(t)) + angle, bodyLongitude("Moon", new Date(t)));
  const out: MoonAspect[] = [];
  let prevT = fromT;
  const prev = pairs.map(({ body, offset }) => separation(body, offset, prevT));
  while (prevT < toT) {
    // Samples every 3 hours; the Moon always outruns the planets, so the separation is monotonic between them.
    const t = Math.min(prevT + DAY_MS / 8, toT);
    const moonLon = bodyLongitude("Moon", new Date(t));
    const bodyLons = new Map(bodies.map((body) => [body, bodyLongitude(body, new Date(t))]));
    pairs.forEach(({ body, type, offset }, i) => {
      const cur = delta((bodyLons.get(body) ?? 0) + offset, moonLon);
      const before = prev[i]!;
      if (cur === 0 && before !== 0 && Math.abs(before) < 90) {
        out.push({ at: new Date(t), body, aspect: type, moonLon });
      } else if (before !== 0 && cur !== 0 && Math.sign(cur) !== Math.sign(before) && Math.abs(cur) < 90 && Math.abs(before) < 90) {
        let lo = prevT;
        let hi = t;
        const rising = cur > before;
        for (let k = 0; k < 26; k += 1) {
          const mid = (lo + hi) / 2;
          if (separation(body, offset, mid) > 0 === rising) hi = mid;
          else lo = mid;
        }
        const at = new Date(hi);
        out.push({ at, body, aspect: type, moonLon: bodyLongitude("Moon", at) });
      }
      prev[i] = cur;
    });
    prevT = t;
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function windows(fromT: number, toT: number, bodies: readonly VoidBody[]): VoidOfCourseWindow[] {
  // The Moon spends under three days in a sign: four days back finds the entry into it.
  const list = ingresses(fromT - 4 * DAY_MS, toT);
  const out: VoidOfCourseWindow[] = [];
  for (let i = 1; i < list.length; i += 1) {
    const entered = list[i - 1]!;
    const leaving = list[i]!;
    const end = leaving.at.getTime();
    if (end <= fromT) continue;
    const inSign = aspects(entered.at.getTime(), end, bodies).filter((aspect) => aspect.at.getTime() < end);
    const lastAspect = inSign[inSign.length - 1] ?? null;
    out.push(
      Object.freeze({
        from: new Date((lastAspect ?? entered).at.getTime()),
        to: new Date(end),
        lastAspect: lastAspect && Object.freeze(lastAspect),
        sign: SIGN_NAMES[entered.signIndex]!,
        nextSign: SIGN_NAMES[leaving.signIndex]!
      })
    );
  }
  return out;
}

/** Every entry of the apparent Moon into a sign in (from, to], in time order (6-hour steps). */
export function moonIngresses(from: DateInput, to: DateInput): readonly MoonIngress[] {
  return Object.freeze(ingresses(...span(from, to)).map((row) => Object.freeze({ at: row.at, sign: SIGN_NAMES[row.signIndex]! })));
}

/** Every exact Ptolemaic aspect of the Moon to the chosen bodies in (from, to]: 3-hour samples, 26 bisections. */
export function moonAspects(from: DateInput, to: DateInput, options?: VoidOfCourseOptions): readonly MoonAspect[] {
  const bodies = bodiesOf(options);
  return Object.freeze(aspects(...span(from, to), bodies).map((row) => Object.freeze(row)));
}

/** Every void period whose ending ingress falls in (from, to], under VOID_OF_COURSE_CONVENTION. */
export function voidOfCourseWindows(from: DateInput, to: DateInput, options?: VoidOfCourseOptions): readonly VoidOfCourseWindow[] {
  const bodies = bodiesOf(options);
  return Object.freeze(windows(...span(from, to), bodies));
}

/** Whether the Moon is void of course at `at`, the period in progress and the next. */
export function voidOfCourseAt(at: DateInput, options?: VoidOfCourseOptions): VoidOfCourseStatus {
  const bodies = bodiesOf(options);
  const t = dateFrom(at, "at").getTime();
  const list = windows(t - 3 * DAY_MS, t + 6 * DAY_MS, bodies);
  const current = list.find((window) => window.from.getTime() <= t && t < window.to.getTime()) ?? null;
  return Object.freeze({ at: new Date(t), isVoid: current !== null, current, next: list.find((window) => window.from.getTime() > t) ?? null });
}
