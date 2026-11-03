// The two controls of check L7 (../PREREGISTRATION.md, section 3), each of
// which must fail L7's tests, src/sect.test.ts: a sectReading with the
// altitude test written `> 0`, and one with orientality's test written `>= 0`.
// Added after review 1 (the amendment "2026-11-03, review 1: L7's controls get
// a tool" of ../PREREGISTRATION.md, section 11), as the varga sensitivity's
// tools/test-controls.mjs does its controls: first src/sect.test.ts on this
// checkout as it stands, which must pass; then, for each control, one exact
// replacement in src/sect.ts (it must match once), src/sect.test.ts run with
// vitest's JSON reporter, the failing tests and their messages recorded, and
// src/sect.ts restored and checked against its SHA-256 before the next run.
//
//   node sect-controls.mjs [--out report.json]
//
// Run it from a checkout whose node_modules holds vitest (engine-rc2, or a
// sparse clone made as the preregistration's section 0 says), alone: it
// changes a tracked file while it runs, and puts it back. vitest's report
// goes to a scratch directory under the system's temporary directory, which
// must lie outside the checkout. It exits 1 unless the tests pass as they
// stand and each control fails at least one of them.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKOUT, finish, options } from "./load.mjs";

const args = options();
const checkout = fileURLToPath(CHECKOUT);
const SOURCE = "src/sect.ts";
const TEST = "src/sect.test.ts";
const CONTROLS = [
  {
    name: "L7 control: the altitude test written > 0",
    replace: ["const day = sunAltitude === null ? sectOf(degrees(read.ascendant, \"ascendant\"), sunLon) === \"day\" : sunAltitude >= 0;",
      "const day = sunAltitude === null ? sectOf(degrees(read.ascendant, \"ascendant\"), sunLon) === \"day\" : sunAltitude > 0;"],
    expected: ["sect gives the Sun on the horizon itself to the day",
      "sectReading at its boundaries gives an altitude of 0 and of -0 to the day, and hands each back unchanged"]
  },
  {
    name: "L7 control: orientality's test written >= 0",
    replace: ["return (raw > 180 ? raw - 360 : raw) > 0 ? \"oriental\" : \"occidental\";",
      "return (raw > 180 ? raw - 360 : raw) >= 0 ? \"oriental\" : \"occidental\";"],
    expected: ["orientality counts a body exactly on the Sun as occidental",
      "sectReading at its boundaries calls Mercury on the Sun occidental and Mercury opposite it oriental"]
  }
];

const scratch = mkdtempSync(join(tmpdir(), "lite-sect-controls-"));
if (!relative(checkout, scratch).startsWith("..")) throw new Error(`${scratch} lies inside the checkout; set TMPDIR outside it.`);
const sha = (text) => createHash("sha256").update(text).digest("hex");

/** src/sect.test.ts run once: every test's full name, and the failing ones with their messages. */
function run() {
  const json = join(scratch, "vitest.json");
  rmSync(json, { force: true });
  try {
    execFileSync("npx", ["vitest", "run", TEST, "--reporter=json", `--outputFile=${json}`], { cwd: checkout, stdio: "ignore" });
  } catch {
    // vitest exits 1 when a test fails
  }
  const tests = JSON.parse(readFileSync(json, "utf8")).testResults.flatMap((each) => each.assertionResults);
  const failing = tests.filter((test) => test.status !== "passed");
  return {
    tests: tests.length,
    failed: failing.map((test) => test.fullName),
    messages: failing.map((test) => ({ name: test.fullName, message: String(test.failureMessages[0] ?? "").split("\n")[0] }))
  };
}

const file = join(checkout, SOURCE);
const original = readFileSync(file, "utf8");
const report = { check: "L7, controls", tool: "docs/evidence/1.1.0-rc.2-20261102/lite/tools/sect-controls.mjs", node: process.version,
  platform: `${process.platform} ${process.arch}`, source: { file: SOURCE, sha256: sha(original) }, test: TEST, controls: [] };
try {
  report.asItStands = run();
  for (const control of CONTROLS) {
    const [from, to] = control.replace;
    const count = original.split(from).length - 1;
    if (count !== 1) throw new Error(`${control.name}: the replacement matches ${count} times in ${SOURCE}`);
    writeFileSync(file, original.replace(from, () => to));
    let outcome;
    try {
      outcome = run();
    } finally {
      writeFileSync(file, original);
    }
    if (sha(readFileSync(file, "utf8")) !== sha(original)) throw new Error(`${SOURCE} was not restored`);
    report.controls.push({
      name: control.name,
      replaced: from,
      with: to,
      ...outcome,
      failedAsItMust: outcome.failed.length > 0,
      // The tests src/sect.test.ts's header names for this control, reported, not judged.
      namedInTheTestFile: control.expected.map((name) => ({ name, failed: outcome.failed.includes(name) }))
    });
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
report.restored = sha(readFileSync(file, "utf8")) === sha(original);
report.pass = report.restored && report.asItStands.failed.length === 0 && report.controls.length === CONTROLS.length &&
  report.controls.every((control) => control.failedAsItMust);
finish(report, args.out);
