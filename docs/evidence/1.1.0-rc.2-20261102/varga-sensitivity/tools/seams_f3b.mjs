/*
 * F3b of the varga sensitivity check: planted seam cases on which a build that
 * ignores the seams of the time basis must fail M6 (control C3d). Added after
 * review 1 by the amendment "2026-11-03, review 1: C3d and the seam input F3b"
 * (PREREGISTRATION.md, section 13). F3 (seams.mjs, seams.json) is not changed.
 * Synthetic places and instants, never anyone's birth data.
 *
 *   node seams_f3b.mjs [--out FILE]
 *
 * Why F3 cannot serve C3d (review 1): its backward-step plants, F3 cases 2 and
 * 3, put the birth 30 s before the planted crossing with a horizon of 1,440
 * minutes, and a seam-blind build's bisection of its first bracket happens to
 * land in the planted window and find the crossing. F3b plants the same
 * crossing in the same way, at the same seam and on the same two clocks, and
 * places the birth so that the span searched after it ends inside the window
 * the step undoes:
 *
 * - the seam is 1972-01-01T00:00:00Z on UTC input, plain and with a pinned ΔT
 *   of 60 s, where UT1 steps back by 45 ms;
 * - the Ascendant (lahiri, latitude 30°) is planted as seams.mjs plants a
 *   backward step: a crossing k = round(|step| / 2) ms before the seam's first
 *   millisecond z, at m = z − k, of a D60 change boundary B that is a part
 *   boundary of no other key in src/vedic/fixtures/varga-changes.json (F1),
 *   the place's longitude chosen so that B lies midway between the
 *   longitudes at m − 1 and m;
 * - the step takes the Ascendant back below B at z, and it crosses B again at
 *   m′, the first millisecond from z on at which it is at or above B: the
 *   undone window is [z, m′ − 1];
 * - the horizon is 1 minute, the least vargaSensitivity takes, and the birth
 *   is t0 = h − 60,000 ms, with h = z + floor((m′ − 1 − z) / 2), the middle of
 *   the undone window, so that the span searched after the birth is
 *   [t0, h]: the expected change is the D60 row's `next`, at m.
 *
 * A build that walks the seam finds that change at m. A build whose seam
 * finder returns none brackets from the birth straight to h, the end of the
 * span, where the Ascendant is back in its birth run, so it reports no `next`
 * at all, whatever the length of its brackets: M6 fails. tools/c3d_replica.mjs
 * shows both on synthetic longitudes shaped like these cases.
 *
 * It needs a build of the package (npm run build), which it loads from the
 * repository's dist/ or from ZODIACS_ENGINE_DIST, and it uses the public entry
 * points only, as seams.mjs does: `ayanamsa`, `siderealChart`, `vargaOf` and
 * `VARGAS` from the vedic entry, and `natalChart` and `ENGINE_VERSION` from
 * the root. The search code is never run. Everything below is checked through
 * the public API with lone calls (an evaluation a day away before any instant
 * within 100 ms of the one before, as docs/evidence/birth-window/checker.mjs
 * does): the D60 sign at m − 1 and at m and the longitudes either side of B;
 * the planted sign at z − 1 and its undoing at z; every millisecond of the
 * undone window below B with the birth sign, and m′ at or above B with the
 * planted one; the birth inside the D60 run that ends at B; and the birth
 * sign at the birth, at every second from it up to m − 1, and at m − 1. A case
 * whose check fails is recorded as failed, not dropped. It writes
 * seams-f3b.json beside INPUTS.md (default) and prints a summary.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const args = new Map();
for (let index = 0; index < argv.length; index += 2) args.set(argv[index], argv[index + 1]);
for (const key of args.keys()) if (key !== "--out") throw new Error(`Unknown option ${key}.`);
const out = args.get("--out") ?? fileURLToPath(new URL("../seams-f3b.json", import.meta.url));
const dist = resolve(process.env.ZODIACS_ENGINE_DIST ?? fileURLToPath(new URL("../../../../../dist", import.meta.url)));
const root = await import(pathToFileURL(resolve(dist, "index.js")).href);
const vedic = await import(pathToFileURL(resolve(dist, "vedic.js")).href);
const changes = JSON.parse(readFileSync(new URL("../../../../../src/vedic/fixtures/varga-changes.json", import.meta.url), "utf8"));

const DAY = 86_400_000;
const TICKS = 7560;
const VARGAS = vedic.VARGAS.map((varga) => varga.name);
const KEY = "D60";
const LATITUDE = 30;
const PIN = 60;
const HORIZON_MINUTES = 1;
const HORIZON_MS = HORIZON_MINUTES * 60_000;
/** M5's spacing for the Ascendant, the birth sign's sampling here. */
const SAMPLE_MS = 1_000;
/** As seams.mjs: a step of UT1 or TT larger than this, ms, over a millisecond of the clock is a step. */
const STEP_THRESHOLD_MS = 0.01;
/** As seams.mjs: the seam's first millisecond is searched for within this many ms of its nominal instant. */
const WINDOW_MS = 3_000;
/** The undone window is looked for within this many ms after the seam. */
const RECROSS_LIMIT_MS = 1_000;
const SEAM = { name: "utc-1972", label: "1972-01-01T00:00:00Z", utc: Date.UTC(1972, 0, 1) };
const CLOCKS = [["utc", { timeScale: "utc" }], ["utc-pinned", { timeScale: "utc", deltaT: PIN }]];

