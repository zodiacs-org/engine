/*
 * The controls of G-V3 and G-V2 (PREREGISTRATION.md, section 8), each of which
 * must fail:
 *
 * - C3a, the checker: a copy of the results with one `next.at` moved 1 ms
 *   later (its `minutes` with it) must give an M2 failure; with one `next` set
 *   to null where a change exists, an M5 failure.
 * - G-V2 (iii): a copy with one D2 boundary replaced by the sign start next to
 *   it, a keep, must fail (b) once.
 * - C3b, the bodies' bounds: a build with every body's bound divided by 10
 *   must not pass on births 1 to 50 of F2 (it refuses with rate-bound, or
 *   misses).
 * - C3c, no bisection: a build that reports the Ascendant's changes at the end
 *   of 60 s brackets must fail M2 on births 1 to 50 of F2. The build finds each
 *   change as the package does and reports it, with its signs, at the end of
 *   the 60 s bracket from the birth that holds it: the next change at the
 *   bracket's last millisecond, the previous one a millisecond after the
 *   bracket's first.
 * - C3d, seams ignored: a build whose seam finder returns none must fail M6 on
 *   at least one F3b case (seams-f3b.json). It ran on F3 as first written;
 *   review 1 found that F3's backward-step plants cannot make it fail, and the
 *   amendment of 2026-11-03 (PREREGISTRATION.md, section 13) added F3b, whose
 *   search span ends inside the window the step undoes, and names it here.
 *
 *   node controls.mjs --work DIR [--results FILE] [--births FILE] [--f3b FILE]
 *                     [--only NAME,...] [--workers N] [--step-scale N] [--dry-run]
 *
 * The copies of the results are taken from --results (default
 * ../results/results.jsonl), the first line of F2 with a change of the kind
 * each needs. A control build is a copy of the package's dist/ (load.mjs) in
 * DIR, with one exact replacement in its vedic.js that must match once, and a
 * link to the astronomy-engine the package resolves (nothing is installed);
 * run.mjs and checker.mjs run on it as separate processes, and the copy is
 * removed afterwards. DIR must lie outside the repository. --dry-run makes and checks
 * the builds' replacements and runs nothing. Writes DIR/controls.json, and
 * exits 1 unless every control failed as it must (since review 1, so that
 * checks.sh records it as the step's exit; the checker's own exit 1 on a
 * failing copy is what a control expects, and is read from its report).
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";

import { FOLDER, HERE, ROOT, options } from "./load.mjs";

const args = options(process.argv.slice(2), ["--work", "--results", "--births", "--f3b", "--only", "--workers", "--step-scale", "--dry-run"]);
if (!args.has("--work")) throw new Error("--work DIR is required: a directory outside the repository.");
const work = resolve(args.get("--work"));
if (!relative(ROOT, work).startsWith("..")) throw new Error(`${work} lies inside the repository.`);
const resultsFile = resolve(args.get("--results") ?? resolve(FOLDER, "results/results.jsonl"));
const births = resolve(args.get("--births") ?? resolve(FOLDER, "births.json"));
const f3b = resolve(args.get("--f3b") ?? resolve(FOLDER, "seams-f3b.json"));
const only = args.has("--only") ? String(args.get("--only")).split(",") : null;
const workers = String(args.get("--workers") ?? 1);
const stepScale = String(args.get("--step-scale") ?? 1);
const dryRun = args.has("--dry-run");
const dist = resolve(process.env.ZODIACS_ENGINE_DIST ?? resolve(ROOT, "dist"));
mkdirSync(work, { recursive: true });

/** Runs a tool; `failing` lets it exit 1, as the checker does on results that fail a check. */
const node = (script, list, env = {}, failing = false) => {
  try {
    return execFileSync(process.execPath, [resolve(HERE, script), ...list], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "inherit"] }).toString();
  } catch (error) {
    if (failing && error.status === 1) return String(error.stdout ?? "");
    throw error;
  }
};
const check = (results, extra = []) => {
  const out = resolve(work, `check-${Math.random().toString(36).slice(2)}.json`);
  node("checker.mjs", ["--results", results, "--out", out, "--workers", workers, "--step-scale", stepScale, ...extra], {}, true);
  const report = JSON.parse(readFileSync(out, "utf8"));
  return { verdict: report.verdict, failuresByCheck: report.failuresByCheck, failures: report.failures.slice(0, 20) };
};

/** A copy of the results' first F2 line that `pick` can change, changed, written alone to DIR. */
function copyWith(name, pick) {
  const lines = readFileSync(resultsFile, "utf8").trim().split("\n").map((text) => JSON.parse(text));
  for (const line of lines.filter((each) => each.corpus === "F2" && each.result)) {
    const changed = pick(line.result);
    if (changed) {
      const file = resolve(work, `${name}.jsonl`);
      writeFileSync(file, JSON.stringify(line) + "\n");
      return { file, id: line.id, changed };
    }
  }
  throw new Error(`${name}: no line of ${resultsFile} has what it needs.`);
}

