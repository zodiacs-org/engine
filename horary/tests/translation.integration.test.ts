import { describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { cast, createAspectSearchPolicy, createTranslationPolicy, evaluateTranslation } from "../src/index.js";
import type { ClassicalPlanet } from "../src/index.js";
import { questionInput } from "./fixtures.js";
import { translationFixture } from "./translation.fixture.js";

describe("translation engine delegation, without independent ephemeris accuracy claims", () => {
  it("delegates real cast geometry, motion classification, roots and reception without recasting", () => {
    const fixture = cast(questionInput), before = structuredClone(fixture);
    const longitude = vi.spyOn(engine, "bodyLongitude"), crossing = vi.spyOn(engine, "searchLongitudeCrossingsWith");
    const classification = vi.spyOn(engine, "findConfiguredAspects"), dignities = vi.spyOn(engine, "essentialDignities");
    const recast = vi.spyOn(engine, "natalChart");
    try {
      // Broad explicit orbs exercise integration; they are a test choice, not a traditional allowance.
      const report = evaluateTranslation(fixture, createAspectSearchPolicy({
        orbs: { conjunction: 180, sextile: 180, square: 180, trine: 180, opposition: 180 },
        luminaryOrbs: { conjunction: 180, sextile: 180, square: 180, trine: 180, opposition: 180 }, horizonDays: 0.5 }), createTranslationPolicy({ lookbackDays: 0.5 }));
      expect(report.assessment).toBe("patterns-found");
      expect(report.search).toMatchObject({ status: "complete", clock: "engine-utc-model" });
      expect(longitude.mock.calls.length).toBe(report.search.samples);
      expect(crossing).toHaveBeenCalled();
      expect(classification).toHaveBeenCalled();
      expect(dignities).toHaveBeenCalled();
      expect(recast).not.toHaveBeenCalled();
      for (const call of crossing.mock.calls) {
        expect(call[3]).toEqual(new Date(report.search.from));
        expect(call[4]).toEqual(new Date(report.search.to));
      }
      expect(fixture).toEqual(before);
      expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    } finally { longitude.mockRestore(); crossing.mockRestore(); classification.mockRestore(); dignities.mockRestore(); recast.mockRestore(); }
  });
  it("uses the same production wrapper on a controlled provider to exercise known contact ordering", () => {
    const law = translationFixture(), longitude = vi.spyOn(engine, "bodyLongitude").mockImplementation((body, at) => law.longitudeAt(body as ClassicalPlanet, at));
    try {
      const report = evaluateTranslation(law.fixture, createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays: 5 }),
        createTranslationPolicy({ carriers: ["Moon"], lookbackDays: 2 }));
      expect(report.translations[0]!.status).toBe("translation-candidate");
      expect(report.search.clock).toBe("engine-utc-model");
      expect(longitude.mock.calls.length).toBe(report.search.samples);
    } finally { longitude.mockRestore(); }
  });
  it("preserves every engine house system and polar fallback when searching is disabled", () => {
    const aspectPolicy = createAspectSearchPolicy({ search: false });
    for (const houseSystem of engine.HOUSE_SYSTEMS) {
      const fixture = cast({ ...questionInput, houseSystem });
      const report = evaluateTranslation(fixture, aspectPolicy);
      expect(report.significators.houses).toEqual({ requested: houseSystem, actual: fixture.chart.houses.system });
      expect(report.search.samples).toBe(0);
    }
    const polar = cast({ ...questionInput, houseSystem: "placidus", location: { latitude: 80, longitude: 34 } });
    expect(evaluateTranslation(polar, aspectPolicy).significators.houses).toEqual({ requested: "placidus", actual: "whole" });
  });
});
