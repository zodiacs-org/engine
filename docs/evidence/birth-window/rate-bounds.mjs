/*
 * The scans behind the birth-window search's bounds (README, "Birth-time
 * windows"), from the engine's own functions over 1800-2200:
 *
 * - each body's largest longitude rate, by central differences over ±10 min
 *   every hour (Moon, nodes), 3 h (Mercury, Venus, Mars), 6 h (Sun) or day;
 *   the largest change of rate between samples bounds what the grid can miss;
 * - the obliquity's largest rate and the RAMC's rate range.
 *
 * The true node's millisecond jitter, scanned here at first at two instants a
 * year, has a denser scan of its own in node-jitter.mjs.
 *
 *   node rate-bounds.mjs [--out FILE]   (about 15 minutes on four cores)
 *
 * Loads the build in ../../../dist; ZODIACS_ENGINE_DIST points it elsewhere.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const here = fileURLToPath(new URL(".", import.meta.url));
const DAY = 86_400_000;
const FROM = Date.UTC(1800, 0, 1);
const TO = Date.UTC(2200, 0, 1);
const JOBS = [
  ["Moon", 1], ["North Node", 1], ["Mercury", 3], ["Venus", 3], ["Mars", 3], ["Sun", 6],
  ["Jupiter", 24], ["Saturn", 24], ["Uranus", 24], ["Neptune", 24], ["Pluto", 24],
  ["obliquity", 6], ["RAMC", 24]
];

if (isMainThread) {
  const out = resolve(process.argv[3] ?? resolve(here, "rate-bounds.json"));
  const window = await import(pathToFileURL(resolve(process.env.ZODIACS_ENGINE_DIST ?? resolve(here, "../../../dist"), "window.js")).href);
  const results = {};
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, () => new Promise((settle, fail) => {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: {} });
    const feed = () => (next < JOBS.length ? worker.postMessage(JOBS[next++]) : worker.terminate().then(settle));
    worker.on("message", (result) => {
      results[result.name] = result;
      process.stderr.write(`${result.name} done\n`);
      feed();
    });
    worker.on("error", fail);
    feed();
  })));
  const bodies = {};
  for (const [name] of JOBS.slice(0, 11)) {
    const scan = results[name];
    const bound = window.WINDOW_RATE_BOUNDS[name];
    bodies[name] = { ...scan, bound, boundOverMaximum: bound / (scan.maxAbs + scan.maxAcceleration * scan.stepHours / 48) };
  }
  bodies["South Node"] = { sameAs: "North Node", bound: window.WINDOW_RATE_BOUNDS["South Node"] };
  const report = {
    span: [new Date(FROM).toISOString(), new Date(TO).toISOString()],
    units: "degrees and days",
    note: "boundOverMaximum divides the bound by the scanned maximum plus the largest change of rate over half a grid step.",
    bodies,
    obliquity: { ...results.obliquity, bound: 5e-5 },
    ramc: results.RAMC
  };
  writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
  console.log(`written ${out}`);
} else {
  const dist = resolve(process.env.ZODIACS_ENGINE_DIST ?? resolve(here, "../../../dist"));
  const { bodyLongitude } = await import(pathToFileURL(resolve(dist, "internal.js")).href);
  const { deltaT } = await import(pathToFileURL(resolve(dist, "deltat.js")).href);
  const { MakeTime, SetDeltaTFunction, SiderealTime, e_tilt } = await import("astronomy-engine");
  const wrap = (d) => ((((d % 360) + 540) % 360) - 180);
  const fresh = (t) => e_tilt(MakeTime(new Date(t + DAY)));
  parentPort.on("message", ([name, stepHours]) => {
    let at;
    if (name === "RAMC" || name === "obliquity") {
      SetDeltaTFunction(deltaT);
      at = name === "RAMC"
        ? (t) => { fresh(t); return SiderealTime(MakeTime(new Date(t))) * 15; }
        : (t) => { fresh(t); return e_tilt(MakeTime(new Date(t))).tobl; };
    } else at = (t) => { fresh(t); return bodyLongitude(name, new Date(t)); };
    const h = 600_000;
    const step = stepHours * 3_600_000;
    let maxAbs = 0;
    let when = FROM;
    let min = Infinity;
    let max = -Infinity;
    let maxAcceleration = 0;
    let previous = null;
    for (let t = FROM; t <= TO; t += step) {
      const rate = wrap(at(t + h) - at(t - h)) / ((2 * h) / DAY);
      if (Math.abs(rate) > maxAbs) {
        maxAbs = Math.abs(rate);
        when = t;
      }
      min = Math.min(min, rate);
      max = Math.max(max, rate);
      if (previous !== null) maxAcceleration = Math.max(maxAcceleration, Math.abs(rate - previous) / (step / DAY));
      previous = rate;
    }
    parentPort.postMessage({ name, stepHours, maxAbs, at: new Date(when).toISOString(), min, max, maxAcceleration });
  });
}
