/*
 * F3 of the varga sensitivity check (PREREGISTRATION.md, section 6): the
 * cases planted at the seams of the time basis, one for each seam on each
 * clock on which it steps, 13 in all. Synthetic places and instants, never
 * anyone's birth data.
 *
 *   node seams.mjs [--out FILE]
 *
 * It needs a build of engine main a253973's packed sources (in engine-rc2 at
 * commit P: npm run build), which it loads from the repository's dist/, or from
 * ZODIACS_ENGINE_DIST. It uses the public entry points only: `ayanamsa`,
 * `userAyanamsa`, `siderealChart`, `vargaOf` and `VARGAS` from the vedic
 * entry, and `natalChart` and `ENGINE_VERSION` from the root. It writes
 * seams.json beside INPUTS.md (default) and prints a summary.
 *
 * For each case it finds, in the engine's own arithmetic, the seam's first
 * millisecond on the clock and the step of UT1 and of TT there; then:
 *
 * - where UT1 steps, it plants the Ascendant: it chooses the place's
 *   longitude so that a D60 change boundary of the sidereal Ascendant
 *   (lahiri) falls inside the step;
 * - where only TT steps, it plants the Moon: it chooses a caller's epoch
 *   ayanamsa's value so that a D60 change boundary of the Moon falls inside
 *   the step;
 * - where the step goes forward, the boundary is put at the middle of the
 *   longitudes the step adds, so the change falls on the seam's first
 *   millisecond; the birth is put after the seam and the change is the
 *   row's `previous`;
 * - where the step goes backward, a crossing is planted half a step before
 *   the seam (k = round(|step| / 2) ms before it, the boundary midway
 *   between the longitudes at that millisecond and the one before), which
 *   the step then undoes; the birth is put before the crossing and the
 *   change is the row's `next`. A step under a millisecond leaves no
 *   millisecond half a step before the seam, so no such crossing can be
 *   planted: the case is recorded as not planted, with its step, and kept.
 *
 * The boundary is a D60 boundary that is a part boundary of no other key in
 * src/vedic/fixtures/varga-changes.json (F1), so only the D60 row changes at
 * it. Every expected change is then checked through the public API with lone
 * calls (an evaluation a day away before any instant within 100 ms of the
 * one before, as docs/evidence/birth-window/checker.mjs does): the signs on
 * either side of it, the longitudes either side of the boundary, the undoing
 * of a backward plant, and the birth sign at the birth and at every second
 * (Ascendant) or ten seconds (Moon) between the birth and the change. A case
 * whose check fails is recorded as failed, not dropped.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const args = new Map();
for (let index = 0; index < argv.length; index += 2) args.set(argv[index], argv[index + 1]);
for (const key of args.keys()) if (key !== "--out") throw new Error(`Unknown option ${key}.`);
const out = args.get("--out") ?? fileURLToPath(new URL("../seams.json", import.meta.url));
const dist = resolve(process.env.ZODIACS_ENGINE_DIST ?? fileURLToPath(new URL("../../../../../dist", import.meta.url)));
const root = await import(pathToFileURL(resolve(dist, "index.js")).href);
const vedic = await import(pathToFileURL(resolve(dist, "vedic.js")).href);
const changes = JSON.parse(readFileSync(new URL("../../../../../src/vedic/fixtures/varga-changes.json", import.meta.url), "utf8"));

const DAY = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const TICKS = 7560;
/** src/time-scale.ts:265, MODEL_KNOTS_FROM: the ΔT model's handover from its spline to its knots, UT1 days from J2000. */
const HANDOVER_DAYS = (1941 - 2000) * 365.25;
const VARGAS = vedic.VARGAS.map((varga) => varga.name);
const KEY = "D60";
const LATITUDE = 30;
/** The birth's distance from the planted change: 30 s for the Ascendant, 10 minutes for the Moon. */
const OFFSET = { Ascendant: 30_000, Moon: 600_000 };
/** Sampling of the birth sign between the birth and the change, as M5 samples: 1 s for the Ascendant, 10 s for the Moon. */
const SAMPLE = { Ascendant: 1_000, Moon: 10_000 };
/**
 * The step of UT1 or TT over a millisecond of the clock is its advance less
 * 1 ms (within one piece of the time basis both advance by 1 ms to within
 * 1e-7 ms, and the arithmetic on instants near 1.8e12 ms rounds to 2.4e-4
 * ms); a step larger than this, ms, in size is a step.
 */
const STEP_THRESHOLD_MS = 0.01;
/** Each seam's first millisecond is searched for within this many ms of its nominal instant. */
const WINDOW_MS = 3_000;
const BASE_VALUE = 23.85;

