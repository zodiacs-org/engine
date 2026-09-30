/**
 * Nakshatra dashas from the Moon's sidereal longitude at birth: Vimshottari
 * to five levels, and Yogini and Ashtottari mahadashas. BPHS ch. 46
 * (Santhanam 1984) is the source for all three; ch. 51 vv. 1–2 for the
 * Vimshottari sub-periods.
 *
 * Time is elapsed-time arithmetic: a dasha year is a fixed number of days of
 * 86,400,000 ms, chosen by name, and every boundary is birth + (years since
 * the period's start) × that year. Calendar dates play no part. The part of
 * the birth nakshatra already traversed is taken from the Moon's longitude
 * (the arc fraction), as modern tables do; BPHS's worked examples use the
 * Moon's time in the nakshatra (bhayat/bhabhog), which differs slightly.
 */
import { NAKSHATRA_TICKS, TICKS_PER_DEGREE, ticksOf } from "./grid.js";
import { VIMSHOTTARI_LORDS, VIMSHOTTARI_YEARS, nakshatraOf } from "./nakshatra.js";
import { requireSidereal } from "./sidereal.js";
import type { SiderealLongitude } from "./sidereal.js";
import { dateFrom } from "../date-input.js";
import type { DateInput } from "../types.js";

/** The dasha systems implemented. */
export type DashaSystem = "vimshottari" | "yogini" | "ashtottari";
/** A dasha year's length by name; DASHA_YEAR_DAYS gives its days. */
export type DashaYearLength = "julian" | "tropical" | "savana";

/** Days in a dasha year: Julian (default), tropical, and the 360-day savana year. */
export const DASHA_YEAR_DAYS: Readonly<Record<DashaYearLength, number>> = Object.freeze({
  julian: 365.25, tropical: 365.2422, savana: 360
});

/** The names of Vimshottari levels 1 to 5. */
export const DASHA_LEVELS = Object.freeze([
  "mahadasha", "antardasha", "pratyantardasha", "sookshmadasha", "pranadasha"
] as const);
/** A level's name. */
export type DashaLevelName = (typeof DASHA_LEVELS)[number];

/** Yogini dasha (BPHS 46.195–199): yogini, planet, years. */
export const YOGINIS = Object.freeze([
  ["Mangala", "Moon", 1], ["Pingala", "Sun", 2], ["Dhanya", "Jupiter", 3], ["Bhramari", "Mars", 4],
  ["Bhadrika", "Mercury", 5], ["Ulka", "Saturn", 6], ["Siddha", "Venus", 7], ["Sankata", "Rahu", 8]
].map(([name, planet, years]) => Object.freeze({ name: name as string, planet: planet as string, years: years as number })));

/** Ashtottari lords in order, with their years (BPHS 46.17–20). */
export const ASHTOTTARI_YEARS = Object.freeze({
  Sun: 6, Moon: 15, Mars: 8, Mercury: 17, Saturn: 10, Jupiter: 19, Rahu: 12, Venus: 21
} as const);

/** A dasha period, frozen; only the dasha functions make one. */
export interface DashaPeriod {
  readonly system: DashaSystem;
  readonly level: 1 | 2 | 3 | 4 | 5;
  readonly levelName: DashaLevelName;
  /** Lords from the mahadasha down to this period. */
  readonly lords: readonly string[];
  readonly lord: string;
  /**
   * ISO 8601 UTC, the boundaries rounded to the millisecond. The period runs
   * from `start` (inclusive) to `end` (exclusive); vimshottariAt uses these.
   */
  readonly start: string;
  readonly end: string;
  /** The unrounded boundaries, milliseconds since 1970-01-01T00:00Z. */
  readonly startMs: number;
  readonly endMs: number;
  /** Length in dasha years. */
  readonly years: number;
}

/** Options for the dasha functions. */
export interface DashaOptions {
  /** "julian" (365.25 days, the default), "tropical" (365.2422) or "savana" (360). */
  readonly yearLength?: DashaYearLength;
}

/** A dasha system's result, frozen. */
export interface DashaResult {
  readonly system: DashaSystem;
  readonly yearLength: DashaYearLength;
  readonly yearDays: number;
  /** The Moon's instant, taken as the birth instant, ISO 8601 UTC. */
  readonly birth: string;
  /** The Moon's sidereal longitude and its ayanamsa label. */
  readonly moon: number;
  readonly ayanamsa: string;
  /** The mahadasha running at birth and the years of it still to run. */
  readonly balance: { readonly lord: string; readonly years: number };
  /** Consecutive mahadashas from the one running at birth, which starts before birth. */
  readonly mahadashas: readonly DashaPeriod[];
}

interface Context {
  readonly yearMs: number;
  readonly lords: readonly number[];
}
const CONTEXT = new WeakMap<object, Context>();

const iso = (ms: number): string => new Date(Math.round(ms)).toISOString();

function yearDaysOf(options: DashaOptions | undefined): [DashaYearLength, number] {
  const name = options?.yearLength ?? "julian";
  if (typeof name !== "string" || !Object.hasOwn(DASHA_YEAR_DAYS, name)) {
    throw new RangeError("yearLength must be julian, tropical or savana.");
  }
  return [name, DASHA_YEAR_DAYS[name]];
}

