/*
 * The controls of G-V1, G-V2 (a) and the named tests (PREREGISTRATION.md,
 * section 8), each of which must fail: one exact replacement in one file of
 * the working tree (it must match once), the test file run with vitest's JSON
 * reporter, the failing tests and their messages recorded, and the file
 * restored and checked against its SHA-256 before the next control.
 *
 *   node test-controls.mjs [--out FILE] [--only NAME,...]
 *
 * Run it from the repository root of a checkout whose node_modules holds
 * vitest (engine-rc2, or a sparse clone made as the preregistration's scope
 * limitation says), alone: it changes tracked files while it runs, and puts
 * each back. Writes FILE (default ../results/test-controls.json), and exits 1
 * unless every control failed as it must (since review 1, so that checks.sh
 * records it as the step's exit).
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { FOLDER, ROOT, options } from "./load.mjs";

const args = options(process.argv.slice(2), ["--out", "--only"]);
const out = resolve(String(args.get("--out") ?? resolve(FOLDER, "results/test-controls.json")));
const only = args.has("--only") ? String(args.get("--only")).split(",") : null;
const SEARCH = "src/vedic/varga-time.ts";
const TEST = "src/vedic/varga-time.test.ts";
const CONTROLS = [
  {
    name: "G-V1 naive floor", file: "src/vedic/grid.ts", test: "src/vedic/boundaries.test.ts",
    replace: [["return f === p && productError(lon, TICKS_PER_DEGREE, p) < 0 ? f - 1 : f;", "return Math.floor(lon * 7560);"]],
    mustFail: "at least one of the 18 varga tests", judge: (failed) => failed.some((name) => /places D\d+(cyclic)? exactly/.test(name))
  },
  {
    name: "G-V2 (a) control (i): every part boundary a change", file: "src/vedic/varga.ts", test: TEST,
    replace: [["if (signAt(t - 1) !== signAt(t)) changes.push(t);", "changes.push(t);"]],
    mustFail: "G-V2 (a) with exactly 24 mismatches", judge: (_, messages) => mismatches(messages) === 24
  },
  {
    name: "G-V2 (a) control (ii): one change row of F1 a keep", file: "src/vedic/fixtures/varga-changes.json", test: TEST,
    replace: [["[1002960,10,11,1]", "[1002960,10,11,0]"]],
    mustFail: "G-V2 (a) with exactly one mismatch", judge: (_, messages) => mismatches(messages) === 1
  },
  {
    name: "the mean ayanamsa subtracted", file: SEARCH, test: TEST,
    replace: [["ayanamsaAt(sky.definition, time).true", "ayanamsaAt(sky.definition, time).mean"]],
    mustFail: "the evaluation paths' test", judge: (failed) => failed.some((name) => name.includes("bit for bit"))
  },
  {
    name: "one copied rate bound changed", file: SEARCH, test: TEST,
    replace: [["Moon: 31,", "Moon: 30,"]],
    mustFail: "the copied bounds' test", judge: (failed) => failed.some((name) => name.includes("WINDOW_RATE_BOUNDS"))
  },
  {
    name: "no 1 ms terminal step", file: SEARCH, test: TEST,
    replace: [["n = Math.max(1, Math.floor(d / high));", "n = Math.max(2, Math.floor(d / high));"]],
    mustFail: "the one-millisecond touch", judge: (failed) => failed.some((name) => name.includes("touching a boundary for one millisecond"))
  },
  {
    name: "brackets allowed across seams", file: SEARCH, test: TEST,
    replace: [["): [previous: Found[], next: Found[]] | \"rate-bound\" | \"evaluation-budget\" {\n", "): [previous: Found[], next: Found[]] | \"rate-bound\" | \"evaluation-budget\" {\n  walks = [];\n"]],
    mustFail: "the backward step", judge: (failed) => failed.some((name) => name.includes("a seam stepping back after a crossing"))
  },
  {
    name: "a build that computes instead of refusing", file: SEARCH, test: TEST,
    replace: [
      ["let reason: VargaRefusalReason | null = !known ? \"out-of-range\" : spent ? \"evaluation-budget\"\n      : point !== \"Ascendant\" ? null : chart.angles === null ? \"no-angles\" : Math.abs(latitude!) > 66 ? \"polar\" : null;", "let reason: VargaRefusalReason | null = spent ? \"evaluation-budget\" : null;"],
      ["if (!Array.isArray(value) || value.some((item, k) => !all.includes(item as T) || value.indexOf(item) !== k)) {", "if (false) {"],
      ["return all.filter((item) => value.includes(item));", "return Array.isArray(value) ? all.filter((item) => value.includes(item)) : undefined;"],
      ["if (typeof cyclic !== \"boolean\") throw", "if (false) throw"],
      ["if (typeof minutes !== \"number\" || !Number.isInteger(minutes) || minutes < 1 || minutes > 2880) {", "if (false) {"],
      ["const read = readOptions(options, [\"points\", \"vargas\", \"cyclic\", \"horizonMinutes\"], \"vargaSensitivity options\");", "const read = (typeof options === \"object\" && options !== null ? options : {}) as Record<string, unknown>;"]
    ],
    mustFail: "each refusal test", judge: (failed) => {
      const refusals = ["no-angles without a known time", "no-angles without a place", "polar beyond", "out-of-range when", "throws RangeError for"];
      return refusals.every((name) => failed.some((test) => test.includes(name)));
    }
  },
  {
    name: "an instant 1 ms later", file: SEARCH, test: TEST,
    replace: [["at: new Date(found[0]).toISOString(),", "at: new Date(found[0] + 1).toISOString(),"]],
    mustFail: "the docs' synthetic birth", judge: (failed) => failed.some((name) => name.includes("pins the engine's own instants"))
  },
  // Added after review 2 (PREREGISTRATION.md, section 13, 2026-11-04): the direction of a change taken
  // through turn(d + 180) − 180, as before review 2, must fail the contract case of a last step of one unit
  // in the last place and review 2's two cases through the public API.
  {
    name: "a change's direction through turn(d + 180) - 180 (4f4c1e8's)", file: SEARCH, test: TEST,
    replace: [["const signed = (value: number): number => (value > 180 ? value - 360 : value <= -180 ? value + 360 : value);", "const signed = (value: number): number => turn(value + 180) - 180;"]],
    mustFail: "the last step of one unit in the last place, analytic and through the public API",
    judge: (failed) => failed.some((name) => name.includes("last step onto a boundary is one unit in the last place")) &&
      ["D2", "D60"].every((varga) => failed.some((name) => name.includes(`the ${varga} change gives the boundary it reaches`)))
  }
];

/**
 * The G-V2 (a) mismatches the per-key tests report: each failure message reads
 * "expected [ ... ] to deeply equal []", the list showing some items and
 * "…(N)" for the rest.
 */
