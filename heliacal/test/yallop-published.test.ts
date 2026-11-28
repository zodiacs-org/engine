import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { crescentGeometry } from "../src/crescent-geometry.js";
import { crescentEvents, evaluateYallop, sunBodyGeometry, yallopBestTime } from "../src/index.js";
import type { CrescentEventsResult } from "../src/index.js";
import reference from "./fixtures/yallop-published.json" with { type: "json" };

// The gates and source facts were written before the implementation was run.
// This checks published calculated examples, not an observed-sighting corpus.
const POLICY = { model: "yallop-1997/1", lastAcceptedCategory: "B", maxElongationDeg: 30 } as const;
const LAUNCHER = fileURLToPath(new URL("../bin/heliacal.mjs", import.meta.url));
type Group = typeof reference.groups[number];
type Row = Group["rows"][number];

function nearTime(actual: string | Date, expected: string, seconds: number): void {
  const ms = typeof actual === "string" ? Date.parse(actual) : actual.getTime();
  expect(Math.abs(ms - Date.parse(expected)) / 1000).toBeLessThanOrEqual(seconds);
}

function publishedSearchChecks(result: CrescentEventsResult, group: Group): void {
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error("Expected complete crescent search");
  for (const row of group.rows) {
    const matches = result.opportunities.filter((opportunity) =>
      opportunity.status === "evaluated" && opportunity.bestTime.at.startsWith(row.date));
    expect(matches).toHaveLength(1);
    const actual = matches[0]!;
    if (actual.status !== "evaluated") throw new Error("Expected evaluated opportunity");
    nearTime(actual.sunCrossing.at, row.sunset, reference.tolerance.engineTimeAbsoluteSeconds);
    nearTime(actual.moonCrossing.at, row.moonset, reference.tolerance.engineTimeAbsoluteSeconds);
    nearTime(actual.bestTime.at, row.bestTime, reference.tolerance.engineTimeAbsoluteSeconds);
    expect(actual.criterion.category).toBe(row.category);
    expect(actual.criterion.model).toBe(POLICY.model);
    expect(actual.period).toBe("evening");
    expect(actual.bestTime.rule).toBe("evening-four-ninths");
    expect(actual.passesSelection).toBe(row.category === "A" || row.category === "B");
    for (const event of [actual.sunCrossing, actual.moonCrossing]) {
      expect(event.position).toMatchObject({ receipt: {
        schema: "zodiacs.calc-receipt.v1", engine: { name: "@zodiacs/engine" }
      } });
    }
  }
  const publishedPassing = group.rows.filter((row) => row.category === "A" || row.category === "B");
  expect(publishedPassing).toHaveLength(1);
  expect(result.events).toHaveLength(1);
  const first = result.events[0]!;
  expect(first.appearance).toBe("first-evening");
  expect(first.receiptScope).toBe("positions");
  nearTime(first.at, publishedPassing[0]!.bestTime, reference.tolerance.engineTimeAbsoluteSeconds);
  expect(first.bracket.before.status).toBe("evaluated");
  expect(first.bracket.after.status).toBe("evaluated");
  expect(first.bracket.before.passesSelection).toBe(false);
  expect(first.bracket.after.passesSelection).toBe(true);
}

describe("Yallop TN69 Appendix A published London predictions", () => {
  it("records the primary source, its independent calculated status and predeclared gates", () => {
    expect(reference.source.kind).toBe("published-calculated-example;not-observed-sightings");
    expect(reference.source.locator).toContain("Appendix A");
    expect(reference.tolerance.declaredBeforeImplementationComparison).toBe(true);
  });

  it.each(reference.groups.flatMap((group) => group.rows))(
    "agrees with the printed best time from rounded horizon times on $date", (row: Row) => {
      nearTime(yallopBestTime(row.sunset, row.moonset).at, row.bestTime,
        reference.tolerance.roundedSourceBestTimeAbsoluteSeconds);
    }
  );

  it.each(reference.groups.flatMap((group) => group.rows))(
    "recovers published category $category from engine geometry at the printed time on $date", (row: Row) => {
      const geometry = sunBodyGeometry("Moon", row.bestTime, reference.observer);
      expect(geometry.status).toBe("ok");
      if (geometry.status !== "ok") throw new Error("Expected supported lunar geometry");
      expect(evaluateYallop(crescentGeometry(geometry).yallop).category).toBe(row.category);
    }
  );

  it.each(reference.groups)("reproduces the published transition through the library for $id", (group) => {
    publishedSearchChecks(crescentEvents(reference.observer, group.from, group.to, POLICY), group);
  });

  it.each(reference.groups)("reproduces the published transition through the CLI for $id", (group) => {
    const child = spawnSync(process.execPath, [LAUNCHER, "crescent",
      "--latitude", String(reference.observer.latitude), "--longitude", String(reference.observer.longitude),
      "--height", String(reference.observer.height), "--from", group.from, "--to", group.to,
      "--model", POLICY.model, "--last-category", POLICY.lastAcceptedCategory,
      "--max-elongation-deg", String(POLICY.maxElongationDeg)
    ], { cwd: tmpdir(), encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
    expect(child.error).toBeUndefined();
    expect(child.signal).toBeNull();
    expect(child.status, child.stderr).toBe(0);
    expect(child.stderr).toBe("");
    const document = JSON.parse(child.stdout) as { schema: string; command: string; result: CrescentEventsResult };
    expect(document).toMatchObject({ schema: "heliacal-cli/1", command: "crescent" });
    // JSON dates are strings at runtime; nearTime deliberately accepts both.
    publishedSearchChecks(document.result, group);
  }, 30_000);
});
