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
 * in the fixture.
 *
 * The engine side is src/vedic/ayanamsa.ts's ayanamsaAt at each row's TT
 * instant, and its rate the central difference over plus and minus 0.001 day
 * of TT, as src/calc-sidereal.test.ts computes them. A difference is taken to
 * the nearest whole turn, since a caller's ayanamsa need not lie within a turn
 * of zero and the engine's is wrapped.
 */
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

import { AstroTime } from "astronomy-engine";

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
type StarSeries = Series & { readonly name: AyanamsaName; readonly year: number; readonly leastElongation: number };
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
  const out = {
    generator: "docs/evidence/calc-sidereal-2026-10-05/tools/differences.ts --every-year",
    source: header,
    units:
      "largest |engine − ERFA| of the mean ayanamsa, arcseconds, and of its rate, arcseconds a day; jd in TT. years: for each star, one row a year:" +
      " [year, ERFA's least angle from the Sun that year (degrees), then for each of the bands star, starNearSun and starAtSun: comparisons," +
      " largest position difference, largest rate difference]. callers: [definition, comparisons, largest position difference, largest rate difference]",
    nearSunDegrees: NEAR_SUN_DEGREES,
    atSunDegrees: AT_SUN_DEGREES,
    bands,
    bounds: AYANAMSA_BOUNDS,
    extraYears,
    extraCallers,
    years,
    callers
  };
  writeFileSync(new URL("../results/every-year.json", import.meta.url), `${JSON.stringify(out)}\n`);
  console.log(JSON.stringify({ bands, extraYears, extraCallers }, null, 1));
}
