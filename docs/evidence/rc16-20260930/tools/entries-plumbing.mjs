/*
 * The opt-in entries' plumbing proof for 0.1.1-rc.16, and what the full
 * nutation moves in each of them.
 *
 *   node docs/evidence/rc16-20260930/tools/entries-plumbing.mjs [out.json]
 *
 * Three engines are bundled with esbuild from source, astronomy-engine left
 * external (the checkout's node_modules):
 *
 * - "before": src/ at 5e0d00c, the integrated candidate before the nutation
 *   commits, whose calc, window and sky entries called astronomy-engine's
 *   nutation (git archive, into a directory under TMPDIR);
 * - "five": this tree's src/ with src/nutation.ts patched to what
 *   astronomy-engine 2.1.19 computes, its first five terms and no
 *   complementary terms in the equation of the equinoxes, the patches of
 *   docs/evidence/nutation-2026-09-29/tools/plumbing.mjs;
 * - "full": this tree's src/, as it ships.
 *
 * Each runs in its own process over the same synthetic workloads for the
 * calc, window, sky, techniques and houses entries and the timing entry's
 * planetary returns, and every number is compared. "five" against "before"
 * is the proof that the entries now take the engine's nutation and nothing
 * else changed (gate: 1e-9 degree, 1e-9 degree a day, 1 ms, 1e-12 relative,
 * and identical structure); "full" against "before" is what the full series
 * moves, reported, not gated. The receipts' convention ids and calc's bounds
 * are left out of the numbers: rc.16 changes them on purpose, and the report
 * lists how the ids changed.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const BEFORE = "5e0d00c";
const GATE = { degrees: 1e-9, degreesPerDay: 1e-9, milliseconds: 1, relative: 1e-12 };
const DAY = 86_400_000;

// ── Workloads, the same in every process ────────────────────────────────────

function random(seed) {
  let state = seed;
  return () => (state = (state * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
}
const between = (next, from, to) => Date.UTC(from, 0, 1) + Math.floor(next() * (Date.UTC(to, 0, 1) - Date.UTC(from, 0, 1)));
const jdOf = (ms) => 2_440_587.5 + ms / DAY;

const FRAMES = [
  "ecliptic-true-of-date", "ecliptic-mean-of-date", "ecliptic-j2000", "ecliptic-icrs",
  "equatorial-true-of-date", "equatorial-mean-of-date", "equatorial-j2000", "equatorial-icrs"
];
const BODIES = [
  "Sun", "Moon", "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
  "North Node", "South Node", "Mean Node", "Mean South Node", "Black Moon Lilith"
];
const POINTS = new Set(["North Node", "South Node", "Mean Node", "Mean South Node", "Black Moon Lilith"]);
const SYSTEMS = [
  "whole", "placidus", "porphyry", "equal", "equal-mc", "vehlow", "koch",
  "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian"
];
const SITES = [
  { latitude: 51.48, longitude: 0, height: 45 },
  { latitude: -33.9, longitude: 18.4, height: 25 },
  { latitude: 64.84, longitude: -147.72, height: 136 },
  { latitude: 0.5, longitude: 100.2, height: 0 },
  { latitude: 40.71, longitude: -74.01, height: 10 },
  { latitude: -54.8, longitude: -68.3, height: 20 }
];

/** 24 calc instants, 1800 to 2200, on each of calc's time forms in turn. */
function calcInstants() {
  const next = random(20_260_930);
  return Array.from({ length: 24 }, (_, i) => {
    const ms = between(next, 1800, 2200);
    const iso = new Date(ms).toISOString();
    return [iso, { jd: jdOf(ms), scale: "UT1" }, { jd: jdOf(ms), scale: "TT" }, { iso, deltaT: -20 + next() * 150 }][i % 4];
  });
}

