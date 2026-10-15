import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { calendarTtToJd, collectCase, gridForCase, rateBrackets, subdivideBracket, validateReferencePlan } from "../scripts/collect-references.mjs";
import { horizonsParameters, horizonsUrl } from "../scripts/horizons.mjs";
import { DISTANCE_TARGETS } from "../src/targets.js";
import type { ApsisBody } from "../src/targets.js";

interface ReferenceCase {
  id: string;
  split: "development" | "held-out";
  body: ApsisBody;
  fromTt: string;
  toTt: string;
  stepDays: number;
}
interface Target {
  targetId: string;
  centerId: string;
  referencePoint: "body-center" | "system-barycenter";
  physicalCenterId?: string;
}
interface Budget {
  eventTimeSeconds: number;
  distanceKm: number;
  radialSpeedKmPerSecond: number;
  orbitalSpeedKmPerSecond: number;
}
interface Plan {
  schema: string;
  timeScale: string;
  solverNumericalBudgetSeconds: number;
  reference: {
    endpoint: string;
    finalBracketSeconds: number;
    maxBatchEpochs: number;
    maxResponseBytes: number;
    subdivisions: number;
  };
  budgets: Record<ApsisBody, Budget>;
  targets: Record<ApsisBody, Target>;
  cases: ReferenceCase[];
}
interface Source {
  url: string;
  params: Record<string, string>;
  responseSha256: string;
  retrievedAt: string;
  header: {
    apiVersion: string;
    target: { id: string; name: string; solution: string };
    center: { id: string; name: string; solution: string };
    units: string;
    frame: string;
    timeScale: string;
    correction: string;
  };
}
interface Sample {
  jdTt: number;
  distanceKm: number;
  radialSpeedKmPerSecond: number;
  positionKm: [number, number, number];
  velocityKmPerSecond: [number, number, number];
  sourceIndex: number;
}
interface ReferenceEvent {
  id: string;
  kind: "perigee" | "apogee" | "perihelion" | "aphelion";
  jdTt: number;
  distanceKm: number;
  orbitalSpeedKmPerSecond: number;
  radialSpeedKmPerSecond: number;
  bracketSeconds: number;
  discoveryBracket: [number, number];
  samples: Record<"before" | "left" | "at" | "right" | "after", Sample>;
}
interface Fixture {
  schema: string;
  planSha256: string;
  case: ReferenceCase;
  target: Target;
  gridColumns: string[];
  grid: [number, number, number, number][];
  events: ReferenceEvent[];
  sources: Source[];
}
interface Manifest {
  schema: string;
  planSha256: string;
  fixtures: { path: string; sha256: string }[];
}

const directory = new URL("../references/", import.meta.url);
const planBytes = readFileSync(new URL("plan.json", directory));
const plan = JSON.parse(planBytes.toString("utf8")) as Plan;
const planSha256 = createHash("sha256").update(planBytes).digest("hex");
const bodies = Object.keys(DISTANCE_TARGETS) as ApsisBody[];
const development = plan.cases.filter((entry) => entry.split === "development");
const heldOut = plan.cases.filter((entry) => entry.split === "held-out");
const epochToleranceDays = 2e-9;

function requestedEpochs(source: Source): number[] {
  return source.params.TLIST!.split(" ").map((value) => Number(value.slice(1, -1)));
}

function verifyProvenance(fixture: Fixture, jdTt: number, sourceIndex: number): void {
  expect(Number.isInteger(sourceIndex)).toBe(true);
  expect(sourceIndex).toBeGreaterThanOrEqual(0);
  expect(sourceIndex).toBeLessThan(fixture.sources.length);
  const source = fixture.sources[sourceIndex]!;
  expect(requestedEpochs(source).some((jd) => Math.abs(jd - jdTt) <= epochToleranceDays)).toBe(true);
}

function verifySample(fixture: Fixture, sample: Sample): void {
  expect(Number.isFinite(sample.jdTt)).toBe(true);
  expect(sample.positionKm).toHaveLength(3);
  expect(sample.velocityKmPerSecond).toHaveLength(3);
  expect([...sample.positionKm, ...sample.velocityKmPerSecond, sample.distanceKm,
    sample.radialSpeedKmPerSecond].every(Number.isFinite)).toBe(true);
  expect(sample.distanceKm).toBeGreaterThan(0);
  const range = Math.hypot(...sample.positionKm);
  const speed = Math.hypot(...sample.velocityKmPerSecond);
  const radial = sample.positionKm.reduce((sum, coordinate, index) =>
    sum + coordinate / range * sample.velocityKmPerSecond[index]!, 0);
  // Decimal-column consistency only; these allowances are not physical errors.
  expect(Math.abs(range - sample.distanceKm)).toBeLessThanOrEqual(Math.max(1e-8, range * 5e-14));
  expect(Math.abs(radial - sample.radialSpeedKmPerSecond)).toBeLessThanOrEqual(Math.max(1e-12, speed * 5e-14));
  expect(Math.abs(sample.radialSpeedKmPerSecond)).toBeLessThanOrEqual(speed + 1e-12);
  verifyProvenance(fixture, sample.jdTt, sample.sourceIndex);
}

