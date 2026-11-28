import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { PLANETARY_BODIES, sampleDistance, searchPlanetaryApsides } from "../src/index.js";
import type { PlanetaryBody } from "../src/index.js";

interface ReferenceSample {
  jdTt: number;
  distanceKm: number;
  radialSpeedKmPerSecond: number;
  velocityKmPerSecond: [number, number, number];
}

interface ReferenceEvent {
  id: string;
  kind: "perihelion" | "aphelion";
  jdTt: number;
  distanceKm: number;
  samples: Record<"before" | "at" | "after", ReferenceSample>;
}

interface ReferenceCase {
  id: string;
  split: string;
  body: string;
  fromTt: string;
  toTt: string;
  stepDays: number;
}

interface PlanetaryFixture {
  case: ReferenceCase;
  target: {
    targetId: string;
    centerId: string;
    referencePoint: "body-center" | "system-barycenter";
  };
  grid: [number, number, number, number][];
  events: ReferenceEvent[];
}

interface ReferenceBudget {
  eventTimeSeconds: number;
  distanceKm: number;
  radialSpeedKmPerSecond: number;
  orbitalSpeedKmPerSecond: number;
}

const directory = new URL("../references/", import.meta.url);
const plan = JSON.parse(readFileSync(new URL("plan.json", directory), "utf8")) as {
  budgets: Record<PlanetaryBody, ReferenceBudget>;
  cases: ReferenceCase[];
  solverNumericalBudgetSeconds: number;
};

// Fixed development paths prevent a later held-out fixture from entering these
// tuning checks through directory discovery. Source integrity is tested apart.
const developmentCases = [
  { body: "Mercury", id: "dev-mercury-2000" },
  { body: "Venus", id: "dev-venus-2000" },
  { body: "Earth", id: "dev-earth-2000" },
  { body: "Mars", id: "dev-mars-2000" },
  { body: "Jupiter", id: "dev-jupiter-2000" },
  { body: "Saturn", id: "dev-saturn-1980" },
  { body: "Uranus", id: "dev-uranus-1880" },
  { body: "Neptune", id: "dev-neptune-1805" },
  { body: "Pluto", id: "dev-pluto-1805" }
] as const satisfies readonly { body: PlanetaryBody; id: string }[];

it("uses every registered planetary development case without evaluating held-out cases", () => {
  expect(developmentCases.map(({ body }) => body)).toEqual(PLANETARY_BODIES);
  expect(developmentCases.map(({ id }) => id)).toEqual(plan.cases
    .filter(({ split, body }) => split === "development" && body !== "Moon")
    .map(({ id }) => id));
});