// Invented birth-time windows and births (WINDOWS and NATAL), not anyone's:
// synthetic instants at the coordinates of cities or of open sea, the windows
// placed on what they exercise (a leap second, the start of 1972, a leap day,
// the polar circle, the far south).
const WINDOWS = [
  { start: "1911-03-02T04:00:00Z", end: "1911-03-02T10:00:00Z", latitude: 51.5, longitude: -0.12, houseSystem: "placidus" },
  { start: "1966-09-14T20:00:00Z", end: "1966-09-15T02:00:00Z", latitude: -33.9, longitude: 151.2, houseSystem: "koch" },
  { start: "1987-11-04T02:00:00Z", end: "1987-11-04T08:00:00Z", latitude: 48.21, longitude: 16.37, houseSystem: "whole" },
  { start: "2016-12-31T21:00:00Z", end: "2017-01-01T03:00:00Z", latitude: 35.7, longitude: 139.7, houseSystem: "equal" },
  { start: "1971-12-31T22:00:00Z", end: "1972-01-01T02:00:00Z", latitude: 40.4, longitude: -3.7, houseSystem: "regiomontanus" },
  { start: "2003-06-21T00:00:00Z", end: "2003-06-21T06:00:00Z", latitude: 66.2, longitude: 25.7, houseSystem: "placidus" },
  { start: "2044-02-29T10:00:00Z", end: "2044-02-29T14:00:00Z", latitude: 0.3, longitude: -78.5, houseSystem: "campanus" },
  { start: "2150-08-08T12:00:00Z", end: "2150-08-08T16:00:00Z", latitude: -60.1, longitude: -45.3, houseSystem: "topocentric" }
];

const NATAL = [
  { utc: "1851-03-14T04:37:00Z", latitude: 45.76, longitude: 4.84, houseSystem: "placidus" },
  { utc: "1902-07-19T18:05:00Z", latitude: -23.55, longitude: -46.63, houseSystem: "koch" },
  { utc: "1948-05-18T11:20:00Z", latitude: 15, longitude: 70, houseSystem: "equal" },
  { utc: "1976-10-02T23:59:30Z", latitude: 60.17, longitude: 24.94, houseSystem: "placidus" },
  { utc: "1999-12-31T12:00:00Z", latitude: -41.29, longitude: 174.78, houseSystem: "whole" },
  { utc: "2031-05-05T05:05:05Z", latitude: 19.43, longitude: -99.13, houseSystem: "porphyry" }
];

// ── Rows: [entry, kind, key, type, value] ───────────────────────────────────

