import { describe, expect, it } from "vitest";
import { createAspectSearchPolicy, createTranslationPolicy, evaluateTranslationWith } from "../src/index.js";
import type { AspectLongitudeAt, ClassicalPlanet } from "../src/index.js";
import { DAY, epoch, translationFixture } from "./translation.fixture.js";

const aspects = createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays: 5, stepDays: 0.25 });
const policy = (maxSamples = 200_000) => createTranslationPolicy({ carriers: ["Moon", "Mercury"], lookbackDays: 2, maxSamples });

describe("global translation provider budgets and invalid inputs", () => {
  it("refuses before sampling if all coarse scans cannot fit, preserving current facts", () => {
    const law = translationFixture();
    let calls = 0;
    const report = evaluateTranslationWith(() => { calls++; return 0; }, law.fixture, aspects, policy(1));
    expect(report.search).toMatchObject({ status: "refused", reason: "sample-budget", samples: 0 });
    expect(calls).toBe(0);
    expect(report.translations[0]).toMatchObject({ status: "search-refused", separationContact: null, applicationContact: null,
      intervening: [], current: { separation: { observation: { motion: "separating" } }, application: { observation: { motion: "applying" } } } });
    expect(report.contacts).toEqual([]);
  });
  it("counts both longitude calls per relative sample, stays inside the window and refuses late atomically", () => {
    const law = translationFixture("Moon", { Mercury: [t => 13.25 + 3 * t, 3] });
    let calls = 0;
    const dates: number[] = [], bodies = new Set<ClassicalPlanet>();
    const provider: AspectLongitudeAt = (body, at) => {
      calls++; dates.push(at.getTime()); bodies.add(body);
      return law.longitudeAt(body, at);
    };
    const full = evaluateTranslationWith(provider, law.fixture, aspects, policy());
    expect(full.search.status).toBe("complete");
    expect(calls).toBe(full.search.samples);
    expect(full.contacts.length).toBeGreaterThan(0);
    expect(bodies).toEqual(new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"]));
    expect(Math.min(...dates)).toBe(epoch - 2 * DAY);
    expect(Math.max(...dates)).toBe(epoch + 5 * DAY);
    calls = 0;
    const limit = full.search.samples - 1;
    const refused = evaluateTranslationWith(provider, law.fixture, aspects, policy(limit));
    expect(refused.search).toMatchObject({ status: "refused", reason: "sample-budget" });
    expect(refused.search.samples).toBeGreaterThan(0);
    expect(refused.search.samples).toBeLessThanOrEqual(limit);
    expect(calls).toBe(refused.search.samples);
    expect(refused.contacts).toEqual([]);
    expect(refused.translations).toHaveLength(2);
    for (const item of refused.translations) expect(item).toMatchObject({ status: "search-refused", separationContact: null, applicationContact: null, intervening: [] });
  });
  it("honours its own documented provider budget regardless of the aspect report's separate budget", () => {
    const law = translationFixture();
    const report = evaluateTranslationWith(law.longitudeAt, law.fixture, createAspectSearchPolicy({ aspects: ["conjunction"],
      horizonDays: 5, stepDays: 0.25, maxSamples: 1 }), policy());
    expect(report.search.status).toBe("complete");
    expect(report.translations[0]!.status).toBe("translation-candidate");
  });
  it("propagates provider errors and invalid longitudes rather than turning them into absent contacts", () => {
    const law = translationFixture();
    for (const value of [-1, 360, NaN, Infinity, null, "0"]) {
      expect(() => evaluateTranslationWith(() => value as number, law.fixture, aspects, policy())).toThrow(RangeError);
    }
    const failure = new RangeError("Outside provider span");
    expect(() => evaluateTranslationWith(() => { throw failure; }, law.fixture, aspects, policy())).toThrow(failure);
    expect(() => evaluateTranslationWith(null as never, law.fixture, aspects, policy())).toThrow(RangeError);
  });
  it("rejects missing and duplicate classical rows and invalid current speeds/longitudes", () => {
    const bad = translationFixture();
    bad.fixture.chart.bodies = bad.fixture.chart.bodies.filter(row => row.body !== "Jupiter");
    expect(() => evaluateTranslationWith(bad.longitudeAt, bad.fixture, aspects, policy())).toThrow(RangeError);
    const duplicate = translationFixture();
    duplicate.fixture.chart.bodies.push({ ...duplicate.fixture.chart.bodies.find(row => row.body === "Jupiter")! });
    expect(() => evaluateTranslationWith(duplicate.longitudeAt, duplicate.fixture, aspects, policy())).toThrow(RangeError);
    for (const value of [NaN, Infinity, null, "3"]) {
      const law = translationFixture();
      law.fixture.chart.bodies.find(row => row.body === "Moon")!.speed = value as number;
      expect(() => evaluateTranslationWith(law.longitudeAt, law.fixture, aspects, policy())).toThrow(RangeError);
    }
    for (const value of [-1, 360, NaN]) {
      const law = translationFixture();
      law.fixture.chart.bodies.find(row => row.body === "Jupiter")!.lon = value;
      expect(() => evaluateTranslationWith(law.longitudeAt, law.fixture, aspects, policy())).toThrow(RangeError);
    }
  });
  it("rejects unrepresentable past/future windows even if translation is disabled", () => {
    for (const instant of [-8_640_000_000_000_000, 8_640_000_000_000_000]) {
      const law = translationFixture();
      const fixture = { ...law.fixture, input: { ...law.fixture.input, instant: new Date(instant).toISOString() } };
      expect(() => evaluateTranslationWith(law.longitudeAt, fixture, aspects, createTranslationPolicy({ translationOfLight: false }))).toThrow(RangeError);
    }
  });
});
