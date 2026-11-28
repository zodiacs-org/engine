import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import * as api from "../src/index.js";
import { buildReport } from "../scripts/validate-references.mjs";
import { renderReport } from "../scripts/validation.mjs";

let report: ReturnType<typeof buildReport>;
beforeAll(() => { report = buildReport(api); }, 60_000);

it("reproduces the committed measured report on its recorded runtime", () => {
  const committed = readFileSync(new URL("../docs/evidence/m10/RESULTS.md", import.meta.url), "utf8");
  // Other supported machines still enforce every numeric result and code/input
  // identity. The recorded environment remains the one that produced the file.
  const recorded = committed.match(/Runtime: Node ([^,]+), ([^,]+), ([^.]+)\./u);
  expect(recorded).not.toBeNull();
  const withRecordedRuntime = { ...report, runtime: { node: recorded![1]!, platform: recorded![2]!, arch: recorded![3]! } };
  expect(renderReport(withRecordedRuntime)).toBe(committed);
});

const plan = JSON.parse(readFileSync(new URL("../references/plan.json", import.meta.url), "utf8")) as {
  cases: { id: string; split: string }[];
  physicalCenterChecks: { bodies: string[]; jdTt: number[] };
};
it("evaluates the entire registered corpus and all reserved center spot checks", () => {
  expect(report.cases.map((item) => item.id)).toEqual(plan.cases.map((item) => item.id));
  expect(report.physicalCenters.map((item: { body: string; jdTt: number }) => [item.body, item.jdTt])).toEqual(
    plan.physicalCenterChecks.bodies.flatMap((body) => plan.physicalCenterChecks.jdTt.map((jd) => [body, jd]))
  );
});

// Ordinary independent assertions remain red when a budget fails. No skips,
// expected-failure markers, changed budgets or stored engine expectations.
describe("reserved independent acceptance", () => {
  for (const entry of plan.cases.filter((item) => item.split === "held-out")) {
    it(`${entry.id} completes with unique matching and no missing or extra events`, () => {
      const item = report.cases.find((row) => row.id === entry.id)!;
      expect(item.search.status).toBe("complete");
      expect(item.counts.missed).toBe(0);
      expect(item.counts.extra).toBe(0);
      expect(item.counts.ambiguous).toBe(0);
      expect(item.counts.matched).toBe(item.counts.reference);
    });
    for (const check of ["eventTimeSeconds", "eventDistanceKm", "sameTtDistanceKm",
      "sameTtRadialSpeedKmPerSecond", "sameTtOrbitalSpeedKmPerSecond", "numerical-interval", "sample-completion"]) {
      it(`${entry.id} meets ${check}`, () => {
        const item = report.cases.find((row) => row.id === entry.id)!;
        // A failed search cannot turn missing event metrics into passing checks.
        if (check.startsWith("event") || check === "numerical-interval") {
          expect(item.search.status).toBe("complete");
          expect(item.counts.matched).toBe(item.counts.reference);
        }
        expect(item.failures.filter((failure) => failure.check === check)).toEqual([]);
      });
    }
  }
});
