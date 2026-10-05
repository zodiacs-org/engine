/**
 * The engine's mean ayanamsas and their rates against ERFA's, by the bands
 * the calc entry's bounds use; writes ../results/differences.json.
 *
 *   npx vite-node docs/evidence/calc-sidereal-2026-10-05/tools/differences.ts
 *
 * The engine side is src/vedic/ayanamsa.ts's ayanamsaAt at each row's TT
 * instant, and its rate the central difference over plus and minus 0.001 day
 * of TT, as src/calc-sidereal.test.ts computes them; ERFA's side is
 * src/fixtures/ayanamsa-rates.json (tools/ayanamsa_rates.py) and
 * src/fixtures/ayanamsa-rates-dense.json (tools/dense_rates.py). A difference
 * is taken to the nearest whole turn, since a caller's ayanamsa need not lie
 * within a turn of zero and the engine's is wrapped.
 */
import { readFileSync, writeFileSync } from "node:fs";

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
interface Dense {
  readonly stars: readonly (Series & { readonly name: AyanamsaName })[];
  readonly callers: readonly (Series & {
    readonly definition: { readonly epoch: number; readonly value: number; readonly rate?: number; readonly model?: "engine" | "newcomb" | "iau1976" };
  })[];
}

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../../../src/fixtures/${name}`, import.meta.url), "utf8"));
const { rows } = fixture("ayanamsa-rates.json") as { rows: Row[] };
const dense = fixture("ayanamsa-rates-dense.json") as Dense;

/** Every comparison: a definition, a TT instant, and ERFA's mean ayanamsa (degrees) and rate (degrees a day) there. */
const comparisons: { readonly definition: AyanamsaDefinition; readonly label: string; readonly jd: number; readonly mean: number; readonly rate: number }[] = [];
const users = new Map<string, AyanamsaDefinition>();
for (const row of rows) {
  let definition: AyanamsaDefinition = AYANAMSAS[row.name as AyanamsaName];
  if (row.kind === "user") {
    if (!users.has(row.name)) users.set(row.name, userAyanamsa({ name: row.name, epoch: { julianDateTT: row.epoch! }, value: row.value!, model: row.model! }));
    definition = users.get(row.name)!;
  }
  comparisons.push({ definition, label: row.name, jd: row.jd, mean: row.mean, rate: row.rate });
}
for (const series of dense.stars) {
  series.jd.forEach((jd, k) => comparisons.push({ definition: AYANAMSAS[series.name], label: series.name, jd, mean: series.mean[k]!, rate: series.rate[k]! }));
}
for (const series of dense.callers) {
  const { epoch, value, rate, model } = series.definition;
  const definition = userAyanamsa({ name: "caller", epoch: { julianDateTT: epoch }, value, ...(rate === undefined ? { model: model! } : { rate }) });
  const label = `caller: epoch ${epoch}, value ${value}, ${rate === undefined ? `model ${model}` : `rate ${rate}″/yr`}`;
  series.jd.forEach((jd, k) => comparisons.push({ definition, label, jd, mean: series.mean[k]!, rate: series.rate[k]! }));
}

const STEP = 0.001;
const at = (jd: number) => AstroTime.FromTerrestrialTime(jd - 2_451_545);
const turn = (degrees: number) => degrees - 360 * Math.round(degrees / 360);

interface Largest {
  arcsec: number;
  name: string;
  jd: number;
  /** The engine's angle of the star from the Sun, degrees, for a star definition. */
  elongation: number | null;
}
const bands = Object.fromEntries(
  (Object.keys(AYANAMSA_BOUNDS) as AyanamsaBand[]).map((band) => [
    band,
    { comparisons: 0, position: null as Largest | null, rate: null as Largest | null }
  ])
) as Record<AyanamsaBand, { comparisons: number; position: Largest | null; rate: Largest | null }>;

for (const { definition, label, jd, mean, rate } of comparisons) {
  const now = ayanamsaAt(definition, at(jd));
  const engineRate = turn(ayanamsaAt(definition, at(jd + STEP)).mean - ayanamsaAt(definition, at(jd - STEP)).mean) / (2 * STEP);
  const elongation = now.elongation;
  const band: AyanamsaBand =
    definition.kind !== "star" ? "epochOrLinear" : elongation! >= NEAR_SUN_DEGREES ? "star" : elongation! >= AT_SUN_DEGREES ? "starNearSun" : "starAtSun";
  const entry = bands[band];
  entry.comparisons++;
  const where = (arcsec: number): Largest => ({ arcsec, name: label, jd, elongation });
  const position = Math.abs(turn(now.mean - mean)) * 3600;
  const rateDifference = Math.abs(engineRate - rate) * 3600;
  if (!entry.position || position > entry.position.arcsec) entry.position = where(position);
  if (!entry.rate || rateDifference > entry.rate.arcsec) entry.rate = where(rateDifference);
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