async function run(modulePath, outPath) {
  const engine = await import(pathToFileURL(modulePath).href);
  const { calc, window, sky, techniques, housesExtra, planetaryReturns } = engine;
  const rows = [];
  const add = (entry, kind, key, type, value) => rows.push([entry, kind, key, type, value]);
  const ms = (date) => date.getTime();

  // calc(): every body geocentric and apparent in every frame; five bodies at
  // every center and correction in every frame.
  const instants = calcInstants();
  instants.forEach((time, t) => {
    const site = SITES[t % SITES.length];
    const requests = [];
    for (const body of BODIES) for (const frame of FRAMES) requests.push({ body, time, frame, flags: { cartesian: !POINTS.has(body) } });
    for (const body of ["Sun", "Moon", "Mars", "Jupiter", "Earth"]) {
      for (const center of ["geocentric", "heliocentric", "barycentric", { topocentric: site }]) {
        for (const correction of ["apparent", "astrometric", "geometric"]) {
          for (const frame of FRAMES) requests.push({ body, time, frame, center, flags: { correction, cartesian: true } });
        }
      }
    }
    requests.forEach((request, r) => {
      const key = `${t}.${r}`;
      const result = calc.calc(request);
      add("calc", "status", key, "exact", result.status === "ok" ? "ok" : result.reason);
      if (result.status !== "ok") return;
      const topocentric = typeof request.center === "object";
      const kind = `${request.frame.includes("true") ? "true" : request.frame.includes("mean") ? "mean" : "fixed"}${topocentric ? "-topocentric" : ""}`;
      add("calc", `lon/${kind}`, key, "deg", result.lon);
      add("calc", `lat/${kind}`, key, "deg", result.lat);
      if (result.dist !== null) add("calc", "dist", key, "rel", result.dist);
      if (result.speeds) {
        add("calc", `speed/${kind}`, key, "degday", result.speeds.lon);
        add("calc", `speed/${kind}`, key, "degday", result.speeds.lat);
      }
      if (result.cartesian) {
        const { x, y, z, vx, vy, vz } = result.cartesian;
        add("calc", "xyz", key, "vec", [x, y, z]);
        if (vx !== null) add("calc", "vxyz", key, "vecday", [vx, vy, vz, x, y, z]);
      }
      add("calc", "instants", key, "exact", result.receipt.instants);
      add("calc", "ids", key, "ids", result.receipt.conventions);
    });
    // houses(): thirteen systems at three places.
    for (const place of [{ latitude: 0.5, longitude: -71.1 }, { latitude: 51.5, longitude: -0.12 }, { latitude: -63.4, longitude: 150 }]) {
      for (const system of SYSTEMS) {
        const key = `${t}.${system}.${place.latitude}`;
        const result = calc.houses({ time, place, system });
        add("calc", "houses.status", key, "exact", result.status === "ok" ? [result.status, result.system, result.flags] : result.reason);
        if (result.status !== "ok") continue;
        add("calc", "houses.angles", key, "deg", result.angles.asc);
        add("calc", "houses.angles", key, "deg", result.angles.mc);
        add("calc", "houses.vertex-east-point", key, "deg", result.vertex);
        add("calc", "houses.vertex-east-point", key, "deg", result.eastPoint);
        add("calc", "houses.armc", key, "deg", result.armc);
        add("calc", "houses.obliquity", key, "deg", result.obliquity);
        result.cusps.forEach((cusp) => add("calc", "houses.cusps", key, "deg", cusp));
        add("calc", "ids", key, "ids", result.receipt.conventions);
        // The houses entry on the same angle input: gast from the RAMC.
        const input = { gastHours: (((result.armc - place.longitude) % 360) + 360) % 360 / 15, latitude: place.latitude, longitude: place.longitude, obliquity: result.obliquity };
        const co = housesExtra.coAscendants(input);
        for (const value of Object.values(co)) add("houses", "coAscendants", key, "deg", value);
        const speeds = housesExtra.houseSpeeds(system, input);
        add("houses", "speeds.status", key, "exact", [speeds.system, speeds.fellBack]);
        speeds.cusps.forEach((value) => add("houses", "speeds", key, "degday", value));
        const bodies = calc.chart({ time, place: { latitude: place.latitude, longitude: place.longitude }, houseSystem: system });
        if (bodies.status === "ok") {
          for (const body of bodies.chart.bodies) {
            const position = housesExtra.housePosition(system, input, { lon: body.lon, lat: body.lat });
            if (position === null) add("houses", "housePosition", key, "exact", null);
            else add("houses", "housePosition", key, "deg", position * 30);
          }
        }
      }
    }
  });
  // events(): crossings of fixed longitudes.
  const searches = [
    ["Sun", 0, "1850-01-01", "1851-01-01", 5], ["Moon", 123.4, "1901-03-01", "1901-05-01", 0.25],
    ["Mercury", 300, "1999-01-01", "2000-01-01", 1], ["Mars", 45, "2080-01-01", "2082-01-01", 2],
    ["Jupiter", 200, "2140-01-01", "2146-01-01", 5], ["North Node", 90, "1960-01-01", "1970-01-01", 5]
  ];
  searches.forEach(([body, longitude, from, to, stepDays], s) => {
    const result = calc.events({ kind: "longitude-crossing", body, longitude, from, to, stepDays });
    add("calc", "events", `${s}`, "instants", result.events.map((event) => [Date.parse(event.at), event.retrograde]));
    add("calc", "ids", `${s}`, "ids", result.receipt.conventions);
  });

  // birthWindow().
  WINDOWS.forEach((input, w) => {
    const result = window.birthWindow(input);
    add("window", "switches", `${w}`, "instants", result.switches.map((entry) => [ms(entry.at), JSON.stringify(entry.changes)]));
    add("window", "cells", `${w}`, "exact", result.cells.length);
    add("window", "flags", `${w}`, "exact", result.flags);
    add("window", "unresolved", `${w}`, "instants", result.unresolved.map((entry) => [ms(entry.start), ms(entry.end), JSON.stringify(entry.features)]));
  });

  // skyEvents() and planetaryHours().
  const next = random(930);
  const days = Array.from({ length: 6 }, () => new Date(between(next, 1850, 2150)).toISOString().slice(0, 10));
  for (const [s, site] of SITES.entries()) {
    for (const [d, day] of days.entries()) {
      const from = `${day}T00:00:00Z`;
      const to = new Date(Date.parse(from) + 2 * DAY).toISOString();
      for (const body of ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]) {
        const key = `${s}.${d}.${body}`;
        const result = sky.skyEvents(body, site, from, to);
        add("sky", "events", key, "instants", result.events.map((event) => [ms(event.at), event.kind]));
        add("sky", "flags", key, "exact", [result.status, result.flags]);
        for (const event of result.events) {
          add("sky", "altitude", key, "deg", event.altitude);
          add("sky", "azimuth", key, "deg", event.azimuth);
        }
      }
      const hours = sky.planetaryHours(site, day);
      add("sky", "hours.status", `${s}.${d}`, "exact", [hours.status, hours.flags]);
      add("sky", "hours", `${s}.${d}`, "instants", hours.hours.map((hour) => [ms(hour.start), hour.ruler]));
    }
  }

  // techniques and the timing entry's planetary returns.
  NATAL.forEach((birth, n) => {
    const at = new Date(Date.parse(birth.utc) + (20 + 7 * n) * 365.25 * DAY);
    const solar = techniques.solarReturn(birth, at);
    add("techniques", "solarReturn", `${n}`, "instants", [[ms(solar.instant)]]);
    add("techniques", "returnChart", `${n}`, "deg", solar.chart.angles.asc);
    add("techniques", "returnChart", `${n}`, "deg", solar.chart.angles.mc);
    const lunar = techniques.lunarReturn(birth, at);
    add("techniques", "lunarReturn", `${n}`, "instants", [[ms(lunar.instant)]]);
    add("techniques", "returnChart", `${n}`, "deg", lunar.chart.angles.asc);
    const voids = techniques.voidOfCourseWindows(at, new Date(ms(at) + 10 * DAY));
    add("techniques", "voidOfCourse", `${n}`, "instants", voids.map((entry) => [ms(entry.from), ms(entry.to), entry.sign, entry.nextSign]));
    add("techniques", "moonSigns", `${n}`, "exact", techniques.moonSignsBetween(at, new Date(ms(at) + 5 * DAY)));
    const other = NATAL[(n + 1) % NATAL.length];
    const davison = techniques.davisonChart(birth, other);
    add("techniques", "davison.instant", `${n}`, "instants", [[ms(davison.instant)]]);
    for (const body of davison.chart.bodies) add("techniques", "davison.bodies", `${n}`, "deg", body.lon);
    if (davison.chart.angles) add("techniques", "davison.angles", `${n}`, "deg", davison.chart.angles.asc);
    const composite = techniques.compositeChart(birth, other);
    for (const body of composite.bodies) add("techniques", "composite", `${n}`, "deg", body.lon);
    add("techniques", "composite.aspects", `${n}`, "exact", composite.aspects.map((aspect) => `${aspect.a}-${aspect.b}-${aspect.type}`));
    const body = ["Saturn", "Jupiter", "Mars", "Venus", "Mercury", "Sun"][n];
    const returns = planetaryReturns(birth, body, birth.utc, new Date(Date.parse(birth.utc) + 60 * 365.25 * DAY));
    add("timing", "planetaryReturns", `${n}`, "instants", returns.returns.map((entry) => [ms(entry.at), entry.retrograde, entry.pass]));
  });
  writeFileSync(outPath, JSON.stringify(rows));
}

