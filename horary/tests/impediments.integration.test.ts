import { describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { cast, createAspectSearchPolicy, createImpedimentPolicy, evaluateImpediments } from "../src/index.js";
import { questionInput } from "./fixtures.js";

describe("impediment engine delegation, not independent ephemeris accuracy", () => {
  it("reuses exact aspect decisions, relative crossings and station helpers without recasting", () => {
    const fixture = cast(questionInput), before = structuredClone(fixture);
    const longitude = vi.spyOn(engine, "bodyLongitude"), speed = vi.spyOn(engine, "longitudeSpeed");
    const crossing = vi.spyOn(engine, "searchLongitudeCrossingsWith"), recast = vi.spyOn(engine, "natalChart");
    const exact = vi.spyOn(engine, "findConfiguredAspects");
    try {
      const orbs = Object.fromEntries(engine.ASPECT_TYPES.map(type => [type, 180]));
      const report = evaluateImpediments(fixture, createAspectSearchPolicy({ horizonDays: 0.5, orbs, luminaryOrbs: orbs }),
        createImpedimentPolicy({ thirdPlanets: ["Jupiter", "Saturn"] }));
      expect(report.assessment).toBe("applications-found");
      expect(report.search).toMatchObject({ status: "complete", clock: "engine-utc-model" });
      expect(report.motion.aspects.search.clock).toBe("engine-utc-model");
      expect(report.motion.eventSearch).toMatchObject({ status: "complete", clock: "engine-utc-model" });
      expect(longitude.mock.calls.length + speed.mock.calls.length)
        .toBe(2 * report.motion.aspects.search.samples + report.motion.eventSearch.samples + report.search.samples);
      expect(speed).toHaveBeenCalled();
      expect(crossing).toHaveBeenCalled();
      expect(exact).toHaveBeenCalled();
      expect(recast).not.toHaveBeenCalled();
      for (const call of crossing.mock.calls) {
        expect(call[3]).toEqual(new Date(report.search.from));
        expect(call[4]).toEqual(new Date(report.search.to));
      }
      expect(fixture).toEqual(before);
      expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    } finally { longitude.mockRestore(); speed.mockRestore(); crossing.mockRestore(); recast.mockRestore(); exact.mockRestore(); }
  });
  it("preserves actual engine houses and polar fallback when searching is disabled", () => {
    const aspectPolicy = createAspectSearchPolicy({ search: false });
    for (const houseSystem of engine.HOUSE_SYSTEMS) {
      const fixture = cast({ ...questionInput, houseSystem });
      const report = evaluateImpediments(fixture, aspectPolicy);
      expect(report.motion.aspects.significators.houses).toEqual({ requested: houseSystem, actual: fixture.chart.houses.system });
      expect(report.search.samples).toBe(0);
      expect(report.motion.eventSearch.samples).toBe(0);
    }
    const fixture = cast({ ...questionInput, houseSystem: "placidus", location: { latitude: 80, longitude: 34 } });
    expect(evaluateImpediments(fixture, aspectPolicy).motion.aspects.significators.houses).toEqual({ requested: "placidus", actual: "whole" });
  });
});
