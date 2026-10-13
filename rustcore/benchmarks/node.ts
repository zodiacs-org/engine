import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import * as wasm from "../ts/index.js";
import { positions } from "../../src/api.js";
import { timeBasis } from "../../src/time-scale.js";
import { eclipticOfDate } from "../../src/frame.js";
import { computeAngles, computeHouses } from "../../src/houses.js";
import { findAspects } from "../../src/aspects.js";
import { createAspectPolicy, findConfiguredAspects } from "../../src/configured-aspects.js";
import type { AspectPolicyInput } from "../../src/configured-aspects.js";
import type { BodyName, BodyPosition, HouseSystem } from "../../src/types.js";

// Keep the corpus arithmetically reproducible in Rust. It contains no personal data.
const dates = Array.from({ length: 9 }, (_, i) => Date.UTC(1800 + i * 50, 0, 1));
const latitudes = [-80, -66.5, -45, 0, 45, 66.5, 80];
const longitudes = dates.map((_, i) => i * 37 - 148);
const systems: HouseSystem[] = ["whole", "placidus", "koch", "porphyry", "regiomontanus",
  "campanus", "topocentric", "alcabitius", "equal", "equal-mc", "vehlow", "meridian", "morinus"];
const names: BodyName[] = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
  "Uranus", "Neptune", "Pluto", "North Node", "South Node"];
const charts: BodyPosition[][] = dates.map((_, chartIndex) => names.map((body, bodyIndex) => ({
  body,
  lon: (bodyIndex * 31.25 + chartIndex * (bodyIndex + 1) / 8) % 360,
  speed: ((bodyIndex % 5) - 2) / 4 + chartIndex / 1024,
  lat: 0, retrograde: false, sign: "aries", degree: 0
})));
// Sign and other unused annotations are deliberately synthetic; aspects read lon/speed.
const allAngles = [0, 60, 90, 120, 180, 30, 45, 72, 135, 144, 150];
const allNames = ["conjunction", "sextile", "square", "trine", "opposition", "semisextile",
  "semisquare", "quintile", "sesquiquadrate", "biquintile", "quincunx"];
const policyInputs: Record<string, AspectPolicyInput> = {
  configured_default: {},
  configured_all: { aspects: allNames.map(type => ({ type, orb: 2 })) },
  configured_custom: { bodies: names, aspects: [
    { type: "custom", angle: 17.25, orb: 1.5 }, { type: "square", orb: 3 }
  ] }
};

const manifest = [
  { id: "positions/warm", callsPerIteration: 9 },
  { id: "positions/cold", callsPerIteration: 9 },
  ...systems.map(system => ({ id: `houses/${system}`, callsPerIteration: 63 })),
  { id: "time/utc", callsPerIteration: 9 },
  { id: "frame/ecliptic_of_date", callsPerIteration: 9 },
  ...["legacy", ...Object.keys(policyInputs)].map(policy => ({ id: `aspects/${policy}`, callsPerIteration: 9 }))
];
const descriptor = { schema: 1, manifest, dates, latitudes, longitudes,
  charts: charts.map(chart => chart.map(({ body, lon, speed }) => ({ body, lon, speed }))),
  allAngles, houseInputs: dates.flatMap((_, i) => latitudes.map(latitude => ({
    gastHours: i * 2.75, latitude, longitude: longitudes[i]!, obliquity: 23.4393
  }))), policies: Object.entries(policyInputs).map(([id, input]) => {
    const policy = createAspectPolicy(input);
    return { id, bodies: policy.bodies, aspects: policy.aspects.map(rule => ({ ...rule, luminaryOrb: rule.luminaryOrb ?? null })) };
  }) };

const reference = { positions, timeBasis, eclipticOfDate, computeAngles, computeHouses,
  findAspects, createAspectPolicy, findConfiguredAspects };
type Runtime = "typescript" | "wasm";
type Suite = { id: string; callsPerIteration: number; run: () => number };
let sink = 0;
function consume(value: number): void {
  assert(Number.isFinite(value), "Benchmark produced a non-finite checksum.");
  sink = value;
}

function positionChecksum(rows: BodyPosition[]): number {
  // Consume coordinates and rates from every returned row; no result is substituted.
  return rows.reduce((sum, row) => sum + row.lon + row.lat + row.speed, rows.length);
}

