import { describe, expect, it } from "vitest";
import { createAspectSearchPolicy, createCollectionPolicy, evaluateCollectionWith } from "../src/index.js";
import type { AspectLongitudeAt, ClassicalPlanet } from "../src/index.js";
import { collectionFixture, DAY, epoch } from "./collection.fixture.js";

const aspects = createAspectSearchPolicy({ aspects: ["conjunction", "sextile"], orbs: { sextile: 6 },
  horizonDays: 8, stepDays: 0.25, maxSamples: 1 });
const policy = (maxSamples = 200_000) => createCollectionPolicy({ collectors: ["Jupiter", "Saturn"], maxSamples });

describe("collection budgets and consumer validation", () => {
  it("preflights the entire scan and retains current/reception facts on refusal", () => {
    const law = collectionFixture();
    let calls = 0;
    const report = evaluateCollectionWith(() => { calls++; return 0; }, law.fixture, aspects, policy(1));
    expect(report.search).toMatchObject({ status: "refused", reason: "sample-budget", samples: 0 });
    expect(calls).toBe(0);
    expect(report.contacts).toEqual([]);
    expect(report.collections[0]).toMatchObject({ status: "search-refused", completion: null, contactOrder: "not-established" });
    expect(report.collections[0]!.applications.every(row => row.contact === null && row.current.motion === "applying")).toBe(true);
    expect(report.collections[0]!.receptions.find(row => row.host === "Venus")!.dignities).toEqual(["term"]);
  });
  it("counts provider calls across multiple collectors, refuses late atomically and stays inside the horizon", () => {
    const law = collectionFixture({ Jupiter: [t => 219.5 + t / 4, 0.25] });
    let calls = 0;
    const dates: number[] = [], bodies = new Set<ClassicalPlanet>();
    const provider: AspectLongitudeAt = (body, at) => {
      calls++; dates.push(at.getTime()); bodies.add(body);
      return law.longitudeAt(body, at);
    };
    const full = evaluateCollectionWith(provider, law.fixture, aspects, policy());
    expect(full.search.status).toBe("complete");
    expect(full.collections).toHaveLength(2);
    expect(calls).toBe(full.search.samples);
    expect(bodies).toEqual(new Set(["Mars", "Venus", "Jupiter", "Saturn"]));
    expect(Math.min(...dates)).toBe(epoch);
    expect(Math.max(...dates)).toBe(epoch + 8 * DAY);
    calls = 0;
    const limit = full.search.samples - 1;
    const refused = evaluateCollectionWith(provider, law.fixture, aspects, policy(limit));
    expect(refused.search).toMatchObject({ status: "refused", reason: "sample-budget" });
    expect(refused.search.samples).toBeGreaterThan(0);
    expect(refused.search.samples).toBeLessThanOrEqual(limit);
    expect(calls).toBe(refused.search.samples);
    expect(refused.contacts).toEqual([]);
    expect(refused.collections).toHaveLength(2);
    for (const item of refused.collections) {
      expect(item).toMatchObject({ status: "search-refused", completion: null, contactOrder: "not-established" });
      expect(item.applications.every(row => row.contact === null)).toBe(true);
    }
  });
  it("copies each provider Date so mutations cannot alter the other longitude sample", () => {
    const law = collectionFixture();
    const provider: AspectLongitudeAt = (body, at) => {
      const value = law.longitudeAt(body, at);
      at.setTime(0);
      return value;
    };
    expect(evaluateCollectionWith(provider, law.fixture, aspects, policy()).collections[0]!.status).toBe("collection-candidate");
  });
  it("propagates invalid provider values and provider failures", () => {
    const law = collectionFixture();
    for (const value of [-1, 360, NaN, Infinity, null, "0"]) {
      expect(() => evaluateCollectionWith(() => value as number, law.fixture, aspects, policy())).toThrow(RangeError);
    }
    const error = new Error("Provider failure");
    expect(() => evaluateCollectionWith(() => { throw error; }, law.fixture, aspects, policy())).toThrow(error);
    expect(() => evaluateCollectionWith(null as never, law.fixture, aspects, policy())).toThrow(RangeError);
  });
  it("validates each required body once and ignores unselected rows", () => {
    const missing = collectionFixture();
    missing.fixture.chart.bodies = missing.fixture.chart.bodies.filter(row => row.body !== "Saturn");
    expect(() => evaluateCollectionWith(missing.longitudeAt, missing.fixture, aspects, policy())).toThrow(RangeError);
    const duplicate = collectionFixture();
    duplicate.fixture.chart.bodies.push({ ...duplicate.fixture.chart.bodies.find(row => row.body === "Sun")! });
    expect(() => evaluateCollectionWith(duplicate.longitudeAt, duplicate.fixture, aspects, policy())).toThrow(RangeError);
    for (const value of [NaN, Infinity, null, "3"]) {
      const law = collectionFixture();
      law.fixture.chart.bodies.find(row => row.body === "Mars")!.speed = value as number;
      expect(() => evaluateCollectionWith(law.longitudeAt, law.fixture, aspects, policy())).toThrow(RangeError);
    }
    for (const value of [-1, 360, NaN]) {
      const law = collectionFixture();
      law.fixture.chart.bodies.find(row => row.body === "Saturn")!.lon = value;
      expect(() => evaluateCollectionWith(law.longitudeAt, law.fixture, aspects, policy())).toThrow(RangeError);
    }
    const ignore = collectionFixture();
    ignore.fixture.chart.bodies.find(row => row.body === "Mercury")!.lon = NaN;
    expect(evaluateCollectionWith(ignore.longitudeAt, ignore.fixture, aspects, policy()).search.status).toBe("complete");
  });
  it("revalidates aspect snapshots and refuses an unrepresentable horizon even when disabled", () => {
    const law = collectionFixture();
    expect(() => evaluateCollectionWith(law.longitudeAt, law.fixture, { ...aspects, schema: "other" } as never, policy())).toThrow(RangeError);
    const edge = { ...law.fixture, input: { ...law.fixture.input, instant: new Date(8_640_000_000_000_000).toISOString() } };
    expect(() => evaluateCollectionWith(law.longitudeAt, edge, aspects, createCollectionPolicy({ collectionOfLight: false }))).toThrow(RangeError);
  });
});
