/*
 * Zodiacal releasing: Vettius Valens's distribution of the times from the Lot
 * of Fortune or the Lot of Spirit, with its sub-periods to the fourth level
 * and the loosing of the bond.
 *
 * Source: Vettius Valens, *Anthologies* IV.4–IV.10, tr. Mark T. Riley. See
 * docs/timing-hellenistic.md.
 */
import type { NatalSource } from "../api.js";
import { dateFrom } from "../date-input.js";
import { SIGN_SLUGS } from "../signs.js";
import type { DateInput, ZodiacSign } from "../types.js";
import { TRADITIONAL_RULERS } from "./rulers.js";
import type { TraditionalPlanet } from "./rulers.js";
import {
  DAY_MS,
  chartLongitude,
  dateAt,
  integerIn,
  natalContext,
  oneOf,
  originOf,
  readOptions,
  sectContradictsAltitude,
  signAt,
  startSign,
  timingFlags
} from "./shared.js";
import type { TimingFlag, TimingOrigin } from "./shared.js";

/** The years each sign allots: its ruler's minor years, but Capricorn 27 and Aquarius 30. */
export const VALENS_MINOR_YEARS: Readonly<Record<ZodiacSign, number>> = /*#__PURE__*/ Object.freeze({
  aries: 15,
  taurus: 8,
  gemini: 20,
  cancer: 25,
  leo: 19,
  virgo: 20,
  libra: 8,
  scorpio: 15,
  sagittarius: 12,
  capricorn: 27,
  aquarius: 30,
  pisces: 12
});

/** Units in one round of the twelve signs at any level. */
export const RELEASING_CYCLE_UNITS = 211;

/** A level of releasing: 1 for years, 2 months, 3 "days" and 4 "hours". */
export type ReleasingLevel = 1 | 2 | 3 | 4;

/** The lots releasing starts from. */
export type ReleasingLot = "Lot of Fortune" | "Lot of Spirit";

/**
 * The releasing year; each level below is a twelfth of the one above.
 * `"valens-360"` (default): 360 days, so 30-day months and 2½-day and 5-hour
 * units. `"julian-365.25"`: 365¼ days.
 */
export type ReleasingYearConvention = "valens-360" | "julian-365.25";

/** The year conventions the releasing functions accept, default first. */
export const RELEASING_YEAR_CONVENTIONS: readonly ReleasingYearConvention[] = /*#__PURE__*/ Object.freeze([
  "valens-360",
  "julian-365.25"
]);

/** The year convention used when none is named. */
export const DEFAULT_RELEASING_YEARS: ReleasingYearConvention = "valens-360";

// The quotients are written as numbers, each the double that 5/24, or
// 365.25/12, /144 or /1728, gives, so that a bundler can leave the table out
// (scripts/pure-tables.mjs).
/** Days in one unit of levels 1 to 4 (index 0 is level 1). */
export const RELEASING_UNIT_DAYS: Readonly<Record<ReleasingYearConvention, readonly [number, number, number, number]>> =
  /*#__PURE__*/ Object.freeze({
    "valens-360": /*#__PURE__*/ Object.freeze([360, 30, 2.5, 0.20833333333333334] as [number, number, number, number]),
    "julian-365.25": /*#__PURE__*/ Object.freeze([365.25, 30.4375, 2.5364583333333335, 0.2113715277777778] as [number, number, number, number])
  });

/**
 * Milliseconds in one level-4 unit: 5 hours, or 365.25/1728 days. Both are
 * whole numbers, so every boundary is an exact integer count of them.
 */
const LEVEL4_UNIT_MS: Readonly<Record<ReleasingYearConvention, number>> = /*#__PURE__*/ Object.freeze({
  "valens-360": 18_000_000,
  "julian-365.25": 18_262_500
});
/** Level-4 units in one unit of each level. */
const LEVEL_SCALE: Readonly<Record<ReleasingLevel, number>> = /*#__PURE__*/ Object.freeze({ 1: 1728, 2: 144, 3: 12, 4: 1 });
const MINOR: readonly number[] = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ SIGN_SLUGS.map((sign) => VALENS_MINOR_YEARS[sign]));
/** The most periods one call may return. */
const MAX_PERIODS = 100_000;

