import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildReference } from "../scripts/build-reference.mjs";

const { moduleUrl } = await buildReference();
const workloads = await import(moduleUrl.href ?? moduleUrl);
const {
  CHART_CASES, HOUSE_CASES, HOUSE_SYSTEMS, TRANSIT_CASE,
  chartWorkload, housesWorkload, transitScanWorkload, runSmokeCases
} = workloads;
const enginePackage = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));

function finiteNumbers(value, path = "result") {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} must be finite`);
  } else if (value instanceof Date) {
    assert.ok(Number.isFinite(value.getTime()), `${path} must be a valid Date`);
  } else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) finiteNumbers(item, `${path}.${key}`);
  }
}

function longitude(value) {
  assert.ok(Number.isFinite(value) && value >= 0 && value < 360, `Invalid longitude: ${value}`);
}

test("smoke metadata identifies the checkout engine and its pinned ephemeris", () => {
  const result = runSmokeCases();
  assert.equal(result.schema, "edge-smoke/1");
  assert.equal(result.engineVersion, enginePackage.version);
  assert.deepEqual(result.ephemeris, {
    name: "astronomy-engine", version: enginePackage.dependencies["astronomy-engine"]
  });
  assert.deepEqual(result.charts, chartWorkload());
  assert.deepEqual(result.houses, housesWorkload());
  assert.deepEqual(result.transitScan, transitScanWorkload());
  finiteNumbers(result);
});

test("chart workload keeps every synthetic case and computes finite positions", () => {
  const charts = chartWorkload();
  assert.ok(CHART_CASES.length > 0);
  assert.equal(new Set(CHART_CASES.map(({ id }) => id)).size, CHART_CASES.length);
  assert.deepEqual(charts.map(({ id }) => id), CHART_CASES.map(({ id }) => id));
  for (const [index, { id, result }] of charts.entries()) {
    const input = CHART_CASES[index].input;
    assert.equal(result.input.utc.getTime(), new Date(input.utc).getTime(), id);
    assert.equal(result.engineVersion, enginePackage.version, id);
    assert.ok(result.bodies.some(({ body }) => body === "Sun"), id);
    assert.ok(result.bodies.some(({ body }) => body === "Moon"), id);
    assert.equal(new Set(result.bodies.map(({ body }) => body)).size, result.bodies.length, id);
    for (const body of result.bodies) {
      longitude(body.lon);
      assert.ok(body.lat >= -90 && body.lat <= 90, id);
      assert.ok(body.degree >= 0 && body.degree < 30, id);
      assert.equal(typeof body.retrograde, "boolean", id);
      assert.ok(Number.isFinite(body.speed), id);
    }
    finiteNumbers(result, id);
  }
});

test("chart corpus exercises whole, southern Placidus, polar fallback and unknown time", () => {
  const charts = new Map(chartWorkload().map(({ id, result }) => [id, result]));
  const whole = CHART_CASES.find(({ input }) => input.houseSystem === "whole" && input.timeKnown !== false);
  const southern = CHART_CASES.find(({ input }) => input.houseSystem === "placidus" && input.latitude < 0);
  const polar = CHART_CASES.find(({ input }) => input.houseSystem === "koch" && Math.abs(input.latitude) > 70);
  const untimed = CHART_CASES.find(({ input }) => input.timeKnown === false);
  assert.ok(whole && southern && polar && untimed, "Required chart scenarios must remain in the corpus");
  assert.equal(charts.get(whole.id).houses.system, "whole");
  assert.equal(charts.get(southern.id).houses.system, "placidus");
  assert.equal(charts.get(polar.id).input.houseSystem, "koch");
  assert.equal(charts.get(polar.id).houses.system, "whole");
  assert.ok(charts.get(polar.id).flags.includes("polar-fallback"));
  assert.equal(charts.get(untimed.id).angles, null);
  assert.equal(charts.get(untimed.id).houses, null);
  assert.ok(charts.get(untimed.id).flags.includes("no-time"));
});

test("houses workload covers every input and system with valid cusps", () => {
  const rows = housesWorkload();
  assert.ok(HOUSE_CASES.some(({ input }) => input.latitude > 0));
  assert.ok(HOUSE_CASES.some(({ input }) => input.latitude < 0));
  assert.ok(HOUSE_CASES.some(({ input }) => Math.abs(input.latitude) >= 90 - input.obliquity));
  const expected = HOUSE_CASES.flatMap(({ id }) => HOUSE_SYSTEMS.map((system) => `${id}/${system}`));
  assert.deepEqual(rows.map(({ id, system }) => `${id}/${system}`).sort(), expected.sort());
  assert.equal(new Set(expected).size, expected.length);
  for (const row of rows) {
    const input = HOUSE_CASES.find(({ id }) => id === row.id).input;
    const fallsBack = ["placidus", "koch"].includes(row.system) && Math.abs(input.latitude) >= 90 - input.obliquity;
    assert.equal(row.result.houses.system, fallsBack ? "whole" : row.system);
    assert.equal(row.result.fellBack, fallsBack);
    assert.equal(row.result.fallbackSystem, fallsBack ? "whole" : null);
    assert.equal(row.result.houses.cusps.length, 12);
    row.result.houses.cusps.forEach(longitude);
    for (const name of ["asc", "mc", "dsc", "ic"]) longitude(row.angles[name]);
    finiteNumbers(row);
  }
});

test("transit scan completes inside its budget and returns ordered crossings", () => {
  const result = transitScanWorkload();
  assert.equal(result.status, "complete");
  assert.ok(Number.isInteger(result.samples) && result.samples > 0);
  assert.ok(result.samples <= TRANSIT_CASE.options.maxSamples);
  assert.ok(result.crossings.length > 0, "The smoke scan must exercise root refinement");
  let previous = new Date(TRANSIT_CASE.from).getTime();
  for (const crossing of result.crossings) {
    assert.ok(crossing.at instanceof Date);
    assert.ok(crossing.at.getTime() > previous);
    assert.ok(crossing.at.getTime() <= new Date(TRANSIT_CASE.to).getTime());
    assert.equal(typeof crossing.retrograde, "boolean");
    previous = crossing.at.getTime();
  }
  finiteNumbers(result);
});

test("interleaved workloads preserve exact results and their input fixtures", () => {
  const fixtures = structuredClone({ CHART_CASES, HOUSE_CASES, HOUSE_SYSTEMS, TRANSIT_CASE });
  const first = runSmokeCases();
  const saved = structuredClone(first);
  transitScanWorkload();
  housesWorkload();
  chartWorkload();
  transitScanWorkload();
  assert.deepEqual(runSmokeCases(), saved);
  assert.deepEqual(first, saved, "Later calls must not mutate previous outputs");
  assert.deepEqual({ CHART_CASES, HOUSE_CASES, HOUSE_SYSTEMS, TRANSIT_CASE }, fixtures);
});
