// scripts/ratchet.mjs's rules, on budgets, commit messages and test reports
// made up here: what weakens a budget, what counts as a person's approval,
// what --tighten may do, the verdict on a range, which skipped tests --check
// lets through, and that a measurement which is not a finite number fails it.
// The measurements themselves need dist/ and are made by
// `node scripts/ratchet.mjs --check` after the build.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  APPROVAL_TRAILER,
  BUDGET_TAG,
  GUARDED_FILES,
  GUARDRAILS_TAG,
  SKIPPED_BY_DESIGN,
  approved,
  checkProblems,
  finite,
  guardVerdict,
  largestMagnitude,
  limitsOf,
  overLimits,
  reportProblems,
  skippedTests,
  tightened,
  weakenings
} from "./ratchet.mjs";

const budgets = JSON.parse(readFileSync(new URL("../budgets.json", import.meta.url), "utf8"));
const approval = 'Approved-by: A Person, 2026-01-02: "Raise the root budget for the new point."';

describe("budgets.json", () => {
  it("bounds every measurement the ratchet makes, and the root's natalChart under 40,000 bytes gzipped", () => {
    expect(Object.keys(limitsOf(budgets)).sort()).toEqual(
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
    expect(budgets.gzip["."]).toBeLessThanOrEqual(40_000);
    expect(budgets.gzip["./core"]).toBeLessThanOrEqual(40_000);
    expect(budgets.gzip["./minor-bodies"]).toBeLessThanOrEqual(140_000);
    expect(budgets.gzip["./minor-bodies:chiron"]).toBeLessThanOrEqual(15_000);
    expect(budgets.bareChunkImports).toBe(0);
    expect(budgets.accuracy).toEqual({ de440L1MaxArcsec: 0.02, minorBodiesOosMaxArcsec: 1, conformanceMinPass: 639 });
    expect(budgets.minPassingTests % 100).toBe(0);
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
    const report = { numPassedTests: 5_800, numPendingTests: 0, numTodoTests: 0, testResults: [] };
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
    numPassedTests: passed,
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
    expect(reportProblems({ testResults: [] }, ci, root)).toEqual(["the test report is not a vitest JSON report: it has no numPassedTests"]);
    expect(checkProblems({ budgets: limits, measured: { minPassingTests: 5_800 }, report: undefined, environment: ci, root })).toEqual([
      "minPassingTests needs the test run's report: pass --tests REPORT"
    ]);
  });
});

