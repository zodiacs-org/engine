/*
 * G-V3's checker (PREREGISTRATION.md, section 8), and G-V2 (b): each result
 * of run.mjs checked through the public API of the package under test with
 * lone calls. It uses siderealChart, siderealLongitude, vargaOf and
 * userAyanamsa from @zodiacs/engine/vedic and chartPoints from the root,
 * imports nothing from the search module and shares no code with it; it places
 * a longitude on the 1/7560° grid with its own exact arithmetic (BigInt).
 *
 *   node checker.mjs [--results FILE] [--seams FILE|none] [--f3b FILE|none] [--changes FILE]
 *                    [--out FILE] [--workers N] [--step-scale N]
 *
 * M0 the call returned, and no row is refused; M1 each row's position is
 * vargaOf at the birth; M2 each change's `from` is the sign at at − 1 ms and
 * `to` the sign at at; M3 minutes = (at − birth) / 60,000, zero or negative for
 * previous and positive for next, and at lies in `searched`; M4 `boundary` is
 * the double nearest T / 7560 for a whole T on the short arc from the
 * longitude at at − 1 ms to the longitude at at; M5 at every sample instant in
 * [previous, next) the sign is the birth sign (every second for the
 * Ascendant, 10 s for the Moon, 60 s for the other points, counted from the
 * birth both ways, and the interval's first and last milliseconds; a null side
 * extends the interval to that end of `searched`); M6 every F3 and F3b case
 * gives its expected change (F3b, seams-f3b.json, added after review 1 by the
 * amendment of 2026-11-03 in section 13). G-V2 (b): every reported boundary
 * T is a change row of F1 for its key, with `from` and `to` F1's signs below
 * and at T in the direction of the crossing.
 *
 * Lone calls: a chart a day away is evaluated before the first instant of
 * each call and before any instant within 100 ms of the one before, as
 * docs/evidence/birth-window/checker.mjs does. Reported outside the pass
 * rule: changes per point and key, null sides, the evaluations each call
 * reports, run times, and the disclosure of whether the public API gives the
 * same bits at each F2 birth instant alone and 1 ms after a call at the
 * millisecond before.
 *
 * Writes FILE (default ../results/check.json), and exits 1 if any check
 * failed (since review 1, so that checks.sh records the verdict as the step's
 * exit). --step-scale N multiplies M5's sample spacing; it is for trials only,
 * and the output records it. Each worker thread loads its own copy of the
 * package.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

import { FOLDER, ayanamsaOf, changeRows, keyOf, loadEngine, options, readJson } from "./load.mjs";

const DAY = 86_400_000;
const TICKS = 7560n;
const CIRCLE = 2_721_600;
const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
/** M5's sample spacing, ms. */
const SPACING = { Ascendant: 1_000, Moon: 10_000 };
const OTHER_SPACING = 60_000;

/** floor(lon × 7560) for the exact binary value of a finite double lon ≥ 0. */
export function exactTicks(lon) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, lon);
  const bits = view.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const mantissa = biased === 0 ? fraction : fraction | (1n << 52n);
  const exponent = (biased === 0 ? 1 : biased) - 1075;
  const product = mantissa * TICKS;
  return Number(exponent >= 0 ? product << BigInt(exponent) : product >> BigInt(-exponent));
}

/** A difference of longitudes, degrees, in [−180, 180). */
const arc = (value) => ((((value + 180) % 360) + 360) % 360) - 180;

