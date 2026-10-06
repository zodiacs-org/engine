/*
 * Firdaria (fardārāt): the Persian division of life into periods ruled by the
 * seven planets and the Moon's nodes, each planetary period shared in seven
 * equal sub-periods.
 *
 * Sources: al-Bīrūnī, *Book of Instruction* §§395, 438–439 (tr. Wright);
 * Abu Maʿshar, *On the Revolutions of the Years of Nativities* IV.1 and IV.7,
 * and Bonatti, *Liber astronomiae*, as quoted by Birchfield, "The Fardārāt in
 * Nativities" (2020). See docs/timing-hellenistic.md.
 */
import type { NatalSource } from "../api.js";
import { dateFrom } from "../date-input.js";
import type { DateInput, Sect } from "../types.js";
import { CHALDEAN_ORDER } from "./rulers.js";
import type { TraditionalPlanet } from "./rulers.js";
import { dateAt, integerIn, natalContext, oneOf, readOptions, sectContradictsAltitude, timingFlags } from "./shared.js";
import type { TimingFlag } from "./shared.js";
import { solarYears } from "./solar-years.js";
import type { SolarYears } from "./solar-years.js";

/** A lord of a firdaria period: a planet or one of the Moon's nodes. */
export type FirdariaLord = TraditionalPlanet | "North Node" | "South Node";

/**
 * Where the nodes fall by night; days are the same in both. `"abu-mashar"`
 * (default): last, after Mercury. `"bonatti"`: after Mars, as by day.
 */
export type FirdariaVariant = "abu-mashar" | "bonatti";

/** The variants the firdaria functions accept, default first. */
export const FIRDARIA_VARIANTS: readonly FirdariaVariant[] = /*#__PURE__*/ Object.freeze(["abu-mashar", "bonatti"]);

/** The variant used when none is named. */
export const DEFAULT_FIRDARIA_VARIANT: FirdariaVariant = "abu-mashar";

/** The years of each lord's period, 75 in all. */
export const FIRDARIA_YEARS: Readonly<Record<FirdariaLord, number>> = /*#__PURE__*/ Object.freeze({
  Sun: 10,
  Venus: 8,
  Mercury: 13,
  Moon: 9,
  Saturn: 11,
  Jupiter: 12,
  Mars: 7,
  "North Node": 3,
  "South Node": 2
});

/** The years of one sequence, after which it begins again. */
export const FIRDARIA_CYCLE_YEARS = 75;

const DAY_SEQUENCE: readonly FirdariaLord[] = /*#__PURE__*/ Object.freeze([
  "Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter", "Mars", "North Node", "South Node"
]);
const NIGHT_SEQUENCES: Readonly<Record<FirdariaVariant, readonly FirdariaLord[]>> = /*#__PURE__*/ Object.freeze({
  "abu-mashar": /*#__PURE__*/ Object.freeze<FirdariaLord[]>([
    "Moon", "Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "North Node", "South Node"
  ]),
  bonatti: /*#__PURE__*/ Object.freeze<FirdariaLord[]>([
    "Moon", "Saturn", "Jupiter", "Mars", "North Node", "South Node", "Sun", "Venus", "Mercury"
  ])
});

/** One of the seven equal shares of a planetary period, by age in years (start inclusive). */
export interface FirdariaSubPeriod {
  readonly lord: TraditionalPlanet;
  readonly startAge: number;
  readonly endAge: number;
}

/** One firdaria period, by age. */
export interface FirdariaPeriod {
  readonly lord: FirdariaLord;
  readonly years: number;
  readonly startAge: number;
  readonly endAge: number;
  /** Seven for a planet; none for the nodes. */
  readonly subPeriods: readonly FirdariaSubPeriod[];
}

/** A sub-period with its dates. */
export interface DatedFirdariaSubPeriod extends FirdariaSubPeriod {
  readonly start: Date;
  readonly end: Date;
}

/** A period with its dates. */
export interface DatedFirdariaPeriod {
  readonly lord: FirdariaLord;
  readonly years: number;
  /** 0 for the first 75 years of life. */
  readonly cycle: number;
  readonly startAge: number;
  readonly endAge: number;
  readonly start: Date;
  readonly end: Date;
  readonly subPeriods: readonly DatedFirdariaSubPeriod[];
}

