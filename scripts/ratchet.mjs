// The guard against quiet weakening, from 3.0.0. budgets.json, at the
// repository's root, holds ceilings and floors set from what was measured at
// the commit that wrote them; this script measures the build against them,
// and compares them and the files that hold the guardrails with the base
// branch:
//
//   node scripts/ratchet.mjs --check --tests REPORT [--base origin/main]
//   node scripts/ratchet.mjs --tighten --tests REPORT
//
// REPORT is the JSON report of the test run (vitest --reporter=json
// --outputFile=REPORT); run after `npm run build`.
//
// --check measures, on dist/, what budgets.json bounds:
// - gzip: the bundle of a browser application (esbuild, minified, as
//   scripts/dist-purity.mjs bundles one), gzipped at level 9: "." and
//   "./core", the root's natalChart from each entry; "./minor-bodies" and
//   "./minor-bodies:chiron", what all five minor bodies, and Chiron alone
//   (its spec and minorBodyPosition), add to the application of the root's
//   natalChart; "./de440/pack", the whole entry, the pack with it;
// - bareChunkImports: the bare imports of the package's own files left in
//   dist/ (scripts/build-chunk-imports.mjs takes them out);
// - accuracy: de440L1MaxArcsec, the largest difference, in longitude or
//   latitude, of natalChart on the shipped DE440 pack from the conformance
//   suite's 240 L1 vectors (JPL Horizons, DE441); minorBodiesOosMaxArcsec,
//   the largest of the 500 minor-body places on the pack from Horizons's
//   (src/fixtures/minor-bodies-horizons-oos.json); conformanceMinPass, the
//   passes the committed results of the engine hold
//   (conformance/results/zodiacs-engine.json, which conformance.yml checks);
// - minPassingTests: the tests REPORT counts as passed.
// It fails, before measuring anything, where REPORT is of a run that failed:
// its success is not true, it counts a failed test or a failed suite, or a
// file or a test in it has the status "failed" (a run can fail tests and
// still pass more than the floor); --tighten refuses such a report too. It
// fails where a measurement is over its ceiling or under its floor, where
// it is not a finite number (a NaN compares as neither over nor under, so it
// is refused before any comparison), or where it could not be made; and
// where REPORT holds a skipped test (vitest's "skipped", "pending" or "todo")
// that SKIPPED_BY_DESIGN does not let through in this environment: the
// tier-B kernel tests without PRECISION_KERNEL, the tzdata 2025c test on a
// host without that release, and the tests that need dist/ when the run came
// before the build. Then it compares with the base branch's
// merge base: where budgets.json there exists, a ceiling this branch raises,
// a floor it lowers or a limit it removes needs a commit in the range whose
// message holds the tag [budget-increase-approved] and a trailer
// `Approved-by: <name>, <YYYY-MM-DD>: "<the approval's words>"` (a person's,
// never an agent's); and a change to a guardrail file (GUARDED_FILES) or a
// test under src/ deleted or renamed needs the tag
// [guardrails-change-approved] and such a trailer. Where budgets.json does
// not exist there, the range introduces it, and there is no earlier policy
// to compare with: the measurements above are still made and checked.
//
// --tighten lowers each ceiling to the measurement and its headroom, and
// raises each floor to the measurement, where that is tighter, and writes
// budgets.json; it never loosens one.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The files whose change weakens or moves a guardrail; budgets.json is compared value by value instead. */
export const GUARDED_FILES = Object.freeze([
  "scripts/ratchet.mjs",
  "scripts/verify-package-contents.mjs",
  "scripts/verify-dist-purity.mjs",
  "scripts/verify-archive-binding.mjs",
  ".github/workflows/ci.yml"
]);
export const BUDGET_TAG = "[budget-increase-approved]";
export const GUARDRAILS_TAG = "[guardrails-change-approved]";
/** A person's approval: `Approved-by: Name, 2026-11-27: "the words of the approval"`, on a line of its own. */
export const APPROVAL_TRAILER = /^Approved-by: *[^,\n]+, *\d{4}-\d{2}-\d{2}: *(['"‘“]).+\S.*['"’”] *$/m;

/** Limits that are floors: a lower value weakens them. Every other number in budgets.json is a ceiling. */
const FLOORS = Object.freeze(["accuracy.conformanceMinPass", "minPassingTests"]);
/** Headroom --tighten leaves over a measurement, as a fraction: 10 per cent, and 1 per cent for the pack, which is fixed data. */
const HEADROOM = Object.freeze({ default: 0.1, "gzip../de440/pack": 0.01 });

/** `value`, or a thrown error naming `what` where it is not a finite number. */
export function finite(value, what) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${what} is ${value}, not a finite number`);
  return value;
}

/** The largest of `largest` and the magnitudes of `values`, each checked finite first: Math.max would carry a NaN through. */
export function largestMagnitude(largest, values, what) {
  let found = finite(largest, what);
  for (const value of values) found = Math.max(found, Math.abs(finite(value, what)));
  return found;
}

/**
 * The tests a run skips by design (AGENTS.md), each with the condition, on
 * the environment of the check, under which it is let through: `file`, the
 * test file from the repository's root; `describe`, the title of the
 * outermost block whose tests are all skipped, or `test`, the test's own
 * title; and `when`, given { precisionKernel, tz, builtAfterRun }, whether the
 * skip is expected here. Every other skipped test fails the check, and so
 * does one of these where its condition does not hold.
 */
export const SKIPPED_BY_DESIGN = Object.freeze([
  {
    file: "src/de440-kernel.test.ts",
    describe: "de440 on the raw kernel (tier B)",
    because: "PRECISION_KERNEL is not set; the tier-B job runs these with nothing skipped",
    when: (environment) => !environment.precisionKernel
  },
  {
    file: "src/geo/zone-history.test.ts",
    test: "reproduces every segment before 1970 but six, which the reference got otherwise",
    because: "the host's time zone data is not tzdata 2025c",
    when: (environment) => environment.tz !== "2025c"
  },
  ...[
    ["scripts/lite-entry.test.mjs", "describe", "this checkout's build of the lite entry"],
    ["scripts/require-esm.test.mjs", "describe", "require() of this checkout's build"],
    ["scripts/root-isolation.test.mjs", "test", "passes this checkout's build"],
    ["scripts/root-unchanged.test.mjs", "test", "computes from this checkout's build exactly what the archive computes"]
  ].map(([file, kind, title]) => ({
    file,
    [kind]: title,
    because: "it needs dist/, which the build wrote after the test run started",
    when: (environment) => environment.builtAfterRun
  }))
]);

const SKIPPED = new Set(["skipped", "pending", "todo", "disabled"]);

/** A test file of a vitest JSON report, by its path from `root`, with forward slashes. */
function fileOf(file, root) {
  const name = String(file?.name ?? "");
  const relative = name.startsWith(root) ? name.slice(root.length).replace(/^[\\/]+/u, "") : name;
  return relative.split("\\").join("/");
}

/** Each skipped test in a vitest JSON report: its file from `root`, its block titles, its title and its status. */
export function skippedTests(report, root = ROOT) {
  const found = [];
  for (const file of report.testResults ?? []) {
    for (const test of file.assertionResults ?? []) {
      if (SKIPPED.has(test.status)) found.push({ file: fileOf(file, root), ancestors: test.ancestorTitles ?? [], title: test.title, status: test.status });
    }
  }
  return found;
}

/**
 * What a vitest JSON report says failed, each as a sentence: its `success`
 * where that is not true; its counts of failed tests and of failed suites
 * (vitest counts a test file that does not load as a failed suite) where
 * they are not 0, or missing; and each file and each test whose status is
 * "failed". Empty for a run that passed. A run that fails tests can still
 * pass more than the floor of minPassingTests, so the passing count is no
 * verdict on the run.
 */
export function failuresOf(report, root = ROOT) {
  const found = [];
  if (report?.success !== true) found.push(`the test run failed: the report's success is ${JSON.stringify(report?.success) ?? "missing"}, not true`);
  for (const [key, what] of [
    ["numFailedTests", "failed tests"],
    ["numFailedTestSuites", "failed suites"]
  ]) {
    const count = report?.[key];
    if (!Number.isInteger(count)) found.push(`the test report is not a vitest JSON report: it has no ${key}`);
    else if (count !== 0) found.push(`the test run failed: the report counts ${count} ${what} (${key})`);
  }
  for (const file of report?.testResults ?? []) {
    const failed = (file.assertionResults ?? []).filter((test) => test.status === "failed");
    for (const test of failed) found.push(`${fileOf(file, root)}: ${[...(test.ancestorTitles ?? []), test.title].join(" > ")} failed`);
    if (file.status === "failed" && failed.length === 0) {
      const message = String(file.message ?? "").split("\n")[0];
      found.push(`${fileOf(file, root)} failed${message ? `: ${message}` : ""}`);
    }
  }
  return found;
}

/**
 * The problems with a vitest JSON report: its passing count missing; what it
 * says failed (`failuresOf`); each skipped test that SKIPPED_BY_DESIGN does
 * not let through in `environment` ({ precisionKernel, tz, builtAfterRun });
 * and a count of skipped tests the report states that its tests do not
 * account for.
 */
export function reportProblems(report, environment, root = ROOT) {
  const problems = [];
  if (!Number.isInteger(report?.numPassedTests)) problems.push("the test report is not a vitest JSON report: it has no numPassedTests");
  problems.push(...failuresOf(report, root));
  const skipped = skippedTests(report ?? {}, root);
  for (const test of skipped) {
    const rule = SKIPPED_BY_DESIGN.find(
      (entry) => entry.file === test.file && (entry.describe !== undefined ? test.ancestors[0] === entry.describe : test.title === entry.test)
    );
    const name = `${test.file}: ${[...test.ancestors, test.title].join(" > ")}`;
    if (!rule) problems.push(`${name} is ${test.status}, and no rule lets a skip of it through`);
    else if (!rule.when(environment)) problems.push(`${name} is ${test.status}, but its skip is let through only where ${rule.because}`);
  }
  const stated = (report?.numPendingTests ?? 0) + (report?.numTodoTests ?? 0);
  if (stated > skipped.length) problems.push(`the test report counts ${stated} skipped or todo tests and lists ${skipped.length}`);
  return problems;
}

/** Every numeric limit of a budgets object, by dotted path ("gzip..", "accuracy.de440L1MaxArcsec"), notes left out. */
export function limitsOf(budgets) {
  const out = {};
  for (const [key, value] of Object.entries(budgets ?? {})) {
    if (key === "notes") continue;
    if (typeof value === "number") out[key] = value;
    else if (value && typeof value === "object") for (const [inner, limit] of Object.entries(value)) if (typeof limit === "number") out[`${key}.${inner}`] = limit;
  }
  return out;
}

const isFloor = (path) => FLOORS.includes(path);

/** The ways `next` weakens `previous`: a ceiling raised, a floor lowered, a limit removed, each as a sentence. */
export function weakenings(previous, next) {
  const before = limitsOf(previous);
  const after = limitsOf(next);
  const found = [];
  for (const [path, value] of Object.entries(before)) {
    if (!(path in after)) found.push(`${path} is removed (was ${value})`);
    else if (isFloor(path) ? after[path] < value : after[path] > value) {
      found.push(`${path} is ${isFloor(path) ? "lowered" : "raised"} from ${value} to ${after[path]}`);
    }
  }
  return found;
}

/** Whether one of the commit messages holds both `tag` and a person's approval trailer. */
export function approved(messages, tag) {
  return messages.some((message) => message.includes(tag) && APPROVAL_TRAILER.test(message));
}

/**
 * The guard's verdict on a range: `previous` the base's budgets (null where
 * the base has none), `current` this commit's, `guarded` the guardrail files
 * the range changes, `tests` the tests under src/ it deletes or renames, and
 * `messages` its commit messages. Returns the problems, empty when it passes,
 * and what it found.
 */
export function guardVerdict({ previous, current, guarded, tests, messages }) {
  const problems = [];
  const notes = [];
  if (previous === null) {
    notes.push("budgets.json is new in this range: there is no earlier policy to compare it with");
    return { problems, notes };
  }
  const weaker = weakenings(previous, current);
  if (weaker.length > 0) {
    if (approved(messages, BUDGET_TAG)) notes.push(`budgets weakened, with approval: ${weaker.join("; ")}`);
    else problems.push(`budgets.json weakens ${weaker.join("; ")}, and no commit in the range holds ${BUDGET_TAG} with an Approved-by trailer`);
  }
  const changed = [...guarded.map((file) => `${file} changed`), ...tests.map((file) => `${file} deleted or renamed`)];
  if (changed.length > 0) {
    if (approved(messages, GUARDRAILS_TAG)) notes.push(`guardrails changed, with approval: ${changed.join("; ")}`);
    else problems.push(`${changed.join("; ")}, and no commit in the range holds ${GUARDRAILS_TAG} with an Approved-by trailer`);
  }
  return { problems, notes };
}

/** Rounded up to two significant figures (an accuracy) or to the next 100 (a size, from 1,000 up). */
function roundUp(value) {
  if (value >= 1000) return Math.ceil(value / 100) * 100;
  if (value === 0) return 0;
  const unit = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Number((Math.ceil(value / unit - 1e-9) * unit).toPrecision(2));
}

/** budgets.json tightened to `measured` (by dotted path): each ceiling lowered to the measurement and its headroom where that is lower, each floor raised to the measurement, rounded down to a hundred, where that is higher. */
export function tightened(budgets, measured) {
  const next = structuredClone(budgets);
  for (const [path, value] of Object.entries(limitsOf(budgets))) {
    if (!(path in measured)) continue;
    finite(measured[path], path);
    const [group, key] = path.includes(".") ? [path.slice(0, path.indexOf(".")), path.slice(path.indexOf(".") + 1)] : [null, path];
    const target = isFloor(path)
      ? Math.max(value, path === "minPassingTests" ? Math.floor(measured[path] / 100) * 100 : measured[path])
      : Math.min(value, roundUp(measured[path] * (1 + (HEADROOM[path] ?? HEADROOM.default))));
    if (group === null) next[key] = target;
    else next[group][key] = target;
  }
  assert.deepEqual(weakenings(budgets, next), [], "tightening must never weaken a limit");
  return next;
}

/** Each measurement against its limit: the ones over a ceiling or under a floor. */
export function overLimits(budgets, measured) {
  const problems = [];
  for (const [path, limit] of Object.entries(limitsOf(budgets))) {
    if (!(path in measured)) {
      problems.push(`${path} was not measured`);
      continue;
    }
    const value = measured[path];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      problems.push(`${path} is ${value}, not a finite measurement`);
      continue;
    }
    if (isFloor(path) ? value < limit : value > limit) problems.push(`${path} is ${value}, ${isFloor(path) ? "under its floor" : "over its ceiling"} of ${limit}`);
  }
  return problems;
}

