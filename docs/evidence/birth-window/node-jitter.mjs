/*
 * The true node's millisecond jitter over REFERENCE_SPAN, against the bound
 * the birth-window search uses, 5e-5 (1 + |T|) degrees (README, "Birth-time
 * windows").
 *
 * An epoch every 5 days from 1800-01-01 to 2200-01-01 (29,220 epochs), each
 * at a different time of day; at each, the engine's north node at 3,000
 * consecutive milliseconds (each evaluated alone, astronomy-engine's nutation
 * cache moved away first) and the largest distance of those values from their
 * least-squares quadratic: the node's smooth motion over 3 s is that quadratic
 * to far below the jitter. 87,660,000 evaluations in all. The review's worst
 * case, 2191-02-03T16:15:59.033Z over 30,000 ms, is measured the same way in
 * blocks of 3,000.
 *
 *   node node-jitter.mjs [--out FILE] [--workers N]   (about 15 minutes on four cores)
 *
 * Loads the build in ../../../dist; ZODIACS_ENGINE_DIST points it elsewhere.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const here = fileURLToPath(new URL(".", import.meta.url));
const DAY = 86_400_000;
const J2000 = Date.UTC(2000, 0, 1, 12);
const FROM = Date.UTC(1800, 0, 1);
const TO = Date.UTC(2200, 0, 1);
const STEP_DAYS = 5;
const BLOCK = 3_000;
const REVIEW = { epoch: "2191-02-03T16:15:59.033Z", blocks: 10 };
const bound = (T) => 5e-5 * (1 + Math.abs(T));

if (isMainThread) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const out = option("--out", resolve(here, "node-jitter.json"));
  const workers = Number(option("--workers", 4));
  const epochs = [];
  for (let k = 0; FROM + k * STEP_DAYS * DAY < TO; k += 1) {
    // A different time of day at each epoch: 16,127 s apart, modulo a day.
    epochs.push(FROM + k * STEP_DAYS * DAY + ((k * 16_127_000) % DAY));
  }
  const jobs = [];
  const size = Math.ceil(epochs.length / (workers * 8));
  for (let i = 0; i < epochs.length; i += size) jobs.push({ epochs: epochs.slice(i, i + size), blocks: 1 });
  jobs.push({ epochs: [Date.parse(REVIEW.epoch)], blocks: REVIEW.blocks });
  const began = Date.now();
  const rows = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: workers }, () => new Promise((settle, fail) => {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { dist: process.env.ZODIACS_ENGINE_DIST ?? resolve(here, "../../../dist") } });
      const feed = () => (next < jobs.length ? worker.postMessage(jobs[next++]) : worker.terminate().then(settle));
      worker.on("message", (found) => {
        rows.push(...found);
        process.stderr.write(`${rows.length} epochs, ${((Date.now() - began) / 60000).toFixed(1)} min\n`);
        feed();
      });
      worker.on("error", fail);
      feed();
    }))
  );
  const review = rows.find((row) => row.blocks === REVIEW.blocks);
  const scan = rows.filter((row) => row.blocks === 1).sort((a, b) => a.time - b.time);
  const ratio = (row) => bound(row.T) / row.value;
  const largest = scan.reduce((best, row) => (row.value > best.value ? row : best));
  const tightest = scan.reduce((best, row) => (ratio(row) < ratio(best) ? row : best));
  const show = (row) => ({ epoch: new Date(row.time).toISOString(), T: +row.T.toFixed(4), value: row.value, bound: bound(row.T), ratio: +ratio(row).toFixed(3) });
  const decades = [];
  for (let year = 1800; year < 2200; year += 10) {
    const within = scan.filter((row) => row.time >= Date.UTC(year, 0, 1) && row.time < Date.UTC(year + 10, 0, 1));
    decades.push([year, Math.max(...within.map((row) => row.value)), +Math.min(...within.map(ratio)).toFixed(3)]);
  }
  const summary = {
    method:
      "Largest distance of the engine's north node, over 3,000 consecutive milliseconds each evaluated alone, from the least-squares quadratic through them.",
    span: { from: new Date(FROM).toISOString(), to: new Date(TO).toISOString() },
    epochs: scan.length,
    epochEveryDays: STEP_DAYS,
    millisecondsPerEpoch: BLOCK,
    evaluations: scan.length * BLOCK + REVIEW.blocks * BLOCK,
    bound: "5e-5 (1 + |T|) degrees, T Julian centuries from J2000",
    largest: show(largest),
    tightest: show(tightest),
    review: { ...show(review), milliseconds: REVIEW.blocks * BLOCK },
    worstTwenty: [...scan].sort((a, b) => ratio(a) - ratio(b)).slice(0, 20).map(show),
    decades: { columns: ["from", "largest value", "smallest bound / value"], rows: decades },
    minutes: +((Date.now() - began) / 60000).toFixed(1)
  };
  writeFileSync(out, JSON.stringify(summary, null, 1) + "\n");
  console.log(JSON.stringify({ largest: summary.largest, tightest: summary.tightest, review: summary.review }, null, 1));
} else {
  const dist = workerData.dist;
  const { bodyLongitude } = await import(pathToFileURL(resolve(dist, "internal.js")).href);
  const { MakeTime, e_tilt } = await import("astronomy-engine");
  const wrap = (d) => ((((d % 360) + 540) % 360) - 180);
  // Least-squares a + b x + c x², x in [−1, 1], by Cramer's rule.
  const x = (i) => (2 * i) / (BLOCK - 1) - 1;
  const m = [0, 0, 0, 0, 0];
  for (let i = 0; i < BLOCK; i += 1) for (let k = 0, p = 1; k < 5; k += 1, p *= x(i)) m[k] += p;
  const matrix = [[m[0], m[1], m[2]], [m[1], m[2], m[3]], [m[2], m[3], m[4]]];
  const det = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(matrix);
  const values = new Float64Array(BLOCK);
  const block = (t0) => {
    for (let i = 0; i < BLOCK; i += 1) {
      e_tilt(MakeTime(new Date(t0 + i + DAY)));
      const value = bodyLongitude("North Node", new Date(t0 + i));
      values[i] = i === 0 ? value : values[i - 1] + wrap(value - values[i - 1]);
    }
    const r = [0, 0, 0];
    for (let i = 0; i < BLOCK; i += 1) for (let k = 0, p = 1; k < 3; k += 1, p *= x(i)) r[k] += (values[i] - values[0]) * p;
    const [a, b, c] = [0, 1, 2].map((j) => det(matrix.map((row, i) => row.map((value, k) => (k === j ? r[i] : value)))) / d);
    let largest = 0;
    for (let i = 0; i < BLOCK; i += 1) largest = Math.max(largest, Math.abs(values[i] - values[0] - (a + b * x(i) + c * x(i) ** 2)));
    return largest;
  };
  parentPort.on("message", ({ epochs, blocks }) => {
    parentPort.postMessage(
      epochs.map((time) => {
        let value = 0;
        for (let k = 0; k < blocks; k += 1) value = Math.max(value, block(time + k * BLOCK));
        return { time, T: (time - J2000) / (36525 * DAY), value, blocks };
      })
    );
  });
}
