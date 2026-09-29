/**
 * Same-family compatibility check, not independent astrometric validation.
 * Usage: node verify-site-adoption.mjs SITE_REPO CANDIDATE_ARCHIVE OUTPUT_JSON [CANDIDATE_VERSION]
 * CANDIDATE_VERSION defaults to 0.1.1-rc.12, the candidate this was written for.
 * Reads frozen git objects, never the site's mutable worktree or dependencies.
 * Mismatches are counted and reported; any mismatch fails the check. The
 * temporary installs are removed however the check ends.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const [siteArgument, candidateArgument, outputArgument, candidateVersion = "0.1.1-rc.12"] = process.argv.slice(2);
assert(siteArgument && candidateArgument && outputArgument,
  "Usage: node verify-site-adoption.mjs SITE_REPO CANDIDATE_ARCHIVE OUTPUT_JSON [CANDIDATE_VERSION]");
const site = resolve(siteArgument);
const candidate = resolve(candidateArgument);
const output = resolve(outputArgument);
const here = dirname(fileURLToPath(import.meta.url));
const mergedCommit = "f2bd0dd45947ff392d0de1135695f584a71bfa08";
const expectedTree = "bb92c6ef5a6794526614c10b0332dc56b41a4c90";
const equivalentLocalCommit = "ba78d143f2397f26661bb72008d57c00ed346316";
const git = (...args) => execFileSync("git", args, { cwd: site, stdio: ["ignore", "pipe", "pipe"] });
let readCommit = mergedCommit;
try { git("cat-file", "-e", `${readCommit}^{commit}`); }
catch { readCommit = equivalentLocalCommit; }
assert.equal(git("rev-parse", `${readCommit}^{tree}`).toString().trim(), expectedTree,
  "Frozen site source tree differs from the merged adoption tree");
const frozen = (path) => git("show", `${readCommit}:${path}`);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourcePaths = ["src/lib/engine/progressions.ts", "src/lib/engine/full.ts", "src/lib/engine/chart-adapter.ts"];
const sources = Object.fromEntries(sourcePaths.map((path) => [path, frozen(path)]));
const scratch = mkdtempSync(join(tmpdir(), "zodiacs-site-progression-parity-"));
try {
const oldArchive = join(scratch, "zodiacs-engine-0.1.1-rc.10.tgz");
const oldBytes = frozen("vendor/zodiacs-engine-0.1.1-rc.10.tgz");
assert.equal(sha256(oldBytes), "a377cdc8c12e25ff7de4fe95ddf77a4cdee8d2da97071b0f8454e340b374565c");
writeFileSync(oldArchive, oldBytes);
const patch = join(here, "site-adapter.patch");

function prepare(name, archive, applyAdapter) {
  const directory = join(scratch, name);
  mkdirSync(directory);
  writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", archive],
    { cwd: directory, stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 });
  for (const [path, bytes] of Object.entries(sources)) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), bytes);
  }
  if (applyAdapter) execFileSync("git", ["apply", patch], { cwd: directory, stdio: ["ignore", "pipe", "pipe"] });
  for (const path of sourcePaths) {
    const compiled = ts.transpileModule(readFileSync(join(directory, path), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
    }).outputText.replace(/from (["'])(\.\/[^"']+)\1/g, (_match, quote, specifier) =>
      `from ${quote}${specifier}.mjs${quote}`);
    writeFileSync(join(directory, path.replace(/\.ts$/, ".mjs")), compiled);
  }
  const manifest = JSON.parse(readFileSync(join(directory, "node_modules/@zodiacs/engine/package.json"), "utf8"));
  assert.equal(manifest.version, applyAdapter ? candidateVersion : "0.1.1-rc.10");
  return { directory, manifest, module: join(directory, "src/lib/engine/progressions.mjs") };
}

const old = prepare("old", oldArchive, false);
const next = prepare("next", candidate, true);
const before = await import(pathToFileURL(old.module).href);
const after = await import(pathToFileURL(next.module).href);
assert.equal(before.PROGRESSION_DAYS_PER_YEAR, after.PROGRESSION_DAYS_PER_YEAR);

// Nine birth epochs times eight target epochs cover historical dates, equal
// instants, pre-birth targets, leap days and negative Unix timestamps.
const birthStrings = ["1800-01-02T12:00:00Z", "1889-12-20T11:45:00Z", "1907-07-06T15:06:36Z",
  "1969-12-31T23:59:59.999Z", "1970-01-01T00:00:00Z", "1989-12-20T11:45:00Z",
  "2000-02-29T12:34:56.789Z", "2019-12-31T00:00:00Z", "2199-12-31T12:00:00Z"];
const targetStrings = ["1800-01-02T12:00:00Z", "1907-07-06T15:06:36Z", "1969-12-31T23:59:59.999Z",
  "1970-01-01T00:00:00Z", "2000-02-29T12:34:56.789Z", "2020-12-30T05:48:46.080Z",
  "2026-09-28T12:00:00Z", "2199-12-31T12:00:00Z"];
const bodyCases = birthStrings.flatMap((birth) => targetStrings.map((target) => [Date.parse(birth), Date.parse(target)]));
for (const birth of birthStrings) bodyCases.push([Date.parse(birth), Date.parse(birth)]);
bodyCases.push([0, 365], [0, -365], [0, 366], [0, -366]);

function sample(api, birthMs, targetMs, withBodies) {
  const birth = new Date(birthMs), target = new Date(targetMs);
  const instant = api.progressedInstant(birth, target);
  const record = { instant: instant.getTime() };
  assert(Number.isFinite(record.instant));
  if (withBodies) {
    record.bodies = api.progressedBodies(birth, target);
    assert.equal(record.bodies.length, 12);
    for (const row of record.bodies) {
      assert.deepEqual(Object.keys(row).sort(), ["body", "lat", "lon", "retrograde", "speed"]);
      assert(Number.isFinite(row.lon) && Number.isFinite(row.lat) && Number.isFinite(row.speed));
    }
  }
  assert.equal(birth.getTime(), birthMs);
  assert.equal(target.getTime(), targetMs);
  return record;
}

// Use the same ordered calls in both separately installed package graphs.
// Count every difference instead of stopping at the first.
const differs = (a, b) => { try { assert.deepEqual(a, b); return false; } catch { return true; } };
const oldResults = bodyCases.map(([birth, target]) => sample(before, birth, target, true));
const newResults = bodyCases.map(([birth, target]) => sample(after, birth, target, true));
const mismatchedCases = [];
let instantMismatches = 0;
let bodyMismatches = 0;
for (let i = 0; i < bodyCases.length; i++) {
  const instantDiffers = newResults[i].instant !== oldResults[i].instant;
  const rowsDiffering = newResults[i].bodies.filter((row, index) => differs(row, oldResults[i].bodies[index])).length;
  if (instantDiffers) instantMismatches += 1;
  bodyMismatches += rowsDiffering;
  if (instantDiffers || rowsDiffering > 0) mismatchedCases.push({ case: i, birth: bodyCases[i][0], target: bodyCases[i][1] });
}

// Date-boundary cases are arithmetic checks only; no ephemeris is evaluated.
const dates = [-8_640_000_000_000_000, Date.parse("-000001-12-31"), Date.parse("0000-02-29"),
  Date.parse("0099-01-01"), -1, 0, 1, 8_640_000_000_000_000];
const mappingCases = dates.flatMap((birth) => dates.map((target) => [birth, target]));
mappingCases.push([886044525541365, -263987313490360]);
let seed = 0x20260928;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
for (let i = 0; i < 256; i++) mappingCases.push([
  Math.trunc((random() * 2 - 1) * 8_640_000_000_000_000),
  Math.trunc((random() * 2 - 1) * 8_640_000_000_000_000)
]);
let mappingMismatches = 0;
for (let i = 0; i < mappingCases.length; i++) {
  const [birth, target] = mappingCases[i];
  if (differs(sample(after, birth, target, false), sample(before, birth, target, false))) {
    mappingMismatches += 1;
    mismatchedCases.push({ mappingCase: i, birth, target });
  }
}
const passed = instantMismatches === 0 && bodyMismatches === 0 && mappingMismatches === 0;

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  runtime: process.version,
  status: passed ? "passed" : "failed",
  scope: "Exact existing-site Date-input behavior and body-shape compatibility; not independent astrometric certification",
  site: { mergedCommit, expectedTree, readCommit, sourceSha256: Object.fromEntries(
    Object.entries(sources).map(([path, bytes]) => [path, sha256(bytes)])) },
  packages: { old: { version: old.manifest.version, sha256: sha256(oldBytes) },
    candidate: { version: next.manifest.version, sha256: sha256(readFileSync(candidate)) } },
  adapterPatchSha256: sha256(readFileSync(patch)),
  proposedAdapterSourceSha256: sha256(readFileSync(join(next.directory, "src/lib/engine/progressions.ts"))),
  results: { bodyCases: bodyCases.length, rowsPerCase: 12, comparedBodyRows: bodyCases.length * 12,
    exactBodyRows: bodyCases.length * 12 - bodyMismatches, additionalMappingCases: mappingCases.length,
    instantMismatches, bodyMismatches, mappingMismatches, mismatchedCases: mismatchedCases.slice(0, 20) },
  method: "Actual frozen site modules transpiled with TypeScript; proposed patch applied only in a temporary copy; separate physical npm installations and identical ordered API calls",
  limitations: ["Both versions use astronomy-engine 2.1.19; parity is not a new precision bound.",
    "Only valid ordinary Date arguments are compared; from rc.12 the candidate deliberately rejects malformed inputs and adds DateInput forms.",
    `This does not install ${candidateVersion} in the site or validate its full production build, bundle budget, MCP artifacts or published metadata.`]
};
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
