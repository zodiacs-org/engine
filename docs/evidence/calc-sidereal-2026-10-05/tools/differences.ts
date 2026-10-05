/**
 * The engine's mean ayanamsas and their rates against ERFA's, by the bands
 * the calc entry's bounds use.
 *
 *   npx vite-node docs/evidence/calc-sidereal-2026-10-05/tools/differences.ts
 *   npx vite-node docs/evidence/calc-sidereal-2026-10-05/tools/differences.ts --every-year <rows>
 *
 * Without arguments it reads the fixtures, src/fixtures/ayanamsa-rates.json
 * (tools/ayanamsa_rates.py) and src/fixtures/ayanamsa-rates-dense.json
 * (tools/dense_rates.py), and writes ../results/differences.json. With
 * --every-year it reads the JSON lines that `dense_rates.py --every-year`
 * writes, every star definition for every year from 1800 to 2199 and every
 * caller's ayanamsa at 401 instants, with ayanamsa-rates.json's rows, and
 * writes ../results/every-year.json: each band's comparisons and largest
 * differences, from which the bounds are set, each star's least angle
 * from the Sun and largest differences by band in every year, each caller's
 * largest differences, and the years and callers in which a band's largest
 * difference fell, which dense_rates.py's EXTRA_YEARS and EXTRA_CALLERS keep
 * in the fixture. And for every pass that ERFA or the engine caps, or comes
 * within dense_rates.py's NEAR_CAP of capping, `caps`: where each caps the
 * deflection's denominator, how far the engine's crossings fall from ERFA's,
 * how far the engine's margin is from ERFA's at the instant of ERFA's least, and
 * whether the series samples every 0.00001 day through the 0.001 day either
 * side of each engine crossing, in which a rate's central difference
 * straddles it. It exits with an error if one is not.
 *
 * The engine side is src/vedic/ayanamsa.ts's ayanamsaAt at each row's TT
 * instant, and its rate the central difference over plus and minus 0.001 day
 * of TT, as src/calc-sidereal.test.ts computes them. A difference is taken to
 * the nearest whole turn, since a caller's ayanamsa need not lie within a turn
 * of zero and the engine's is wrapped.
 */
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

import { AstroTime, Body, HelioVector } from "astronomy-engine";

import { AYANAMSA_BOUNDS, AT_SUN_DEGREES, NEAR_SUN_DEGREES } from "../../../../src/calc-ayanamsa.js";
import type { AyanamsaBand } from "../../../../src/calc-ayanamsa.js";
import { AYANAMSAS, userAyanamsa } from "../../../../src/vedic.js";
import type { AyanamsaDefinition, AyanamsaName } from "../../../../src/vedic.js";
import { ayanamsaAt } from "../../../../src/vedic/ayanamsa.js";

interface Row {
  readonly kind: "epoch" | "user" | "linear" | "star";
  readonly name: string;
  readonly jd: number;
  readonly mean: number;
  readonly rate: number;
  readonly epoch?: number;
  readonly value?: number;
  readonly model?: "engine" | "newcomb" | "iau1976";
}
interface Series {
  readonly jd: readonly number[];
  readonly mean: readonly number[];
  readonly rate: readonly number[];
}
interface CallerDefinition {
  readonly epoch: number;
  readonly value: number;
  readonly rate?: number;
  readonly model?: "engine" | "newcomb" | "iau1976";
}
type StarSeries = Series & {
  readonly name: AyanamsaName;
  readonly year: number;
  readonly closest: number;
  readonly leastElongation: number;
  readonly leastMarginAt: number;
  readonly capMargin: number;
  readonly capFromTo: readonly number[];
  readonly nearCapFromTo: readonly number[];
};
type CallerSeries = Series & { readonly definition: CallerDefinition };

const STEP = 0.001;
const at = (jd: number) => AstroTime.FromTerrestrialTime(jd - 2_451_545);
const turn = (degrees: number) => degrees - 360 * Math.round(degrees / 360);
const BANDS = Object.keys(AYANAMSA_BOUNDS) as AyanamsaBand[];

interface Largest {
  arcsec: number;
  name: string;
  jd: number;
  /** The engine's angle of the star from the Sun, degrees, for a star definition. */
  elongation: number | null;
  year?: number;
}
type Tally = Record<AyanamsaBand, { comparisons: number; position: Largest | null; rate: Largest | null }>;
const tally = (): Tally =>
  Object.fromEntries(BANDS.map((band) => [band, { comparisons: 0, position: null, rate: null }])) as unknown as Tally;

