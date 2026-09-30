/*
 * The true node's sign ingresses from 1800 to 2200, and which of them a
 * birth-time window can leave unresolved (README, "Birth-time windows").
 *
 * The engine's north node every hour (each value evaluated alone); where the
 * sign changes between two samples, the ingress by bisection to the minute,
 * and its rate from longitudeSpeed there. Near an ingress the node's jitter
 * makes its sign change back and forth wherever its smooth motion lies within
 * about twice the jitter bound J = 5e-5 (1 + |T|)° of the boundary: for
 * 4J/|rate| days. The search compares the node at every millisecond there,
 * and where that is more than its budget of 2,000,000 instants a window that
 * contains all of it is left unresolved there. Each such ingress is then
 * checked: birthWindow over the two hours around it, Placidus at 51.5° N.
 * The node's stations (where longitudeSpeed, a difference over ±6 h, changes
 * sign, found every 6 hours and bisected to the minute) within 0.001° of a
 * boundary are listed too, crossed or not: a station within the jitter band
 * would hold the node there for far longer than an ingress.
 *
 *   node node-ingresses.mjs [--out FILE]   (about 5 minutes on four cores)
 *
 * Loads the build in ../../../dist; ZODIACS_ENGINE_DIST points it elsewhere.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const here = fileURLToPath(new URL(".", import.meta.url));
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;
const J2000 = Date.UTC(2000, 0, 1, 12);
const FROM = Date.UTC(1800, 0, 1);
const TO = Date.UTC(2200, 0, 1);
const BUDGET = 2_000_000;
const jitter = (time) => 5e-5 * (1 + Math.abs((time - J2000) / (36525 * DAY)));
const dist = process.env.ZODIACS_ENGINE_DIST ?? resolve(here, "../../../dist");

if (isMainThread) {
  const args = process.argv.slice(2);
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : resolve(here, "node-ingresses.json");
  const began = Date.now();
  const parts = 16;
  const jobs = Array.from({ length: parts }, (_, k) => {
    const from = FROM + Math.floor(((TO - FROM) / HOUR) * (k / parts)) * HOUR;
    const to = FROM + Math.floor(((TO - FROM) / HOUR) * ((k + 1) / parts)) * HOUR;
    return { from, to };
  });
  const found = { ingresses: [], approaches: [] };
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, () => new Promise((settle, fail) => {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { dist } });
      const feed = () => (next < jobs.length ? worker.postMessage(jobs[next++]) : worker.terminate().then(settle));
      worker.on("message", (part) => {
        found.ingresses.push(...part.ingresses);
        found.approaches.push(...part.approaches);
        feed();
      });
      worker.on("error", fail);
      feed();
    }))
  );
  found.ingresses.sort((a, b) => a.time - b.time);
  found.approaches.sort((a, b) => a.time - b.time);
  // Each ingress whose band exceeds the budget, run as a window of two hours around it.
  const { birthWindow } = await import(pathToFileURL(resolve(dist, "window.js")).href);
  const rows = found.ingresses.map(({ time, rate }) => {
    const band = ((4 * jitter(time)) / Math.abs(rate)) * DAY;
    const row = { at: new Date(time).toISOString(), rate: +rate.toPrecision(4), bandMs: Math.round(band), overBudget: band > BUDGET };
    if (row.overBudget) {
      const start = Math.floor(time / MINUTE) * MINUTE - HOUR;
      const t0 = performance.now();
      const result = birthWindow({ start: new Date(start), end: new Date(start + 2 * HOUR), latitude: 51.5, longitude: -0.12, houseSystem: "placidus" });
      row.window = {
        seconds: +((performance.now() - t0) / 1000).toFixed(2),
        flags: result.flags,
        unresolvedMs: result.unresolved.reduce((sum, gap) => sum + gap.milliseconds, 0)
      };
    }
    return row;
  });
  const over = rows.filter((row) => row.overBudget);
  const summary = {
    method:
      "Hourly samples of the engine's north node, 1800-2200; ingresses bisected to the minute; rate from longitudeSpeed; band 4J/|rate| with J = 5e-5 (1 + |T|) degrees; over budget when the band exceeds 2,000,000 ms.",
    ingresses: rows.length,
    overBudget: over.length,
    overBudgetDates: over.map((row) => row.at.slice(0, 10)),
    windowsAroundThem: {
      all: over.length,
      unresolved: over.filter((row) => row.window.flags.includes("node-unresolved")).length,
      slowestSeconds: Math.max(...over.map((row) => row.window.seconds))
    },
    stationsNearBoundaries: found.approaches.map(({ time, boundary, least }) => ({ at: new Date(time).toISOString(), boundary, degreesFromIt: least })),
    rows,
    minutes: +((Date.now() - began) / 60000).toFixed(1)
  };
  writeFileSync(out, JSON.stringify(summary, null, 1) + "\n");
  console.log(JSON.stringify({ ingresses: summary.ingresses, overBudget: summary.overBudget, windowsAroundThem: summary.windowsAroundThem, stations: summary.stationsNearBoundaries, dates: summary.overBudgetDates }, null, 1));
} else {
  const { bodyLongitude, longitudeSpeed } = await import(pathToFileURL(resolve(workerData.dist, "internal.js")).href);
  const { MakeTime, e_tilt } = await import("astronomy-engine");
  const node = (time) => {
    e_tilt(MakeTime(new Date(time + DAY)));
    return bodyLongitude("North Node", new Date(time));
  };
  const sign = (value) => Math.floor(value / 30);
  const distance = (value) => Math.abs(value - Math.round(value / 30) * 30);
  parentPort.on("message", ({ from, to }) => {
    const ingresses = [];
    const approaches = [];
    const bisect = (low, high, same) => {
      while (high - low > MINUTE) {
        const middle = low + Math.max(1, Math.floor((high - low) / 2 / MINUTE)) * MINUTE;
        if (same(middle)) low = middle;
        else high = middle;
      }
      return high;
    };
    let previous = node(from);
    for (let time = from + HOUR; time <= to; time += HOUR) {
      const value = node(time);
      const before = sign(previous);
      if (sign(value) !== before) {
        const at = bisect(time - HOUR, time, (t) => sign(node(t)) === before);
        ingresses.push({ time: at, rate: longitudeSpeed("North Node", new Date(at)) });
      }
      previous = value;
    }
    const speed = (time) => longitudeSpeed("North Node", new Date(time));
    let last = speed(from);
    for (let time = from + 6 * HOUR; time <= to; time += 6 * HOUR) {
      const current = speed(time);
      if (Math.sign(current) !== Math.sign(last)) {
        const was = Math.sign(last);
        const at = bisect(time - 6 * HOUR, time, (t) => Math.sign(speed(t)) === was);
        const value = node(at);
        if (distance(value) < 1e-3) approaches.push({ time: at, boundary: (Math.round(value / 30) * 30) % 360, least: distance(value) });
      }
      last = current;
    }
    parentPort.postMessage({ ingresses, approaches });
  });
}