/**
 * What --check finds wrong with a build, before it compares with the base
 * branch: each measurement over its ceiling, under its floor or not finite,
 * and the test report's problems (`reportProblems`), or its absence.
 */
export function checkProblems({ budgets, measured, report, environment, root = ROOT }) {
  const problems = overLimits(budgets, measured);
  if (report === undefined) problems.push("minPassingTests needs the test run's report: pass --tests REPORT");
  else problems.push(...reportProblems(report, environment, root));
  return problems;
}

// ---------------------------------------------------------------- measuring the build

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const wrapArcsec = (a, b) => ((((a - b) % 360) + 540) % 360 - 180) * 3600;

/** What budgets.json bounds, measured on dist/ and the test run's report, by dotted path; a measurement that is not finite throws. */
export async function measure({ report }) {
  const { bareImports, bundleOf } = await import("./dist-purity.mjs");
  const measured = {};
  const gzip = async (contents) => {
    const bundle = await bundleOf({ root: ROOT, contents });
    assert.deepEqual([...bundle.errors, ...bundle.warnings], [], `esbuild bundles with errors or warnings:\n${contents}`);
    return bundle.gzip;
  };
  const natal = 'import { natalChart } from "./dist/index.js";\n';
  const root = await gzip(`${natal}globalThis.chart = natalChart;\n`);
  measured["gzip.."] = root;
  measured["gzip../core"] = await gzip('import { natalChart } from "./dist/core.js";\nglobalThis.chart = natalChart;\n');
  measured["gzip../minor-bodies"] = (await gzip(`${natal}import * as minor from "./dist/minor-bodies.js";\nglobalThis.chart = [natalChart, minor];\n`)) - root;
  measured["gzip../minor-bodies:chiron"] =
    (await gzip(`${natal}import { chiron, minorBodyPosition } from "./dist/minor-bodies.js";\nglobalThis.chart = [natalChart, minorBodyPosition(chiron, new Date())];\n`)) - root;
  measured["gzip../de440/pack"] = await gzip('import * as pack from "./dist/de440-pack.js";\nglobalThis.pack = pack;\n');

  const dist = readdirSync(new URL("../dist/", import.meta.url)).filter((name) => name.endsWith(".js"));
  measured.bareChunkImports = dist.reduce((sum, name) => sum + bareImports(read(`dist/${name}`)).length, 0);

  const engine = await import(pathToFileURL(`${ROOT}dist/index.js`).href);
  const pack = await import(pathToFileURL(`${ROOT}dist/de440-pack.js`).href);
  const minor = await import(pathToFileURL(`${ROOT}dist/minor-bodies.js`).href);
  const before = engine.defaultEphemeris().name;
  pack.useDe440();
  try {
    let largest = 0;
    const { vectors } = JSON.parse(read("conformance/vectors/L1-positions.json"));
    assert.equal(vectors.length, 240, "the conformance suite's L1 file holds 240 vectors");
    for (const vector of vectors) {
      const chart = engine.natalChart({ utc: new Date(Math.round((vector.input.jd_tt - 2440587.5) * 86_400_000)), timeScale: "tt", timeKnown: false });
      assert.equal(chart.ephemeris.name, "jpl-de440", "natalChart after useDe440() computes on the pack");
      const body = chart.bodies.find((candidate) => candidate.body === vector.input.body);
      const what = `natalChart's ${vector.input.body} for ${vector.id}`;
      finite(body.lon, `${what} longitude`);
      finite(body.lat, `${what} latitude`);
      largest = largestMagnitude(largest, [wrapArcsec(body.lon, vector.expected.lon), (body.lat - vector.expected.lat) * 3600], what);
    }
    measured["accuracy.de440L1MaxArcsec"] = largest;
    largest = 0;
    let checks = 0;
    const fixture = JSON.parse(read("src/fixtures/minor-bodies-horizons-oos.json"));
    for (const spec of minor.MINOR_BODIES) {
      for (const check of fixture.bodies[spec.name].points) {
        const ms = (check.jdTt - 2440587.5) * 86_400_000;
        const place = minor.minorBodyPosition(spec, new Date(Math.round(ms)), { timeScale: "tt" });
        assert.equal(place.ephemeris.name, "jpl-de440", "a minor body after useDe440() is reduced with the pack's Earth");
        const what = `${spec.name} at JD ${check.jdTt} TT`;
        finite(place.lon, `${what} longitude`);
        finite(place.lat, `${what} latitude`);
        finite(place.speed, `${what} speed`);
        const moved = place.lon + (place.speed * (ms - Math.round(ms))) / 86_400_000;
        largest = largestMagnitude(largest, [wrapArcsec(moved, check.lon), (place.lat - check.lat) * 3600], what);
        checks += 1;
      }
    }
    assert.equal(checks, 500, "the fixture holds 500 minor-body checks");
    measured["accuracy.minorBodiesOosMaxArcsec"] = largest;
  } finally {
    engine.setDefaultEphemeris(before);
  }
  const results = JSON.parse(read("conformance/results/zodiacs-engine.json")).results;
  measured["accuracy.conformanceMinPass"] = results.filter((result) => result.verdict === "pass").length;

  if (report !== undefined) {
    assert(Number.isInteger(report.numPassedTests), "the test report is not a vitest JSON report");
    measured.minPassingTests = report.numPassedTests;
  }
  for (const [path, value] of Object.entries(measured)) finite(value, path);
  return measured;
}