/** The conventions dated firdaria were computed with. */
export interface FirdariaConventions {
  readonly variant: FirdariaVariant;
  readonly years: "solar-return";
  readonly subPeriods: "sevenths-descending-spheres";
}

/** Dated firdaria for one or more 75-year cycles. */
export interface FirdariaTimeline {
  readonly birth: Date;
  readonly sect: Sect;
  readonly periods: readonly DatedFirdariaPeriod[];
  readonly conventions: FirdariaConventions;
  readonly flags: readonly TimingFlag[];
}

/** The firdaria period and sub-period running at an instant. */
export interface FirdariaAt {
  readonly at: Date;
  readonly sect: Sect;
  /** Fractional age in solar-return years. */
  readonly age: number;
  readonly period: DatedFirdariaPeriod;
  /** Null in the nodes' periods. */
  readonly subPeriod: DatedFirdariaSubPeriod | null;
  readonly conventions: FirdariaConventions;
  readonly flags: readonly TimingFlag[];
}

/** Options for the firdaria functions. */
export interface FirdariaOptions {
  /** Where the nodes fall by night; `"abu-mashar"` by default. */
  readonly variant?: FirdariaVariant | undefined;
}

/** Options for {@link firdaria}. */
export interface FirdariaTimelineOptions extends FirdariaOptions {
  /** 75-year cycles to date, 1 to 4; 1 by default. */
  readonly cycles?: number | undefined;
}

function checkedSect(value: unknown): Sect {
  if (value === "day" || value === "night") return value;
  throw new RangeError('sect must be "day" or "night".');
}

function variantOf(
  options: unknown,
  allowed: readonly string[]
): { variant: FirdariaVariant; read: Readonly<Record<string, unknown>> } {
  const read = readOptions(options, allowed, "firdaria options");
  return { variant: oneOf(read.variant, FIRDARIA_VARIANTS, DEFAULT_FIRDARIA_VARIANT, "variant"), read };
}

/**
 * The firdaria lords in order: by day the planets from the Sun, by night from
 * the Moon, with the nodes where the variant puts them. Unknown sects and
 * variants throw RangeError. Frozen.
 */
export function firdariaSequence(sect: Sect, options?: FirdariaOptions): readonly FirdariaLord[] {
  const { variant } = variantOf(options, ["variant"]);
  return checkedSect(sect) === "day" ? DAY_SEQUENCE : NIGHT_SEQUENCES[variant];
}

function subPeriodsOf(lord: FirdariaLord, startAge: number, years: number): FirdariaSubPeriod[] {
  if (lord === "North Node" || lord === "South Node") return [];
  const first = CHALDEAN_ORDER.indexOf(lord);
  const shares: FirdariaSubPeriod[] = [];
  for (let index = 0; index < 7; index += 1) {
    shares.push(Object.freeze({
      lord: CHALDEAN_ORDER[(first + index) % 7]!,
      startAge: startAge + (index * years) / 7,
      endAge: index === 6 ? startAge + years : startAge + ((index + 1) * years) / 7
    }));
  }
  return shares;
}

function periodsOf(sequence: readonly FirdariaLord[], offset: number): FirdariaPeriod[] {
  const periods: FirdariaPeriod[] = [];
  let age = offset;
  for (const lord of sequence) {
    const years = FIRDARIA_YEARS[lord];
    periods.push(Object.freeze({
      lord,
      years,
      startAge: age,
      endAge: age + years,
      subPeriods: Object.freeze(subPeriodsOf(lord, age, years))
    }));
    age += years;
  }
  return periods;
}

/**
 * The nine periods of one 75-year cycle, by age. A planet's period has seven
 * equal shares, its own and then each planet below it in
 * {@link CHALDEAN_ORDER}; the nodes have none. Frozen.
 */
export function firdariaPeriods(sect: Sect, options?: FirdariaOptions): readonly FirdariaPeriod[] {
  return Object.freeze(periodsOf(firdariaSequence(sect, options), 0));
}

function datedPeriod(years: SolarYears, period: FirdariaPeriod, cycle: number): DatedFirdariaPeriod {
  return Object.freeze({
    lord: period.lord,
    years: period.years,
    cycle,
    startAge: period.startAge,
    endAge: period.endAge,
    start: dateAt(years.instantOf(period.startAge), "A firdaria boundary"),
    end: dateAt(years.instantOf(period.endAge), "A firdaria boundary"),
    subPeriods: Object.freeze(period.subPeriods.map((share) => Object.freeze({
      ...share,
      start: dateAt(years.instantOf(share.startAge), "A firdaria boundary"),
      end: dateAt(years.instantOf(share.endAge), "A firdaria boundary")
    })))
  });
}

