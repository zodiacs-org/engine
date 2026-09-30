/*
 * The plumbing proof: this tree's engine, fed astronomy-engine's own
 * nutation, must give what 0.1.1-rc.15 gives.
 *
 *   node docs/evidence/nutation-2026-09-29/tools/plumbing.mjs [results/plumbing.json]
 *
 * rc.15 is the carried archive, artifacts/zodiacs-engine-0.1.1-rc.15.tgz
 * (its SHA-256 checked against its receipt), unpacked into a directory under
 * TMPDIR. This tree's src/ is bundled twice with esbuild, astronomy-engine
 * left external:
 *
 * - "five": src/nutation.ts patched to what astronomy-engine 2.1.19 computes,
 *   its first five terms and no complementary terms in the equation of the
 *   equinoxes. Both patches must match exactly once, or the run stops.
 * - "full": unpatched, the engine as it now ships.
 *
 * Each engine runs in its own process over the same grid of synthetic
 * instants and places, and every number is compared: body longitudes,
 * latitudes and speeds, the angles, the cusps of all thirteen house systems,
 * the mean node and Black Moon Lilith with their speeds, the Vertex, the East
 * Point and the lots, declinations, right ascensions, the true obliquity and
 * the out-of-bounds margins, the nine built-in ayanamsas and a user-defined
 * one (mean, nutation, true), Moon phases and Saturn-return crossings.
 * Flags, fallbacks, the sect and the aspects' pairs must agree exactly.
 * "five" against rc.15 is the proof (gate 1e-9°, 1e-9°/day, 1 ms); "full"
 * against rc.15 is what the full series changes, reported, not gated.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ROOT, unpackRc15 } from "./engines.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = { degrees: 1e-9, degreesPerDay: 1e-9, milliseconds: 1 };

// ── The grid, the same in every process ─────────────────────────────────────

const SYSTEMS = [
  "whole", "placidus", "porphyry", "equal", "equal-mc", "vehlow", "koch",
  "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian"
];
const AYANAMSAS = [
  "lahiri", "fagan-bradley", "krishnamurti", "raman", "yukteswar",
  "true-chitra", "true-revati", "true-pushya", "galactic-center"
];

function grid() {
  let seed = 20_260_929;
  const random = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
  const at = (from, to) => new Date(Date.UTC(from, 0, 1) + random() * (Date.UTC(to, 0, 1) - Date.UTC(from, 0, 1)));
  const cases = [];
  for (let i = 0; i < 480; i += 1) {
    const high = i % 10 === 9;
    const latitude = high ? (i % 20 === 19 ? 1 : -1) * (66 + random() * 14) : -66 + random() * 132;
    const scale = ["utc", "ut1", "tt", "pin"][i % 4];
    cases.push({
      utc: at(1800, 2200).toISOString(),
      latitude,
      longitude: -180 + random() * 360,
      ...(scale === "pin" ? { deltaT: -30 + random() * 200 } : scale === "utc" ? {} : { timeScale: scale })
    });
  }
  // Outside the reference span, still inside the ephemeris's.
  for (let i = 0; i < 40; i += 1) {
    const [from, to] = i % 2 === 0 ? [200, 1800] : [2200, 3900];
    cases.push({ utc: at(from, to).toISOString(), latitude: -60 + random() * 120, longitude: -180 + random() * 360 });
  }
  return cases;
}

async function run(modulePath, outPath) {
  const engine = await import(pathToFileURL(modulePath).href);
  const user = engine.userAyanamsa({ name: "plumbing", epoch: "1900-01-01T00:00:00Z", value: 22.5 });
  const rows = [];
  const cases = grid();
  for (const [index, c] of cases.entries()) {
    const birth = { ...c, houseSystem: "placidus" };
    const chart = engine.natalChart(birth);
    const houses = {};
    for (const houseSystem of SYSTEMS) {
      const h = engine.natalChart({ ...c, houseSystem }).houses;
      houses[houseSystem] = { system: h.system, cusps: h.cusps };
    }
    const points = engine.chartPoints(chart);
    const declinations = engine.chartDeclinations(chart);
    const options = { ...(c.timeScale ? { timeScale: c.timeScale } : {}), ...(c.deltaT !== undefined ? { deltaT: c.deltaT } : {}) };
    const ayanamsas = {};
    for (const name of [...AYANAMSAS, user]) {
      const value = engine.ayanamsa(name, c.utc, options);
      ayanamsas[typeof name === "string" ? name : "user"] = { mean: value.mean, nutation: value.nutation, true: value.true };
    }
    const row = {
      bodies: chart.bodies.map(({ body, lon, lat, speed, retrograde }) => ({ body, lon, lat, speed, retrograde })),
      aspects: chart.aspects.map(({ a, b, type }) => `${a}-${b}-${type}`),
      angles: chart.angles,
      flags: chart.flags,
      houses,
      points: { sect: points.sect, points: points.points.map(({ point, lon, lat, speed }) => ({ point, lon, lat, speed })) },
      declinations: {
        trueObliquity: declinations.trueObliquity,
        rows: declinations.rows.map(({ body, ra, dec, boundMarginArcsec, outOfBounds }) => ({ body, ra, dec, boundMarginArcsec, outOfBounds }))
      },
      ayanamsas,
      moonPhase: engine.moonPhase(c.utc).angle
    };
    // The crossing solver on the engine's longitudes: every twelfth case.
    if (index % 12 === 0 && Date.parse(c.utc) > Date.UTC(1800, 0, 1) && Date.parse(c.utc) < Date.UTC(2100, 0, 1)) {
      row.saturnReturn = engine.saturnReturn({ utc: c.utc }).seasons.map((season) =>
        season.crossings.map((crossing) => [crossing.at.getTime(), crossing.retrograde])
      );
    }
    rows.push(row);
  }
  writeFileSync(outPath, JSON.stringify(rows));
}

// ── Comparison ──────────────────────────────────────────────────────────────

const wrap = (d) => ((((d % 360) + 540) % 360) - 180);

function compare(a, b) {
  const stats = {};
  const mismatches = [];
  const add = (key, value) => {
    const s = (stats[key] ??= { count: 0, max: 0, values: [] });
    s.count += 1;
    s.max = Math.max(s.max, value);
    s.values.push(value);
  };
  const angle = (key, x, y) => add(key, Math.abs(wrap(x - y)));
  const plain = (key, x, y) => add(key, Math.abs(x - y));
  const same = (key, x, y) => {
    if (JSON.stringify(x) !== JSON.stringify(y)) mismatches.push(key);
  };
  a.forEach((ra, i) => {
    const rb = b[i];
    ra.bodies.forEach((body, j) => {
      const other = rb.bodies[j];
      same("bodies.name", body.body, other.body);
      angle("bodies.lon", body.lon, other.lon);
      plain("bodies.lat", body.lat, other.lat);
      plain("bodies.speed", body.speed, other.speed);
      same(`bodies.retrograde#${i}`, body.retrograde, other.retrograde);
    });
    same(`aspects#${i}`, ra.aspects, rb.aspects);
    same(`flags#${i}`, ra.flags, rb.flags);
    for (const key of ["asc", "mc", "dsc", "ic"]) angle("angles", ra.angles[key], rb.angles[key]);
    for (const system of SYSTEMS) {
      same(`houses.system#${i}.${system}`, ra.houses[system].system, rb.houses[system].system);
      ra.houses[system].cusps.forEach((cusp, j) => angle(`houses.${system}`, cusp, rb.houses[system].cusps[j]));
    }
    same(`points.sect#${i}`, ra.points.sect, rb.points.sect);
    ra.points.points.forEach((point, j) => {
      const other = rb.points.points[j];
      same("points.name", point.point, other.point);
      const kind = ["Mean Node", "Mean South Node", "Black Moon Lilith"].includes(point.point) ? "points.meanLunar"
        : ["Vertex", "East Point"].includes(point.point) ? "points.vertexEastPoint" : "points.lots";
      angle(`${kind}.lon`, point.lon, other.lon);
      plain(`${kind}.lat`, point.lat, other.lat);
      if (point.speed !== null) plain(`${kind}.speed`, point.speed, other.speed);
    });
    plain("declinations.trueObliquity", ra.declinations.trueObliquity, rb.declinations.trueObliquity);
    ra.declinations.rows.forEach((row, j) => {
      const other = rb.declinations.rows[j];
      if (row.ra !== null && other.ra !== null) angle("declinations.ra", row.ra, other.ra);
      else same(`declinations.raDefined#${i}`, row.ra, other.ra);
      plain("declinations.dec", row.dec, other.dec);
      plain("declinations.boundMargin", row.boundMarginArcsec / 3600, other.boundMarginArcsec / 3600);
      same(`declinations.outOfBounds#${i}`, row.outOfBounds, other.outOfBounds);
    });
    for (const [name, value] of Object.entries(ra.ayanamsas)) {
      const other = rb.ayanamsas[name];
      for (const key of ["mean", "nutation", "true"]) angle(`ayanamsa.${key}`, value[key], other[key]);
    }
    angle("moonPhase", ra.moonPhase, rb.moonPhase);
    if (ra.saturnReturn) {
      same(`saturnReturn.count#${i}`, ra.saturnReturn.map((s) => s.length), rb.saturnReturn.map((s) => s.length));
      ra.saturnReturn.forEach((season, s) =>
        season.forEach(([at, retrograde], k) => {
          const [bt, bretrograde] = rb.saturnReturn[s]?.[k] ?? [NaN, null];
          plain("saturnReturn.ms", at, bt);
          same(`saturnReturn.retrograde#${i}`, retrograde, bretrograde);
        })
      );
    }
  });
  const summary = {};
  for (const [key, s] of Object.entries(stats)) {
    s.values.sort((x, y) => x - y);
    const q = (p) => s.values[Math.min(s.values.length - 1, Math.floor(p * s.values.length))];
    summary[key] = { count: s.count, max: s.max, p50: q(0.5), p95: q(0.95) };
  }
  return { summary, mismatches: [...new Set(mismatches.map((m) => m.replace(/#\d+/, "")))], mismatchCount: mismatches.length };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (process.argv[2] === "--run") return run(process.argv[3], process.argv[4]);
  const out = process.argv[2] ? resolve(process.argv[2]) : join(HERE, "../results/plumbing.json");
  const rc15 = unpackRc15();
  const { scratch } = rc15;
  try {
    const digest = rc15.sha256;
    writeFileSync(join(scratch, "rc15/entry.mjs"),
      'export * from "./package/dist/index.js";\nexport { ayanamsa, userAyanamsa } from "./package/dist/vedic.js";\n');

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
    const bundle = async (name, patched) => {
      const outfile = join(scratch, `${name}.mjs`);
      await build({
        stdin: {
          contents: 'export * from "./index.ts";\nexport { ayanamsa, userAyanamsa } from "./vedic.ts";\n',
          resolveDir: join(ROOT, "src"),
          sourcefile: "entry.ts",
          loader: "ts"
        },
        bundle: true,
        format: "esm",
        platform: "node",
        external: ["astronomy-engine"],
        outfile,
        logLevel: "error",
        plugins: patched ? [{
          name: "five-terms",
          setup(b) {
            b.onLoad({ filter: /[\\/]src[\\/]nutation\.ts$/ }, () => ({ contents: five, loader: "ts" }));
          }
        }] : []
      });
      return outfile;
    };
    const engines = {
      rc15: join(scratch, "rc15/entry.mjs"),
      five: await bundle("five", true),
      full: await bundle("full", false)
    };
    const results = {};
    for (const [name, path] of Object.entries(engines)) {
      const target = join(scratch, `${name}.json`);
      const started = Date.now();
      const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--run", path, target], { stdio: "inherit" });
      if (child.status !== 0) throw new Error(`${name} failed`);
      console.error(`${name}: ${((Date.now() - started) / 1000).toFixed(1)} s`);
      results[name] = JSON.parse(readFileSync(target, "utf8"));
    }
    const proof = compare(results.five, results.rc15);
    const change = compare(results.full, results.rc15);
    const gateOf = (key) => (key.endsWith(".speed") ? GATE.degreesPerDay : key === "saturnReturn.ms" ? GATE.milliseconds : GATE.degrees);
    const failures = Object.entries(proof.summary).filter(([key, s]) => s.max > gateOf(key)).map(([key]) => key);
    const git = spawnSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
    const dirty = spawnSync("git", ["-C", ROOT, "status", "--porcelain", "--", "src"], { encoding: "utf8" }).stdout.trim() !== "";
    // The source the bundles were built from, whatever was committed: git's
    // tree hash of src/ as the working tree holds it.
    const index = join(scratch, "index");
    const env = { ...process.env, GIT_INDEX_FILE: index };
    spawnSync("git", ["-C", ROOT, "read-tree", "--empty"], { env });
    spawnSync("git", ["-C", ROOT, "add", "-A", "--", "src"], { env });
    const srcTree = spawnSync("git", ["-C", ROOT, "write-tree", "--prefix=src/"], { env, encoding: "utf8" }).stdout.trim();
    const cases = grid();
    const report = {
      tool: "docs/evidence/nutation-2026-09-29/tools/plumbing.mjs",
      node: process.version,
      head: git,
      srcModifiedFromHead: dirty,
      srcTree,
      rc15Archive: { file: "artifacts/zodiacs-engine-0.1.1-rc.15.tgz", sha256: digest },
      patches: PATCHES.map(([from, to]) => ({ from, to })),
      grid: {
        cases: cases.length,
        inReferenceSpan: 480,
        outsideReferenceSpan: 40,
        scales: "utc, ut1, tt and a pinned ΔT in turn for the 480; utc for the 40",
        latitudes: "|φ| ≤ 66° for nine cases in ten, 66°–80° for the tenth",
        saturnReturns: cases.filter((c, i) => i % 12 === 0 && Date.parse(c.utc) > Date.UTC(1800, 0, 1) && Date.parse(c.utc) < Date.UTC(2100, 0, 1)).length
      },
      units: "degrees; speeds in degrees per day; boundMargin in degrees; saturnReturn.ms in milliseconds",
      gate: GATE,
      proof: { verdict: failures.length === 0 && proof.mismatchCount === 0 ? "pass" : "fail", failures, mismatches: proof.mismatches, summary: proof.summary },
      change: { mismatches: change.mismatches, mismatchCount: change.mismatchCount, summary: change.summary }
    };
    writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
    console.error(`plumbing: ${report.proof.verdict}; written ${relative(process.cwd(), out)}`);
    if (report.proof.verdict !== "pass") process.exitCode = 1;
  } finally {
    rc15.cleanup();
  }
}

await main();