for (const { body, id } of developmentCases) {
  const fixture = JSON.parse(readFileSync(
    new URL(`fixtures/${id}.json`, directory), "utf8"
  )) as PlanetaryFixture;
  const budget = plan.budgets[body];
  const fromJdTt = fixture.grid[0]![0];
  const toJdTt = fixture.grid[fixture.grid.length - 1]![0];
  let result: ReturnType<typeof searchPlanetaryApsides>;

  // Each count describes turns witnessed on this fixture's registered Horizons
  // range-rate grid, not proof of continuous completeness or physical-center
  // coverage where the reference target is a planetary system barycenter.
  describe(`heliocentric ${body} search against ${id} Horizons references`, () => {
    beforeAll(() => {
      expect(fixture.case).toEqual(plan.cases.find((entry) => entry.id === id));
      expect(fixture.case).toMatchObject({ id, body, split: "development" });
      result = searchPlanetaryApsides(body, {
        from: { jd: fromJdTt, scale: "tt" },
        to: { jd: toJdTt, scale: "tt" }
      });
      expect(result.status, `${id}: ${result.status === "refused" ? result.reason : "complete"}`)
        .toBe("complete");
    }, 30_000);

    it("has no missing or extra reference events and preserves their chronological kinds", () => {
      expect(result.events).toHaveLength(fixture.events.length);
      expect(result.events.map(({ kind }) => kind)).toEqual(fixture.events.map(({ kind }) => kind));
      for (let index = 0; index < result.events.length; index += 1) {
        const event = result.events[index]!;
        expect(event.body).toBe(body);
        expect(event.instant.jdTt).toBeGreaterThan(fromJdTt);
        expect(event.instant.jdTt).toBeLessThanOrEqual(toJdTt);
        if (index > 0) {
          expect(event.instant.jdTt).toBeGreaterThan(result.events[index - 1]!.instant.jdTt);
        }
        const matches = fixture.events.filter((reference) => reference.kind === event.kind &&
          Math.abs(reference.jdTt - event.instant.jdTt) * 86_400 <= budget.eventTimeSeconds);
        expect(matches, `Unique independent match for ${id} ${event.kind}`).toHaveLength(1);
      }
    });

    it.each(fixture.events.map((reference, index) => ({ reference, index })))(
      "meets the registered event-time budget with numerical witnesses and receipts for $reference.id",
      ({ reference, index }) => {
        const event = result.events[index];
        expect(event, `Missing ${reference.id}`).toBeDefined();
        if (!event) throw new Error(`Missing ${reference.id}`);
        expect(event.kind).toBe(reference.kind);
        expect(Math.abs(event.instant.jdTt - reference.jdTt) * 86_400, `${reference.id} event time`)
          .toBeLessThanOrEqual(budget.eventTimeSeconds);
        expect((event.refinement.upper.jdTt - event.refinement.lower.jdTt) * 86_400)
          .toBeLessThanOrEqual(plan.solverNumericalBudgetSeconds);
        expect(event.instant.jdTt).toBeGreaterThanOrEqual(event.refinement.lower.jdTt);
        expect(event.instant.jdTt).toBeLessThanOrEqual(event.refinement.upper.jdTt);
        expect(event.target).toEqual({
          body, center: "heliocentric", referencePoint: fixture.target.referencePoint,
          horizonsTarget: fixture.target.targetId, horizonsCenter: fixture.target.centerId
        });
        expect(event.receipt.request).toMatchObject({
          body, center: "heliocentric", frame: "equatorial-j2000",
          flags: { correction: "geometric", speeds: true, cartesian: true }
        });
        expect(event.instant).toEqual(event.receipt.instants[0]);
      }
    );

    it.each(fixture.events.map((reference, index) => ({ reference, index })))(
      "meets the registered event-distance budget for $reference.id",
      ({ reference, index }) => {
        const event = result.events[index];
        expect(event, `Missing ${reference.id}`).toBeDefined();
        if (!event) throw new Error(`Missing ${reference.id}`);
        expect(event.kind).toBe(reference.kind);
        // Event distances are compared at independently located instants.
        // Same-TT distance and speed agreement is tested separately below.
        expect(Math.abs(event.distanceKm - reference.distanceKm), `${reference.id} event distance`)
          .toBeLessThanOrEqual(budget.distanceKm);
      }
    );
  });

  // These independent sampler checks still run if the search refuses its
  // numerical refinement, so a solver failure cannot hide ephemeris errors.
  describe(`heliocentric ${body} samples against ${id} Horizons references`, () => {
    it.each(fixture.events)(
      "meets same-TT distance and speed budgets before, at and after $id",
      (reference) => {
        for (const point of ["before", "at", "after"] as const) {
          const independent = reference.samples[point];
          const actual = sampleDistance(body, { jd: independent.jdTt, scale: "tt" });
          const context = `${reference.id} ${point}`;
          expect(actual.status, context).toBe("ok");
          if (actual.status !== "ok") throw new Error(`Reference instant refused: ${context}`);
          expect(actual.instant.jdTt).toBe(independent.jdTt);
          expect.soft(Math.abs(actual.distanceKm - independent.distanceKm), `${context} distance`)
            .toBeLessThanOrEqual(budget.distanceKm);
          expect.soft(Math.abs(actual.radialSpeedKmPerSecond - independent.radialSpeedKmPerSecond),
            `${context} radial speed`).toBeLessThanOrEqual(budget.radialSpeedKmPerSecond);
          const independentOrbitalSpeed = Math.hypot(...independent.velocityKmPerSecond);
          expect.soft(Math.abs(actual.orbitalSpeedKmPerSecond - independentOrbitalSpeed), `${context} total speed`)
            .toBeLessThanOrEqual(budget.orbitalSpeedKmPerSecond);
        }
      }
    );
  });
}