const LEAP_2017 = Date.UTC(2017, 0, 1);
const UTC_1972 = Date.UTC(1972, 0, 1);
const TABLE_END = Date.UTC(2027, 9, 2) + 1; // src/time-scale.ts:223, a UTC after UT1_TO_MS
const HANDOVER_MS = J2000_MS + HANDOVER_DAYS * DAY;

/** The seams of PREREGISTRATION.md section 6, with their nominal first millisecond on UTC (and UT1) input. */
const SEAMS = [
  { name: "leap-second-2017", label: "the leap second before 2017-01-01", utc: LEAP_2017 },
  { name: "utc-1972", label: "1972-01-01T00:00:00Z", utc: UTC_1972 },
  { name: "table-end-2027", label: "2027-10-02T00:00:00Z, the end of the IERS UT1 table", utc: TABLE_END },
  { name: "handover-1941", label: "1940-12-31T18:00 UT1, the ΔT model's handover", utc: HANDOVER_MS }
];
/** The table of PREREGISTRATION.md section 6: for each seam, the clocks on which it steps and the point planted there. */
const TABLE = {
  "leap-second-2017": { utc: "Ascendant", "utc-pinned": "Ascendant" },
  "utc-1972": { utc: "Ascendant", "utc-pinned": "Ascendant", ut1: "Moon", tt: "Ascendant" },
  "table-end-2027": { utc: "Ascendant", "utc-pinned": "Ascendant", ut1: "Moon", tt: "Ascendant" },
  "handover-1941": { utc: "Moon", ut1: "Moon", tt: "Ascendant" }
};
const COLUMNS = ["utc", "utc-pinned", "ut1", "tt"];
const PIN = 60;
const clockOf = (column) => (column === "utc-pinned" ? { timeScale: "utc", deltaT: PIN } : { timeScale: column });

// ---------------------------------------------------------------- time basis

const ayanamsaOptions = (clock) => ({
  ...(clock.timeScale === "utc" ? {} : { timeScale: clock.timeScale }),
  ...(clock.deltaT === undefined ? {} : { deltaT: clock.deltaT })
});

/**
 * UT1 and TT (ms) of an instant on a clock, and the provenance of its record,
 * from the record the vedic entry's `ayanamsa` gives (its `timeScale` and
 * `deltaT`), by the operations src/time-scale.ts performs.
 */
function basisOf(ms, clock) {
  const value = vedic.ayanamsa("lahiri", new Date(ms), ayanamsaOptions(clock));
  const { timeScale: scale, deltaT } = value;
  let ut1;
  if (clock.timeScale === "ut1") ut1 = ms;
  else if (clock.timeScale === "utc") ut1 = ms + (scale.ut1MinusUtc?.seconds ?? 0) * 1000;
  else if (clock.deltaT !== undefined) ut1 = ms - clock.deltaT * 1000;
  else if (scale.basis === "iers") ut1 = ms - 32_184 - scale.leapSeconds.taiMinusUtc * 1000 + scale.ut1MinusUtc.seconds * 1000;
  else ut1 = ms - deltaT.seconds * 1000; // TT read on the ΔT model: the fixed point UT1 = TT - ΔT(UT1)
  const side = (ut1 - J2000_MS) / DAY < HANDOVER_DAYS ? "spline" : "knots";
  const provenance = [scale.basis, deltaT.model, deltaT.segment, scale.ut1MinusUtc?.source ?? "none",
    scale.leapSeconds?.taiMinusUtc ?? "none", side].join(" ");
  return { ut1, tt: ut1 + deltaT.seconds * 1000, provenance };
}

/** Every millisecond within the window at which the provenance changes or UT1 or TT steps. */
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

/** The nominal first millisecond on a clock: on TT input, the UTC one plus TT - UTC there, to the millisecond. */
function nominalOn(seam, clock) {
  if (clock.timeScale !== "tt") return seam.utc;
  const before = basisOf(seam.utc - 1, { timeScale: "utc" });
  return seam.utc + Math.round(before.tt - (seam.utc - 1));
}

// ---------------------------------------------------------------- positions

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

/** The point's sidereal longitude at a millisecond, as siderealChart gives it, and its D60 sign. */
function pointAt(ms, point, clock, longitude, ayanamsa) {
  return lone(ms, () => {
    const chart = vedic.siderealChart({ ...birthInput(ms, clock, longitude), utc: new Date(ms) }, ayanamsa);
    const value = point === "Ascendant" ? chart.ascendant : chart.bodies.find((body) => body.body === point);
    return { lon: value.lon, sign: vedic.vargaOf(value, KEY).sign };
  });
}

/** a - b, degrees, into [-180, 180). */
const diff = (a, b) => ((((a - b + 540) % 360) + 360) % 360) - 180;