function suites(runtime: Runtime): Suite[] {
  const api = runtime === "wasm" ? wasm : reference;
  const result: Suite[] = [{ id: "positions/warm", callsPerIteration: dates.length,
    run: () => dates.reduce((sum, date) => sum + positionChecksum(api.positions(date)), 0) }];
  // Construct identical geometry outside the timer. A native manifest checks the
  // raw inputs, and the established parity suite checks the numerical algorithms.
  const houseInputs = descriptor.houseInputs;
  const houseAngles = houseInputs.map(input => api.computeAngles(input));
  for (const system of systems) result.push({ id: `houses/${system}`, callsPerIteration: houseInputs.length,
    run: () => houseInputs.reduce((sum, input, i) => {
      const house = api.computeHouses(system, input, houseAngles[i]!);
      return sum + house.houses.cusps.reduce((a, b) => a + b, 0) + Number(house.fellBack);
    }, 0) });
  result.push({ id: "time/utc", callsPerIteration: dates.length,
    run: () => dates.reduce((sum, date) => {
      const basis = api.timeBasis(date);
      return sum + basis.ut1Days + basis.ttDays + basis.deltaT.seconds;
    }, 0) });
  // The same input TT is used by both implementations and changes each call,
  // so the reference's last-frame cache cannot turn this into a cache-hit test.
  const ttDays = dates.map(date => timeBasis(date).ttDays);
  result.push({ id: "frame/ecliptic_of_date", callsPerIteration: dates.length,
    run: () => ttDays.reduce((sum, tt, i) => {
      const frame = api.eclipticOfDate(1 + i / 16, -0.5, 0.25, tt);
      return sum + frame.lon + frame.lat;
    }, 0) });
  result.push({ id: "aspects/legacy", callsPerIteration: charts.length,
    run: () => charts.reduce((sum, rows) => api.findAspects(rows).reduce((a, b) => a + b.orb + 1, sum), 0) });
  for (const [policyName, input] of Object.entries(policyInputs)) {
    const policy = api.createAspectPolicy(input);
    result.push({ id: `aspects/${policyName}`, callsPerIteration: charts.length,
      run: () => charts.reduce((sum, rows) =>
        api.findConfiguredAspects(rows, policy).aspects.reduce((a, b) => a + b.orb + 1, sum), 0) });
  }
  return result;
}

function timed(run: () => number, repeats: number): number {
  let checksum = 0;
  const start = performance.now();
  for (let i = 0; i < repeats; i++) checksum += run();
  const elapsed = performance.now() - start;
  consume(checksum);
  return elapsed * 1e6;
}

const mode = process.argv[2];
if (mode === "describe") {
  console.log(JSON.stringify(descriptor));
} else if (mode === "cold") {
  const runtime = process.argv[3] as Runtime;
  assert(["typescript", "wasm"].includes(runtime));
  if (runtime === "wasm") wasm.initRustCore(readFileSync("pkg/zodiacs_rustcore_bg.wasm"));
  // No corpus setup or positions evaluation before this timer. Process startup,
  // source imports and WASM compilation/initialization are excluded.
  const api = runtime === "wasm" ? wasm : reference;
  const ns = timed(() => dates.reduce((sum, date) => sum + positionChecksum(api.positions(date)), 0), 1);
  console.log(JSON.stringify({ runtime, nsPerCall: ns / dates.length, checksum: sink }));
} else if (mode === "warm" || mode === "smoke") {
  wasm.initRustCore(readFileSync("pkg/zodiacs_rustcore_bg.wasm"));
  const ts = suites("typescript"), rust = suites("wasm");
  const smoke = mode === "smoke";
  const settings = { samples: smoke ? 2 : 30, warmupMs: smoke ? 0 : 100, targetSampleMs: smoke ? 1 : 25 };
  const measurements = [];
  for (let index = 0; index < ts.length; index++) {
    const pair = { typescript: ts[index]!, wasm: rust[index]! };
    assert.equal(pair.typescript.id, pair.wasm.id);
    const records = { typescript: [] as number[], wasm: [] as number[] };
    const repeats = { typescript: 1, wasm: 1 };
    for (const runtime of ["typescript", "wasm"] as const) {
      const run = pair[runtime].run;
      const until = performance.now() + settings.warmupMs;
      do { consume(run()); } while (performance.now() < until);
      if (!smoke) {
        let ns;
        do {
          ns = timed(run, repeats[runtime]);
          if (ns < 10e6) repeats[runtime] *= 2;
        } while (ns < 10e6);
        repeats[runtime] = Math.max(1, Math.ceil(repeats[runtime] * settings.targetSampleMs * 1e6 / ns));
      }
    }
    for (let sample = 0; sample < settings.samples; sample++) {
      // Alternate the within-pair order to reduce systematic first/second bias.
      const order: Runtime[] = sample % 2 === 0 ? ["typescript", "wasm"] : ["wasm", "typescript"];
      for (const runtime of order) {
        const suite = pair[runtime];
        records[runtime].push(timed(suite.run, repeats[runtime]) / repeats[runtime] / suite.callsPerIteration);
      }
    }
    measurements.push({ id: pair.typescript.id, callsPerIteration: pair.typescript.callsPerIteration, repeats, samples: records });
    process.stderr.write(`Measured ${pair.typescript.id}\n`);
  }
  console.log(JSON.stringify({ settings, measurements, checksum: sink }));
} else throw new Error("Expected describe, cold <typescript|wasm>, warm or smoke.");
