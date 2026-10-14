import { describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { cast, createAspectSearchPolicy, evaluateSignificatorAspects } from "../src/index.js";
import { questionInput } from "./fixtures.js";

describe("aspect engine delegation (not independent ephemeris accuracy evidence)", () => {
  it("delegates exact classification and bounded relative crossings on both moving planets", () => {
    const result = cast(questionInput);
    const before = structuredClone(result);
    const classifySpy = vi.spyOn(engine, "findConfiguredAspects");
    const crossingSpy = vi.spyOn(engine, "searchLongitudeCrossingsWith");
    const longitudeSpy = vi.spyOn(engine, "bodyLongitude");
    const castSpy = vi.spyOn(engine, "natalChart");
    try {
      const report = evaluateSignificatorAspects(result, createAspectSearchPolicy({ horizonDays: 0.5, maxSamples: 2000 }));
      expect(report.search).toMatchObject({ status: "complete", clock: "engine-utc-model", from: "2000-01-01T12:00:00.000Z",
        to: "2000-01-02T00:00:00.000Z" });
      // Each unique physical pair is classified for each aspect, with broad, eligible and exact policies.
      expect(classifySpy).toHaveBeenCalledTimes(report.aspects.length * 3);
      expect(crossingSpy).toHaveBeenCalledTimes(report.aspects.reduce((sum, row) => sum + (row.angle === 0 || row.angle === 180 ? 1 : 2), 0));
      expect(longitudeSpy).toHaveBeenCalledTimes(report.search.samples * 2);
      expect(castSpy).not.toHaveBeenCalled();
      for (const call of crossingSpy.mock.calls) {
        expect(call[3]).toEqual(new Date(report.search.from));
        expect(call[4]).toEqual(new Date(report.search.to));
        expect(call[5]!.stepDays).toBe(0.25);
        expect(call[5]!.maxSamples).toBeLessThanOrEqual(2000);
      }
      const selected = report.significators.planets.map(row => row.planet);
      expect(new Set(longitudeSpy.mock.calls.map(call => call[0]))).toEqual(new Set(selected));
      for (const row of report.aspects) {
        const a = result.chart.bodies.find(body => body.body === row.a.planet)!;
        const b = result.chart.bodies.find(body => body.body === row.b.planet)!;
        expect(row.current).toMatchObject({ aLongitude: a.lon, bLongitude: b.lon, aSpeed: a.speed, bSpeed: b.speed });
      }
      expect(result).toEqual(before);
    } finally { classifySpy.mockRestore(); crossingSpy.mockRestore(); longitudeSpy.mockRestore(); castSpy.mockRestore(); }
  });

  it("supports actual house systems and fallback with search disabled", () => {
    const policy = createAspectSearchPolicy({ search: false });
    for (const houseSystem of engine.HOUSE_SYSTEMS) {
      const result = cast({ ...questionInput, houseSystem });
      const report = evaluateSignificatorAspects(result, policy);
      expect(report.significators.houses).toEqual({ requested: houseSystem, actual: result.chart.houses.system });
      expect(report.search.samples).toBe(0);
      expect(report.aspects.every(row => row.contacts.length === 0)).toBe(true);
    }
    const result = cast({ ...questionInput, location: { latitude: 80, longitude: 34 }, houseSystem: "placidus" });
    expect(evaluateSignificatorAspects(result, policy).significators.houses).toEqual({ requested: "placidus", actual: "whole" });
  });

  it("calls no ephemeris for an empty aspect selection or budget preflight refusal", () => {
    const result = cast(questionInput);
    const longitudeSpy = vi.spyOn(engine, "bodyLongitude");
    try {
      expect(evaluateSignificatorAspects(result, createAspectSearchPolicy({ aspects: [] })).search.status).toBe("disabled");
      expect(evaluateSignificatorAspects(result, createAspectSearchPolicy({ maxSamples: 1 })).search.status).toBe("refused");
      expect(longitudeSpy).not.toHaveBeenCalled();
    } finally { longitudeSpy.mockRestore(); }
  });
});