/** Checks one call's line; returns its failures and what the report counts. */
export function checkLine(engine, line, { changes, expected, stepScale, disclose }) {
  const { root, vedic } = engine;
  const failures = [];
  const fail = (check, detail) => failures.push({ corpus: line.corpus, id: line.id, check, detail });
  const counted = { corpus: line.corpus, id: line.id, changes: {}, nullSides: 0, evaluations: line.result?.evaluations ?? null, ms: line.ms, publicCalls: 0, samples: 0, disclosure: null };
  if (line.error) {
    fail("M0", `the call threw: ${line.error.split("\n")[0]}`);
    return { failures, counted };
  }
  const result = line.result;
  const ayanamsa = ayanamsaOf(vedic, line.ayanamsa);
  const t0 = Date.parse(result.utc);
  const points = [...new Set(result.rows.map((row) => row.point))];
  const nodes = points.some((point) => point.startsWith("Mean"));
  const at = (ms) => ({ ...line.birth, utc: new Date(ms) });
  // The public API's sidereal longitudes at an instant, with lone calls.
  let previous = Number.NaN;
  const publicAt = (ms) => {
    if (!(Math.abs(ms - previous) > 100)) vedic.siderealChart(at(ms + DAY), ayanamsa);
    previous = ms;
    counted.publicCalls += 1;
    const chart = vedic.siderealChart(at(ms), ayanamsa);
    const extra = nodes ? root.chartPoints(at(ms)).points : [];
    return (point) => {
      if (point === "Ascendant") return chart.ascendant;
      if (point.startsWith("Mean")) return vedic.siderealLongitude(extra.find((row) => row.point === point).lon, chart.ayanamsaValue);
      return chart.bodies.find((row) => row.body === point);
    };
  };
  const cache = new Map();
  const lonAt = (ms) => {
    if (!cache.has(ms)) cache.set(ms, publicAt(ms));
    return cache.get(ms);
  };
  const [from, to] = [Date.parse(result.searched.from), Date.parse(result.searched.to)];
  const signOf = (lon, row) => vedic.vargaOf(lon, row.varga, row.scheme).sign;
  for (const row of result.rows) {
    const key = `${row.point} ${keyOf(row)}`;
    counted.changes[key] ??= 0;
    if (row.refusal) {
      fail("M0", `${key} refused: ${row.refusal.reason}`);
      continue;
    }
    const birth = lonAt(t0)(row.point);
    if (JSON.stringify(row.position) !== JSON.stringify(vedic.vargaOf(birth, row.varga, row.scheme))) fail("M1", `${key}: position`);
    for (const side of ["previous", "next"]) {
      const change = row[side];
      if (!change) {
        counted.nullSides += 1;
        continue;
      }
      counted.changes[key] += 1;
      const ms = Date.parse(change.at);
      const [before, after] = [lonAt(ms - 1)(row.point), lonAt(ms)(row.point)];
      if (change.from !== signOf(before, row) || change.to !== signOf(after, row)) fail("M2", `${key} ${side} at ${change.at}`);
      if (change.minutes !== (ms - t0) / 60_000 || (side === "previous" ? ms > t0 : ms <= t0) || ms < from || ms > to) {
        fail("M3", `${key} ${side} at ${change.at}`);
      }
      const tick = Math.round(change.boundary * 7560);
      const up = arc(after.lon - before.lon) > 0;
      const [tb, ta] = [exactTicks(before.lon), exactTicks(after.lon)];
      const reach = up ? (tick - tb + CIRCLE) % CIRCLE : (tick - ta + CIRCLE) % CIRCLE;
      const span = up ? (ta - tb + CIRCLE) % CIRCLE : (tb - ta + CIRCLE) % CIRCLE;
      if (change.boundary !== tick / 7560 || !(reach > 0 && reach <= span)) fail("M4", `${key} ${side} boundary ${change.boundary}`);
      const f1 = changes.get(keyOf(row))?.get(tick);
      const signs = f1 && (up ? [SIGNS[f1[0]], SIGNS[f1[1]]] : [SIGNS[f1[1]], SIGNS[f1[0]]]);
      if (!f1 || f1[2] !== 1 || signs[0] !== change.from || signs[1] !== change.to) fail("G-V2b", `${key} ${side} boundary ${change.boundary}`);
    }
  }
  // M5, every sample instant once for all the rows that take it.
  const plan = new Map();
  for (const row of result.rows) {
    if (row.refusal) continue;
    const spacing = (SPACING[row.point] ?? OTHER_SPACING) * stepScale;
    const low = row.previous ? Date.parse(row.previous.at) : from;
    const high = row.next ? Date.parse(row.next.at) - 1 : to;
    const times = new Set([low, high]);
    for (let k = Math.ceil((low - t0) / spacing); t0 + k * spacing <= high; k += 1) times.add(t0 + k * spacing);
    for (const ms of times) {
      if (!plan.has(ms)) plan.set(ms, []);
      plan.get(ms).push(row);
    }
  }
  const missed = new Set();
  for (const ms of [...plan.keys()].sort((a, b) => a - b)) {
    const lon = cache.get(ms) ?? publicAt(ms);
    counted.samples += 1;
    for (const row of plan.get(ms)) {
      const key = `${row.point} ${keyOf(row)}`;
      if (!missed.has(key) && signOf(lon(row.point), row) !== row.position.sign) {
        missed.add(key);
        fail("M5", `${key} at ${new Date(ms).toISOString()}`);
      }
    }
  }
  // M6.
  if (expected) {
    const row = result.rows.find((each) => each.point === line.options.points[0] && each.varga === expected.varga && each.scheme === expected.scheme);
    const change = row?.[expected.side];
    const want = { at: expected.at, boundary: expected.boundary, from: expected.from, to: expected.to };
    const got = change && { at: change.at, boundary: change.boundary, from: change.from, to: change.to };
    if (JSON.stringify(got) !== JSON.stringify(want)) fail("M6", `case ${line.id}: ${JSON.stringify(got)} for ${JSON.stringify(want)}`);
  }
  // The disclosure: the same bits alone and 1 ms after a call at the millisecond before.
  if (disclose) {
    previous = Number.NaN;
    const alone = publicAt(t0);
    publicAt(t0 - 1);
    previous = t0 - 1_000; // so that the next call is not preceded by one a day away
    const after = publicAt(t0);
    counted.disclosure = points.filter((point) => !Object.is(alone(point).lon, after(point).lon));
  }
  return { failures, counted };
}

