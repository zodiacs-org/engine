/*
 * The harness: for each window, the search (@zodiacs/engine/window), then the
 * independent checker (checker.mjs, natalChart at every whole second), then
 * the preregistered comparison (compare.mjs), in parallel worker threads.
 *
 *   node run.mjs [--windows FILE] [--out DIR] [--workers N] [--limit N]
 *
 * Writes DIR/results.jsonl (one line per window) and DIR/summary.json.
 * Loads the build in ../../../dist; ZODIACS_ENGINE_DIST points it elsewhere.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const here = fileURLToPath(new URL(".", import.meta.url));

if (isMainThread) {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
  const file = resolve(args.get("--windows") ?? resolve(here, "windows.json"));
  const out = resolve(args.get("--out") ?? here);
  const workers = Number(args.get("--workers") ?? Math.max(1, availableParallelism() - 1));
  const input = JSON.parse(readFileSync(file, "utf8"));
  const windows = input.windows.slice(0, Number(args.get("--limit") ?? input.windows.length));
  mkdirSync(out, { recursive: true });
  const results = new Array(windows.length);
  let next = 0;
  let done = 0;
  const began = Date.now();
  await Promise.all(
    Array.from({ length: Math.min(workers, windows.length) }, () => new Promise((settle, fail) => {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: {} });
      const feed = () => {
        if (next < windows.length) worker.postMessage(windows[next++]);
        else worker.terminate().then(settle);
      };
      worker.on("message", (result) => {
        results[result.id] = result;
        done += 1;
        if (done % 25 === 0 || done === windows.length) {
          process.stderr.write(`${done}/${windows.length} windows, ${((Date.now() - began) / 60000).toFixed(1)} min\n`);
        }
        feed();
      });
      worker.on("error", fail);
      feed();
    }))
  );
  writeFileSync(resolve(out, "results.jsonl"), results.map((result) => JSON.stringify(result)).join("\n") + "\n");
  const sum = (key) => results.reduce((total, result) => total + (result[key] ?? 0), 0);
  const failed = results.filter((result) => !result.pass);
  const summary = {
    windows: results.length,
    generator: input.generator,
    seed: input.seed,
    passed: results.length - failed.length,
    failed: failed.map((result) => result.id),
    errors: results.filter((result) => result.error).map((result) => ({ id: result.id, error: result.error })),
    sampledTransitions: sum("sampledTransitions"),
    matched: sum("matched"),
    missed: sum("missed"),
    extra: sum("extra"),
    switches: sum("switches"),
    changes: sum("changes"),
    excursions: sum("excursions"),
    excursionsConfirmed: sum("excursionsConfirmed"),
    samples: sum("samples"),
    sampleDisagreements: sum("sampleDisagreements"),
    millisecondChecks: sum("millisecondChecks"),
    millisecondFailures: sum("millisecondFailures"),
    boundExceeded: results.filter((result) => result.flags?.includes("bound-exceeded")).map((result) => result.id),
    finderSeconds: sum("finderMs") / 1000,
    checkerSeconds: sum("checkerMs") / 1000,
    wallMinutes: (Date.now() - began) / 60000,
    workers,
    node: process.version,
    verdict: failed.length === 0 && sum("missed") === 0 && sum("extra") === 0 ? "PASS" : "FAIL"
  };
  writeFileSync(resolve(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ ...summary, failed: summary.failed.length, errors: summary.errors.length }, null, 2));
} else {
  const dist = resolve(process.env.ZODIACS_ENGINE_DIST ?? resolve(here, "../../../dist"));
  const { birthWindow } = await import(pathToFileURL(resolve(dist, "window.js")).href);
  const checker = await import(pathToFileURL(resolve(here, "checker.mjs")).href);
  const { compareWindow } = await import(pathToFileURL(resolve(here, "compare.mjs")).href);
  parentPort.on("message", (spec) => {
    const window = {
      start: Date.parse(spec.start),
      end: Date.parse(spec.end),
      latitude: spec.latitude,
      longitude: spec.longitude,
      houseSystem: spec.houseSystem
    };
    const base = { id: spec.id, seconds: spec.seconds, latitude: spec.latitude, houseSystem: spec.houseSystem };
    let result;
    let finderMs;
    const t0 = performance.now();
    try {
      result = birthWindow({ start: new Date(window.start), end: new Date(window.end), latitude: window.latitude, longitude: window.longitude, houseSystem: window.houseSystem });
      finderMs = performance.now() - t0;
    } catch (error) {
      finderMs = performance.now() - t0;
      const t1 = performance.now();
      const samples = checker.sample(window);
      const transitions = samples.slice(1).reduce((total, current, index) =>
        total + checker.COMPONENTS.filter((component) => current.features[component] !== samples[index].features[component]).length, 0);
      parentPort.postMessage({ ...base, error: String(error?.message ?? error), pass: false, finderMs, checkerMs: performance.now() - t1, samples: samples.length, sampledTransitions: transitions, missed: transitions, matched: 0, extra: 0 });
      return;
    }
    const t1 = performance.now();
    const samples = checker.sample(window);
    const checkerMs = performance.now() - t1;
    const compared = compareWindow(window, result, samples, checker.COMPONENTS, (times) => checker.probe(window, times));
    parentPort.postMessage({ ...base, flags: result.flags, cells: result.cells.length, finderMs, checkerMs, ...compared });
  });
}
