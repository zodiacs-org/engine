/*
 * Annual and monthly profections: a natal point advanced one whole sign for
 * each year of life, and within the year one sign for each month.
 *
 * Sources: Vettius Valens, *Anthologies* IV.11 and IV.28 (tr. Riley);
 * Ptolemy, *Tetrabiblos* IV.10 (tr. Robbins); al-Bīrūnī, *Book of
 * Instruction* §§522–524 (tr. Wright). See docs/timing-hellenistic.md.
 */
import type { NatalSource } from "../api.js";
import { dateFrom } from "../date-input.js";
import type { DateInput, HouseNumber, ZodiacSign } from "../types.js";
import { TRADITIONAL_RULERS } from "./rulers.js";
import type { TraditionalPlanet } from "./rulers.js";
import {
  chartLongitude,
  dateAt,
  integerIn,
  longitudeName,
  natalContext,
  oneOf,
  originOf,
  placeFrom,
  readOptions,
  sectContradictsAltitude,
  signAt,
  startSign,
  timingFlags
} from "./shared.js";
import type { ChartLongitudeName, TimingFlag, TimingOrigin } from "./shared.js";
import { solarYears } from "./solar-years.js";
import type { SolarYears } from "./solar-years.js";

/**
 * How a profection year is divided into months, each a sign on from the last.
 * `"solar"` (default): twelve, each from when the Sun has gained another 30°
 * on its natal longitude. `"twelfths"`: twelve equal parts of the year.
 * `"thirteenths"`: thirteen equal parts, the last repeating the year's sign.
 */
export type ProfectionMonthConvention = "solar" | "twelfths" | "thirteenths";

/** The month conventions `profectionAt` and `profectionYear` accept, default first. */
export const PROFECTION_MONTH_CONVENTIONS: readonly ProfectionMonthConvention[] = /*#__PURE__*/ Object.freeze([
  "solar",
  "twelfths",
  "thirteenths"
]);

/** The month convention used when none is named. */
export const DEFAULT_PROFECTION_MONTHS: ProfectionMonthConvention = "solar";

/** An annual profection by completed years alone. */
export interface AnnualProfection {
  /** Completed years of life; 0 is the first year. */
  readonly age: number;
  /** The sign or longitude counted from; its `point` is null. */
  readonly origin: TimingOrigin;
  readonly sign: ZodiacSign;
  /** The sign's traditional ruler, the lord of the year. */
  readonly ruler: TraditionalPlanet;
  /** `age mod 12 + 1`: the place counted inclusively from the origin (the whole-sign house from the Ascendant). */
  readonly house: HouseNumber;
}

/**
 * The sign `age` completed years on from the origin's sign, one sign a year,
 * and its ruler, the lord of the year. `origin` is a lowercase sign name or a
 * longitude in degrees. Age 0 is the first year of life. Negative, fractional
 * and unsafe ages throw RangeError.
 */
export function annualProfection(origin: ZodiacSign | number, age: number): AnnualProfection {
  const start = startSign(origin, "origin");
  const years = integerIn(age, 0, Number.MAX_SAFE_INTEGER, "age");
  const sign = signAt(start.index + (years % 12));
  return Object.freeze({
    age: years,
    origin: originOf(start.index, start.lon, null),
    sign,
    ruler: TRADITIONAL_RULERS[sign],
    house: placeFrom(years)
  });
}

/** The natal point a dated profection counts from. */
export interface ProfectionOrigin extends TimingOrigin {
  readonly point: ChartLongitudeName;
  readonly lon: number;
}

/** The conventions a dated profection was computed with. */
export interface ProfectionConventions {
  readonly year: "solar-return";
  readonly months: ProfectionMonthConvention;
  readonly rulers: "traditional-domicile";
}

/** A dated profection year or month; `start` is inclusive and `end` exclusive. */
export interface ProfectionSpan {
  readonly sign: ZodiacSign;
  readonly ruler: TraditionalPlanet;
  /** The place counted inclusively from the starting point's sign. */
  readonly house: HouseNumber;
  readonly start: Date;
  readonly end: Date;
}

/** One month of a profection year. */
export interface ProfectionMonth extends ProfectionSpan {
  /** 0 to 11, or to 12 with thirteenths. */
  readonly index: number;
}

/** The dated year of an annual profection and its months. */
export interface ProfectionYearSpan extends ProfectionSpan {
  /** Completed years of life. */
  readonly age: number;
}

/** A whole profection year with every month. */
export interface ProfectionYear extends ProfectionYearSpan {
  readonly origin: ProfectionOrigin;
  readonly months: readonly ProfectionMonth[];
  readonly conventions: ProfectionConventions;
  readonly flags: readonly TimingFlag[];
}

/** The profection year and month running at an instant. */
export interface ProfectionAt {
  readonly at: Date;
  readonly origin: ProfectionOrigin;
  readonly year: ProfectionYearSpan;
  readonly month: ProfectionMonth;
  readonly conventions: ProfectionConventions;
  readonly flags: readonly TimingFlag[];
}

/** Options for the dated profections. */
export interface ProfectionOptions {
  /** The natal body, angle or chart point to profect; `"Ascendant"` by default. */
  readonly point?: ChartLongitudeName | undefined;
  /** `"solar"` by default. */
  readonly months?: ProfectionMonthConvention | undefined;
}