// ---------------------------------------------------------------- comparing with the base branch

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });

/** The range from the merge base of `base` and HEAD: the base's budgets.json, the guardrail files and src/ tests it changes, and its messages. */
export function rangeFrom(base) {
  const fork = git("merge-base", base, "HEAD").trim();
  let previous = null;
  try {
    previous = JSON.parse(git("show", `${fork}:budgets.json`));
  } catch (error) {
    if (!/does not exist|exists on disk, but not in/u.test(String(error?.stderr ?? error))) throw error;
  }
  const guarded = git("diff", "--name-only", fork, "HEAD", "--", ...GUARDED_FILES).split("\n").filter(Boolean);
  const tests = git("diff", "--name-only", "--diff-filter=DR", "-M", fork, "HEAD", "--", "src/*.test.ts", "src/**/*.test.ts")
    .split("\n")
    .filter(Boolean);
  const messages = git("log", "--format=%B%x00", `${fork}..HEAD`).split("\0").map((message) => message.trim()).filter(Boolean);
  return { fork, previous, guarded, tests, messages };
}

// ---------------------------------------------------------------- the command line

/**
 * The environment the skips are judged in: whether PRECISION_KERNEL is set,
 * the host's time zone data release, and whether dist/ was built after the
 * test run started (each file the tests that need it read is newer than the
 * report's start), as in CI, where the tests run before the Build step.
 */