// ------------------------------------------------- the time basis (seams.mjs)

const ayanamsaOptions = (clock) => ({
  ...(clock.timeScale === "utc" ? {} : { timeScale: clock.timeScale }),
  ...(clock.deltaT === undefined ? {} : { deltaT: clock.deltaT })
});

/** UT1 and TT (ms) of an instant on a UTC clock, and the provenance of its record, from the vedic entry's `ayanamsa` record. */
function basisOf(ms, clock) {
  const value = vedic.ayanamsa("lahiri", new Date(ms), ayanamsaOptions(clock));
  const { timeScale: scale, deltaT } = value;
  const ut1 = ms + (scale.ut1MinusUtc?.seconds ?? 0) * 1000;
  const provenance = [scale.basis, deltaT.model, deltaT.segment, scale.ut1MinusUtc?.source ?? "none",
    scale.leapSeconds?.taiMinusUtc ?? "none"].join(" ");
  return { ut1, tt: ut1 + deltaT.seconds * 1000, provenance };
}

/** Every millisecond within the window at which the provenance changes or UT1 or TT steps (seams.mjs's eventsNear). */
function eventsNear(nominal, clock) {
  const events = [];
  let before = basisOf(nominal - WINDOW_MS - 1, clock);
  for (let ms = nominal - WINDOW_MS; ms <= nominal + WINDOW_MS; ms += 1) {
    const now = basisOf(ms, clock);
    const ut1Step = now.ut1 - before.ut1 - 1;
    const ttStep = now.tt - before.tt - 1;
    const stepped = Math.abs(ut1Step) > STEP_THRESHOLD_MS || Math.abs(ttStep) > STEP_THRESHOLD_MS;
    if (stepped || now.provenance !== before.provenance) {
      events.push({
        ms,
        at: new Date(ms).toISOString(),
        ut1StepMs: Number(ut1Step.toFixed(3)),
        ttStepMs: Number(ttStep.toFixed(3)),
        stepped,
        provenanceBefore: before.provenance,
        provenanceAt: now.provenance
      });
    }
    before = now;
  }
  return events;
}

// ------------------------------------------------- positions (seams.mjs)

let previous = Number.NaN;
/** A lone call: an evaluation a day away first when the instant lies within 100 ms of the one before. */
function lone(ms, run) {
  if (!(Math.abs(ms - previous) > 100)) root.natalChart({ utc: new Date(ms + DAY) });
  previous = ms;
  return run();
}

function birthInput(ms, clock, longitude) {
  return {
    utc: new Date(ms).toISOString(),
    timeScale: clock.timeScale,
    ...(clock.deltaT === undefined ? {} : { deltaT: clock.deltaT }),
    latitude: LATITUDE,
    longitude,
    houseSystem: "whole"
  };
}

/** The sidereal Ascendant at a millisecond, as siderealChart gives it, and its D60 sign. */
function ascendantAt(ms, clock, longitude) {
  return lone(ms, () => {
    const chart = vedic.siderealChart({ ...birthInput(ms, clock, longitude), utc: new Date(ms) }, "lahiri");
    return { lon: chart.ascendant.lon, sign: vedic.vargaOf(chart.ascendant, KEY).sign };
  });
}

/** a - b, degrees, into [-180, 180). */
const diff = (a, b) => ((((a - b + 540) % 360) + 360) % 360) - 180;

