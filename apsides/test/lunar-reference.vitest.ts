import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { sampleDistance, searchLunarApsides } from "../src/index.js";

interface ReferenceSample {
  jdTt: number;
  distanceKm: number;
  radialSpeedKmPerSecond: number;
  velocityKmPerSecond: [number, number, number];
}

interface ReferenceEvent {
  id: string;
  kind: "perigee" | "apogee";
  jdTt: number;
  distanceKm: number;
  samples: Record<"before" | "at" | "after", ReferenceSample>;
}

interface LunarFixture {
  case: { id: string; split: string; body: string; fromTt: string; toTt: string };
  grid: [number, number, number, number][];
  events: ReferenceEvent[];
}

interface LunarBudget {
  eventTimeSeconds: number;
  distanceKm: number;
  radialSpeedKmPerSecond: number;
  orbitalSpeedKmPerSecond: number;
}

const directory = new URL("../references/", import.meta.url);
const plan = JSON.parse(readFileSync(new URL("plan.json", directory), "utf8")) as {
  budgets: { Moon: LunarBudget };
  solverNumericalBudgetSeconds: number;
};
// The path is deliberately fixed. This milestone must not collect or evaluate
// any held-out case. Reference/source integrity has its own offline tests.
const fixture = JSON.parse(readFileSync(
  new URL("fixtures/dev-moon-2000.json", directory), "utf8"
)) as LunarFixture;
const budget = plan.budgets.Moon;
const fromJdTt = fixture.grid[0]![0];
const toJdTt = fixture.grid[fixture.grid.length - 1]![0];
let result: ReturnType<typeof searchLunarApsides>;

// Independent evidence is limited to this registered development case:
// geocentric Moon, JPL Horizons DE441, 2000-01-01 through 2000-02-01 TT.
// Counts refer to extrema witnessed by that fixture's range-rate grid.
describe("lunar search against dev-moon-2000 Horizons references", () => {
  beforeAll(() => {
    expect(fixture.case).toMatchObject({
      id: "dev-moon-2000", split: "development", body: "Moon",
      fromTt: "2000-01-01", toTt: "2000-02-01"
    });
    result = searchLunarApsides({
      from: { jd: fromJdTt, scale: "tt" },
      to: { jd: toJdTt, scale: "tt" }
    });
    expect(result.status).toBe("complete");
  });

  it("has no missing or extra reference events and preserves their chronological kinds", () => {
    expect(result.events).toHaveLength(fixture.events.length);
    expect(result.events.map(({ kind }) => kind)).toEqual(fixture.events.map(({ kind }) => kind));
    expect(new Set(fixture.events.map(({ kind }) => kind))).toEqual(new Set(["perigee", "apogee"]));
    for (let index = 0; index < result.events.length; index += 1) {
      const event = result.events[index]!;
      expect(event.body).toBe("Moon");
      expect(event.instant.jdTt).toBeGreaterThan(fromJdTt);
      expect(event.instant.jdTt).toBeLessThanOrEqual(toJdTt);
      if (index > 0) {
        expect(event.instant.jdTt).toBeGreaterThan(result.events[index - 1]!.instant.jdTt);
      }
      // Pairing is unique within the preregistered time allowance. This rejects
      // a duplicate event that could otherwise replace a missing neighbor.
      const matches = fixture.events.filter((reference) => reference.kind === event.kind &&
        Math.abs(reference.jdTt - event.instant.jdTt) * 86_400 <= budget.eventTimeSeconds);
      expect(matches, `Unique independent match for ${event.kind}`).toHaveLength(1);
    }
  });

  it.each(fixture.events.map((reference, index) => ({ reference, index })))(
    "meets the registered event-time and event-distance budgets for $reference.id",
    ({ reference, index }) => {
      const event = result.events[index];
      expect(event, `Missing ${reference.id}`).toBeDefined();
      if (!event) throw new Error(`Missing ${reference.id}`);
      expect(event.kind).toBe(reference.kind);
      expect(Math.abs(event.instant.jdTt - reference.jdTt) * 86_400).toBeLessThanOrEqual(
        budget.eventTimeSeconds
      );
      // This compares distances at the two independently located extrema.
      // Same-instant distance agreement is checked separately below.
      expect(Math.abs(event.distanceKm - reference.distanceKm)).toBeLessThanOrEqual(budget.distanceKm);
      expect((event.refinement.upper.jdTt - event.refinement.lower.jdTt) * 86_400)
        .toBeLessThanOrEqual(plan.solverNumericalBudgetSeconds);
      expect(event.instant.jdTt).toBeGreaterThanOrEqual(event.refinement.lower.jdTt);
      expect(event.instant.jdTt).toBeLessThanOrEqual(event.refinement.upper.jdTt);
      expect(event.receipt.request).toMatchObject({
        body: "Moon", center: "geocentric", frame: "equatorial-j2000",
        flags: { correction: "geometric" }
      });
      expect(event.instant).toEqual(event.receipt.instants[0]);
    }
  );

  it.each(fixture.events)(
    "meets same-TT distance and speed budgets before, at and after $id",
    (reference) => {
      for (const point of ["before", "at", "after"] as const) {
        const independent = reference.samples[point];
        const actual = sampleDistance("Moon", { jd: independent.jdTt, scale: "tt" });
        expect(actual.status, `${reference.id} ${point}`).toBe("ok");
        if (actual.status !== "ok") throw new Error(`Reference instant refused: ${reference.id} ${point}`);
        expect(actual.instant.jdTt).toBe(independent.jdTt);
        expect(Math.abs(actual.distanceKm - independent.distanceKm)).toBeLessThanOrEqual(budget.distanceKm);
        expect(Math.abs(actual.radialSpeedKmPerSecond - independent.radialSpeedKmPerSecond))
          .toBeLessThanOrEqual(budget.radialSpeedKmPerSecond);
        const independentOrbitalSpeed = Math.hypot(...independent.velocityKmPerSecond);
        expect(Math.abs(actual.orbitalSpeedKmPerSecond - independentOrbitalSpeed))
          .toBeLessThanOrEqual(budget.orbitalSpeedKmPerSecond);
        if (point !== "at") {
          expect(Math.sign(actual.radialSpeedKmPerSecond)).toBe(Math.sign(independent.radialSpeedKmPerSecond));
        }
      }
    }
  );
});