function moonAndBirth(moon: SiderealLongitude): { moon: SiderealLongitude; birthMs: number } {
  const checked = requireSidereal(moon);
  if (checked.utc === null) throw new RangeError("The Moon's SiderealLongitude must carry its instant.");
  return { moon: checked, birthMs: Date.parse(checked.utc) };
}

function integer(value: unknown, low: number, high: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < low || value > high) {
    throw new RangeError(`${label} must be an integer from ${low} to ${high}.`);
  }
  return value;
}

/**
 * Consecutive periods from `startMs`: boundaries share one expression, so
 * they meet exactly. Sub-periods pass their parent's `endMs`, so the last one
 * ends exactly where the parent does.
 */
function sequence(system: DashaSystem, parentLords: readonly number[], names: readonly string[],
  indices: readonly number[], years: readonly number[], startMs: number, yearMs: number, endMs?: number): DashaPeriod[] {
  const level = (parentLords.length + 1) as DashaPeriod["level"];
  const out: DashaPeriod[] = [];
  let elapsed = 0;
  indices.forEach((index, i) => {
    const lords = [...parentLords, index];
    const from = startMs + elapsed * yearMs;
    elapsed += years[i]!;
    const to = endMs !== undefined && i === indices.length - 1 ? endMs : startMs + elapsed * yearMs;
    const period: DashaPeriod = Object.freeze({
      system, level, levelName: DASHA_LEVELS[level - 1]!,
      lords: Object.freeze(lords.map((l) => names[l]!)), lord: names[index]!,
      start: iso(from), end: iso(to), startMs: from, endMs: to, years: years[i]!
    });
    CONTEXT.set(period, { yearMs, lords });
    out.push(period);
  });
  return out;
}

function result(system: DashaSystem, yearLength: DashaYearLength, yearDays: number, moon: SiderealLongitude,
  birthMs: number, balance: { lord: string; years: number }, mahadashas: DashaPeriod[]): DashaResult {
  return Object.freeze({
    system, yearLength, yearDays, birth: iso(birthMs), moon: moon.lon, ayanamsa: moon.ayanamsa,
    balance: Object.freeze(balance), mahadashas: Object.freeze(mahadashas)
  });
}

const vimYears = (index: number): number => VIMSHOTTARI_YEARS[VIMSHOTTARI_LORDS[index]!];

/**
 * Vimshottari mahadashas (BPHS 46.12–16), 120 years from the birth
 * nakshatra's lord, whose untraversed fraction is the balance; the first
 * starts before birth. `moon` must carry its instant.
 */
export function vimshottariDasha(moon: SiderealLongitude, options?: DashaOptions): DashaResult {
  const [yearLength, yearDays] = yearDaysOf(options);
  const { moon: checked, birthMs } = moonAndBirth(moon);
  const { index, elapsed } = nakshatraOf(checked);
  const first = index % 9;
  const yearMs = yearDays * 86_400_000;
  const indices = Array.from({ length: 9 }, (_, k) => (first + k) % 9);
  const start = birthMs - elapsed * vimYears(first) * yearMs;
  return result("vimshottari", yearLength, yearDays, checked, birthMs,
    { lord: VIMSHOTTARI_LORDS[first]!, years: (1 - elapsed) * vimYears(first) },
    sequence("vimshottari", [], VIMSHOTTARI_LORDS, indices, indices.map(vimYears), start, yearMs));
}

/**
 * The nine sub-periods of a Vimshottari period of levels 1–4 (BPHS 51.1–2),
 * from its own lord, each period years × its years / 120.
 */
export function dashaSubperiods(period: DashaPeriod): readonly DashaPeriod[] {
  const context = typeof period === "object" && period !== null ? CONTEXT.get(period) : undefined;
  if (!context || period.system !== "vimshottari") {
    throw new RangeError("Sub-periods are implemented for Vimshottari periods made by this engine only.");
  }
  if (period.level >= 5) throw new RangeError("Vimshottari periods stop at the fifth level (prana).");
  const own = context.lords[context.lords.length - 1]!;
  const indices = Array.from({ length: 9 }, (_, k) => (own + k) % 9);
  return Object.freeze(sequence("vimshottari", context.lords, VIMSHOTTARI_LORDS, indices,
    indices.map((i) => (period.years * vimYears(i)) / 120), period.startMs, context.yearMs, period.endMs));
}

/** Options for vimshottariAt. */
export interface DashaAtOptions extends DashaOptions {
  /** How many levels to descend, 1 (mahadasha) to 5 (prana); default 5. */
  readonly levels?: number;
}

/**
 * The Vimshottari periods running at `at`, mahadasha first, down to
 * `levels`, compared with the periods' `start` and `end`: a period's own
 * `start` finds it. Outside the 120 years, a RangeError.
 */
