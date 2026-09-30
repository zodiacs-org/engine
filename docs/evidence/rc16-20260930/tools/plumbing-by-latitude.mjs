/*
 * What the full IAU 2000B series moves at the root plumbing proof's 520
 * charts, by latitude: where each largest change of the angles, the cusps of
 * each house system and the lots falls. The review of rc.16's first build
 * found that the CHANGELOG gave Koch's largest change, 3.883″, as one at
 * 66°–80°, where it is at 65.75°; this places each figure.
 *
 *   node docs/evidence/rc16-20260930/tools/plumbing-by-latitude.mjs [results/plumbing-by-latitude.json]
 *
 * It runs docs/evidence/nutation-2026-09-29/tools/plumbing.mjs's own "--run"
 * workload, unchanged, on the same two engines as that tool's "full" against
 * "rc15" comparison: the carried rc.15 archive (checked against its receipt,
 * unpacked under TMPDIR) and this checkout's src/, bundled with esbuild. The
 * grid is plumbing.mjs's grid() written again below; every case's ascendant,
 * computed here with the bundled engine, must equal the one the workload
 * wrote, or the run stops. The classes: the 432 of the 480 cases from 1800 to
 * 2200 with |latitude| < 66°, the other 48, at 66° to 80°, and the 40 from 200
 * to 1800 and 2200 to 3900 within 60°. Changes are in arcseconds. The report
 * records the git tree of src/ as the working tree holds it.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ROOT, unpackRc15 } from "../../nutation-2026-09-29/tools/engines.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUMBING = join(ROOT, "docs/evidence/nutation-2026-09-29/tools/plumbing.mjs");
const SYSTEMS = [
  "whole", "placidus", "porphyry", "equal", "equal-mc", "vehlow", "koch",
  "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian"
];

/** plumbing.mjs's grid(), the same seed and the same draws. */
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
  for (let i = 0; i < 40; i += 1) {
    const [from, to] = i % 2 === 0 ? [200, 1800] : [2200, 3900];
    cases.push({ utc: at(from, to).toISOString(), latitude: -60 + random() * 120, longitude: -180 + random() * 360 });
  }
  return cases;
}

const wrap = (d) => ((((d % 360) + 540) % 360) - 180);
const classOf = (index, c) => (index >= 480 ? "200-1800 and 2200-3900, within 60°" : Math.abs(c.latitude) >= 66 ? "1800-2200, 66° to 80°" : "1800-2200, within 66°");

