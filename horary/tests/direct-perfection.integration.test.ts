import { describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { cast, createAspectSearchPolicy, createDirectPerfectionPolicy, evaluateDirectPerfection } from "../src/index.js";
import { questionInput } from "./fixtures.js";

describe("direct event engine delegation (not independent ephemeris accuracy evidence)", () => {
  it("reuses engine longitude, speed, signs and crossing helpers without recasting or mutating the chart", () => {
    const fixture = cast(questionInput), before = structuredClone(fixture);
    const longitude = vi.spyOn(engine, "bodyLongitude"), speed = vi.spyOn(engine, "longitudeSpeed");
    const crossing = vi.spyOn(engine, "searchLongitudeCrossingsWith"), recast = vi.spyOn(engine, "natalChart");
    const dignity = vi.spyOn(engine, "dignityRulersAt");
    try {
      const report = evaluateDirectPerfection(fixture, createAspectSearchPolicy({ aspects: ["conjunction"], horizonDays: 0.5, maxSamples: 2000 }));
      expect(report.eventSearch).toMatchObject({ status: "complete", clock: "engine-utc-model" });
      expect(report.aspects.search.clock).toBe("engine-utc-model");
      const planets = report.aspects.significators.planets;
      expect(speed).toHaveBeenCalled();
      expect(new Set(speed.mock.calls.map(call => call[0]))).toEqual(new Set(planets.map(row => row.planet)));
      expect(longitude.mock.calls.length + speed.mock.calls.length).toBe(2 * report.aspects.search.samples + report.eventSearch.samples);
      const aspectCalls = planets.length * (planets.length - 1) / 2;
      expect(crossing).toHaveBeenCalledTimes(aspectCalls + planets.length * 13);
      for (const call of crossing.mock.calls) {
        expect(call[3]).toEqual(new Date(report.eventSearch.from));
        expect(call[4]).toEqual(new Date(report.eventSearch.to));
        expect(call[5]!.stepDays).toBe(0.25);
      }
      expect(dignity).toHaveBeenCalled(); // Sign selection and sign evidence delegate to the engine.
      expect(recast).not.toHaveBeenCalled();
      expect(fixture).toEqual(before);
      expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    } finally { longitude.mockRestore(); speed.mockRestore(); crossing.mockRestore(); recast.mockRestore(); dignity.mockRestore(); }
  });

  it("retains engine house selection and fallback with future searches disabled", () => {
    const aspect = createAspectSearchPolicy({ search: false }), direct = createDirectPerfectionPolicy();
    for (const houseSystem of engine.HOUSE_SYSTEMS) {
      const fixture = cast({ ...questionInput, houseSystem });
      const report = evaluateDirectPerfection(fixture, aspect, direct);
      expect(report.aspects.significators.houses).toEqual({ requested: houseSystem, actual: fixture.chart.houses.system });
      expect(report.eventSearch.samples).toBe(0);
    }
    const polar = cast({ ...questionInput, houseSystem: "placidus", location: { latitude: 80, longitude: 34 } });
    expect(evaluateDirectPerfection(polar, aspect).aspects.significators.houses).toEqual({ requested: "placidus", actual: "whole" });
  });
});
