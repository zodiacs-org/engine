/*
 * Run time of birthWindow per window, in one thread: 39 windows (each of the
 * thirteen house systems three times) of 10 minutes, 2 hours and 24 hours,
 * at typical latitudes (|φ| <= 60°) and at high ones (60° to 90°), at seeded
 * random instants from 1800 to 2200 and random longitudes. Synthetic inputs.
 *
 *   node timing.mjs [--out FILE]
 *
 * Loads the build in ../../../dist; ZODIACS_ENGINE_DIST points it elsewhere.
 */
import { loadavg } from "node:os";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = resolve(process.env.ZODIACS_ENGINE_DIST ?? resolve(here, "../../../dist"));
const { birthWindow } = await import(pathToFileURL(resolve(dist, "window.js")).href);
const out = resolve(process.argv[3] ?? resolve(here, "timing.json"));

function mulberry32(state) {
  let a = state >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SYSTEMS = ["whole", "placidus", "porphyry", "equal", "equal-mc", "vehlow", "koch", "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian"];
const FROM = Date.UTC(1800, 0, 1);
const TO = Date.UTC(2200, 0, 1);
const random = mulberry32(7);
const window = (milliseconds, high, system) => {
  const start = FROM + Math.floor(random() * (TO - FROM - milliseconds));
  const latitude = high ? (random() < 0.5 ? -1 : 1) * (60 + 30 * random()) : -60 + 120 * random();
  return { start: new Date(start), end: new Date(start + milliseconds), latitude, longitude: -180 + 360 * random(), houseSystem: system };
};

// Warm up the JIT and astronomy-engine's Pluto tables outside the timings.
for (const system of SYSTEMS) birthWindow(window(3_600_000, false, system));

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
const rows = [];
for (const [label, milliseconds] of [["10 minutes", 600_000], ["2 hours", 7_200_000], ["24 hours", 86_400_000]]) {
  for (const high of [false, true]) {
    const times = [];
    const switches = [];
    for (let repeat = 0; repeat < 3; repeat += 1) {
      for (const system of SYSTEMS) {
        const input = window(milliseconds, high, system);
        const began = performance.now();
        const result = birthWindow(input);
        times.push(performance.now() - began);
        switches.push(result.switches.length);
      }
    }
    times.sort((a, b) => a - b);
    switches.sort((a, b) => a - b);
    const row = {
      length: label,
      latitudes: high ? "60° to 90°" : "-60° to 60°",
      windows: times.length,
      medianMs: Math.round(quantile(times, 0.5)),
      p90Ms: Math.round(quantile(times, 0.9)),
      maxMs: Math.round(times.at(-1)),
      meanMs: Math.round(times.reduce((sum, time) => sum + time, 0) / times.length),
      medianSwitches: quantile(switches, 0.5)
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}
writeFileSync(out, `${JSON.stringify({ node: process.version, loadAverageAfter: loadavg().map((load) => Number(load.toFixed(2))), rows }, null, 2)}\n`);
