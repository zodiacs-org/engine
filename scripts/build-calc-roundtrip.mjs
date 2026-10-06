// Rebuilds src/fixtures/calc-roundtrip.json from the build in dist/: the same
// requests, each run again through calc(), houses(), events() or chart(), with
// the results as this build gives them, as JSON. src/calc-fixtures.test.ts
// replays them.
// The fixture pins the engine's own output (a regression test, not accuracy
// evidence); rebuild it when a change to the engine moves those results on
// purpose, and say why in the commit.
//
// A request written for an earlier release is given as this one reads it: a
// Julian date's scale in lower case from 1.0.0 ("TT" is "tt"; "UT", which the
// calc entry read as UTC taken for UT1 before the time basis, is "utc"), and
// houses()'s house system as `houseSystem`, as chart() names it.
//
//   npm run build && node scripts/build-calc-roundtrip.mjs
import { readFileSync, writeFileSync } from "node:fs";

const fixture = new URL("../src/fixtures/calc-roundtrip.json", import.meta.url);
const calc = await import(new URL("../dist/calc.js", import.meta.url).href);
const run = { calc: calc.calc, houses: calc.houses, events: calc.events, chart: calc.chart };

const SCALES = { UT: "utc", UTC: "utc", UT1: "ut1", TT: "tt" };

/** A copy of a request with every Julian date's scale as this release names it. */
function renamed(value) {
  if (Array.isArray(value)) return value.map(renamed);
  if (value === null || typeof value !== "object") return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) out[key] = key === "scale" && Object.hasOwn(SCALES, entry) ? SCALES[entry] : renamed(entry);
  return out;
}

/** A houses() request with its house system under the name this release reads. */
function housesRequest(request) {
  if (!Object.hasOwn(request, "system")) return request;
  const { system, ...rest } = request;
  return { ...rest, houseSystem: system };
}

const { cases } = JSON.parse(readFileSync(fixture, "utf8"));
const rebuilt = cases.map((entry) => {
  const request = entry.function === "houses" ? housesRequest(renamed(entry.request)) : renamed(entry.request);
  return { function: entry.function, request, result: JSON.parse(JSON.stringify(run[entry.function](request))) };
});
const note =
  "Results of @zodiacs/engine/calc as scripts/build-calc-roundtrip.mjs rebuilt them from the build. " +
  "calc-fixtures.test.ts replays each request and each result's receipt, and turns each cartesian position into the other frames. " +
  "Synthetic instants and places only.";
writeFileSync(fixture, `${JSON.stringify({ note, cases: rebuilt }, null, 1)}\n`);
console.log(`rebuilt ${rebuilt.length} cases in src/fixtures/calc-roundtrip.json`);