/** One releasing period; `start` is inclusive and `end` exclusive. */
export interface ReleasingPeriod {
  readonly level: ReleasingLevel;
  readonly sign: ZodiacSign;
  readonly ruler: TraditionalPlanet;
  /** The sign's minor years: its full length in units of this level. */
  readonly units: number;
  readonly start: Date;
  readonly end: Date;
  /** Days from birth to the start and to the end. */
  readonly startDays: number;
  readonly endDays: number;
  /** Cut short by the end of the enclosing period. */
  readonly truncated: boolean;
  /** The first period after the jump to the opposite sign. */
  readonly loosingOfTheBond: boolean;
}

/** What a releasing sequence counts from; `point` is the lot when read from a chart. */
export interface ReleasingOrigin extends TimingOrigin {
  readonly point: ReleasingLot | null;
}

/** The conventions a releasing result was computed with. */
export interface ReleasingConventions {
  readonly years: ReleasingYearConvention;
  readonly unitDays: readonly [number, number, number, number];
  readonly loosingOfTheBond: "levels-2-to-4;once-per-period;opposite-of-starting-sign";
  readonly rulers: "traditional-domicile";
}

/** The periods of every level up to `levels` that overlap a window. */
export interface ReleasingTimeline {
  readonly origin: ReleasingOrigin;
  readonly birth: Date;
  /** The window; `from` is clamped to birth. */
  readonly from: Date;
  readonly to: Date;
  readonly levels: ReleasingLevel;
  /** Each period followed by its sub-periods, so starts never decrease. */
  readonly periods: readonly ReleasingPeriod[];
  readonly conventions: ReleasingConventions;
  /** Empty unless read from a chart. */
  readonly flags: readonly TimingFlag[];
}

/** The four periods running at an instant. */
export interface ReleasingAt {
  readonly origin: ReleasingOrigin;
  readonly birth: Date;
  readonly at: Date;
  readonly elapsedDays: number;
  /** In releasing years of the chosen convention. */
  readonly elapsedYears: number;
  /** Levels 1 to 4. */
  readonly periods: readonly [ReleasingPeriod, ReleasingPeriod, ReleasingPeriod, ReleasingPeriod];
  readonly conventions: ReleasingConventions;
  /** Empty unless read from a chart. */
  readonly flags: readonly TimingFlag[];
}

/** Options for {@link releasingPeriods} and {@link zodiacalReleasing}. */
export interface ReleasingOptions {
  /** The deepest level, 1 to 4; 2 by default. */
  readonly levels?: ReleasingLevel | undefined;
  /** `"valens-360"` by default. */
  readonly years?: ReleasingYearConvention | undefined;
}

/** Options for {@link releasingAt} and {@link zodiacalReleasingAt}. */
export interface ReleasingAtOptions {
  /** `"valens-360"` by default. */
  readonly years?: ReleasingYearConvention | undefined;
}

interface Span {
  level: ReleasingLevel;
  sign: number;
  /** Level-4 units from birth. */
  start: number;
  end: number;
  truncated: boolean;
  loosing: boolean;
}

interface Walk {
  birthMs: number;
  unitMs: number;
  fromMs: number;
  toMs: number;
  levels: ReleasingLevel;
  out: ReleasingPeriod[];
}

const CONVENTIONS = /*#__PURE__*/ new Map<ReleasingYearConvention, ReleasingConventions>();

function conventionsFor(years: ReleasingYearConvention): ReleasingConventions {
  let found = CONVENTIONS.get(years);
  if (!found) {
    found = Object.freeze({
      years,
      unitDays: RELEASING_UNIT_DAYS[years],
      loosingOfTheBond: "levels-2-to-4;once-per-period;opposite-of-starting-sign",
      rulers: "traditional-domicile"
    } as const);
    CONVENTIONS.set(years, found);
  }
  return found;
}

function overlaps(walk: Walk, span: Span): boolean {
  const startMs = walk.birthMs + span.start * walk.unitMs;
  const endMs = walk.birthMs + span.end * walk.unitMs;
  return startMs <= walk.toMs && endMs > walk.fromMs;
}

function emit(walk: Walk, span: Span): void {
  if (walk.out.length >= MAX_PERIODS) {
    throw new RangeError(
      `The window holds more than ${MAX_PERIODS} releasing periods; narrow it or ask for fewer levels.`
    );
  }
  const sign = signAt(span.sign);
  walk.out.push(Object.freeze({
    level: span.level,
    sign,
    ruler: TRADITIONAL_RULERS[sign],
    units: MINOR[span.sign]!,
    start: dateAt(walk.birthMs + span.start * walk.unitMs, "A releasing boundary"),
    end: dateAt(walk.birthMs + span.end * walk.unitMs, "A releasing boundary"),
    // Exact integers of milliseconds, so whole days come out whole.
    startDays: (span.start * walk.unitMs) / DAY_MS,
    endDays: (span.end * walk.unitMs) / DAY_MS,
    truncated: span.truncated,
    loosingOfTheBond: span.loosing
  }));
}

