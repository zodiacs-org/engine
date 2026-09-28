/*
 * The scans behind the birth-window search's bounds (README, "Birth-time
 * windows"), from the engine's own functions over 1800-2200:
 *
 * - each body's largest longitude rate, by central differences over ±10 min
 *   every hour (Moon, nodes), 3 h (Mercury, Venus, Mars), 6 h (Sun) or day;
 *   the largest change of rate between samples bounds what the grid can miss;
 * - the obliquity's largest rate and the RAMC's rate range;
 * - the true node's millisecond jitter: at two instants a year from 1700 to
 *   2300, the largest distance of its longitude, over 3,000 consecutive
 *   milliseconds, from the least-squares quadratic through them (its smooth
 *   motion over 3 s is that quadratic to far below the jitter).
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
  ["obliquity", 6], ["RAMC", 24], ["node jitter", 0]
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
  const jitter = results["node jitter"];
  const report = {
    span: [new Date(FROM).toISOString(), new Date(TO).toISOString()],
    units: "degrees and days",
    note: "boundOverMaximum divides the bound by the scanned maximum plus the largest change of rate over half a grid step.",
    bodies,
    obliquity: { ...results.obliquity, bound: 5e-5 },
    ramc: results.RAMC,
    nodeJitter: {
      ...jitter,
      bound: "5e-5 (1 + |T|), T in Julian centuries from J2000",
      smallestBoundOverObserved: Math.min(...jitter.rows.map(([year, T, j]) => (5e-5 * (1 + Math.abs(T))) / j))
    }
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
    if (name === "node jitter") {
      const rows = [];
      for (let half = 0; half < 1202; half += 1) {
        const year = 1700 + Math.floor(half / 2);
        const t0 = Date.UTC(year, ((year * 7) % 6) + 6 * (half % 2), 1 + (year % 27), (year * 5) % 24, (year * 11) % 60, 13, 777);
        const n = 3000;
        const values = [];
        for (let i = 0; i < n; i += 1) {
          fresh(t0 + i);
          const value = bodyLongitude("North Node", new Date(t0 + i));
          values.push(i === 0 ? value : values[i - 1] + wrap(value - values[i - 1]));
        }
        // Least squares a + b x + c x², x in [−1, 1], by Cramer's rule.
        const x = (i) => (2 * i) / (n - 1) - 1;
        const m = [0, 0, 0, 0, 0];
        const r = [0, 0, 0];
        for (let i = 0; i < n; i += 1) {
          let power = 1;
          for (let k = 0; k < 5; k += 1) {
            m[k] += power;
            if (k < 3) r[k] += values[i] * power;
            power *= x(i);
          }
        }
        const matrix = [[m[0], m[1], m[2]], [m[1], m[2], m[3]], [m[2], m[3], m[4]]];
        const det = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
        const d = det(matrix);
        const [a, b, c] = [0, 1, 2].map((j) => det(matrix.map((row, i) => row.map((value, k) => (k === j ? r[i] : value)))) / d);
        let largest = 0;
        for (let i = 0; i < n; i += 1) largest = Math.max(largest, Math.abs(values[i] - (a + b * x(i) + c * x(i) ** 2)));
        rows.push([year, (t0 - Date.UTC(2000, 0, 1, 12)) / (36525 * DAY), largest]);
      }
      parentPort.postMessage({ name, rows, largest: Math.max(...rows.map((row) => row[2])) });
      return;
    }
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
