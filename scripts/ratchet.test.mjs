// scripts/ratchet.mjs's rules, on budgets, commit messages and test reports
// made up here: what weakens a budget, what counts as a person's approval,
// what --tighten may do, the verdict on a range, which skipped tests --check
// lets through, that the report of a failed run fails it, that a report
// which leaves a tracked test file out fails it, and that a measurement
// which is not a finite number fails it; and, on a git repository made up
// here, which changes in a range need an approval. The measurements
// themselves need dist/ and are made by `node scripts/ratchet.mjs --check`
// after the build; the command is run here only on reports it refuses
// before measuring: a failed run's, one that leaves a test file out, and,
// with --tighten, one with a skipped test that no rule lets through.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  APPROVAL_TRAILER,
  BUDGET_TAG,
  GUARDED_FILES,
  GUARDRAILS_TAG,
  SKIPPED_BY_DESIGN,
  TEST_FILE,
  approved,
  checkProblems,
  failuresOf,
  finite,
  guardVerdict,
  largestMagnitude,
  limitsOf,
  missingTestFiles,
  overLimits,
  rangeFrom,
  reportProblems,
  skippedTests,
  tightened,
  trackedTestFiles,
  weakenings
} from "./ratchet.mjs";

const budgets = JSON.parse(readFileSync(new URL("../budgets.json", import.meta.url), "utf8"));
const approval = 'Approved-by: A Person, 2026-01-02: "Raise the root budget for the new point."';

describe("budgets.json", () => {
  /** The bounds budgets.json keeps, as bounds and not values: --tighten lowers its ceilings and raises its floors. */
  const keepsBounds = (limits) => {
    expect(Object.keys(limitsOf(limits)).sort()).toEqual(
      [
        "accuracy.conformanceMinPass",
        "accuracy.de440L1MaxArcsec",
        "accuracy.minorBodiesOosMaxArcsec",
        "bareChunkImports",
        "gzip..",
        "gzip../core",
        "gzip../de440/pack",
        "gzip../minor-bodies",
        "gzip../minor-bodies:chiron",
        "minPassingTests"
      ].sort()
    );
    expect(limits.gzip["."]).toBeLessThanOrEqual(40_000);
    expect(limits.gzip["./core"]).toBeLessThanOrEqual(40_000);
    expect(limits.gzip["./minor-bodies"]).toBeLessThanOrEqual(140_000);
    expect(limits.gzip["./minor-bodies:chiron"]).toBeLessThanOrEqual(15_000);
    expect(limits.bareChunkImports).toBe(0);
    expect(limits.accuracy.de440L1MaxArcsec).toBeLessThanOrEqual(0.02);
    expect(limits.accuracy.minorBodiesOosMaxArcsec).toBeLessThanOrEqual(1);
    expect(limits.accuracy.conformanceMinPass).toBeGreaterThanOrEqual(639);
    expect(limits.minPassingTests).toBeGreaterThanOrEqual(5_700);
    expect(limits.minPassingTests % 100).toBe(0);
  };

  it("bounds every measurement the ratchet makes, and the root's natalChart under 40,000 bytes gzipped", () => {
    keepsBounds(budgets);
  });

  it("keeps those bounds once --tighten has lowered the accuracy ceilings to the measurements of its notes", () => {
    // What budgets.json's notes give: the sizes on Node 22.22.2 after the third review's fixes, the accuracy, and the
    // passing tests on the commit that set the floor.
    const measured = {
      "gzip..": 36_624,
      "gzip../core": 36_624,
      "gzip../minor-bodies": 115_981,
      "gzip../minor-bodies:chiron": 14_125,
      "gzip../de440/pack": 2_367_563,
      bareChunkImports: 0,
      "accuracy.de440L1MaxArcsec": 0.0126,
      "accuracy.minorBodiesOosMaxArcsec": 0.53211,
      "accuracy.conformanceMinPass": 639,
      minPassingTests: 5_729
    };
    const next = tightened(budgets, measured);
    expect(next.accuracy.de440L1MaxArcsec).toBeLessThanOrEqual(0.014);
    expect(next.accuracy.minorBodiesOosMaxArcsec).toBeLessThanOrEqual(0.59);
    keepsBounds(next);
  });
});