function environmentOf(tests, report) {
  const started = Number(report?.startTime);
  const built = ["index.js", "metafile-esm.json", "metafile-lite.json", "lite.d.ts"].map((name) => `${ROOT}dist/${name}`);
  return {
    precisionKernel: Boolean(process.env.PRECISION_KERNEL),
    tz: process.versions.tz,
    builtAfterRun: tests !== undefined && Number.isFinite(started) && built.every((file) => existsSync(file) && statSync(file).mtimeMs >= started)
  };
}

async function main(args) {
  const mode = args.includes("--tighten") ? "tighten" : args.includes("--check") ? "check" : null;
  assert(mode, "usage: node scripts/ratchet.mjs --check --tests REPORT [--base REF] | --tighten --tests REPORT");
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const tests = option("--tests");
  const budgets = JSON.parse(read("budgets.json"));
  const report = tests === undefined ? undefined : JSON.parse(readFileSync(tests, "utf8"));
  // The report of a failed run is refused before anything is measured: its passing count is no floor to meet or set.
  const failed = report === undefined ? [] : failuresOf(report);
  if (failed.length > 0) {
    console.error(`ratchet failed: ${tests} is the report of a run that failed, and --${mode} needs one that passed:\n- ${failed.join("\n- ")}`);
    process.exit(1);
  }
  const measured = await measure({ report });
  if (mode === "tighten") {
    assert(tests, "--tighten needs --tests REPORT, to set the passing-test floor");
    const next = tightened(budgets, measured);
    writeFileSync(new URL("../budgets.json", import.meta.url), `${JSON.stringify(next, null, 2)}\n`);
    console.log(`ratchet: budgets.json tightened to ${JSON.stringify(limitsOf(next))}`);
    return;
  }
  const problems = checkProblems({ budgets, measured, report, environment: environmentOf(tests, report) });
  const base = option("--base") ?? "origin/main";
  const range = rangeFrom(base);
  const verdict = guardVerdict({ ...range, current: budgets });
  problems.push(...verdict.problems);
  const shown = Object.entries(measured).map(([path, value]) => `${path} ${+value.toPrecision(6)} (limit ${limitsOf(budgets)[path]})`).join(", ");
  if (problems.length > 0) {
    console.error(`ratchet failed:\n- ${problems.join("\n- ")}\nmeasured: ${shown}`);
    process.exit(1);
  }
  console.log(`ratchet passed against ${base} (merge base ${range.fork.slice(0, 12)}): ${shown}${verdict.notes.length ? `; ${verdict.notes.join("; ")}` : ""}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main(process.argv.slice(2));