function sectFrom(natal: NatalSource): { sect: Sect; birth: Date; sectContradicted: boolean } {
  const { chart, points, birth } = natalContext(natal);
  if (points.sect === null) {
    throw new RangeError("Firdaria need the chart's sect, which needs a birth time and place.");
  }
  return { sect: points.sect, birth, sectContradicted: sectContradictsAltitude(chart, points) };
}

function conventionsFor(variant: FirdariaVariant): FirdariaConventions {
  return Object.freeze({ variant, years: "solar-return", subPeriods: "sevenths-descending-spheres" } as const);
}

/**
 * Dated firdaria for `options.cycles` 75-year cycles (1 to 4). The sect comes
 * from `chartPoints`, so the chart needs a birth time and place. Whole ages
 * fall on the solar returns that begin profection years; fractional ages are
 * linear in time within their year. Invalid options throw RangeError. Frozen.
 */
export function firdaria(natal: NatalSource, options?: FirdariaTimelineOptions): FirdariaTimeline {
  const { variant, read } = variantOf(options, ["variant", "cycles"]);
  const cycles = read.cycles === undefined ? 1 : integerIn(read.cycles, 1, 4, "cycles");
  const { sect, birth, sectContradicted } = sectFrom(natal);
  const years = solarYears(birth);
  const sequence = firdariaSequence(sect, { variant });
  const periods: DatedFirdariaPeriod[] = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    for (const period of periodsOf(sequence, cycle * FIRDARIA_CYCLE_YEARS)) {
      periods.push(datedPeriod(years, period, cycle));
    }
  }
  return Object.freeze({
    birth: new Date(birth.getTime()),
    sect,
    periods: Object.freeze(periods),
    conventions: conventionsFor(variant),
    flags: timingFlags([birth.getTime(), periods.at(-1)!.end.getTime()], sectContradicted)
  });
}

/**
 * The period and sub-period running at `date`, and the age there: its
 * solar-return year and the elapsed fraction of it. A date before birth
 * throws RangeError. Frozen.
 */
export function firdariaAt(natal: NatalSource, date: DateInput, options?: FirdariaOptions): FirdariaAt {
  const at = dateFrom(date, "date");
  const { variant } = variantOf(options, ["variant"]);
  const { sect, birth, sectContradicted } = sectFrom(natal);
  const years = solarYears(birth);
  const time = at.getTime();
  const year = years.yearAt(time);
  const age = year.age + (time - year.start) / (year.end - year.start);
  const sequence = firdariaSequence(sect, { variant });
  // Choose by age, then confirm against the dated boundaries, which round to
  // whole milliseconds: at a boundary the neighbouring period may hold the date.
  const cycle = Math.floor(age / FIRDARIA_CYCLE_YEARS);
  const candidates: { period: FirdariaPeriod; cycle: number }[] = [];
  for (const each of [cycle - 1, cycle, cycle + 1]) {
    if (each < 0) continue;
    for (const period of periodsOf(sequence, each * FIRDARIA_CYCLE_YEARS)) candidates.push({ period, cycle: each });
  }
  const guess = candidates.findIndex(({ period }) => period.startAge <= age && age < period.endAge);
  const contains = (span: { start: Date; end: Date }) => span.start.getTime() <= time && time < span.end.getTime();
  let period: DatedFirdariaPeriod | undefined;
  for (const index of [guess, guess - 1, guess + 1]) {
    const candidate = index >= 0 ? candidates[index] : undefined;
    if (!candidate) continue;
    const dated = datedPeriod(years, candidate.period, candidate.cycle);
    if (contains(dated)) {
      period = dated;
      break;
    }
  }
  if (!period) throw new RangeError("Could not place the date within its firdaria period.");
  return Object.freeze({
    at,
    sect,
    age,
    period,
    subPeriod: period.subPeriods.find(contains) ?? null,
    conventions: conventionsFor(variant),
    flags: timingFlags(
      [birth.getTime(), year.start, year.end, period.start.getTime(), period.end.getTime()],
      sectContradicted
    )
  });
}