const BUILDS = {
  "C3b-body-bounds-divided-by-10": ["      else rates = [0, BODY_RATE_BOUNDS[point] + a];", "      else rates = [0, (BODY_RATE_BOUNDS[point] + a) / 10];"],
  "C3c-ascendant-at-60s-bracket-ends": [
    "        at: new Date(found[0]).toISOString(),\n        minutes: (found[0] - t0) / 6e4,",
    "        at: new Date(END(found[0])).toISOString(),\n        minutes: (END(found[0]) - t0) / 6e4,"
  ],
  "C3d-no-seams": ["  return walks;\n}", "  return [];\n}"]
};
/** C3c's report: an Ascendant change at the end of the 60 s bracket from the birth that holds it. */
const C3C_END = [
  "      const change = (found) => found && Object.freeze({",
  "      const END = (ms) => point !== \"Ascendant\" ? ms : ms > t0 ? t0 + 6e4 * Math.ceil((ms - t0) / 6e4) : t0 - 6e4 * Math.ceil((t0 - ms + 1) / 6e4) + 1;\n" +
    "      const change = (found) => found && Object.freeze({"
];

function build(name) {
  const copy = resolve(work, name);
  rmSync(copy, { recursive: true, force: true });
  cpSync(dist, copy, { recursive: true });
  const main = createRequire(resolve(dist, "index.js")).resolve("astronomy-engine");
  const ephemeris = main.slice(0, main.lastIndexOf("astronomy-engine") + "astronomy-engine".length);
  mkdirSync(resolve(copy, "node_modules"));
  symlinkSync(ephemeris, resolve(copy, "node_modules/astronomy-engine"), "dir");
  let code = readFileSync(resolve(copy, "vedic.js"), "utf8");
  for (const [from, to] of name.startsWith("C3c") ? [BUILDS[name], C3C_END] : [BUILDS[name]]) {
    const count = code.split(from).length - 1;
    if (count !== 1) throw new Error(`${name}: the replacement matches ${count} times in vedic.js`);
    code = code.replace(from, () => to);
  }
  writeFileSync(resolve(copy, "vedic.js"), code);
  return copy;
}

const report = { tool: "docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/controls.mjs", results: resultsFile, stepScale: Number(stepScale), dryRun, controls: {} };
const wanted = (name) => !only || only.some((prefix) => name.startsWith(prefix));

if (!dryRun && wanted("C3a-next-1ms-later")) {
  const copy = copyWith("C3a-next-1ms-later", (result) => {
    const row = result.rows.find((each) => each.next);
    if (!row) return null;
    const at = Date.parse(row.next.at) + 1;
    row.next.at = new Date(at).toISOString();
    row.next.minutes = (at - Date.parse(result.utc)) / 60_000;
    return `${row.point} ${row.varga} ${row.scheme} next.at ${row.next.at}`;
  });
  const outcome = check(copy.file, ["--seams", "none", "--f3b", "none"]);
  report.controls["C3a-next-1ms-later"] = { ...copy, ...outcome, mustFail: "M2", failed: outcome.failuresByCheck.M2 > 0 };
}
if (!dryRun && wanted("C3a-next-null")) {
  const copy = copyWith("C3a-next-null", (result) => {
    const row = result.rows.find((each) => each.next);
    if (!row) return null;
    row.next = null;
    return `${row.point} ${row.varga} ${row.scheme} next set to null`;
  });
  const outcome = check(copy.file, ["--seams", "none", "--f3b", "none"]);
  report.controls["C3a-next-null"] = { ...copy, ...outcome, mustFail: "M5", failed: outcome.failuresByCheck.M5 > 0 };
}
if (!dryRun && wanted("G-V2-iii-d2-keep")) {
  const copy = copyWith("G-V2-iii-d2-keep", (result) => {
    const row = result.rows.find((each) => each.varga === "D2" && each.scheme === "parashari" && each.next);
    if (!row) return null;
    const start = Math.round(row.next.boundary / 30) * 30;
    row.next.boundary = start % 360;
    return `${row.point} D2 next.boundary ${row.next.boundary}, the sign start next to it`;
  });
  const outcome = check(copy.file, ["--seams", "none", "--f3b", "none"]);
  report.controls["G-V2-iii-d2-keep"] = { ...copy, ...outcome, mustFail: "G-V2b once", failed: outcome.failuresByCheck["G-V2b"] === 1 };
}
for (const name of Object.keys(BUILDS).filter(wanted)) {
  const copy = build(name);
  if (dryRun) {
    report.controls[name] = { build: copy, replacements: "each matched once" };
    rmSync(copy, { recursive: true, force: true });
    continue;
  }
  const out = resolve(work, `${name}-results`);
  const corpus = name.startsWith("C3d") ? ["--births", "none", "--seams", "none", "--f3b", f3b] : ["--births", births, "--seams", "none", "--f3b", "none", "--limit", "50"];
  node("run.mjs", [...corpus, "--out", out], { ZODIACS_ENGINE_DIST: copy });
  const outcome = check(resolve(out, "results.jsonl"), name.startsWith("C3d") ? ["--seams", "none", "--f3b", f3b] : ["--seams", "none", "--f3b", "none"]);
  const failed = name.startsWith("C3b") ? outcome.verdict !== "PASS" && Object.values(outcome.failuresByCheck).some((n) => n > 0)
    : name.startsWith("C3c") ? outcome.failuresByCheck.M2 > 0
      : outcome.failuresByCheck.M6 > 0;
  report.controls[name] = { ...outcome, mustFail: name.startsWith("C3b") ? "not pass" : name.startsWith("C3c") ? "M2" : "M6", failed };
  rmSync(copy, { recursive: true, force: true });
}
report.allFailed = Object.values(report.controls).every((control) => dryRun || control.failed);
writeFileSync(resolve(work, "controls.json"), JSON.stringify(report, null, 1) + "\n");
process.exitCode = report.allFailed ? 0 : 1;
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.controls).map(([name, control]) => [name, dryRun ? "replacements match" : control.failed ? `failed as it must (${control.mustFail})` : "DID NOT FAIL"]))));