/**
 * The sub-periods of `parent`, from its own sign in zodiacal order, each for
 * the sign's minor years in units of the level below. After a full round of
 * twelve signs the next sub-period jumps to the sign opposite the parent's
 * (the loosing of the bond) and the order continues from there, without a
 * second jump. The last sub-period is cut short at the parent's end.
 */
function visit(walk: Walk, span: Span): void {
  if (!overlaps(walk, span)) return;
  emit(walk, span);
  if (span.level >= walk.levels) return;
  const level = (span.level + 1) as ReleasingLevel;
  const scale = LEVEL_SCALE[level];
  let position = span.start;
  let sign = span.sign;
  let emitted = 0;
  let loosed = false;
  while (position < span.end) {
    let loosing = false;
    if (!loosed && emitted === 12) {
      sign = (span.sign + 6) % 12;
      loosed = true;
      loosing = true;
    }
    const nominal = MINOR[sign]! * scale;
    const end = Math.min(position + nominal, span.end);
    visit(walk, { level, sign, start: position, end, truncated: end < position + nominal, loosing });
    position = end;
    sign = (sign + 1) % 12;
    emitted += 1;
  }
}

function walkFrom(startIndex: number, walk: Walk): void {
  const scale = LEVEL_SCALE[1];
  let position = 0;
  let sign = startIndex;
  // Level 1 follows the signs in order from the lot, without a loosing of the
  // bond: Valens describes it only for sub-periods, and one round is 211 years.
  while (walk.birthMs + position * walk.unitMs <= walk.toMs) {
    const end = position + MINOR[sign]! * scale;
    visit(walk, { level: 1, sign, start: position, end, truncated: false, loosing: false });
    position = end;
    sign = (sign + 1) % 12;
  }
}

/** A window and its options, checked before any chart is computed. */
interface DateWindow {
  levels: ReleasingLevel;
  years: ReleasingYearConvention;
  from: Date;
  to: Date;
}

function windowOf(options: ReleasingOptions | undefined, from: DateInput, to: DateInput): DateWindow {
  const read = readOptions(options, ["levels", "years"], "releasing options");
  const levels = (read.levels === undefined ? 2 : integerIn(read.levels, 1, 4, "levels")) as ReleasingLevel;
  const years = oneOf(read.years, RELEASING_YEAR_CONVENTIONS, DEFAULT_RELEASING_YEARS, "years");
  const fromDate = dateFrom(from, "from");
  const toDate = dateFrom(to, "to");
  if (toDate.getTime() < fromDate.getTime()) throw new RangeError("to must not precede from.");
  return { levels, years, from: fromDate, to: toDate };
}

/** The year convention and instant for {@link releasingAt}, checked before any chart is computed. */
function instantOf(options: ReleasingAtOptions | undefined, date: DateInput): DateWindow {
  const read = readOptions(options, ["years"], "releasing options");
  const years = oneOf(read.years, RELEASING_YEAR_CONVENTIONS, DEFAULT_RELEASING_YEARS, "years");
  const at = dateFrom(date, "date");
  return { levels: 4, years, from: at, to: at };
}

function timeline(
  origin: ReleasingOrigin,
  startIndex: number,
  birth: Date,
  dates: DateWindow,
  flags: readonly TimingFlag[]
): ReleasingTimeline {
  const { levels, years, from: fromDate, to: toDate } = dates;
  const birthMs = birth.getTime();
  if (toDate.getTime() < birthMs) throw new RangeError("to must not precede the birth instant.");
  const fromMs = Math.max(fromDate.getTime(), birthMs);
  const walk: Walk = {
    birthMs,
    unitMs: LEVEL4_UNIT_MS[years],
    fromMs,
    toMs: toDate.getTime(),
    levels,
    out: []
  };
  walkFrom(startIndex, walk);
  return Object.freeze({
    origin,
    birth: new Date(birthMs),
    from: new Date(fromMs),
    to: toDate,
    levels,
    periods: Object.freeze(walk.out),
    conventions: conventionsFor(years),
    flags
  });
}

