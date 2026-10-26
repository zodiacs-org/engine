// Whether natalConventionIds gives the ids that zodiacs.org's registry tests
// say a natal receipt names: `natalReceiptIds` in the site's
// tests/conventions-registry.test.ts, read from a checkout of
// zodiacs-org/site, its TypeScript types stripped by Node, its ids sorted
// and each kept once. Both run on receipts this build writes for 57
// synthetic charts: each house system at four latitudes (two of them inside
// the polar circle), and an unknown time read at UTC noon, a chart with no
// place, one outside the reference span on local mean time, and charts on
// TT and on UT1. Run from the checkout after `npm run build`, on Node 22.13
// or later:
//
//   node docs/evidence/1.1.0-rc.1-20261026/tools/site-rule.mjs <site checkout> > docs/evidence/1.1.0-rc.1-20261026/results/site-rule.txt
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const site = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("usage: node site-rule.mjs <site checkout>");
const testFile = "tests/conventions-registry.test.ts";
const text = readFileSync(join(site, testFile), "utf8");
const source = /^function natalReceiptIds\([\s\S]*?^\}$/mu.exec(text)?.[0];
if (!source) throw new Error(`no natalReceiptIds in ${testFile}`);
const siteIds = new Function(`${stripTypeScriptTypes(source)}; return natalReceiptIds;`)();
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
  const { receipt } = createNatalEnvelope(natalChart(birth), context);
  const bySite = JSON.stringify([...new Set(siteIds(receipt))].sort());
  if (bySite === JSON.stringify(natalConventionIds(receipt)) && bySite === JSON.stringify(receipt.conventionIds)) same += 1;
  for (const id of receipt.conventionIds) named.add(id);
}
const commit = execFileSync("git", ["-C", site, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
console.log(`# node tools/site-rule.mjs <site checkout>; Node ${process.version}, ${process.platform}-${process.arch}, ${new Date().toISOString().slice(0, 10)}`);
console.log(`site: zodiacs-org/site at ${commit}, ${testFile} (SHA-256 ${createHash("sha256").update(text).digest("hex")})`);
console.log(`engine: this build, ${ENGINE_VERSION}`);
console.log(`${same} of ${cases.length} receipts: the site's natalReceiptIds, sorted and each once, equals natalConventionIds and the receipt's conventionIds`);
console.log(`${named.size} distinct ids named across them`);
process.exitCode = same === cases.length ? 0 : 1;