/** D60 boundaries (ticks) that are a part boundary of no other key of F1 (seams.mjs). */
const OTHER = new Set(Object.entries(changes.varga).filter(([key]) => key !== KEY).flatMap(([, rows]) => rows.map((row) => row[0])));
function cleanBoundaryNear(lon) {
  const step = TICKS / 2; // 0.5 degree
  const centre = Math.round((lon * TICKS) / step);
  for (let distance = 0; distance < 60; distance += 1) {
    for (const k of distance === 0 ? [centre] : [centre - distance, centre + distance]) {
      const ticks = ((((k * step) % (360 * TICKS)) + 360 * TICKS) % (360 * TICKS));
      if (!OTHER.has(ticks)) return ticks;
    }
  }
  throw new Error("no clean D60 boundary found");
}

// ------------------------------------------------- the cases

function construct(column, clock) {
  const events = eventsNear(SEAM.utc, clock);
  const record = {
    seam: SEAM.name,
    label: SEAM.label,
    clock: column,
    timeScale: clock.timeScale,
    ...(clock.deltaT === undefined ? {} : { deltaT: clock.deltaT }),
    point: "Ascendant",
    key: KEY,
    events
  };
  const steps = events.filter((event) => event.stepped);
  if (steps.length !== 1) return { ...record, status: "failed", reason: `expected one step within ${WINDOW_MS} ms of ${SEAM.label}, found ${steps.length}` };
  const [event] = steps;
  const z = event.ms;
  Object.assign(record, {
    seamAt: event.at,
    seamAtMs: z,
    steps: { ut1Ms: event.ut1StepMs, ttMs: event.ttStepMs },
    plantedOn: "UT1",
    adjusted: "the place's longitude"
  });
  const k = Math.round(Math.abs(event.ut1StepMs) / 2);
  if (!(event.ut1StepMs < 0) || k < 1) return { ...record, status: "failed", reason: "UT1 does not step back by a millisecond or more here" };
  const m = z - k;
  // The place's longitude that puts B midway between the Ascendant at m - 1 and at m (seams.mjs's solve).
  let longitude = 0;
  const aim = () => {
    const [x1, x0] = [ascendantAt(m - 1, clock, longitude).lon, ascendantAt(m, clock, longitude).lon];
    return x1 + diff(x0, x1) / 2;
  };
  const ticks = cleanBoundaryNear(((aim() % 360) + 360) % 360);
  const boundary = ticks / TICKS;
  for (let round = 0; round < 12; round += 1) {
    const miss = diff(aim(), boundary);
    if (Math.abs(miss) < 1e-11) break;
    const h = 1e-3;
    longitude += h;
    const slope = (diff(aim(), boundary) - miss) / h;
    longitude -= h;
    longitude -= miss / slope;
  }
  longitude = Math.round(longitude * 1e9) / 1e9;
  const sample = (ms) => ascendantAt(ms, clock, longitude);
  const failures = [];
  const below = sample(m - 1);
  const above = sample(m);
  if (!(diff(below.lon, boundary) < 0)) failures.push("the longitude at m - 1 is not below the boundary");
  if (!(diff(above.lon, boundary) >= 0)) failures.push("the longitude at m is not at or above the boundary");
  if (below.sign === above.sign) failures.push("the D60 sign does not change at m");
  const last = sample(z - 1);
  const first = sample(z);
  if (!(diff(last.lon, boundary) >= 0 && last.sign === above.sign)) failures.push("the planted sign does not hold at the seam's last millisecond before the step");
  if (!(diff(first.lon, boundary) < 0 && first.sign === below.sign)) failures.push("the step does not undo the planted crossing");
  // The undone window: every millisecond from z below B, with the birth sign, up to m', the first at or above B.
  let recross = null;
  for (let ms = z; ms <= z + RECROSS_LIMIT_MS; ms += 1) {
    const now = sample(ms);
    if (diff(now.lon, boundary) >= 0) {
      recross = { ms, lon: now.lon, sign: now.sign };
      break;
    }
    if (now.sign !== below.sign) failures.push(`the birth sign does not hold at ${new Date(ms).toISOString()} in the undone window`);
  }
  if (recross === null) return { ...record, status: "failed", reason: `no recrossing within ${RECROSS_LIMIT_MS} ms of the seam` };
  if (recross.sign !== above.sign) failures.push("the sign at the recrossing is not the planted one");
  const spanEnd = z + Math.floor((recross.ms - 1 - z) / 2);
  const birth = spanEnd - HORIZON_MS;
  const atEnd = sample(spanEnd);
  const atBirth = sample(birth);
  if (!(diff(boundary, atBirth.lon) > 0 && diff(boundary, atBirth.lon) < 0.5)) failures.push("the birth does not lie in the D60 run that ends at the boundary");
  if (!(spanEnd >= z && spanEnd < recross.ms && diff(atEnd.lon, boundary) < 0 && atEnd.sign === below.sign)) failures.push("the span's end does not lie in the undone window with the birth sign");
  let samples = 0;
  for (let ms = birth; ms <= m - 1; ms += SAMPLE_MS) {
    samples += 1;
    if (sample(ms).sign !== below.sign) failures.push(`the birth sign does not hold at ${new Date(ms).toISOString()}`);
  }
  if (sample(m - 1).sign !== below.sign) failures.push("the birth sign does not hold at m - 1");
  samples += 1;
  return {
    ...record,
    status: failures.length === 0 ? "planted" : "failed",
    rule: "half-step-before-backward-step, the span searched ending inside the undone window",
    plantedBeforeSeamMs: k,
    ...(failures.length === 0 ? {} : { reason: failures.join("; ") }),
    undoneWindow: {
      from: new Date(z).toISOString(),
      fromMs: z,
      to: new Date(recross.ms - 1).toISOString(),
      toMs: recross.ms - 1,
      recrossAt: new Date(recross.ms).toISOString(),
      recrossAtMs: recross.ms
    },
    spanEnd: { at: new Date(spanEnd).toISOString(), atMs: spanEnd, afterSeamMs: spanEnd - z },
    input: birthInput(birth, clock, longitude),
    ayanamsa: "lahiri",
    options: { points: ["Ascendant"], vargas: VARGAS, cyclic: true, horizonMinutes: HORIZON_MINUTES },
    expected: {
      key: KEY,
      varga: KEY,
      scheme: "parashari",
      side: "next",
      at: new Date(m).toISOString(),
      atMs: m,
      minutes: (m - birth) / 60_000,
      boundaryTicks: ticks,
      boundary,
      from: below.sign,
      to: above.sign
    },
    seamBlind: "a build whose seam finder returns none brackets from the birth to the span's end, inside the undone window, where the Ascendant is back in its birth run: it reports no next, and M6 fails",
    checks: {
      lonAtMinus1: below.lon,
      lonAt: above.lon,
      lonSeamMinus1: last.lon,
      lonSeam: first.lon,
      lonRecross: recross.lon,
      lonSpanEnd: atEnd.lon,
      lonBirth: atBirth.lon,
      marginBelowDegrees: -diff(below.lon, boundary),
      marginAboveDegrees: diff(above.lon, boundary),
      undoneWindowMs: recross.ms - z,
      birthSignSamples: samples
    }
  };
}