export function vimshottariAt(moon: SiderealLongitude, at: DateInput, options?: DashaAtOptions): readonly DashaPeriod[] {
  const levels = integer(options?.levels ?? 5, 1, 5, "levels");
  const when = dateFrom(at, "at").getTime();
  const chain: DashaPeriod[] = [];
  let periods: readonly DashaPeriod[] = vimshottariDasha(moon, options).mahadashas;
  for (let level = 1; level <= levels; level += 1) {
    const found = periods.find((p) => Math.round(p.startMs) <= when && when < Math.round(p.endMs));
    if (!found) throw new RangeError("at is outside the 120-year Vimshottari cycle of this Moon.");
    chain.push(found);
    if (level < levels) periods = dashaSubperiods(found);
  }
  return Object.freeze(chain);
}

/** Options for yoginiDasha and ashtottariDasha. */
export interface CycleOptions extends DashaOptions {
  /** Complete cycles of mahadashas to list, 1 to 10; default 1. */
  readonly cycles?: number;
}

/**
 * Yogini mahadashas (BPHS 46.195–199): the nakshatra's number plus 3,
 * remainder by 8, gives the yogini at birth; 36 years a cycle.
 */
export function yoginiDasha(moon: SiderealLongitude, options?: CycleOptions): DashaResult {
  const [yearLength, yearDays] = yearDaysOf(options);
  const cycles = integer(options?.cycles ?? 1, 1, 10, "cycles");
  const { moon: checked, birthMs } = moonAndBirth(moon);
  const { index, elapsed } = nakshatraOf(checked);
  const first = (index + 3) % 8;
  const yearMs = yearDays * 86_400_000;
  const names = YOGINIS.map((y) => y.name);
  const indices = Array.from({ length: 8 * cycles }, (_, k) => (first + k) % 8);
  const years = indices.map((i) => YOGINIS[i]!.years);
  return result("yogini", yearLength, yearDays, checked, birthMs,
    { lord: names[first]!, years: (1 - elapsed) * years[0]! },
    sequence("yogini", [], names, indices, years, birthMs - elapsed * years[0]! * yearMs, yearMs));
}

// Ashtottari counts 28 nakshatras: Abhijit is the last pada of Uttara Ashadha
// plus the first fifteenth of Shravana (BPHS 46.21–22, note).
const ABHIJIT_START = 20 * NAKSHATRA_TICKS + 3 * (NAKSHATRA_TICKS / 4);
const ABHIJIT_END = 21 * NAKSHATRA_TICKS + NAKSHATRA_TICKS / 15;
const ASHTOTTARI_LORDS = Object.keys(ASHTOTTARI_YEARS) as (keyof typeof ASHTOTTARI_YEARS)[];
const GROUP_SIZES = [4, 3, 4, 3, 4, 3, 4, 3];

/**
 * Ashtottari mahadashas (BPHS 46.17–22): 28 nakshatras with Abhijit, from
 * Ardra in groups of 4, 3, 4, 3, …, each an equal share of its lord's years;
 * 108 years a cycle. When it applies (46.17–23) is for the caller to decide.
 */
export function ashtottariDasha(moon: SiderealLongitude, options?: CycleOptions): DashaResult {
  const [yearLength, yearDays] = yearDaysOf(options);
  const cycles = integer(options?.cycles ?? 1, 1, 10, "cycles");
  const { moon: checked, birthMs } = moonAndBirth(moon);
  const ticks = ticksOf(checked.lon);
  const standard = Math.floor(ticks / NAKSHATRA_TICKS);
  // Position among the 28, its start and its extent in ticks.
  let position: number;
  let from: number;
  let to: number;
  if (ticks >= ABHIJIT_START && ticks < ABHIJIT_END) [position, from, to] = [21, ABHIJIT_START, ABHIJIT_END];
  else {
    position = standard + (standard >= 21 ? 1 : 0);
    from = standard === 21 ? ABHIJIT_END : standard * NAKSHATRA_TICKS;
    to = standard === 20 ? ABHIJIT_START : (standard + 1) * NAKSHATRA_TICKS;
  }
  const elapsed = Math.min(Math.max((checked.lon * TICKS_PER_DEGREE - from) / (to - from), 0), 1 - Number.EPSILON / 2);
  let offset = (position - 5 + 28) % 28;
  let group = 0;
  while (offset >= GROUP_SIZES[group]!) offset -= GROUP_SIZES[group++]!;
  const size = GROUP_SIZES[group]!;
  const total = ASHTOTTARI_YEARS[ASHTOTTARI_LORDS[group]!];
  const balance = ((1 - elapsed) * total) / size + ((size - 1 - offset) * total) / size;
  const yearMs = yearDays * 86_400_000;
  const indices = Array.from({ length: 8 * cycles }, (_, k) => (group + k) % 8);
  const years = indices.map((i) => ASHTOTTARI_YEARS[ASHTOTTARI_LORDS[i]!]);
  return result("ashtottari", yearLength, yearDays, checked, birthMs,
    { lord: ASHTOTTARI_LORDS[group]!, years: balance },
    sequence("ashtottari", [], ASHTOTTARI_LORDS, indices, years, birthMs - (total - balance) * yearMs, yearMs));
}