describe("weakenings", () => {
  const base = { gzip: { ".": 39_900 }, bareChunkImports: 0, accuracy: { de440L1MaxArcsec: 0.02, conformanceMinPass: 639 }, minPassingTests: 5_700 };

  it("finds a ceiling raised, a floor lowered and a limit removed, and nothing in a tightening", () => {
    expect(weakenings(base, base)).toEqual([]);
    expect(weakenings(base, { ...base, gzip: { ".": 39_800 }, minPassingTests: 5_800 })).toEqual([]);
    expect(weakenings(base, { ...base, gzip: { ".": 40_000 } })).toEqual(["gzip.. is raised from 39900 to 40000"]);
    expect(weakenings(base, { ...base, bareChunkImports: 1 })).toEqual(["bareChunkImports is raised from 0 to 1"]);
    expect(weakenings(base, { ...base, accuracy: { de440L1MaxArcsec: 0.03, conformanceMinPass: 639 } })).toEqual([
      "accuracy.de440L1MaxArcsec is raised from 0.02 to 0.03"
    ]);
    expect(weakenings(base, { ...base, accuracy: { de440L1MaxArcsec: 0.02, conformanceMinPass: 638 } })).toEqual([
      "accuracy.conformanceMinPass is lowered from 639 to 638"
    ]);
    expect(weakenings(base, { ...base, minPassingTests: 5_600 })).toEqual(["minPassingTests is lowered from 5700 to 5600"]);
    const { bareChunkImports, ...rest } = base;
    void bareChunkImports;
    expect(weakenings(base, rest)).toEqual(["bareChunkImports is removed (was 0)"]);
  });
});

describe("approval", () => {
  it("needs the tag and a person's dated, quoted trailer in one message", () => {
    expect(APPROVAL_TRAILER.test(approval)).toBe(true);
    expect(APPROVAL_TRAILER.test("Approved-by: A Person, 2026-01-02: “Yes, raise it.”")).toBe(true);
    for (const missing of [
      "Approved-by: A Person",
      "Approved-by: A Person, 2026-01-02",
      "Approved-by: A Person, 2 January 2026: \"yes\"",
      "Approved-by: A Person, 2026-01-02: yes",
      "Approved-by: A Person, 2026-01-02: \"\"",
      "approved by A Person, 2026-01-02: \"yes\""
    ]) {
      expect(APPROVAL_TRAILER.test(missing), missing).toBe(false);
    }
    expect(approved([`Raise a budget ${BUDGET_TAG}\n\n${approval}`], BUDGET_TAG)).toBe(true);
    expect(approved([`Raise a budget ${BUDGET_TAG}`, approval], BUDGET_TAG)).toBe(false);
    expect(approved([`Raise a budget\n\n${approval}`], BUDGET_TAG)).toBe(false);
    expect(approved([`Change CI ${GUARDRAILS_TAG}\n\n${approval}`], BUDGET_TAG)).toBe(false);
  });
});

describe("the verdict on a range", () => {
  const previous = { gzip: { ".": 39_900 }, minPassingTests: 5_700 };

  it("lets budgets.json in where the base has none, with nothing to compare", () => {
    const verdict = guardVerdict({ previous: null, current: previous, guarded: [...GUARDED_FILES], tests: ["src/a.test.ts"], messages: [] });
    expect(verdict.problems).toEqual([]);
    expect(verdict.notes).toEqual(["budgets.json is new in this range: there is no earlier policy to compare it with"]);
  });

  it("fails a weakened budget, a changed guardrail and a deleted test without approval, and passes them with it", () => {
    const current = { gzip: { ".": 40_000 }, minPassingTests: 5_700 };
    const unapproved = guardVerdict({ previous, current, guarded: ["scripts/ratchet.mjs"], tests: ["src/points.test.ts"], messages: ["Tidy"] });
    expect(unapproved.problems).toHaveLength(2);
    expect(unapproved.problems[0]).toMatch(/^budgets\.json weakens gzip\.\. is raised from 39900 to 40000, and no commit/u);
    expect(unapproved.problems[1]).toMatch(/^scripts\/ratchet\.mjs changed; src\/points\.test\.ts deleted or renamed, and no commit/u);
    const passes = guardVerdict({
      previous,
      current,
      guarded: ["scripts/ratchet.mjs"],
      tests: ["src/points.test.ts"],
      messages: [`One ${BUDGET_TAG}\n\n${approval}`, `Two ${GUARDRAILS_TAG}\n\n${approval}`]
    });
    expect(passes.problems).toEqual([]);
    expect(passes.notes).toHaveLength(2);
    expect(guardVerdict({ previous, current: { gzip: { ".": 39_000 }, minPassingTests: 5_800 }, guarded: [], tests: [], messages: [] })).toEqual({ problems: [], notes: [] });
  });

  it("counts vitest.config.mjs and scripts/dist-purity.mjs guardrails: a change to either fails without approval and passes with it", () => {
    // What the run collects; and how the gzip and bareChunkImports measurements bundle, gzip and count.
    for (const [file, message] of [
      ["vitest.config.mjs", "Run fewer files"],
      ["scripts/dist-purity.mjs", "Bundle the applications otherwise"]
    ]) {
      expect(GUARDED_FILES).toContain(file);
      const change = { previous, current: previous, guarded: [file], tests: [] };
      expect(guardVerdict({ ...change, messages: [message] }).problems).toEqual([
        `${file} changed, and no commit in the range holds ${GUARDRAILS_TAG} with an Approved-by trailer`
      ]);
      expect(guardVerdict({ ...change, messages: [`${message} ${GUARDRAILS_TAG}\n\n${approval}`] }).problems).toEqual([]);
    }
  });
});