/** D60 boundaries (ticks) that are a part boundary of no other key of F1. */
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

// ---------------------------------------------------------------- the cases

const ayanamsaFor = (point, seam, column, value) =>
  point === "Moon"
    ? { name: `seam-${seam.name.split("-").at(-1)}-${column}`, epoch: { julianDateTT: 2_451_545 }, value, model: "engine" }
    : "lahiri";
const definitionOf = (spec) => (typeof spec === "string" ? spec : vedic.userAyanamsa(spec));

/**
 * The longitude the construction aims at, for a place longitude or an
 * ayanamsa value: forward, the middle of the longitudes the step adds,
 * [x(z - 1) + a, x(z)] with a the advance from z - 2 to z - 1; backward, the
 * middle of [x(m - 1), x(m)].
 */
function aimed(point, clock, z, plant, longitude, spec) {
  const definition = definitionOf(spec);
  const at = (ms) => pointAt(ms, point, clock, longitude, definition).lon;
  if (plant.forward) {
    const [x2, x1, x0] = [at(z - 2), at(z - 1), at(z)];
    return x1 + (diff(x1, x2) + diff(x0, x1)) / 2;
  }
  const [x1, x0] = [at(plant.at - 1), at(plant.at)];
  return x1 + diff(x0, x1) / 2;
}

function construct(seam, column, point) {
  const clock = clockOf(column);
  const nominal = nominalOn(seam, clock);
  const events = eventsNear(nominal, clock);
  const record = {
    seam: seam.name,
    label: seam.label,
    clock: column,
    timeScale: clock.timeScale,
    ...(clock.deltaT === undefined ? {} : { deltaT: clock.deltaT }),
    point,
    key: KEY,
    events
  };
  const steps = events.filter((event) => event.stepped);
  if (steps.length !== 1) return { ...record, status: "failed", reason: `expected one step within ${WINDOW_MS} ms of ${new Date(nominal).toISOString()}, found ${steps.length}` };
  const [event] = steps;
  const z = event.ms;
  const stepMs = point === "Ascendant" ? event.ut1StepMs : event.ttStepMs;
  Object.assign(record, {
    seamAt: event.at,
    seamAtMs: z,
    steps: { ut1Ms: event.ut1StepMs, ttMs: event.ttStepMs },
    plantedOn: point === "Ascendant" ? "UT1" : "TT",
    adjusted: point === "Ascendant" ? "the place's longitude" : "the epoch ayanamsa's value"
  });
  if (point === "Moon" && event.ut1StepMs !== 0) {
    return { ...record, status: "failed", reason: "UT1 steps here, so the table's Moon is not the point to plant" };
  }
  if (point === "Ascendant" && event.ut1StepMs === 0) {
    return { ...record, status: "failed", reason: "UT1 does not step here, so the table's Ascendant cannot be planted" };
  }
  const forward = stepMs > 0;
  const k = Math.round(Math.abs(stepMs) / 2);
  if (!forward && k < 1) {
    return {
      ...record,
      status: "not-planted",
      rule: "half-step-before-backward-step",
      reason: `the step goes back by ${Math.abs(stepMs)} ms, under a millisecond, so no millisecond lies half a step before the seam and the step undoes no crossing on the millisecond lattice`,
      input: birthInput(z - OFFSET[point], clock, 0),
      ayanamsa: ayanamsaFor(point, seam, column, BASE_VALUE),
      options: { points: [point], vargas: VARGAS, cyclic: true, horizonMinutes: 1440 },
      expected: null
    };
  }
  const plant = forward ? { forward, at: z } : { forward, at: z - k };
  // Solve for the longitude (Ascendant) or the ayanamsa value (Moon) that puts the aim on a clean D60 boundary.
  let longitude = 0;
  let value = BASE_VALUE;
  const aim = () => aimed(point, clock, z, plant, longitude, ayanamsaFor(point, seam, column, value));
  const ticks = cleanBoundaryNear(((aim() % 360) + 360) % 360);
  const boundary = ticks / TICKS;
  for (let round = 0; round < 12; round += 1) {
    const miss = diff(aim(), boundary);
    if (Math.abs(miss) < 1e-11) break;
    if (point === "Moon") value += miss;
    else {
      const h = 1e-3;
      const before = miss;
      longitude += h;
      const slope = (diff(aim(), boundary) - before) / h;
      longitude -= h;
      longitude -= before / slope;
    }
  }
  longitude = Math.round(longitude * 1e9) / 1e9;
  value = Math.round(value * 1e12) / 1e12;
  const spec = ayanamsaFor(point, seam, column, value);
  const definition = definitionOf(spec);
  const at = plant.at;
  const side = forward ? "previous" : "next";
  const birth = forward ? at + OFFSET[point] : at - OFFSET[point];
  const sample = (ms) => pointAt(ms, point, clock, longitude, definition);
  const below = sample(at - 1);
  const above = sample(at);
  const failures = [];
  if (!(diff(below.lon, boundary) < 0)) failures.push("the longitude at at - 1 ms is not below the boundary");
  if (!(diff(above.lon, boundary) >= 0)) failures.push("the longitude at at is not at or above the boundary");
  if (below.sign === above.sign) failures.push("the D60 sign does not change at at");
  const checks = { lonAtMinus1: below.lon, lonAt: above.lon };
  if (!forward) {
    const last = sample(z - 1);
    const first = sample(z);
    checks.lonSeamMinus1 = last.lon;
    checks.lonSeam = first.lon;
    if (!(diff(last.lon, boundary) >= 0 && last.sign === above.sign)) failures.push("the planted sign does not hold at the seam's last millisecond before the step");
    if (!(diff(first.lon, boundary) < 0 && first.sign === below.sign)) failures.push("the step does not undo the planted crossing");
  }
  const birthSign = forward ? above.sign : below.sign;
  const span = forward ? [at, birth] : [birth, at - 1];
  let samples = 0;
  for (let ms = span[0]; ms <= span[1]; ms += SAMPLE[point]) {
    samples += 1;
    if (sample(ms).sign !== birthSign) failures.push(`the birth sign does not hold at ${new Date(ms).toISOString()}`);
  }
  if (sample(span[1]).sign !== birthSign) failures.push("the birth sign does not hold at the end of the span");
  samples += 1;
  return {
    ...record,
    status: failures.length === 0 ? "planted" : "failed",
    rule: forward ? "inside-forward-step" : "half-step-before-backward-step",
    ...(forward ? {} : { plantedBeforeSeamMs: k }),
    ...(failures.length === 0 ? {} : { reason: failures.join("; ") }),
    input: birthInput(birth, clock, point === "Ascendant" ? longitude : 0),
    ayanamsa: spec,
    options: { points: [point], vargas: VARGAS, cyclic: true, horizonMinutes: 1440 },
    expected: {
      key: KEY,
      varga: KEY,
      scheme: "parashari",
      side,
      at: new Date(at).toISOString(),
      atMs: at,
      minutes: (at - birth) / 60_000,
      boundaryTicks: ticks,
      boundary,
      from: below.sign,
      to: above.sign
    },
    checks: {
      ...checks,
      marginBelowDegrees: -diff(below.lon, boundary),
      marginAboveDegrees: diff(above.lon, boundary),
      birthSignSamples: samples
    }
  };
}

