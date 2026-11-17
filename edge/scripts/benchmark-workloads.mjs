import assert from "node:assert/strict";

// Consumers deliberately do real reads in the timed loop. Full result equality
// is checked separately outside timing; these checksums are not accuracy data.
export function benchmarkWorkloads(module) {
  return [{
    id: "chart",
    unit: "one chartWorkload call, including every CHART_CASES input",
    inputs: module.CHART_CASES,
    run: module.chartWorkload,
    consume(rows) {
      let sum = 0;
      for (const { result } of rows) {
        sum += result.aspects.length;
        for (const body of result.bodies) sum += body.lon + body.speed;
      }
      return sum;
    },
    validate(rows) {
      assert.deepEqual(rows.map(({ id }) => id), module.CHART_CASES.map(({ id }) => id));
      for (const { result } of rows) assert(result.bodies.length > 0, "Empty chart.");
    }
  }, {
    id: "houses",
    unit: "one housesWorkload call, including every HOUSE_CASES and HOUSE_SYSTEMS pair",
    inputs: { cases: module.HOUSE_CASES, systems: module.HOUSE_SYSTEMS },
    run: module.housesWorkload,
    consume(rows) {
      let sum = 0;
      for (const { angles, result } of rows) {
        sum += angles.asc + angles.mc;
        for (const cusp of result.houses.cusps) sum += cusp;
      }
      return sum;
    },
    validate(rows) {
      assert.deepEqual(rows.map(({ id, system }) => [id, system]),
        module.HOUSE_CASES.flatMap(({ id }) => module.HOUSE_SYSTEMS.map((system) => [id, system])));
      for (const { result } of rows) assert.equal(result.houses.cusps.length, 12);
    }
  }, {
    id: "transit-scan",
    unit: "one transitScanWorkload call over the complete TRANSIT_CASE interval",
    inputs: module.TRANSIT_CASE,
    run: module.transitScanWorkload,
    consume(result) {
      let sum = result.samples;
      for (const crossing of result.crossings) sum += crossing.at.getTime() / 1000 + Number(crossing.retrograde);
      return sum;
    },
    validate(result) {
      assert.equal(result.status, "complete", "Benchmark must not time a refused scan.");
      assert(result.samples > 0 && result.samples <= module.TRANSIT_CASE.options.maxSamples);
      assert(result.crossings.length > 0, "Benchmark scan must refine a crossing.");
      for (const crossing of result.crossings) {
        assert(crossing.at instanceof Date && Number.isFinite(crossing.at.getTime()));
        assert(crossing.at.getTime() > Date.parse(module.TRANSIT_CASE.from));
        assert(crossing.at.getTime() <= Date.parse(module.TRANSIT_CASE.to));
      }
    }
  }];
}