function chain(
  origin: ReleasingOrigin,
  startIndex: number,
  birth: Date,
  instant: DateWindow,
  flags: readonly TimingFlag[]
): ReleasingAt {
  const { years, from: at } = instant;
  if (at.getTime() < birth.getTime()) throw new RangeError("The date must not precede the birth instant.");
  const result = timeline(origin, startIndex, birth, instant, flags);
  const periods = result.periods;
  if (periods.length !== 4 || periods.some((period, index) => period.level !== index + 1)) {
    throw new RangeError("Could not place the date within one period of each level.");
  }
  const elapsedDays = (at.getTime() - birth.getTime()) / DAY_MS;
  return Object.freeze({
    origin,
    birth: new Date(birth.getTime()),
    at,
    elapsedDays,
    elapsedYears: elapsedDays / RELEASING_UNIT_DAYS[years][0],
    periods: periods as unknown as readonly [ReleasingPeriod, ReleasingPeriod, ReleasingPeriod, ReleasingPeriod],
    conventions: result.conventions,
    flags
  });
}

/**
 * The periods of levels 1 to `options.levels` (2 by default) that overlap
 * [from, to]. Level 1 runs from birth through the signs in order from the
 * origin (a sign name or a longitude). Each period is divided from its own
 * sign in the next level's units, the last cut short; after a round of 211
 * units the order jumps once to the opposite sign (the loosing of the bond).
 * Boundaries are whole level-4 units after birth. Bad input and windows of
 * more than 100,000 periods throw RangeError. Frozen.
 */
export function releasingPeriods(
  origin: ZodiacSign | number,
  birthUtc: DateInput,
  from: DateInput,
  to: DateInput,
  options?: ReleasingOptions
): ReleasingTimeline {
  const sign = startSign(origin, "origin");
  const birth = dateFrom(birthUtc, "birthUtc");
  return timeline(originOf(sign.index, sign.lon, null), sign.index, birth, windowOf(options, from, to), timingFlags([], false));
}

/**
 * The four periods running at `date`, as in {@link releasingPeriods}, with the
 * elapsed days and releasing years. A date before birth throws RangeError.
 * Frozen.
 */
export function releasingAt(
  origin: ZodiacSign | number,
  birthUtc: DateInput,
  date: DateInput,
  options?: ReleasingAtOptions
): ReleasingAt {
  const sign = startSign(origin, "origin");
  const birth = dateFrom(birthUtc, "birthUtc");
  return chain(originOf(sign.index, sign.lon, null), sign.index, birth, instantOf(options, date), timingFlags([], false));
}

function checkedLot(lot: unknown): ReleasingLot {
  if (lot !== "Lot of Fortune" && lot !== "Lot of Spirit") {
    throw new RangeError('lot must be "Lot of Fortune" or "Lot of Spirit".');
  }
  return lot;
}

function lotStart(
  natal: NatalSource,
  lot: ReleasingLot
): { origin: ReleasingOrigin; index: number; birth: Date; flags: readonly TimingFlag[] } {
  const { chart, points, birth } = natalContext(natal);
  const row = chartLongitude(chart, points, lot, "lot");
  const index = Math.floor(row.lon / 30) % 12;
  const flags = timingFlags([birth.getTime()], sectContradictsAltitude(chart, points));
  return { origin: originOf(index, row.lon, lot), index, birth, flags };
}

/**
 * {@link releasingPeriods} from a chart's Lot of Fortune or Spirit as
 * `chartPoints` computes it; the lots need a birth time and place.
 */
export function zodiacalReleasing(
  natal: NatalSource,
  lot: ReleasingLot,
  from: DateInput,
  to: DateInput,
  options?: ReleasingOptions
): ReleasingTimeline {
  const name = checkedLot(lot);
  const dates = windowOf(options, from, to);
  const { origin, index, birth, flags } = lotStart(natal, name);
  return timeline(origin, index, birth, dates, flags);
}

/** {@link releasingAt} from a chart's Lot of Fortune or Spirit, as `chartPoints` computes it. */
export function zodiacalReleasingAt(
  natal: NatalSource,
  lot: ReleasingLot,
  date: DateInput,
  options?: ReleasingAtOptions
): ReleasingAt {
  const name = checkedLot(lot);
  const instant = instantOf(options, date);
  const { origin, index, birth, flags } = lotStart(natal, name);
  return chain(origin, index, birth, instant, flags);
}