describe("a range in a git repository", () => {
  // git without the host's configuration (no hooks, no signing), committing as an identity of its own.
  const identity = { GIT_AUTHOR_NAME: "Ratchet Test", GIT_AUTHOR_EMAIL: "ratchet@example.invalid", GIT_COMMITTER_NAME: "Ratchet Test", GIT_COMMITTER_EMAIL: "ratchet@example.invalid" };
  const env = { ...process.env, ...identity, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: "1" };
  /** A new folder for a repository: the folder, git run in it, and a writer of its files. */
  const repository = () => {
    const folder = mkdtempSync(join(tmpdir(), "zodiacs-ratchet-git-"));
    const git = (...args) => execFileSync("git", args, { cwd: folder, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const write = (file, text) => {
      mkdirSync(dirname(join(folder, file)), { recursive: true });
      writeFileSync(join(folder, file), text);
    };
    return { folder, git, write };
  };

  it("finds vitest.config.mjs and scripts/dist-purity.mjs changed and each test file deleted or renamed, wherever it is, and then their approval", () => {
    const { folder, git, write } = repository();
    try {
      git("init", "-q", "-b", "main");
      write("budgets.json", `${JSON.stringify({ minPassingTests: 5_700 })}\n`);
      write("vitest.config.mjs", 'export default { test: { setupFiles: ["./src/test-setup.ts"] } };\n');
      write("scripts/dist-purity.mjs", 'export const bareImports = (code) => code.match(/^import "[^"]+";$/gmu) ?? [];\n');
      for (const file of ["src/geo/points.test.ts", "scripts/build.test.mjs", "tests/sky.spec.ts", "bots/facts/reading.test.ts", "src/fixtures/points.test.json"]) {
        write(file, `export const file = ${JSON.stringify(file)};\n`);
      }
      git("add", "-A");
      git("commit", "-q", "-m", "Base");
      expect(trackedTestFiles(folder)).toEqual(["bots/facts/reading.test.ts", "scripts/build.test.mjs", "src/geo/points.test.ts", "tests/sky.spec.ts"]);

      git("checkout", "-q", "-b", "change");
      write("vitest.config.mjs", 'export default { test: { setupFiles: ["./src/test-setup.ts"], exclude: ["tests/**"] } };\n');
      // The measurements' code, made to count no bare import.
      write("scripts/dist-purity.mjs", "export const bareImports = () => [];\n");
      rmSync(join(folder, "scripts/build.test.mjs"));
      // Renamed out of the pattern and within it: each is the test file deleted, by its old name.
      renameSync(join(folder, "bots/facts/reading.test.ts"), join(folder, "bots/facts/reading.ts"));
      renameSync(join(folder, "tests/sky.spec.ts"), join(folder, "tests/zodiac.spec.ts"));
      // Not a test file: a fixture's deletion needs no approval.
      rmSync(join(folder, "src/fixtures/points.test.json"));
      git("add", "-A");
      git("commit", "-q", "-m", "Run fewer files");
      const range = rangeFrom("main", folder);
      expect(range.previous).toEqual({ minPassingTests: 5_700 });
      expect(range.guarded).toEqual(["scripts/dist-purity.mjs", "vitest.config.mjs"]);
      expect(range.tests).toEqual(["bots/facts/reading.test.ts", "scripts/build.test.mjs", "tests/sky.spec.ts"]);
      expect(range.messages).toEqual(["Run fewer files"]);
      expect(guardVerdict({ ...range, current: range.previous }).problems).toEqual([
        "scripts/dist-purity.mjs changed; vitest.config.mjs changed; bots/facts/reading.test.ts deleted or renamed; scripts/build.test.mjs deleted or renamed; " +
          `tests/sky.spec.ts deleted or renamed, and no commit in the range holds ${GUARDRAILS_TAG} with an Approved-by trailer`
      ]);

      git("commit", "-q", "--allow-empty", "-m", `Approve the smaller run ${GUARDRAILS_TAG}\n\n${approval}`);
      const approvedRange = rangeFrom("main", folder);
      expect(approvedRange.messages).toHaveLength(2);
      expect(guardVerdict({ ...approvedRange, current: range.previous }).problems).toEqual([]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("finds a test file renamed to a name of the pattern that is no test file's, example.test.ts to example.test.txt, as the test file deleted", () => {
    const { folder, git, write } = repository();
    try {
      git("init", "-q", "-b", "main");
      write("budgets.json", `${JSON.stringify({ minPassingTests: 5_700 })}\n`);
      write("example.test.ts", 'export const file = "example.test.ts";\n');
      git("add", "-A");
      git("commit", "-q", "-m", "Base");

      git("checkout", "-q", "-b", "change");
      // Both names are in the pathspec (*.test.*): paired as a rename, git would give only the new one, which TEST_FILE does not match.
      renameSync(join(folder, "example.test.ts"), join(folder, "example.test.txt"));
      git("add", "-A");
      git("commit", "-q", "-m", "Keep the example as text");
      expect(trackedTestFiles(folder)).toEqual([]);
      const range = rangeFrom("main", folder);
      expect(range.tests).toEqual(["example.test.ts"]);
      expect(guardVerdict({ ...range, current: range.previous }).problems).toEqual([
        `example.test.ts deleted or renamed, and no commit in the range holds ${GUARDRAILS_TAG} with an Approved-by trailer`
      ]);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("tightening and checking", () => {
  const limits = { gzip: { ".": 40_000, "./de440/pack": 2_500_000 }, bareChunkImports: 0, accuracy: { de440L1MaxArcsec: 0.02, conformanceMinPass: 639 }, minPassingTests: 5_000 };
  const measured = {
    "gzip..": 30_000,
    "gzip../de440/pack": 2_406_590,
    bareChunkImports: 0,
    "accuracy.de440L1MaxArcsec": 0.0126,
    "accuracy.conformanceMinPass": 640,
    minPassingTests: 5_718
  };

  it("lowers ceilings to the measurement and its headroom, raises floors to it, and never loosens", () => {
    expect(tightened(limits, measured)).toEqual({
      gzip: { ".": 33_000, "./de440/pack": 2_430_700 },
      bareChunkImports: 0,
      accuracy: { de440L1MaxArcsec: 0.014, conformanceMinPass: 640 },
      minPassingTests: 5_700
    });
    // A measurement over its ceiling leaves the ceiling where it is.
    expect(tightened(limits, { ...measured, "gzip..": 41_000 }).gzip["."]).toBe(40_000);
  });

  it("names each measurement over its ceiling, under its floor, or not made", () => {
    expect(overLimits(limits, measured)).toEqual([]);
    expect(overLimits(limits, { ...measured, "gzip..": 40_001, minPassingTests: 4_999 })).toEqual([
      "gzip.. is 40001, over its ceiling of 40000",
      "minPassingTests is 4999, under its floor of 5000"
    ]);
    const { bareChunkImports, ...rest } = measured;
    void bareChunkImports;
    expect(overLimits(limits, rest)).toEqual(["bareChunkImports was not measured"]);
  });
});

describe("measurements that are not finite numbers", () => {
  const limits = { gzip: { ".": 40_000 }, accuracy: { de440L1MaxArcsec: 0.02, conformanceMinPass: 639 }, minPassingTests: 5_700 };
  const measured = { "gzip..": 36_000, "accuracy.de440L1MaxArcsec": 0.0126, "accuracy.conformanceMinPass": 639, minPassingTests: 5_800 };

  it("fail the check: a NaN is over no ceiling and under no floor, so it is refused before either comparison", () => {
    expect(overLimits(limits, measured)).toEqual([]);
    expect(overLimits(limits, { ...measured, "accuracy.de440L1MaxArcsec": NaN })).toEqual([
      "accuracy.de440L1MaxArcsec is NaN, not a finite measurement"
    ]);
    expect(overLimits(limits, { ...measured, "accuracy.conformanceMinPass": NaN, "gzip..": Infinity })).toEqual([
      "gzip.. is Infinity, not a finite measurement",
      "accuracy.conformanceMinPass is NaN, not a finite measurement"
    ]);
    const report = { success: true, numPassedTests: 5_800, numFailedTests: 0, numFailedTestSuites: 0, numPendingTests: 0, numTodoTests: 0, testResults: [] };
    const environment = { precisionKernel: false, tz: "2026a", builtAfterRun: true };
    expect(checkProblems({ budgets: limits, measured, report, environment })).toEqual([]);
    expect(checkProblems({ budgets: limits, measured: { ...measured, "accuracy.de440L1MaxArcsec": NaN }, report, environment })).toEqual([
      "accuracy.de440L1MaxArcsec is NaN, not a finite measurement"
    ]);
  });

  it("stop the measurement where a longitude, a latitude or a difference is not finite, which Math.max would carry through", () => {
    expect(Math.max(0.01, NaN)).toBeNaN();
    expect(largestMagnitude(0, [0.01, -0.0126], "L1")).toBe(0.0126);
    expect(() => largestMagnitude(0, [0.01, NaN], "natalChart's Mars for L1-POS-0001")).toThrow(
      "natalChart's Mars for L1-POS-0001 is NaN, not a finite number"
    );
    expect(() => largestMagnitude(NaN, [0.01], "L1")).toThrow(/not a finite number/u);
    expect(() => finite(Infinity, "Ceres at JD 2451545 TT longitude")).toThrow("Ceres at JD 2451545 TT longitude is Infinity, not a finite number");
    expect(() => finite(undefined, "x")).toThrow(/not a finite number/u);
    expect(finite(-0.5, "x")).toBe(-0.5);
  });

  it("are never written into budgets.json by --tighten", () => {
    expect(() => tightened(limits, { ...measured, "accuracy.de440L1MaxArcsec": NaN })).toThrow(/accuracy\.de440L1MaxArcsec is NaN/u);
  });
});

describe("skipped tests in the run's report", () => {
  const root = "/repo/";
  /** A vitest JSON report of `passed` passing tests, with `skipped` as [file, ancestor titles, title, status?]. */
  const reportOf = (passed, skipped) => ({
    success: true,
    numPassedTests: passed,
    numFailedTests: 0,
    numFailedTestSuites: 0,
    numPendingTests: skipped.filter(([, , , status]) => status !== "todo").length,
    numTodoTests: skipped.filter(([, , , status]) => status === "todo").length,
    startTime: 1_000,
    testResults: [
      { name: `${root}src/points.test.ts`, assertionResults: [{ ancestorTitles: ["points"], title: "passes", status: "passed" }] },
      ...skipped.map(([file, ancestorTitles, title, status = "skipped"]) => ({ name: `${root}${file}`, assertionResults: [{ ancestorTitles, title, status }] }))
    ]
  });
  const kernel = SKIPPED_BY_DESIGN[0].describe;
  const BY_DESIGN = [
    ["src/de440-kernel.test.ts", [kernel], "rule (viii): every place within 1e-6 arcsecond of the ERFA chain's, 2,000 rows"],
    ["src/de440-kernel.test.ts", [kernel], "C4: the true node within 1e-6 arcsecond of the chain's at the 200 instants"],
    ["src/de440-kernel.test.ts", [kernel], "C4's control: a node with the frame's rotation added to the velocity is not the oracle's"],
    ["src/geo/zone-history.test.ts", ["the audit's 98-zone divergence list"], "reproduces every segment before 1970 but six, which the reference got otherwise"],
    ["scripts/lite-entry.test.mjs", ["this checkout's build of the lite entry"], "has the four parts"],
    ["scripts/require-esm.test.mjs", ["require() of this checkout's build"], "loads every entry point, each with the names its declarations give"],
    ["scripts/root-isolation.test.mjs", ["the root entry's isolation check"], "passes this checkout's build"],
    ["scripts/root-unchanged.test.mjs", ["the root entry against the carried archive of 3.0.0"], "computes from this checkout's build exactly what the archive computes"]
  ];
  const ci = { precisionKernel: false, tz: "2026a", builtAfterRun: true };
  const limits = { minPassingTests: 5_700 };

  it("lists each skipped, pending and todo test with its file from the repository's root", () => {
    const report = reportOf(10, [["src/a.test.ts", ["a"], "one"], ["src/b.test.ts", [], "two", "todo"], ["src/c.test.ts", ["c", "d"], "three", "pending"]]);
    expect(skippedTests(report, root)).toEqual([
      { file: "src/a.test.ts", ancestors: ["a"], title: "one", status: "skipped" },
      { file: "src/b.test.ts", ancestors: [], title: "two", status: "todo" },
      { file: "src/c.test.ts", ancestors: ["c", "d"], title: "three", status: "pending" }
    ]);
  });

  it("let the skips by design through where their conditions hold, as in CI's engine job", () => {
    expect(reportProblems(reportOf(5_800, BY_DESIGN), ci, root)).toEqual([]);
  });

  it("fail --check on a skipped test that no rule lets through, though the passing tests are over the floor", () => {
    const report = reportOf(5_800, [...BY_DESIGN, ["src/points.test.ts", ["points"], "gives the Vertex"]]);
    const measured = { minPassingTests: report.numPassedTests };
    expect(overLimits(limits, measured)).toEqual([]);
    expect(checkProblems({ budgets: limits, measured, report, environment: ci, root })).toEqual([
      "src/points.test.ts: points > gives the Vertex is skipped, and no rule lets a skip of it through"
    ]);
    // it.skip, it.todo and a test of a block listed by its title elsewhere are all caught.
    const todo = reportOf(5_800, [["src/points.test.ts", ["points"], "gives the East Point", "todo"]]);
    expect(reportProblems(todo, ci, root)).toEqual(["src/points.test.ts: points > gives the East Point is todo, and no rule lets a skip of it through"]);
    const elsewhere = reportOf(5_800, [["src/de440.test.ts", [kernel], "a test of the same title in another file"]]);
    expect(reportProblems(elsewhere, ci, root)).toHaveLength(1);
  });

  it("fail --tighten on an it.skip that no rule lets through: the command exits non-zero before it measures anything, and budgets.json is left as it was", () => {
    const folder = mkdtempSync(join(tmpdir(), "zodiacs-ratchet-"));
    const budgetsBefore = readFileSync(new URL("../budgets.json", import.meta.url), "utf8");
    try {
      // A run of every test file git tracks, which passed, over the floor, with one test of this file under it.skip,
      // which vitest lists as skipped and counts as pending. The command reads names from the repository's root.
      const repository = fileURLToPath(new URL("..", import.meta.url));
      const passes = { ancestorTitles: [], title: "passes", status: "passed" };
      const skip = { ancestorTitles: ["approval"], title: "needs the tag and a person's dated, quoted trailer in one message", status: "skipped" };
      const testResults = trackedTestFiles().map((file) => ({
        name: `${repository}${file}`,
        status: "passed",
        assertionResults: file === "scripts/ratchet.test.mjs" ? [passes, skip] : [passes]
      }));
      const path = join(folder, "vitest-report.json");
      writeFileSync(path, JSON.stringify({ ...reportOf(budgets.minPassingTests + 100, []), numPendingTests: 1, testResults }));
      const run = spawnSync(process.execPath, [fileURLToPath(new URL("./ratchet.mjs", import.meta.url)), "--tighten", "--tests", path], { encoding: "utf8", timeout: 60_000 });
      expect(run.error).toBeUndefined();
      expect(run.status, run.stderr).toBe(1);
      expect(run.stderr).toContain(
        `ratchet failed: ${path} is a report --check refuses, and --tighten needs one it accepts:\n` +
          "- scripts/ratchet.test.mjs: approval > needs the tag and a person's dated, quoted trailer in one message is skipped, and no rule lets a skip of it through\n"
      );
      expect(run.stdout).not.toContain("tightened");
      expect(readFileSync(new URL("../budgets.json", import.meta.url), "utf8")).toBe(budgetsBefore);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("fail a skip by design where its condition does not hold", () => {
    const report = reportOf(5_800, BY_DESIGN);
    const problems = (environment) => reportProblems(report, environment, root);
    expect(problems({ ...ci, precisionKernel: true })).toHaveLength(3);
    expect(problems({ ...ci, precisionKernel: true })[0]).toMatch(/^src\/de440-kernel\.test\.ts: .* is skipped, but its skip is let through only where PRECISION_KERNEL is not set/u);
    expect(problems({ ...ci, tz: "2025c" })).toEqual([
      "src/geo/zone-history.test.ts: the audit's 98-zone divergence list > reproduces every segment before 1970 but six, which the reference got otherwise is skipped, but its skip is let through only where the host's time zone data is not tzdata 2025c"
    ]);
    expect(problems({ ...ci, builtAfterRun: false })).toHaveLength(4);
  });

  it("fail a report whose counts of skipped tests its tests do not account for, or that is not vitest's", () => {
    expect(reportProblems({ ...reportOf(5_800, []), numPendingTests: 2 }, ci, root)).toEqual(["the test report counts 2 skipped or todo tests and lists 0"]);
    expect(reportProblems({ testResults: [] }, ci, root)).toEqual([
      "the test report is not a vitest JSON report: it has no numPassedTests",
      "the test run failed: the report's success is missing, not true",
      "the test report is not a vitest JSON report: it has no numFailedTests",
      "the test report is not a vitest JSON report: it has no numFailedTestSuites"
    ]);
    expect(checkProblems({ budgets: limits, measured: { minPassingTests: 5_800 }, report: undefined, environment: ci, root })).toEqual([
      "minPassingTests needs the test run's report: pass --tests REPORT"
    ]);
  });
});

describe("a report that leaves a test file out", () => {
  const root = "/repo/";
  const tracked = ["scripts/ratchet.test.mjs", "src/geo/points.test.ts", "tests/sky.spec.ts"];
  /** A vitest JSON report of a run that passed, with a result for each of `files` under `at`. */
  const reportOf = (files, at = root) => ({
    success: true,
    numPassedTests: 5_800,
    numFailedTests: 0,
    numFailedTestSuites: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    startTime: 1_000,
    testResults: files.map((file) => ({ name: `${at}${file}`, status: "passed", assertionResults: [{ ancestorTitles: [], title: "passes", status: "passed" }] }))
  });

  it("names each tracked test file the report holds no result for, and none for a run of them all", () => {
    expect(missingTestFiles(reportOf(tracked), tracked, root)).toEqual([]);
    // As where vitest.config.mjs excludes tests/** or the command line names other files.
    expect(missingTestFiles(reportOf(["scripts/ratchet.test.mjs", "src/geo/points.test.ts"]), tracked, root)).toEqual(["tests/sky.spec.ts"]);
    expect(missingTestFiles(reportOf(["tests/sky.spec.ts"]), tracked, root)).toEqual(["scripts/ratchet.test.mjs", "src/geo/points.test.ts"]);
    expect(missingTestFiles({ testResults: [] }, tracked, root)).toEqual(tracked);
    expect(missingTestFiles({}, tracked, root)).toEqual(tracked);
    // A file vitest collected and skipped is in the report, for the skip rules to judge; one git does not track
    // (a new file, or an AppleDouble ._ file of macOS) is not asked for.
    const skipped = reportOf([...tracked, "src/geo/._points.test.ts"]);
    skipped.testResults[1].assertionResults[0].status = "skipped";
    expect(missingTestFiles(skipped, tracked, root)).toEqual([]);
  });

  it("knows a test file as vitest's default include does, and git tracks this one", () => {
    for (const file of ["src/a.test.ts", "scripts/a.test.mjs", "tests/a.spec.ts", "a.test.cjs", "a.test.js", "a.test.mts", "a.spec.tsx"]) {
      expect(TEST_FILE.test(file), file).toBe(true);
    }
    for (const file of ["src/a.ts", "src/test-setup.ts", "src/fixtures/a.test.json", "tools/wheel/selftest.mjs", "a.test.d.ts", "a.test.ts.orig"]) {
      expect(TEST_FILE.test(file), file).toBe(false);
    }
    const files = trackedTestFiles();
    expect(files).toContain("scripts/ratchet.test.mjs");
    expect(files.every((file) => TEST_FILE.test(file))).toBe(true);
  });

  it("makes the command exit non-zero before it measures anything, with --check and with --tighten", () => {
    const folder = mkdtempSync(join(tmpdir(), "zodiacs-ratchet-"));
    const budgetsBefore = readFileSync(new URL("../budgets.json", import.meta.url), "utf8");
    try {
      // A run of every test file git tracks but this one, which passed, over the floor: the command reads names from the repository's root.
      const repository = fileURLToPath(new URL("..", import.meta.url));
      const all = trackedTestFiles();
      expect(missingTestFiles(reportOf(all, repository), all, repository)).toEqual([]);
      const path = join(folder, "vitest-report.json");
      const report = reportOf(all.filter((file) => file !== "scripts/ratchet.test.mjs"), repository);
      writeFileSync(path, JSON.stringify({ ...report, numPassedTests: budgets.minPassingTests + 100 }));
      for (const mode of ["--check", "--tighten"]) {
        const run = spawnSync(process.execPath, [fileURLToPath(new URL("./ratchet.mjs", import.meta.url)), mode, "--tests", path], { encoding: "utf8", timeout: 60_000 });
        expect(run.error).toBeUndefined();
        expect(run.status, run.stderr).toBe(1);
        expect(run.stderr).toContain(`ratchet failed: ${path} holds no result for 1 of the test files git tracks, and ${mode} needs a run of them all:\n- scripts/ratchet.test.mjs\n`);
        expect(run.stdout).not.toContain("ratchet passed");
      }
      expect(readFileSync(new URL("../budgets.json", import.meta.url), "utf8")).toBe(budgetsBefore);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("the report of a failed run", () => {
  const root = "/repo/";
  const ci = { precisionKernel: false, tz: "2026a", builtAfterRun: true };
  const limits = { minPassingTests: 5_700 };
  /** A vitest JSON report of a run that passed 5,800 tests, over the floor, and failed one. */
  const failedRun = {
    success: false,
    numPassedTests: 5_800,
    numFailedTests: 1,
    numFailedTestSuites: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    startTime: 1_000,
    testResults: [
      {
        name: `${root}src/points.test.ts`,
        status: "failed",
        message: "",
        assertionResults: [
          { ancestorTitles: ["points"], title: "passes", status: "passed" },
          { ancestorTitles: ["points"], title: "gives the Vertex", status: "failed" }
        ]
      }
    ]
  };
  const passedRun = { ...failedRun, success: true, numFailedTests: 0, testResults: [{ ...failedRun.testResults[0], status: "passed", assertionResults: [failedRun.testResults[0].assertionResults[0]] }] };

  it("fails --check though the passing tests are over the floor", () => {
    const measured = { minPassingTests: failedRun.numPassedTests };
    expect(overLimits(limits, measured)).toEqual([]);
    expect(checkProblems({ budgets: limits, measured, report: passedRun, environment: ci, root })).toEqual([]);
    expect(checkProblems({ budgets: limits, measured, report: failedRun, environment: ci, root })).toEqual([
      "the test run failed: the report's success is false, not true",
      "the test run failed: the report counts 1 failed tests (numFailedTests)",
      "src/points.test.ts: points > gives the Vertex failed"
    ]);
  });

  it("fails on each sign of a failure alone: success, either count, or a status", () => {
    expect(failuresOf(passedRun, root)).toEqual([]);
    expect(failuresOf({ ...passedRun, success: false }, root)).toEqual(["the test run failed: the report's success is false, not true"]);
    expect(failuresOf({ ...passedRun, numFailedTests: 2 }, root)).toEqual(["the test run failed: the report counts 2 failed tests (numFailedTests)"]);
    // A test file that does not load: vitest counts a failed suite and lists no test of it.
    const unloaded = { name: `${root}src/broken.test.ts`, status: "failed", message: "Failed to load url ./missing.js\nin src/broken.test.ts", assertionResults: [] };
    expect(failuresOf({ ...passedRun, success: false, numFailedTestSuites: 1, testResults: [...passedRun.testResults, unloaded] }, root)).toEqual([
      "the test run failed: the report's success is false, not true",
      "the test run failed: the report counts 1 failed suites (numFailedTestSuites)",
      "src/broken.test.ts failed: Failed to load url ./missing.js"
    ]);
    expect(failuresOf({ ...passedRun, testResults: failedRun.testResults }, root)).toEqual(["src/points.test.ts: points > gives the Vertex failed"]);
    expect(failuresOf({ ...passedRun, success: "true" }, root)).toEqual(['the test run failed: the report\'s success is "true", not true']);
  });

  it("makes the command exit non-zero before it measures anything, with --check and with --tighten", () => {
    const folder = mkdtempSync(join(tmpdir(), "zodiacs-ratchet-"));
    const budgetsBefore = readFileSync(new URL("../budgets.json", import.meta.url), "utf8");
    try {
      const path = join(folder, "vitest-report.json");
      // The command reads names from the repository's root.
      const repository = fileURLToPath(new URL("..", import.meta.url));
      const testResults = failedRun.testResults.map((file) => ({ ...file, name: file.name.replace(root, repository) }));
      writeFileSync(path, JSON.stringify({ ...failedRun, numPassedTests: budgets.minPassingTests + 100, testResults }));
      for (const mode of ["--check", "--tighten"]) {
        const run = spawnSync(process.execPath, [fileURLToPath(new URL("./ratchet.mjs", import.meta.url)), mode, "--tests", path], { encoding: "utf8", timeout: 60_000 });
        expect(run.error).toBeUndefined();
        expect(run.status, run.stderr).toBe(1);
        expect(run.stderr).toContain(`ratchet failed: ${path} is the report of a run that failed, and ${mode} needs one that passed:`);
        expect(run.stderr).toContain("- the test run failed: the report counts 1 failed tests (numFailedTests)");
        expect(run.stderr).toContain("- src/points.test.ts: points > gives the Vertex failed");
        expect(run.stdout).not.toContain("ratchet passed");
      }
      expect(readFileSync(new URL("../budgets.json", import.meta.url), "utf8")).toBe(budgetsBefore);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