async function work(data) {
  const engine = await loadEngine();
  const changes = changeRows(data.changes);
  return (line) => checkLine(engine, line, { changes, expected: data.expected[`${line.corpus} ${line.id}`] ?? null, stepScale: data.stepScale, disclose: line.corpus === "F2" });
}

if (isMainThread) {
  const args = options(process.argv.slice(2), ["--results", "--seams", "--f3b", "--changes", "--out", "--workers", "--step-scale"]);
  const resultsFile = resolve(args.get("--results") ?? resolve(FOLDER, "results/results.jsonl"));
  const out = resolve(args.get("--out") ?? resolve(resultsFile, "../check.json"));
  const seamsFile = args.get("--seams") === "none" ? null : resolve(args.get("--seams") ?? resolve(FOLDER, "seams.json"));
  const f3bFile = args.get("--f3b") === "none" ? null : resolve(args.get("--f3b") ?? resolve(FOLDER, "seams-f3b.json"));
  const stepScale = Number(args.get("--step-scale") ?? 1);
  const workers = Number(args.get("--workers") ?? 1);
  const lines = readFileSync(resultsFile, "utf8").trim().split("\n").map((text) => JSON.parse(text));
  const expected = {};
  if (seamsFile) for (const entry of readJson(seamsFile).cases) expected[`F3 ${entry.id}`] = entry.expected;
  if (f3bFile) for (const entry of readJson(f3bFile).cases) expected[`F3b ${entry.id}`] = entry.expected;
  const data = { changes: args.get("--changes") ?? undefined, expected, stepScale };
  const outcomes = new Array(lines.length);
  let next = 0;
  let done = 0;
  const began = performance.now();
  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, lines.length, availableParallelism())) }, () => new Promise((settle, reject) => {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: data });
    const feed = () => (next < lines.length ? worker.postMessage({ index: next, line: lines[next++] }) : worker.terminate().then(settle));
    worker.on("message", ({ index, outcome }) => {
      outcomes[index] = outcome;
      done += 1;
      if (done % 50 === 0) process.stderr.write(`${done}/${lines.length} calls checked, ${((performance.now() - began) / 60000).toFixed(1)} min\n`);
      feed();
    });
    worker.on("error", reject);
    feed();
  })));
  const failures = outcomes.flatMap((outcome) => outcome.failures);
  const byCheck = {};
  for (const check of ["M0", "M1", "M2", "M3", "M4", "M5", "M6", "G-V2b"]) byCheck[check] = failures.filter((each) => each.check === check).length;
  const changesByPoint = {};
  for (const outcome of outcomes) for (const [key, count] of Object.entries(outcome.counted.changes)) changesByPoint[key] = (changesByPoint[key] ?? 0) + count;
  const evaluations = outcomes.map((outcome) => outcome.counted.evaluations).filter(Boolean);
  const perPoint = {};
  for (const counts of evaluations) for (const [point, count] of Object.entries(counts)) (perPoint[point] ??= []).push(count);
  const stats = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return { calls: sorted.length, mean: sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length), median: sorted[Math.floor(sorted.length / 2)] ?? null, max: sorted.at(-1) ?? null };
  };
  const disclosed = outcomes.filter((outcome) => outcome.counted.disclosure !== null);
  const report = {
    tool: "docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/checker.mjs",
    results: resultsFile,
    stepScale,
    trial: stepScale !== 1,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    calls: lines.length,
    verdict: failures.length === 0 && stepScale === 1 ? "PASS" : failures.length === 0 ? "no failure (trial spacing)" : "FAIL",
    failuresByCheck: byCheck,
    failures,
    reported: {
      changesByPointAndKey: changesByPoint,
      nullSides: outcomes.reduce((sum, outcome) => sum + outcome.counted.nullSides, 0),
      evaluationsPerCall: stats(evaluations.map((counts) => Object.values(counts).reduce((a, b) => a + b, 0))),
      evaluationsPerPoint: Object.fromEntries(Object.entries(perPoint).map(([point, values]) => [point, stats(values)])),
      callMs: stats(outcomes.map((outcome) => outcome.counted.ms ?? 0)),
      publicCalls: outcomes.reduce((sum, outcome) => sum + outcome.counted.publicCalls, 0),
      m5Samples: outcomes.reduce((sum, outcome) => sum + outcome.counted.samples, 0),
      disclosure: {
        what: "F2 birth instants at which a point's public longitude differs alone and 1 ms after a call at the millisecond before",
        births: disclosed.length,
        differing: disclosed.filter((outcome) => outcome.counted.disclosure.length > 0).map((outcome) => ({ id: outcome.counted.id, points: outcome.counted.disclosure }))
      }
    },
    checkerMinutes: (performance.now() - began) / 60000
  };
  writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
  console.log(JSON.stringify({ calls: report.calls, verdict: report.verdict, failuresByCheck: byCheck, minutes: report.checkerMinutes.toFixed(2) }));
  process.exitCode = failures.length === 0 ? 0 : 1;
} else {
  const check = await work(workerData);
  parentPort.on("message", ({ index, line }) => parentPort.postMessage({ index, outcome: check(line) }));
}