const CONVENTION_CACHE = /*#__PURE__*/ new Map<ProfectionMonthConvention, ProfectionConventions>();

function conventionsFor(months: ProfectionMonthConvention): ProfectionConventions {
  let found = CONVENTION_CACHE.get(months);
  if (!found) {
    found = Object.freeze({ year: "solar-return", months, rulers: "traditional-domicile" } as const);
    CONVENTION_CACHE.set(months, found);
  }
  return found;
}

interface Setup {
  years: SolarYears;
  origin: ProfectionOrigin;
  startIndex: number;
  months: ProfectionMonthConvention;
  /** A lot's sign depends on the sect. */
  sectContradicted: boolean;
}

function setup(natal: NatalSource, options: ProfectionOptions | undefined): Setup {
  const read = readOptions(options, ["point", "months"], "profection options");
  const months = oneOf(read.months, PROFECTION_MONTH_CONVENTIONS, DEFAULT_PROFECTION_MONTHS, "months");
  const point = read.point === undefined ? "Ascendant" : longitudeName(read.point, "point");
  const { chart, points, birth } = natalContext(natal);
  const row = chartLongitude(chart, points, point, "point");
  const startIndex = Math.floor(row.lon / 30) % 12;
  return {
    years: solarYears(birth),
    origin: originOf(startIndex, row.lon, row.name),
    startIndex,
    months,
    sectContradicted: row.name.startsWith("Lot of") && sectContradictsAltitude(chart, points)
  };
}

function span(startIndex: number, offset: number, start: number, end: number): ProfectionSpan {
  const sign = signAt(startIndex + offset);
  return {
    sign,
    ruler: TRADITIONAL_RULERS[sign],
    house: placeFrom(offset),
    start: dateAt(start, "A profection boundary"),
    end: dateAt(end, "A profection boundary")
  };
}

/** Month boundaries of year `age`, from its start to its end inclusive. */
function monthBoundaries(years: SolarYears, age: number, months: ProfectionMonthConvention): number[] {
  const start = years.returnMs(age);
  const end = years.returnMs(age + 1);
  const count = months === "thirteenths" ? 13 : 12;
  const bounds = [start];
  for (let index = 1; index < count; index += 1) {
    const even = start + (index * (end - start)) / count;
    bounds.push(
      months === "solar"
        ? // The Sun's month boundaries lie within about two days of the even
          // twelfths (its equation of centre is under 2°).
          years.sunReaches(years.natalSun + 30 * index, even, 5)
        : Math.round(even)
    );
  }
  bounds.push(end);
  for (let index = 1; index < bounds.length; index += 1) {
    if (!(bounds[index]! > bounds[index - 1]!)) throw new RangeError("Profection months are out of order.");
  }
  return bounds;
}

function monthsOf(startIndex: number, age: number, bounds: readonly number[]): ProfectionMonth[] {
  const months: ProfectionMonth[] = [];
  for (let index = 0; index + 1 < bounds.length; index += 1) {
    months.push(Object.freeze({ index, ...span(startIndex, age + index, bounds[index]!, bounds[index + 1]!) }));
  }
  return months;
}

/**
 * The profection year of an age, dated, with its months. Year n runs from the
 * n-th solar return (the apparent Sun back on its natal longitude; the birth
 * for n = 0) to the next, on the engine's ephemeris from the chart's birth as
 * a UTC instant on the engine's time basis, not on a chart's pinned ΔT. The default point, the Ascendant, needs a birth time and
 * place. Invalid ages, options and points throw RangeError. Frozen.
 */
export function profectionYear(natal: NatalSource, age: number, options?: ProfectionOptions): ProfectionYear {
  const years = integerIn(age, 0, Number.MAX_SAFE_INTEGER, "age");
  const context = setup(natal, options);
  const bounds = monthBoundaries(context.years, years, context.months);
  return Object.freeze({
    age: years,
    ...span(context.startIndex, years, bounds[0]!, bounds[bounds.length - 1]!),
    origin: context.origin,
    months: Object.freeze(monthsOf(context.startIndex, years, bounds)),
    conventions: conventionsFor(context.months),
    flags: timingFlags([context.years.birthMs, bounds[0]!, bounds[bounds.length - 1]!], context.sectContradicted)
  });
}

/**
 * The profection year and month running at `date`. The year turns at the
 * solar return, which can be a day from the birthday. A date before birth
 * throws RangeError, as do {@link profectionYear}'s refusals. Frozen.
 */
export function profectionAt(natal: NatalSource, date: DateInput, options?: ProfectionOptions): ProfectionAt {
  const at = dateFrom(date, "date");
  const context = setup(natal, options);
  const { age } = context.years.yearAt(at.getTime());
  const bounds = monthBoundaries(context.years, age, context.months);
  const months = monthsOf(context.startIndex, age, bounds);
  const time = at.getTime();
  const month = months.find((candidate) => candidate.start.getTime() <= time && time < candidate.end.getTime());
  if (!month) throw new RangeError("Could not place the date within its profection year.");
  return Object.freeze({
    at,
    origin: context.origin,
    year: Object.freeze({ age, ...span(context.startIndex, age, bounds[0]!, bounds[bounds.length - 1]!) }),
    month,
    conventions: conventionsFor(context.months),
    flags: timingFlags([context.years.birthMs, bounds[0]!, bounds[bounds.length - 1]!], context.sectContradicted)
  });
}