describe("preregistered reference scope", () => {
  it("names the same target geometry as the library, without computing engine positions", () => {
    expect(plan.schema).toBe("apsides-reference-plan/1");
    expect(plan.timeScale).toBe("TT");
    expect(Object.keys(plan.targets).sort()).toEqual([...bodies].sort());
    for (const body of bodies) {
      const target = DISTANCE_TARGETS[body];
      expect(plan.targets[body]).toMatchObject({
        targetId: target.horizonsTarget,
        centerId: target.horizonsCenter,
        referencePoint: target.referencePoint
      });
      if (target.referencePoint === "system-barycenter") {
        expect(plan.targets[body].physicalCenterId).toBe(`${target.horizonsTarget}99`);
      }
    }
  });

  it("registers positive physical acceptance limits separately from numerical targets", () => {
    expect(plan.reference.finalBracketSeconds).toBe(1);
    expect(plan.solverNumericalBudgetSeconds).toBe(1);
    expect(Object.keys(plan.budgets).sort()).toEqual([...bodies].sort());
    expect(Object.fromEntries(Object.entries(plan.budgets).map(([body, budget]) => [body, [
      budget.eventTimeSeconds, budget.distanceKm, budget.radialSpeedKmPerSecond, budget.orbitalSpeedKmPerSecond
    ]]))).toEqual({
      Moon: [120, 30, 0.001, 0.001], Mercury: [1200, 5000, 0.005, 0.005],
      Venus: [21600, 5000, 0.005, 0.005], Earth: [3600, 5000, 0.005, 0.005],
      Mars: [7200, 10000, 0.005, 0.005], Jupiter: [86400, 100000, 0.01, 0.01],
      Saturn: [172800, 200000, 0.01, 0.01], Uranus: [604800, 300000, 0.01, 0.01],
      Neptune: [2592000, 500000, 0.01, 0.01], Pluto: [604800, 100000, 0.005, 0.005]
    });
    for (const budget of Object.values(plan.budgets)) {
      expect(Object.keys(budget).sort()).toEqual([
        "distanceKm", "eventTimeSeconds", "orbitalSpeedKmPerSecond", "radialSpeedKmPerSecond"
      ]);
      for (const value of Object.values(budget)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
      expect(budget.eventTimeSeconds).toBeGreaterThan(plan.solverNumericalBudgetSeconds);
    }
  });

  it("reserves disjoint development and held-out windows for each body", () => {
    expect(plan.cases.filter(({ body }) => body === "Pluto")).toMatchObject([
      { split: "development", fromTt: "1805-01-01", toTt: "1900-01-01" },
      { split: "held-out", fromTt: "1900-01-01", toTt: "2195-01-01" }
    ]);
    expect(new Set(plan.cases.map((entry) => entry.id)).size).toBe(plan.cases.length);
    expect(plan.cases.every((entry) => entry.split === "development" || entry.split === "held-out")).toBe(true);
    for (const body of bodies) {
      const training = development.filter((entry) => entry.body === body);
      const reserved = heldOut.filter((entry) => entry.body === body);
      expect(training.length).toBeGreaterThan(0);
      expect(reserved.length).toBeGreaterThan(0);
      for (const entry of [...training, ...reserved]) {
        expect(calendarTtToJd(entry.fromTt)).toBeLessThan(calendarTtToJd(entry.toTt));
        expect(entry.stepDays).toBeGreaterThan(0);
        expect(Number.isFinite(entry.stepDays)).toBe(true);
      }
      for (const first of training) for (const second of reserved) {
        expect(calendarTtToJd(first.toTt) <= calendarTtToJd(second.fromTt) ||
          calendarTtToJd(second.toTt) <= calendarTtToJd(first.fromTt)).toBe(true);
      }
    }
  });

  it("refuses collection of a reserved case before any reference data access", async () => {
    await expect(collectCase(plan, planSha256, heldOut[0]!, { offline: true }))
      .rejects.toThrow("Held-out cases are reserved until M10.");
  });

  it.each([
    { maxBatchEpochs: 0 }, { maxBatchEpochs: 33 }, { maxBatchEpochs: NaN },
    { finalBracketSeconds: NaN }, { finalBracketSeconds: undefined }, { finalBracketSeconds: 0 },
    { subdivisions: 1 }, { subdivisions: Infinity }, { maxRefinementRounds: 0 },
    { maxResponseBytes: 2_000_000 }, { units: "AU-D" }, { frame: "ECLIPTIC" },
    { correction: "LT" }, { endpoint: "https://example.com" }
  ])("rejects invalid reference controls before data access: %j", async (change) => {
    const invalid = { ...plan, reference: { ...plan.reference, ...change } };
    expect(() => validateReferencePlan(invalid)).toThrow(RangeError);
    await expect(collectCase(invalid, planSha256, development[0]!, { offline: true })).rejects.toThrow(RangeError);
  });
});

describe("frozen independent development references", () => {
  let manifest: Manifest;
  const fixtures = new Map<string, Fixture>();

  beforeAll(() => {
    manifest = JSON.parse(readFileSync(new URL("manifest.json", directory), "utf8")) as Manifest;
    for (const item of manifest.fixtures) {
      expect(item.path).toMatch(/^fixtures\/dev-[a-z0-9-]+\.json$/u);
      const bytes = readFileSync(new URL(item.path, directory));
      expect(bytes.length).toBeLessThan(plan.reference.maxResponseBytes);
      expect(item.sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(item.sha256);
      const fixture = JSON.parse(bytes.toString("utf8")) as Fixture;
      expect(fixtures.has(fixture.case.id)).toBe(false);
      fixtures.set(fixture.case.id, fixture);
    }
  });

  it("binds every development fixture to the exact plan and excludes reserved fixtures", () => {
    expect(manifest.schema).toBe("apsides-reference-manifest/1");
    expect(manifest.planSha256).toBe(planSha256);
    const expectedPaths = development.map((entry) => `fixtures/${entry.id}.json`).sort();
    expect(manifest.fixtures.map((item) => item.path).sort()).toEqual(expectedPaths);
    expect(readdirSync(fileURLToPath(new URL("fixtures/", directory))).sort())
      .toEqual(development.map((entry) => `${entry.id}.json`).sort());
    expect([...fixtures.keys()].sort()).toEqual(development.map((entry) => entry.id).sort());
    for (const entry of heldOut) expect(fixtures.has(entry.id)).toBe(false);
  });

  it.each(development)("preserves complete discovery and request evidence for $id", (entry) => {
    const fixture = fixtures.get(entry.id)!;
    expect(fixture.schema).toBe("apsides-horizons-reference/1");
    expect(fixture.planSha256).toBe(planSha256);
    expect(fixture.case).toEqual(entry);
    expect(fixture.target).toEqual(plan.targets[entry.body]);
    expect(fixture.gridColumns).toEqual(["jdTt", "distanceKm", "radialSpeedKmPerSecond", "sourceIndex"]);
    const grid = gridForCase(entry);
    expect(fixture.grid).toHaveLength(grid.length);
    expect(fixture.sources.length).toBeGreaterThan(0);
    expect(new Set(fixture.sources.map((source) => source.url)).size).toBe(fixture.sources.length);
    for (const source of fixture.sources) {
      const requested = requestedEpochs(source);
      expect(requested.length).toBeGreaterThan(0);
      expect(requested.length).toBeLessThanOrEqual(plan.reference.maxBatchEpochs);
      expect(source.params).toEqual(horizonsParameters(fixture.target.targetId, fixture.target.centerId, requested));
      expect(source.url).toBe(horizonsUrl(source.params));
      expect(new URL(source.url).origin + new URL(source.url).pathname).toBe(plan.reference.endpoint);
      expect(source.responseSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(new Date(source.retrievedAt).toISOString()).toBe(source.retrievedAt);
      expect(source.header).toMatchObject({
        apiVersion: "1.2", target: { id: fixture.target.targetId },
        center: { id: fixture.target.centerId.slice(4) },
        units: "KM-S", frame: "ICRF", timeScale: "TT", correction: "NONE"
      });
      expect(source.header).not.toHaveProperty("raw");
      for (const body of [source.header.target, source.header.center]) {
        expect(body.name.trim().length).toBeGreaterThan(0);
        expect(body.solution.trim().length).toBeGreaterThan(0);
      }
      expect(source.header.target).toEqual(fixture.sources[0]!.header.target);
      expect(source.header.center).toEqual(fixture.sources[0]!.header.center);
    }
    for (const [index, row] of fixture.grid.entries()) {
      expect(row).toHaveLength(4);
      expect(row.every(Number.isFinite)).toBe(true);
      expect(Math.abs(row[0] - grid[index]!)).toBeLessThanOrEqual(epochToleranceDays);
      if (index > 0) expect(row[0]).toBeGreaterThan(fixture.grid[index - 1]![0]);
      expect(row[1]).toBeGreaterThan(0);
      expect(row[2]).not.toBe(0);
      verifyProvenance(fixture, row[0], row[3]);
    }
  });

  it.each(development)("accounts for every coarse turn and confirms refined extrema for $id", (entry) => {
    const fixture = fixtures.get(entry.id)!;
    const discovered = rateBrackets(fixture.grid.map(([jdTt, distanceKm, radialSpeedKmPerSecond]) =>
      ({ jdTt, distanceKm, radialSpeedKmPerSecond })));
    expect(fixture.events).toHaveLength(discovered.length);
    expect(new Set(fixture.events.map((event) => event.id)).size).toBe(fixture.events.length);
    for (const [index, event] of fixture.events.entries()) {
      const coarse = discovered[index]!;
      const { before, left, at, right, after } = event.samples;
      const direction = coarse.turn === "minimum" ? 1 : -1;
      expect(event.discoveryBracket).toEqual([coarse.left.jdTt, coarse.right.jdTt]);
      expect(event.kind).toBe(entry.body === "Moon"
        ? (direction === 1 ? "perigee" : "apogee")
        : (direction === 1 ? "perihelion" : "aphelion"));
      expect(left.jdTt).toBeGreaterThanOrEqual(coarse.left.jdTt);
      expect(right.jdTt).toBeLessThanOrEqual(coarse.right.jdTt);
      expect(before.jdTt).toBeLessThan(left.jdTt);
      expect(left.jdTt).toBeLessThanOrEqual(at.jdTt);
      expect(at.jdTt).toBeLessThanOrEqual(right.jdTt);
      expect(right.jdTt).toBeLessThan(after.jdTt);
      expect(event.bracketSeconds).toBe((right.jdTt - left.jdTt) * 86_400);
      expect(event.bracketSeconds).toBeGreaterThan(0);
      expect(event.bracketSeconds).toBeLessThanOrEqual(plan.reference.finalBracketSeconds);
      expect(Math.abs(at.jdTt - (left.jdTt + right.jdTt) / 2)).toBeLessThanOrEqual(epochToleranceDays);
      const probeDays = entry.stepDays / plan.reference.subdivisions;
      expect(Math.abs(at.jdTt - before.jdTt - probeDays)).toBeLessThanOrEqual(epochToleranceDays);
      expect(Math.abs(after.jdTt - at.jdTt - probeDays)).toBeLessThanOrEqual(epochToleranceDays);
      expect(direction * left.radialSpeedKmPerSecond).toBeLessThan(0);
      expect(direction * right.radialSpeedKmPerSecond).toBeGreaterThan(0);
      expect(direction * before.radialSpeedKmPerSecond).toBeLessThan(0);
      expect(direction * after.radialSpeedKmPerSecond).toBeGreaterThan(0);
      expect(direction * (before.distanceKm - at.distanceKm)).toBeGreaterThan(0);
      expect(direction * (after.distanceKm - at.distanceKm)).toBeGreaterThan(0);
      expect(Math.abs(at.radialSpeedKmPerSecond)).toBeLessThanOrEqual(
        Math.max(Math.abs(left.radialSpeedKmPerSecond), Math.abs(right.radialSpeedKmPerSecond))
      );
      for (const sample of Object.values(event.samples)) verifySample(fixture, sample);
      expect(event.jdTt).toBe(at.jdTt);
      expect(event.distanceKm).toBe(at.distanceKm);
      expect(event.radialSpeedKmPerSecond).toBe(at.radialSpeedKmPerSecond);
      expect(event.orbitalSpeedKmPerSecond).toBe(Math.hypot(...at.velocityKmPerSecond));
      expect(event.jdTt).toBeGreaterThan(calendarTtToJd(entry.fromTt));
      expect(event.jdTt).toBeLessThanOrEqual(calendarTtToJd(entry.toTt));
      if (index > 0) expect(event.jdTt).toBeGreaterThan(fixture.events[index - 1]!.jdTt);
    }
  });
});

describe("independent reference helper arithmetic", () => {
  it.each([
    ["1970-01-01", 2_440_587.5], ["2000-01-01", 2_451_544.5],
    ["2000-02-29", 2_451_603.5], ["1900-03-01", 2_415_079.5]
  ] as const)("converts the Gregorian TT label %s without a UTC offset", (label, jd) => {
    expect(calendarTtToJd(label)).toBe(jd);
  });

  it.each(["2000-2-01", "2001-02-29", "1900-02-29", "2000-04-31", "2000-01-01T00:00:00Z", "", null, 10])(
    "rejects malformed or nonexistent TT date %s", (label) => {
      expect(() => calendarTtToJd(label)).toThrow(RangeError);
    }
  );

  it("includes an exact stop once, including the final partial step", () => {
    expect(gridForCase({ fromTt: "2000-01-01", toTt: "2000-01-04", stepDays: 2 }))
      .toEqual([2_451_544.5, 2_451_546.5, 2_451_547.5]);
    expect(gridForCase({ fromTt: "2000-01-01", toTt: "2000-01-02", stepDays: 0.5 }))
      .toEqual([2_451_544.5, 2_451_545, 2_451_545.5]);
  });

  it.each([0, -1, NaN, Infinity, 0.00001])("rejects invalid or oversized discovery step %s", (stepDays) => {
    expect(() => gridForCase({ fromTt: "2000-01-01", toTt: "2000-01-02", stepDays })).toThrow(RangeError);
  });

  it.each(["1999-12-31", "2000-01-01"])("rejects nonincreasing discovery windows ending %s", (toTt) => {
    expect(() => gridForCase({ fromTt: "2000-01-01", toTt, stepDays: 1 })).toThrow(RangeError);
  });

  it("classifies both signs of rate turns and retains all neighboring turns", () => {
    const rows = [-2, -1, 1, 2, -0.5].map((radialSpeedKmPerSecond, jdTt) => ({ jdTt, radialSpeedKmPerSecond }));
    expect(rateBrackets(rows)).toEqual([
      { left: rows[1], right: rows[2], turn: "minimum" },
      { left: rows[3], right: rows[4], turn: "maximum" }
    ]);
    expect(rateBrackets([])).toEqual([]);
    expect(rateBrackets(rows.slice(0, 1))).toEqual([]);
    expect(rateBrackets(rows.slice(0, 2))).toEqual([]);
  });

  it.each([0, -0])("refuses exact rate zero %s instead of losing or classifying an ambiguous event", (zero) => {
    expect(() => rateBrackets([
      { jdTt: 0, radialSpeedKmPerSecond: -1 }, { jdTt: 1, radialSpeedKmPerSecond: zero },
      { jdTt: 2, radialSpeedKmPerSecond: 1 }
    ])).toThrow(/Exact zero/u);
  });

  it.each([
    [{ jdTt: NaN, radialSpeedKmPerSecond: 1 }],
    [{ jdTt: 1, radialSpeedKmPerSecond: Infinity }],
    [{ jdTt: 1, radialSpeedKmPerSecond: -1 }, { jdTt: 1, radialSpeedKmPerSecond: 1 }],
    [{ jdTt: 2, radialSpeedKmPerSecond: -1 }, { jdTt: 1, radialSpeedKmPerSecond: 1 }]
  ])("rejects invalid or unordered rate rows %j", (...rows) => {
    expect(() => rateBrackets(rows)).toThrow(RangeError);
  });

  it("subdivides only the interior of a bracket", () => {
    expect(subdivideBracket({ left: { jdTt: 2 }, right: { jdTt: 10 } }, 4)).toEqual([4, 6, 8]);
    expect(subdivideBracket({ left: { jdTt: -2 }, right: { jdTt: 2 } }, 2)).toEqual([0]);
  });

  it.each([0, 1, 1.5, 33, NaN, Infinity])("rejects invalid subdivision count %s", (count) => {
    expect(() => subdivideBracket({ left: { jdTt: 0 }, right: { jdTt: 1 } }, count)).toThrow(RangeError);
  });

  it.each([[1, 1], [2, 1], [NaN, 1], [0, Infinity]])("rejects invalid bracket endpoints %s, %s", (left, right) => {
    expect(() => subdivideBracket({ left: { jdTt: left }, right: { jdTt: right } }, 4)).toThrow(RangeError);
  });
});