// ── Comparison ──────────────────────────────────────────────────────────────

const wrap = (d) => ((((d % 360) + 540) % 360) - 180);
const idMap = (id) => (id === "nutation:iau2000b-five-terms" ? "nutation:iau2000b" : id);

function compare(a, b) {
  if (a.length !== b.length) throw new Error(`row counts differ: ${a.length} and ${b.length}`);
  const stats = {};
  const structure = {};
  const ids = new Map();
  /** A difference of structure: counted, and the first few shown, rows that differ only. */
  const note = (entry, kind, key, x, y) => {
    const name = `${entry}/${kind}`;
    const s = (structure[name] ??= { count: 0, cases: [] });
    s.count += 1;
    if (s.cases.length >= 8) return;
    if (Array.isArray(x) && Array.isArray(y) && x.every(Array.isArray) && y.every(Array.isArray)) {
      // Rows matched by their labels (all but the instants), in order: the
      // rows of each side left unmatched, with their instants.
      const label = (row) => JSON.stringify(row.filter((v) => !(typeof v === "number" && Math.abs(v) > 1e6)));
      const unmatched = (list, other) => {
        const pool = new Map();
        for (const row of other) pool.set(label(row), (pool.get(label(row)) ?? 0) + 1);
        return list.filter((row) => {
          const left = pool.get(label(row)) ?? 0;
          if (left > 0) pool.set(label(row), left - 1);
          return left === 0;
        });
      };
      s.cases.push({ key, rows: [x.length, y.length], onlyHere: unmatched(x, y).slice(0, 6), onlyBefore: unmatched(y, x).slice(0, 6) });
    } else s.cases.push({ key, here: x, before: y });
  };
  let key = "";
  const add = (entry, kind, type, value) => {
    const name = `${entry}/${kind}`;
    const s = (stats[name] ??= { type, count: 0, max: 0, at: null, values: [] });
    s.count += 1;
    if (value > s.max) [s.max, s.at] = [value, key];
    s.values.push(value);
  };
  a.forEach(([entry, kind, rowKey, type, x], i) => {
    const [entryB, kindB, keyB, typeB, y] = b[i];
    if (entry !== entryB || kind !== kindB || rowKey !== keyB || type !== typeB) throw new Error(`rows ${i} differ in kind: ${entry}/${kind}/${rowKey} and ${entryB}/${kindB}/${keyB}`);
    key = rowKey;
    if (type === "deg") add(entry, kind, type, Math.abs(wrap(x - y)));
    else if (type === "degday") add(entry, kind, type, Math.abs(x - y));
    else if (type === "rel") add(entry, kind, type, Math.abs(x - y) / Math.abs(y));
    else if (type === "vec") add(entry, kind, type, Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) / Math.hypot(...y));
    // A velocity's difference as the angular rate it would turn the position
    // by, degrees a day: a central difference's own noise scales with the
    // position, not with the velocity.
    else if (type === "vecday") add(entry, kind, "degday", (Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) / Math.hypot(y[3], y[4], y[5])) * (180 / Math.PI));
    else if (type === "ids") {
      const from = y.map(idMap);
      if (JSON.stringify(x) !== JSON.stringify(from)) {
        const change = `${JSON.stringify(y.filter((id) => !x.includes(id)))} -> ${JSON.stringify(x.filter((id) => !y.includes(id)))}`;
        ids.set(change, (ids.get(change) ?? 0) + 1);
      }
    } else if (type === "instants") {
      // Rows of instants (milliseconds; every instant here is far from 1970)
      // and labels: the labels and the number of rows must agree, the
      // instants are compared.
      const isTime = (v) => typeof v === "number" && Math.abs(v) > 1e6;
      const shape = (list) => JSON.stringify(list.map((row) => row.map((v) => (isTime(v) ? "t" : v))));
      if (shape(x) !== shape(y)) note(entry, kind, rowKey, x, y);
      else x.forEach((row, j) => row.forEach((v, k) => isTime(v) && add(entry, kind, "ms", Math.abs(v - y[j][k]))));
    } else if (JSON.stringify(x) !== JSON.stringify(y)) note(entry, kind, rowKey, x, y);
  });
  const summary = {};
  for (const [name, s] of Object.entries(stats)) {
    s.values.sort((p, q) => p - q);
    const at = (p) => s.values[Math.min(s.values.length - 1, Math.floor(p * s.values.length))];
    summary[name] = { type: s.type, count: s.count, max: s.max, p50: at(0.5), p95: at(0.95), largestAt: s.at };
  }
  return { summary, structural: structure, idChanges: Object.fromEntries(ids) };
}