/** One comparison, added to each tally given. */
function compare(definition: AyanamsaDefinition, label: string, jd: number, mean: number, rate: number, tallies: Tally[], year?: number): void {
  const now = ayanamsaAt(definition, at(jd));
  const engineRate = turn(ayanamsaAt(definition, at(jd + STEP)).mean - ayanamsaAt(definition, at(jd - STEP)).mean) / (2 * STEP);
  const elongation = now.elongation;
  const band: AyanamsaBand =
    definition.kind !== "star" ? "epochOrLinear" : elongation! >= NEAR_SUN_DEGREES ? "star" : elongation! >= AT_SUN_DEGREES ? "starNearSun" : "starAtSun";
  const position = Math.abs(turn(now.mean - mean)) * 3600;
  const rateDifference = Math.abs(engineRate - rate) * 3600;
  const where = (arcsec: number): Largest => ({ arcsec, name: label, jd, elongation, ...(year === undefined ? {} : { year }) });
  for (const entry of tallies.map((t) => t[band])) {
    entry.comparisons++;
    if (!entry.position || position > entry.position.arcsec) entry.position = where(position);
    if (!entry.rate || rateDifference > entry.rate.arcsec) entry.rate = where(rateDifference);
  }
}

const callerDefinition = ({ epoch, value, rate, model }: CallerDefinition) =>
  userAyanamsa({ name: "caller", epoch: { julianDateTT: epoch }, value, ...(rate === undefined ? { model: model! } : { rate }) });
const callerLabel = ({ epoch, value, rate, model }: CallerDefinition) =>
  `caller: epoch ${epoch}, value ${value}, ${rate === undefined ? `model ${model}` : `rate ${rate}″/yr`}`;

/** Six significant figures. */
const sig = (x: number) => Number(x.toPrecision(6));

/**
 * The engine's own cap margin for a star definition: 1 + p·e less 1e-6/max(E², 1),
 * as apparentStar in src/vedic/ayanamsa.ts computes it, p·e being minus the cosine of
 * the star's angle from the Sun that ayanamsaAt returns, and E the heliocentric
 * Earth's distance (au) from astronomy-engine, as there. Below zero, the engine caps.
 */
function engineMargin(definition: AyanamsaDefinition, jd: number): number {
  const time = at(jd);
  const elongation = ayanamsaAt(definition, time).elongation!;
  const helio = HelioVector(Body.Earth, time);
  const distance = Math.hypot(helio.x, helio.y, helio.z);
  return 1 - Math.cos((elongation * Math.PI) / 180) - 1e-6 / Math.max(distance * distance, 1);
}

/** Where the engine's margin passes zero between `inside` (below zero) and `outside`, to 1e-8 day. */
function engineCrossing(definition: AyanamsaDefinition, inside: number, outside: number): number {
  while (Math.abs(outside - inside) > 1e-8) {
    const middle = (inside + outside) / 2;
    if (engineMargin(definition, middle) < 0) inside = middle;
    else outside = middle;
  }
  return (inside + outside) / 2;
}

/** The instant of the engine's least margin within 0.05 day of `centre`, to 1e-8 day. */
function engineLeast(definition: AyanamsaDefinition, centre: number): number {
  const golden = (Math.sqrt(5) - 1) / 2;
  let [lo, hi] = [centre - 0.05, centre + 0.05];
  while (hi - lo > 1e-8) {
    const a = hi - golden * (hi - lo);
    const b = lo + golden * (hi - lo);
    if (engineMargin(definition, a) < engineMargin(definition, b)) hi = b;
    else lo = a;
  }
  return (lo + hi) / 2;
}

/** True when `jds` (sorted) sample every 0.00001 day, to the 1e-8 day they are rounded to, from `from` to `to`. */
function sampledFinely(jds: readonly number[], from: number, to: number): boolean {
  const step = 0.00001 + 2e-8;
  const inside = jds.filter((jd) => jd >= from - step && jd <= to + step);
  if (inside.length === 0 || inside[0]! > from + step || inside[inside.length - 1]! < to - step) return false;
  return inside.every((jd, k) => k === 0 || jd - inside[k - 1]! <= step);
}

