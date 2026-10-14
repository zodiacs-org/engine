import { describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { cast, createAspectSearchPolicy, createCollectionPolicy, evaluateCollection } from "../src/index.js";
import type { ClassicalPlanet } from "../src/index.js";
import { questionInput } from "./fixtures.js";
import { collectionFixture } from "./collection.fixture.js";

describe("collection engine delegation, without independent ephemeris accuracy claims", () => {
  it("uses the production wrapper and engine aspect, crossing and reception APIs without recasting", () => {
    const law = collectionFixture(), before = structuredClone(law.fixture);
    const longitude = vi.spyOn(engine, "bodyLongitude").mockImplementation((body, at) => law.longitudeAt(body as ClassicalPlanet, at));
    const crossing = vi.spyOn(engine, "searchLongitudeCrossingsWith"), aspect = vi.spyOn(engine, "findConfiguredAspects");
    const dignity = vi.spyOn(engine, "essentialDignities"), recast = vi.spyOn(engine, "natalChart");
    try {
      const report = evaluateCollection(law.fixture, createAspectSearchPolicy({ aspects: ["conjunction", "sextile"],
        orbs: { sextile: 6 }, horizonDays: 8 }), createCollectionPolicy({ collectors: ["Saturn"] }));
      expect(report.collections[0]!.status).toBe("collection-candidate");
      expect(report.search.clock).toBe("engine-utc-model");
      expect(longitude.mock.calls.length).toBe(report.search.samples);
      expect(crossing).toHaveBeenCalled();
      expect(aspect).toHaveBeenCalled();
      expect(dignity).toHaveBeenCalled();
      expect(recast).not.toHaveBeenCalled();
      for (const call of crossing.mock.calls) {
        expect(call[3]).toEqual(new Date(report.search.from));
        expect(call[4]).toEqual(new Date(report.search.to));
      }
      expect(law.fixture).toEqual(before);
    } finally { longitude.mockRestore(); crossing.mockRestore(); aspect.mockRestore(); dignity.mockRestore(); recast.mockRestore(); }
  });
  it("exercises real engine motion on a synthetic instant under explicit broad test orbs", () => {
    const fixture = cast(questionInput);
    const report = evaluateCollection(fixture, createAspectSearchPolicy({ horizonDays: 0.5,
      orbs: { conjunction: 180, sextile: 180, square: 180, trine: 180, opposition: 180 },
      luminaryOrbs: { conjunction: 180, sextile: 180, square: 180, trine: 180, opposition: 180 } }));
    expect(report.assessment).toBe("patterns-found");
    expect(report.search).toMatchObject({ status: "complete", clock: "engine-utc-model" });
    expect(report.search.samples).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
  it("preserves all engine house systems and polar fallback", () => {
    const aspectPolicy = createAspectSearchPolicy({ search: false });
    for (const houseSystem of engine.HOUSE_SYSTEMS) {
      const fixture = cast({ ...questionInput, houseSystem });
      const report = evaluateCollection(fixture, aspectPolicy);
      expect(report.significators.houses).toEqual({ requested: houseSystem, actual: fixture.chart.houses.system });
      expect(report.search.samples).toBe(0);
    }
    const polar = cast({ ...questionInput, houseSystem: "placidus", location: { latitude: 80, longitude: 34 } });
    expect(evaluateCollection(polar, aspectPolicy).significators.houses).toEqual({ requested: "placidus", actual: "whole" });
  });
});
