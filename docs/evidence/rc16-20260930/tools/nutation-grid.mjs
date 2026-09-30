/*
 * The engine's nutation, equation of the equinoxes and sidereal time every
 * 0.1 day of TT from 1800-01-01T00:00 to 2200-01-01T00:00 TT, 1,460,971
 * instants, against ERFA (nutation-grid.py, with pyerfa). The review of
 * rc.16's first build found that two of the CHANGELOG's figures, the equation
 * of the equinoxes against ERFA's ee00 and IAU 2000B against IAU 2006/2000A,
 * were the largest differences at the 101 instants of
 * src/fixtures/nutation-erfa.json and larger on a dense grid; this measures
 * them, and the rest of the model's comparisons, on that grid.
 *
 *   node docs/evidence/rc16-20260930/tools/nutation-grid.mjs <python> [results/nutation-grid.json]
 *
 * <python> is a Python with pyerfa and numpy. src/nutation.ts's tilt and
 * src/ephemeris.ts's gastHours are bundled from this checkout's source with
 * esbuild into a directory under TMPDIR, and each instant goes to
 * nutation-grid.py's standard input as eight little-endian doubles: TT and
 * UT1 in days from J2000.0, Δψ and Δε (arcseconds), the mean and true
 * obliquity (degrees), the equation of the equinoxes (arcseconds) and the
 * apparent sidereal time (hours). UT1 is TT less a pinned synthetic ΔT,
 * −20 + 32 u² s with u = (year − 1820) / 100, as the nutation evidence's
 * tools/erfa-dump.mjs pins it, so that both sides read the same UT1. The
 * report adds the git tree of src/ as the working tree holds it.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const [python, outArg] = process.argv.slice(2);
if (!python) throw new Error("usage: node nutation-grid.mjs <python> [out.json]");
const out = outArg ? resolve(outArg) : join(HERE, "../results/nutation-grid.json");

const FIRST = -730_485; // tenths of a day: 1800-01-01T00:00 TT is J2000.0 − 73,048.5 days
const LAST = 730_485; // 2200-01-01T00:00 TT
const RECORD = 8 * 8;

const scratch = mkdtempSync(join(tmpdir(), "rc16-nutation-grid-"));
if (!relative(ROOT, scratch).startsWith("..")) throw new Error("TMPDIR must be outside the checkout");
try {
  const { build } = await import(pathToFileURL(join(ROOT, "node_modules/esbuild/lib/main.js")).href);
  const outfile = join(scratch, "module.mjs");
  await build({
    stdin: {
      contents: 'export { tilt } from "./nutation.ts";\nexport { gastHours } from "./ephemeris.ts";\n',
      resolveDir: join(ROOT, "src"),
      loader: "ts"
    },
    bundle: true, format: "esm", platform: "node", outfile, logLevel: "error", nodePaths: [join(ROOT, "node_modules")]
  });
  const { tilt, gastHours } = await import(pathToFileURL(outfile).href);

  const child = spawn(python, [join(HERE, "nutation-grid.py")], { stdio: ["pipe", "pipe", "inherit"] });
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  const exited = new Promise((done) => child.on("close", done));
  const write = (buffer) => new Promise((done) => (child.stdin.write(buffer) ? done() : child.stdin.once("drain", done)));

  const PER = 4096;
  let buffer = Buffer.alloc(PER * RECORD);
  let offset = 0;
  const J2000 = Date.UTC(2000, 0, 1, 12);
  for (let k = FIRST; k <= LAST; k += 1) {
    const tt = k / 10;
    const year = 1970 + (J2000 - Date.UTC(1970, 0, 1) + tt * 86_400_000) / (365.25 * 86_400_000);
    const ut = tt - (-20 + 32 * ((year - 1820) / 100) ** 2) / 86_400;
    const t = tilt(tt);
    for (const value of [tt, ut, t.dpsi, t.deps, t.mobl, t.tobl, t.ee, gastHours({ tt, ut })]) {
      buffer.writeDoubleLE(value, offset);
      offset += 8;
    }
    if (offset === buffer.length) {
      await write(buffer);
      buffer = Buffer.alloc(PER * RECORD);
      offset = 0;
    }
  }
  if (offset > 0) await write(buffer.subarray(0, offset));
  child.stdin.end();
  const status = await exited;
  if (status !== 0) throw new Error(`nutation-grid.py exited ${status}`);
  const measured = JSON.parse(Buffer.concat(chunks).toString("utf8"));

  const git = (...args) => spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8" }).stdout.trim();
  const index = join(scratch, "index");
  const env = { ...process.env, GIT_INDEX_FILE: index };
  spawnSync("git", ["-C", ROOT, "read-tree", "--empty"], { env });
  spawnSync("git", ["-C", ROOT, "add", "-A", "--", "src"], { env });
  const srcTree = spawnSync("git", ["-C", ROOT, "write-tree", "--prefix=src/"], { env, encoding: "utf8" }).stdout.trim();
  const report = {
    tool: "docs/evidence/rc16-20260930/tools/nutation-grid.mjs and nutation-grid.py",
    node: process.version,
    head: git("rev-parse", "HEAD"),
    srcTree,
    grid: "every 0.1 day of TT from 1800-01-01T00:00 TT to 2200-01-01T00:00 TT (days from J2000.0: -73048.5 to 73048.5); UT1 = TT - (-20 + 32 u^2) s, u = (year - 1820) / 100",
    ...measured
  };
  writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
  console.error(`nutation grid: ${measured.samples} instants; written ${relative(process.cwd(), out)}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