const mismatches = (messages) => messages
  .filter(({ name }) => name.endsWith("the change boundaries are the fixture's change rows"))
  .reduce((sum, { message }) => {
    const list = /expected \[(.*?)\] to deeply equal \[\]/su.exec(message)?.[1] ?? "";
    return sum + (list.match(/'[^']*'/gu) ?? []).length + Number(/…\((\d+)\)/u.exec(list)?.[1] ?? 0);
  }, 0);

const sha = (text) => createHash("sha256").update(text).digest("hex");
const report = { tool: "docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/test-controls.mjs", node: process.version, platform: `${process.platform} ${process.arch}`, controls: [] };
const work = resolve(dirname(out), "test-controls-work");
mkdirSync(work, { recursive: true });
for (const control of CONTROLS.filter((each) => !only || only.some((name) => each.name.startsWith(name)))) {
  const file = resolve(ROOT, control.file);
  const original = readFileSync(file, "utf8");
  let changed = original;
  for (const [from, to] of control.replace) {
    const count = changed.split(from).length - 1;
    if (count !== 1) throw new Error(`${control.name}: "${from}" matches ${count} times in ${control.file}`);
    changed = changed.replace(from, () => to);
  }
  const json = resolve(work, "vitest.json");
  writeFileSync(file, changed);
  try {
    execFileSync("npx", ["vitest", "run", control.test, "--reporter=json", `--outputFile=${json}`], { cwd: ROOT, stdio: "ignore" });
  } catch {
    // vitest exits 1 when a test fails
  } finally {
    writeFileSync(file, original);
  }
  if (sha(readFileSync(file, "utf8")) !== sha(original)) throw new Error(`${control.file} was not restored`);
  const result = JSON.parse(readFileSync(json, "utf8"));
  const tests = result.testResults.flatMap((each) => each.assertionResults);
  const failed = tests.filter((test) => test.status !== "passed").map((test) => test.fullName);
  const messages = tests.filter((test) => test.status !== "passed").flatMap((test) => test.failureMessages.map((message) => ({ name: test.fullName, message })));
  const ok = failed.length > 0 && control.judge(failed, messages);
  report.controls.push({ name: control.name, file: control.file, test: control.test, mustFail: control.mustFail, failedTests: failed.length, of: tests.length, failedAsItMust: ok, failed });
  console.log(`${control.name}: ${failed.length} of ${tests.length} failed; ${ok ? "failed as it must" : "DID NOT FAIL AS IT MUST"} (${control.mustFail})`);
}
rmSync(work, { recursive: true, force: true });
report.allFailedAsTheyMust = report.controls.every((control) => control.failedAsItMust);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 1) + "\n");
process.exitCode = report.allFailedAsTheyMust ? 0 : 1;
