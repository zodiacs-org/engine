/**
 * The engine's mean ayanamsas and their rates against ERFA's, by the bands
 * the calc entry's bounds use; writes ../results/differences.json.
 *
 *   npx vite-node docs/evidence/calc-sidereal-2026-10-05/tools/differences.ts
 *
 * The engine side is src/vedic/ayanamsa.ts's ayanamsaAt at each row's TT
 * instant, and its rate the central difference over plus and minus 0.001 day
 * of TT, as src/calc-sidereal.test.ts computes them; ERFA's side is
 * src/fixtures/ayanamsa-rates.json (tools/ayanamsa_rates.py).
 */
import { readFileSync, writeFileSync } from "node:fs";

import { AstroTime } from "astronomy-engine";

import { AYANAMSA_BOUNDS, NEAR_SUN_DEGREES } from "../../../../src/calc-ayanamsa.js";
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
  readonly elongation?: number;
}

const fixture = new URL("../../../../src/fixtures/ayanamsa-rates.json", import.meta.url);
const { rows } = JSON.parse(readFileSync(fixture, "utf8")) as { rows: Row[] };
const STEP = 0.001;
const at = (jd: number) => AstroTime.FromTerrestrialTime(jd - 2_451_545);
const users = new Map<string, AyanamsaDefinition>();
const definitionOf = (row: Row): AyanamsaDefinition => {
  if (row.kind !== "user") return AYANAMSAS[row.name as AyanamsaName];
  if (!users.has(row.name)) {
    users.set(row.name, userAyanamsa({ name: row.name, epoch: { julianDateTT: row.epoch! }, value: row.value!, model: row.model! }));
  }
  return users.get(row.name)!;
};

type Band = keyof typeof AYANAMSA_BOUNDS;
interface Largest {
  arcsec: number;
  name: string;
  jd: number;
  /** The engine's angle from the Sun, degrees, for a star definition. */
  elongation: number | null;
}
const bands = Object.fromEntries(
  (Object.keys(AYANAMSA_BOUNDS) as Band[]).map((band) => [
    band,
    { comparisons: 0, position: null as Largest | null, rate: null as Largest | null }
  ])
) as Record<Band, { comparisons: number; position: Largest | null; rate: Largest | null }>;

for (const row of rows) {
  const definition = definitionOf(row);
  const now = ayanamsaAt(definition, at(row.jd));
  const rate = (ayanamsaAt(definition, at(row.jd + STEP)).mean - ayanamsaAt(definition, at(row.jd - STEP)).mean) / (2 * STEP);
  const band: Band = definition.kind !== "star" ? "epochOrLinear" : now.elongation! >= NEAR_SUN_DEGREES ? "star" : "starNearSun";
  const entry = bands[band];
  entry.comparisons++;
  const where = (arcsec: number): Largest => ({ arcsec, name: row.name, jd: row.jd, elongation: now.elongation });
  const position = Math.abs(now.mean - row.mean) * 3600;
  const rateDifference = Math.abs(rate - row.rate) * 3600;
  if (!entry.position || position > entry.position.arcsec) entry.position = where(position);
  if (!entry.rate || rateDifference > entry.rate.arcsec) entry.rate = where(rateDifference);
}

const out = {
  generator: "docs/evidence/calc-sidereal-2026-10-05/tools/differences.ts",
  units: "largest |engine − ERFA| of the mean ayanamsa, arcseconds, and of its rate, arcseconds a day; jd in TT",
  nearSunDegrees: NEAR_SUN_DEGREES,
  bands,
  bounds: AYANAMSA_BOUNDS
};
writeFileSync(new URL("../results/differences.json", import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(bands, null, 1));