/** One row of `caps`, for a star series whose pass ERFA caps or nearly caps, or null when neither ERFA nor the engine comes near. */
function capRow(series: StarSeries): unknown[] | null {
  const definition = AYANAMSAS[series.name];
  // The engine's margin at the instant of ERFA's least, where capMargin is ERFA's.
  const engineThere = engineMargin(definition, series.leastMarginAt);
  if (series.capFromTo.length === 0 && series.nearCapFromTo.length === 0 && engineThere >= 1e-7) return null;
  const lowest = engineLeast(definition, series.leastMarginAt);
  const engineCaps = engineMargin(definition, lowest) < 0 ? [engineCrossing(definition, lowest, lowest - 0.3), engineCrossing(definition, lowest, lowest + 0.3)] : [];
  const jds = [...series.jd].sort((a, b) => a - b);
  const covered = engineCaps.every((c) => sampledFinely(jds, c - STEP, c + STEP));
  const minutes = (days: number) => Number((days * 1440).toFixed(3));
  return [
    series.name,
    series.year,
    series.capMargin,
    sig(engineThere - series.capMargin),
    series.capFromTo,
    engineCaps.map((c) => Number(c.toFixed(8))),
    series.capFromTo.length === 2 && engineCaps.length === 2 ? engineCaps.map((c, k) => minutes(c - series.capFromTo[k]!)) : null,
    covered
  ];
}

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../../src/fixtures/${name}`, import.meta.url), "utf8"));

/** ayanamsa_rates.py's rows: the built-ins and three callers on its grid, the stars every ten years. */
function compareSparseRows(tallies: Tally[]): void {
  const { rows } = fixture("ayanamsa-rates.json") as { rows: Row[] };
  const users = new Map<string, AyanamsaDefinition>();
  for (const row of rows) {
    let definition: AyanamsaDefinition = AYANAMSAS[row.name as AyanamsaName];
    if (row.kind === "user") {
      if (!users.has(row.name)) users.set(row.name, userAyanamsa({ name: row.name, epoch: { julianDateTT: row.epoch! }, value: row.value!, model: row.model! }));
      definition = users.get(row.name)!;
    }
    compare(definition, row.name, row.jd, row.mean, row.rate, tallies);
  }
}

const everyYearAt = process.argv.indexOf("--every-year");
if (everyYearAt === -1) {
  const dense = fixture("ayanamsa-rates-dense.json") as { stars: StarSeries[]; callers: CallerSeries[] };
  const bands = tally();
  compareSparseRows([bands]);
  for (const series of dense.stars) {
    series.jd.forEach((jd, k) => compare(AYANAMSAS[series.name], series.name, jd, series.mean[k]!, series.rate[k]!, [bands], series.year));
  }
  for (const series of dense.callers) {
    const definition = callerDefinition(series.definition);
    const label = callerLabel(series.definition);
    series.jd.forEach((jd, k) => compare(definition, label, jd, series.mean[k]!, series.rate[k]!, [bands]));
  }
  const out = {
    generator: "docs/evidence/calc-sidereal-2026-10-05/tools/differences.ts",
    units: "largest |engine − ERFA| of the mean ayanamsa, arcseconds, and of its rate, arcseconds a day; jd in TT",
    nearSunDegrees: NEAR_SUN_DEGREES,
    atSunDegrees: AT_SUN_DEGREES,
    bands,
    bounds: AYANAMSA_BOUNDS
  };
  writeFileSync(new URL("../results/differences.json", import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
  console.log(JSON.stringify(bands, null, 1));
} else {
  const lines = createInterface({ input: createReadStream(process.argv[everyYearAt + 1]!), crlfDelay: Infinity });
  const bands = tally();
  compareSparseRows([bands]);
  const years: Record<string, unknown[]> = {};
  const callers: unknown[] = [];
  const caps: unknown[][] = [];
  let header: unknown = null;
  for await (const line of lines) {
    const item = JSON.parse(line);
    if (header === null) {
      header = item;
      continue;
    }
    const own = tally();
    if (item.kind === "star") {
      const series = item as StarSeries;
      series.jd.forEach((jd, k) => compare(AYANAMSAS[series.name], series.name, jd, series.mean[k]!, series.rate[k]!, [bands, own], series.year));
      (years[series.name] ??= []).push([
        series.year,
        series.leastElongation,
        ...(["star", "starNearSun", "starAtSun"] as const).flatMap((band) =>
          own[band].comparisons === 0 ? [0, null, null] : [own[band].comparisons, sig(own[band].position!.arcsec), sig(own[band].rate!.arcsec)]
        )
      ]);
      const row = capRow(series);
      if (row) caps.push(row);
    } else {
      const series = item as CallerSeries;
      const definition = callerDefinition(series.definition);
      const label = callerLabel(series.definition);
      series.jd.forEach((jd, k) => compare(definition, label, jd, series.mean[k]!, series.rate[k]!, [bands, own]));
      const entry = own.epochOrLinear;
      callers.push([series.definition, entry.comparisons, sig(entry.position!.arcsec), sig(entry.rate!.arcsec)]);
    }
  }
  // The years and callers holding each band's largest differences, which the fixture keeps.
  const extraYears: Record<string, number[]> = {};
  const extraCallers: string[] = [];
  for (const band of BANDS) {
    for (const largest of [bands[band].position, bands[band].rate]) {
      if (!largest) continue;
      if (largest.year !== undefined) {
        const list = (extraYears[largest.name] ??= []);
        if (!list.includes(largest.year)) list.push(largest.year);
      } else if (!extraCallers.includes(largest.name)) {
        extraCallers.push(largest.name);
      }
    }
  }
  const capped = (by: number) => caps.filter((row) => (row[by] as number[]).length > 0);
  const offsets = caps.flatMap((row) => ((row[6] as number[] | null) ?? []).map((minutes) => [Math.abs(minutes), row[0], row[1]] as const));
  const largestOffset = offsets.reduce((a, b) => (b[0] > a[0] ? b : a), [0, "", 0] as const);
  const margins = caps.map((row) => [Math.abs(row[3] as number), row[0], row[1]] as const);
  const capSummary = {
    erfaCaps: capped(4).length,
    engineCaps: capped(5).length,
    engineOnly: caps.filter((row) => (row[5] as number[]).length > 0 && (row[4] as number[]).length === 0).map((row) => `${row[0]} ${row[1]}`),
    erfaOnly: caps.filter((row) => (row[4] as number[]).length > 0 && (row[5] as number[]).length === 0).map((row) => `${row[0]} ${row[1]}`),
    largestOffsetMinutes: { minutes: largestOffset[0], name: largestOffset[1], year: largestOffset[2] },
    largestMarginDifference: margins.reduce((a, b) => (b[0] > a[0] ? b : a), [0, "", 0] as const),
    uncovered: caps.filter((row) => row[7] !== true).map((row) => `${row[0]} ${row[1]}`)
  };
  const out = {
    generator: "docs/evidence/calc-sidereal-2026-10-05/tools/differences.ts --every-year",
    source: header,
    units:
      "largest |engine − ERFA| of the mean ayanamsa, arcseconds, and of its rate, arcseconds a day; jd in TT. years: for each star, one row a year:" +
      " [year, ERFA's least angle from the Sun that year (degrees), then for each of the bands star, starNearSun and starAtSun: comparisons," +
      " largest position difference, largest rate difference]. callers: [definition, comparisons, largest position difference, largest rate difference]." +
      " caps: one row for each pass ERFA or the engine caps or comes near capping: [star, year, ERFA's least margin 1 + p·e − dlim that" +
      " pass, the engine's margin at that instant less ERFA's, ERFA's crossings, the engine's crossings, the engine's less ERFA's in minutes," +
      " whether the series samples every 0.00001 day through 0.001 day either side of each engine crossing]",
    nearSunDegrees: NEAR_SUN_DEGREES,
    atSunDegrees: AT_SUN_DEGREES,
    bands,
    bounds: AYANAMSA_BOUNDS,
    extraYears,
    extraCallers,
    capSummary,
    years,
    callers,
    caps
  };
  writeFileSync(new URL("../results/every-year.json", import.meta.url), `${JSON.stringify(out)}\n`);
  console.log(JSON.stringify({ bands, extraYears, extraCallers, capSummary }, null, 1));
  if (capSummary.uncovered.length > 0) {
    console.error(`the series do not sample the engine's cap crossings finely in ${capSummary.uncovered.join(", ")}`);
    process.exit(1);
  }
}
