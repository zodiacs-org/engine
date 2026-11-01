// T8 (../PREREGISTRATION.md, section 6, with the plan's correction K5): one
// copy of the time basis, the UT1 table and the nutation. "zodiacs-deltat/1",
// "064d98b4a531053a" and "-172064161," must each occur in exactly one file of
// dist/*.js, JavaScript files only, as scripts/verify-package-contents.mjs
// counts them (declaration files are not counted: in 1.1.0-rc.1's archive
// zodiacs-deltat/1 is also on lines of dist/deltat.d.ts and of a shared
// declaration file, which a correct build keeps); under the layout S the
// last occurs in two, the shared chunk and the frame file (--layout S). Each
// holder must be in dist/time.js's static graph; time.EPHEMERIS_SPAN must be
// the root's object and time.DELTA_T_IERS_MODEL the root's value; and
// TIME_SCALE_NAMES must be frozen and equal ["utc", "ut1", "tt"].
//
// Its control is a copy of the package whose dist/time.js is an esbuild
// bundle of src/time.ts without splitting (controls.sh makes it): two holders,
// and the span identity false.
//
//   node one-copy.mjs --package <dir> [--layout MF|S] [--out <file>]
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { entry, finish, manifest, options } from "./load.mjs";

const opts = options();
if (!opts.package) throw new Error("--package is required");
const layout = opts.layout ?? "MF";
if (!["MF", "S"].includes(layout)) throw new Error(`unknown layout ${layout}`);
const dist = join(opts.package, "dist");
const js = readdirSync(dist).filter((name) => name.endsWith(".js")).sort();
const text = (name) => readFileSync(join(dist, name), "utf8");

// dist/time.js's static graph, as scripts/verify-package-contents.mjs follows imports.
const graph = new Set();
const visit = (name) => {
  if (graph.has(name)) return;
  graph.add(name);
  for (const match of text(name).matchAll(/^(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gmu)) {
    const specifier = match[1] ?? match[2];
    if (specifier.startsWith("./")) visit(specifier.slice(2));
  }
};
visit("time.js");

const NEEDLES = { deltaTModel: '"zodiacs-deltat/1"', ut1Table: '"064d98b4a531053a"', nutation: "-172064161," };
const expected = { deltaTModel: 1, ut1Table: 1, nutation: layout === "S" ? 2 : 1 };
const holders = Object.fromEntries(Object.entries(NEEDLES).map(([key, needle]) => [key, js.filter((name) => text(name).includes(needle))]));
const holdersPass = Object.entries(holders).every(([key, list]) => list.length === expected[key] && list.every((name) => graph.has(name)));

const time = await entry(opts.package, "./time");
const root = await entry(opts.package, ".");
const identities = {
  ephemerisSpan: time.EPHEMERIS_SPAN === root.EPHEMERIS_SPAN,
  deltaTIersModel: time.DELTA_T_IERS_MODEL === root.DELTA_T_IERS_MODEL,
  timeScaleNamesFrozen: Object.isFrozen(time.TIME_SCALE_NAMES),
  timeScaleNames: isDeepStrictEqual(time.TIME_SCALE_NAMES, ["utc", "ut1", "tt"])
};
const pass = holdersPass && Object.values(identities).every(Boolean);
await finish({
  check: "T8",
  tool: "one-copy.mjs",
  package: { name: manifest(opts.package).name, version: manifest(opts.package).version },
  layout,
  holders,
  expectedHolders: expected,
  timeGraph: [...graph].sort(),
  identities,
  controlSignature: { twoHolders: Object.values(holders).some((list) => list.length >= 2), spanIdentityFalse: !identities.ephemerisSpan },
  node: process.version,
  pass
}, opts.out);