const gateOf = (type) =>
  type === "deg" ? GATE.degrees : type === "degday" ? GATE.degreesPerDay : type === "ms" ? GATE.milliseconds : GATE.relative;

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (process.argv[2] === "--run") return run(process.argv[3], process.argv[4]);
  const out = process.argv[2] ? resolve(process.argv[2]) : join(HERE, "../results/entries-plumbing.json");
  const scratch = mkdtempSync(join(tmpdir(), "rc16-plumbing-"));
  if (!relative(ROOT, scratch).startsWith("..")) throw new Error("TMPDIR must be outside the checkout");
  try {
    const git = (...args) => spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 1 << 30 });
    const before = git("rev-parse", BEFORE).stdout.trim();
    mkdirSync(join(scratch, "before"));
    const archive = spawnSync("sh", ["-c", `git -C "${ROOT}" archive ${before} src | tar -x -C "${join(scratch, "before")}"`], { stdio: "inherit" });
    if (archive.status !== 0) throw new Error("git archive failed");
    mkdirSync(join(scratch, "node_modules"));
    symlinkSync(join(ROOT, "node_modules/astronomy-engine"), join(scratch, "node_modules/astronomy-engine"));

    const { build } = await import(pathToFileURL(join(ROOT, "node_modules/esbuild/lib/main.js")).href);
    const nutationSource = readFileSync(join(ROOT, "src/nutation.ts"), "utf8");
    const PATCHES = [
      ["const { dpsi, deps, om } = nutation(t);", "const { dpsi, deps, om } = nutation(t, 5);"],
      [" + 0.00264096 * Math.sin(om) + 0.00006352 * Math.sin(2 * om)", ""]
    ];
    let five = nutationSource;
    for (const [from, to] of PATCHES) {
      if (five.split(from).length !== 2) throw new Error(`patch not found exactly once: ${from}`);
      five = five.replace(from, to);
    }
    const ENTRY = [
      'export * as calc from "./calc.ts";',
      'export * as window from "./window.ts";',
      'export * as sky from "./sky.ts";',
      'export * as techniques from "./techniques.ts";',
      'export * as housesExtra from "./houses-extra.ts";',
      'export { planetaryReturns } from "./timing.ts";'
    ].join("\n");
    const bundle = async (name, src, patched) => {
      const outfile = join(scratch, `${name}.mjs`);
      await build({
        stdin: { contents: ENTRY, resolveDir: src, sourcefile: "entry.ts", loader: "ts" },
        bundle: true,
        format: "esm",
        platform: "node",
        external: ["astronomy-engine"],
        outfile,
        logLevel: "error",
        plugins: patched
          ? [{ name: "five-terms", setup(b) { b.onLoad({ filter: /[\\/]src[\\/]nutation\.ts$/ }, () => ({ contents: five, loader: "ts" })); } }]
          : []
      });
      return outfile;
    };
    const engines = {
      before: await bundle("before", join(scratch, "before/src"), false),
      five: await bundle("five", join(ROOT, "src"), true),
      full: await bundle("full", join(ROOT, "src"), false)
    };
    const results = {};
    const seconds = {};
    for (const [name, path] of Object.entries(engines)) {
      const target = join(scratch, `${name}.json`);
      const started = Date.now();
      const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--run", path, target], { stdio: "inherit" });
      if (child.status !== 0) throw new Error(`${name} failed`);
      seconds[name] = Number(((Date.now() - started) / 1000).toFixed(1));
      console.error(`${name}: ${seconds[name]} s`);
      results[name] = JSON.parse(readFileSync(target, "utf8"));
    }
    const proof = compare(results.five, results.before);
    const change = compare(results.full, results.before);
    const failures = Object.entries(proof.summary).filter(([, s]) => s.max > gateOf(s.type)).map(([name]) => name);
    const head = git("rev-parse", "HEAD").stdout.trim();
    const index = join(scratch, "index");
    const env = { ...process.env, GIT_INDEX_FILE: index };
    spawnSync("git", ["-C", ROOT, "read-tree", "--empty"], { env });
    spawnSync("git", ["-C", ROOT, "add", "-A", "--", "src"], { env });
    const srcTree = spawnSync("git", ["-C", ROOT, "write-tree", "--prefix=src/"], { env, encoding: "utf8" }).stdout.trim();
    const report = {
      tool: "docs/evidence/rc16-20260930/tools/entries-plumbing.mjs",
      node: process.version,
      head,
      srcTree,
      before: { commit: before, what: "the integrated candidate before the nutation commits" },
      patches: PATCHES.map(([from, to]) => ({ from, to })),
      rows: results.full.length,
      seconds,
      units: "deg: degrees (angles wrapped); degday: degrees a day (a velocity's difference over its position's length, as an angular rate); ms: milliseconds; rel and vec: relative to the size of the value",
      gate: GATE,
      proof: {
        verdict: failures.length === 0 && Object.keys(proof.structural).length === 0 ? "pass" : "fail",
        failures,
        structural: proof.structural,
        idChanges: proof.idChanges,
        summary: proof.summary
      },
      change: { structural: change.structural, idChanges: change.idChanges, summary: change.summary }
    };
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
    console.error(`entries plumbing: ${report.proof.verdict}; written ${relative(process.cwd(), out)}`);
    if (report.proof.verdict !== "pass") process.exitCode = 1;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

await main();
