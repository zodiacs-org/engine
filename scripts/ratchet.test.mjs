// scripts/ratchet.mjs's rules, on budgets and commit messages made up here: what
// weakens a budget, what counts as a person's approval, what --tighten may do,
// and the verdict on a range. The measurements themselves need dist/ and are
// made by `node scripts/ratchet.mjs --check` after the build.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  APPROVAL_TRAILER,
  BUDGET_TAG,
  GUARDED_FILES,
  GUARDRAILS_TAG,
  approved,
  guardVerdict,
  limitsOf,
  overLimits,
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
