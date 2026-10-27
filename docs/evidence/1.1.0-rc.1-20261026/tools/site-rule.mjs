// Whether natalConventionIds gives the ids that zodiacs.org's registry tests
// say a natal envelope names, and whether the registry holds them. The site's
// rule, read from a commit of zodiacs-org/site, its TypeScript types stripped
// by Node: `natalReceiptIds` (tests/conventions-registry.test.ts) for the
// receipt's fields, and `calcReceiptIds`'s reading of an instant's time
// records (the ΔT model and segment, the scale, the basis and the source of
// UT1 − UTC) for the result's, which the registry lists as natal results'.
// The site's ids are sorted and each kept once. Both run on envelopes this
// build writes for 57 synthetic charts: each house system at four latitudes
// (two of them inside the polar circle), and an unknown time read at UTC
// noon, a chart with no place, one outside the reference span on local mean
// time, and charts on TT and on UT1. Each id is then looked up in the
// registry (src/data/conventions/registry.json) at the same commit. Run from
// the checkout after `npm run build`, on Node 22.13 or later:
//
//   node docs/evidence/1.1.0-rc.1-20261026/tools/site-rule.mjs <site checkout> <site commit> > docs/evidence/1.1.0-rc.1-20261026/results/site-rule.txt
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const [siteArgument, commitArgument] = process.argv.slice(2);
if (!siteArgument || !commitArgument) throw new Error("usage: node site-rule.mjs <site checkout> <site commit>");
const site = resolve(siteArgument);
const commit = execFileSync("git", ["-C", site, "rev-parse", `${commitArgument}^{commit}`], { encoding: "utf8" }).trim();
const show = (path) => execFileSync("git", ["-C", site, "show", `${commit}:${path}`], { encoding: "utf8", maxBuffer: 1 << 28 });
const testFile = "tests/conventions-registry.test.ts";
const text = show(testFile);
const extract = (name) => {
  const source = new RegExp(`^function ${name}\\([\\s\\S]*?^\\}$`, "mu").exec(text)?.[0];
  if (!source) throw new Error(`no ${name} in ${testFile}`);
  return stripTypeScriptTypes(source);
};
const { natalReceiptIds, calcReceiptIds } = new Function(
  `${extract("natalReceiptIds")}\n${extract("calcReceiptIds")}\nreturn { natalReceiptIds, calcReceiptIds };`
)();
/** The site's ids of an envelope: its receipt's, and its result's time records read as a calc instant's. */
const siteIds = ({ receipt, result }) =>
  [...new Set([
    ...natalReceiptIds(receipt),
    ...calcReceiptIds({ conventions: [], instants: [{ deltaT: result.deltaT, timeScale: result.timeScale }], engine: receipt.engine })
  ])].sort();
const registryText = show("src/data/conventions/registry.json");
const registry = JSON.parse(registryText);
const held = new Set(registry.namespaces.flatMap((space) => space.entries.map((entry) => entry.id)));

const load = (name) => import(pathToFileURL(join(ROOT, "dist", name)).href);
const { ENGINE_VERSION, natalChart } = await load("index.js");
const { createNatalEnvelope } = await load("receipt.js");
const { natalConventionIds } = await load("conventions.js");

const cases = [];
for (const houseSystem of ["whole", "placidus", "porphyry", "equal", "equal-mc", "vehlow", "koch", "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian"])
  for (const latitude of [0, 51.5, 70, -75]) cases.push([{ utc: "1990-06-15T12:30:00Z", latitude, longitude: -0.1, houseSystem }, {}]);
cases.push([{ utc: "2000-01-01T12:00:00Z", timeKnown: false }, { reference: "utc-noon" }]);
cases.push([{ utc: "2000-01-01T12:00:00Z" }, {}]);
cases.push([{ utc: "1700-01-01T12:00:00Z", latitude: 10, longitude: 10, flags: ["lmt"] }, {}]);
cases.push([{ utc: "2001-12-21T09:01:04.184Z", timeScale: "tt", latitude: 10, longitude: 10 }, {}]);
cases.push([{ utc: "2001-12-21T09:00:00Z", timeScale: "ut1", latitude: 10, longitude: 10, flags: ["dst-fold"] }, {}]);
let same = 0;
const named = new Set();
for (const [birth, context] of cases) {
  const envelope = createNatalEnvelope(natalChart(birth), context);
  const bySite = JSON.stringify(siteIds(envelope));
  if (bySite === JSON.stringify(natalConventionIds(envelope)) && bySite === JSON.stringify(envelope.receipt.conventionIds)) same += 1;
  for (const id of envelope.receipt.conventionIds) named.add(id);
}
const missing = [...named].filter((id) => !held.has(id)).sort();
console.log(`# node tools/site-rule.mjs <site checkout> <site commit>; Node ${process.version}, ${process.platform}-${process.arch}, ${new Date().toISOString().slice(0, 10)}`);
console.log(`site: zodiacs-org/site at ${commit}; ${testFile} (SHA-256 ${createHash("sha256").update(text).digest("hex")}); src/data/conventions/registry.json version ${registry.version} (SHA-256 ${createHash("sha256").update(registryText).digest("hex")}), ${held.size} ids`);
console.log(`engine: this build, ${ENGINE_VERSION}`);
console.log(`${same} of ${cases.length} envelopes: the site's rule, sorted and each once, equals natalConventionIds and the receipt's conventionIds`);
console.log(`${named.size} distinct ids named across them; the registry holds ${named.size - missing.length}; not held: ${missing.join(", ") || "none"}`);
process.exitCode = same === cases.length ? 0 : 1;