const cases = CLOCKS.map(([column, clock], id) => ({ id, ...construct(column, clock) }));

const files = readdirSync(dist).filter((name) => name.endsWith(".js")).sort();
const digest = createHash("sha256");
for (const name of files) digest.update(`${name}\n${createHash("sha256").update(readFileSync(resolve(dist, name))).digest("hex")}\n`);
const result = {
  generator: "docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/seams_f3b.mjs",
  corpus: "F3b, the planted seam cases for C3d (PREREGISTRATION.md, section 13, 2026-11-03)",
  engine: { version: root.ENGINE_VERSION, distJsFiles: files.length, distJsDigest: digest.digest("hex") },
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  latitude: LATITUDE,
  pinnedDeltaT: PIN,
  key: KEY,
  horizonMinutes: HORIZON_MINUTES,
  stepThresholdMs: STEP_THRESHOLD_MS,
  windowMs: WINDOW_MS,
  cases
};
const text = `${JSON.stringify(result, null, 1)}\n`;
writeFileSync(out, text);
console.log(JSON.stringify({
  out,
  sha256: createHash("sha256").update(text).digest("hex"),
  cases: cases.map((c) => [c.id, c.seam, c.clock, c.steps?.ut1Ms, c.status, c.input?.longitude, c.expected?.at ?? null,
    c.undoneWindow ? `${c.undoneWindow.from} to ${c.undoneWindow.to}` : null, c.spanEnd?.at ?? null, c.reason ?? ""].join(" | "))
}, null, 1));