const cases = [];
for (const seam of SEAMS) {
  for (const column of COLUMNS) {
    const point = TABLE[seam.name][column];
    if (point) cases.push({ id: cases.length, ...construct(seam, column, point) });
  }
}

// The clocks of the table's empty cells: each seam is searched there too, and must show no step.
const quiet = [];
for (const seam of SEAMS) {
  for (const column of COLUMNS) {
    if (TABLE[seam.name][column]) continue;
    const clock = clockOf(column);
    const events = eventsNear(nominalOn(seam, clock), clock);
    quiet.push({ seam: seam.name, clock: column, steps: events.filter((event) => event.stepped).length, events });
  }
}

const files = readdirSync(dist).filter((name) => name.endsWith(".js")).sort();
const digest = createHash("sha256");
for (const name of files) digest.update(`${name}\n${createHash("sha256").update(readFileSync(resolve(dist, name))).digest("hex")}\n`);
const result = {
  generator: "docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/seams.mjs",
  corpus: "F3, the planted seam cases (PREREGISTRATION.md, section 6)",
  engine: { version: root.ENGINE_VERSION, distJsFiles: files.length, distJsDigest: digest.digest("hex") },
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  latitude: LATITUDE,
  pinnedDeltaT: PIN,
  key: KEY,
  stepThresholdMs: STEP_THRESHOLD_MS,
  windowMs: WINDOW_MS,
  cases,
  clocksWithoutStep: quiet
};
const text = `${JSON.stringify(result, null, 1)}\n`;
writeFileSync(out, text);
console.log(JSON.stringify({
  out,
  sha256: createHash("sha256").update(text).digest("hex"),
  cases: cases.map((c) => [c.id, c.seam, c.clock, c.point, c.steps?.ut1Ms, c.steps?.ttMs, c.status, c.expected?.side ?? null, c.expected?.at ?? null, c.reason ?? ""].join(" | ")),
  clocksWithoutStep: quiet.map((q) => `${q.seam} ${q.clock}: ${q.steps} steps, ${q.events.length} provenance changes`)
}, null, 1));