const out = process.argv[2] ? resolve(process.argv[2]) : join(HERE, "../results/plumbing-by-latitude.json");
const rc15 = unpackRc15();
try {
  const { scratch } = rc15;
  writeFileSync(join(scratch, "rc15/entry.mjs"),
    'export * from "./package/dist/index.js";\nexport { ayanamsa, userAyanamsa } from "./package/dist/vedic.js";\n');
  const { build } = await import(pathToFileURL(join(ROOT, "node_modules/esbuild/lib/main.js")).href);
  const full = join(scratch, "full.mjs");
  await build({
    stdin: {
      contents: 'export * from "./index.ts";\nexport { ayanamsa, userAyanamsa } from "./vedic.ts";\n',
      resolveDir: join(ROOT, "src"),
      sourcefile: "entry.ts",
      loader: "ts"
    },
    bundle: true, format: "esm", platform: "node", external: ["astronomy-engine"], outfile: full, logLevel: "error"
  });
  const rows = {};
  for (const [name, path] of Object.entries({ rc15: join(scratch, "rc15/entry.mjs"), full })) {
    const target = join(scratch, `${name}.json`);
    const child = spawnSync(process.execPath, [PLUMBING, "--run", path, target], { stdio: "inherit" });
    if (child.status !== 0) throw new Error(`${name} failed`);
    rows[name] = JSON.parse(readFileSync(target, "utf8"));
  }
  const cases = grid();
  if (rows.full.length !== cases.length || rows.rc15.length !== cases.length) throw new Error("row counts differ from the grid");
  const engine = await import(pathToFileURL(full).href);
  cases.forEach((c, index) => {
    const asc = engine.natalChart({ ...c, houseSystem: "placidus" }).angles.asc;
    if (asc !== rows.full[index].angles.asc) throw new Error(`case ${index}: the grid differs from plumbing.mjs's`);
  });

  const classes = {};
  const note = (klass, key, value, index) => {
    const entry = ((classes[klass] ??= { cases: 0, largest: {} }).largest[key] ??= { arcsec: 0, case: null });
    if (value > entry.arcsec) Object.assign(entry, { arcsec: value, case: index });
  };
  const fallbacks = {};
  cases.forEach((c, index) => {
    const klass = classOf(index, c);
    const [a, b] = [rows.full[index], rows.rc15[index]];
    (classes[klass] ??= { cases: 0, largest: {} }).cases += 1;
    a.bodies.forEach((body, j) => note(klass, "longitudes", Math.abs(wrap(body.lon - b.bodies[j].lon)) * 3600, index));
    for (const key of ["asc", "mc", "dsc", "ic"]) note(klass, "angles", Math.abs(wrap(a.angles[key] - b.angles[key])) * 3600, index);
    for (const system of SYSTEMS) {
      const used = a.houses[system].system;
      if (used !== system) {
        const f = ((fallbacks[klass] ??= {})[system] ??= {});
        f[used] = (f[used] ?? 0) + 1;
      }
      a.houses[system].cusps.forEach((cusp, j) => note(klass, `cusps, ${system} asked`, Math.abs(wrap(cusp - b.houses[system].cusps[j])) * 3600, index));
    }
    a.points.points.forEach((point, j) => {
      const kind = ["Mean Node", "Mean South Node", "Black Moon Lilith"].includes(point.point) ? "mean node and Lilith"
        : ["Vertex", "East Point"].includes(point.point) ? "Vertex and East Point" : "lots";
      note(klass, kind, Math.abs(wrap(point.lon - b.points.points[j].lon)) * 3600, index);
    });
  });
  // The source the bundle was built from, whatever was committed.
  const env = { ...process.env, GIT_INDEX_FILE: join(scratch, "index") };
  spawnSync("git", ["-C", ROOT, "read-tree", "--empty"], { env });
  spawnSync("git", ["-C", ROOT, "add", "-A", "--", "src"], { env });
  const srcTree = spawnSync("git", ["-C", ROOT, "write-tree", "--prefix=src/"], { env, encoding: "utf8" }).stdout.trim();
  const round = (x, digits = 6) => Number(x.toPrecision(digits));
  const where = (index) => (index === null ? {} : { case: index, utc: cases[index].utc, latitude: round(cases[index].latitude, 4) });
  const report = {
    tool: "docs/evidence/rc16-20260930/tools/plumbing-by-latitude.mjs",
    node: process.version,
    head: spawnSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(),
    srcTree,
    rc15Archive: { file: "artifacts/zodiacs-engine-0.1.1-rc.15.tgz", sha256: rc15.sha256 },
    workload: "docs/evidence/nutation-2026-09-29/tools/plumbing.mjs --run, its 520 synthetic charts; this checkout's src/ (full series) against rc.15 as carried",
    unit: "arcseconds; each largest change with the case it falls on (its index in the grid, UTC as given, latitude)",
    classes: Object.fromEntries(Object.entries(classes).map(([klass, { cases: n, largest }]) => [klass, {
      cases: n,
      fallbacks: fallbacks[klass] ?? {},
      largest: Object.fromEntries(Object.entries(largest).map(([key, { arcsec, case: index }]) => [key, { arcsec: round(arcsec), ...where(index) }]))
    }]))
  };
  writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
  console.error(`plumbing by latitude: written ${relative(process.cwd(), out)}`);
} finally {
  rc15.cleanup();
}
