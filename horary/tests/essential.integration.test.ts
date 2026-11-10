import { describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { cast, createEssentialPolicy, evaluateEssentialCondition } from "../src/index.js";
import { questionInput } from "./fixtures.js";

describe("essential engine delegation (not independent accuracy evidence)", () => {
  it("delegates condition, directional reception, mutual reception and sect to the existing engine APIs", () => {
    const result = cast({ ...questionInput, question: { ...questionInput.question, naturalSignificators: ["Sun", "Mercury", "Saturn"] } });
    const essential = vi.spyOn(engine, "essentialDignities");
    const mutual = vi.spyOn(engine, "mutualReceptions");
    const sectSpy = vi.spyOn(engine, "sectOf");
    const policy = createEssentialPolicy();
    try {
      const before = structuredClone(result);
      const report = evaluateEssentialCondition(result, policy);
      const sun = result.chart.bodies.find(({ body }) => body === "Sun")!;
      expect(sectSpy).toHaveBeenCalledTimes(1);
      expect(sectSpy).toHaveBeenCalledWith(result.chart.angles.asc, sun.lon);
      for (const condition of report.conditions) {
        const lon = result.chart.bodies.find(({ body }) => body === condition.planet)!.lon;
        expect(essential).toHaveBeenCalledWith(condition.planet, lon, report.sect.value);
      }
      for (const direction of report.directionalReceptions) {
        expect(essential).toHaveBeenCalledWith(direction.host, direction.guestLongitude, report.sect.value);
      }
      expect(mutual).toHaveBeenCalledTimes(1);
      expect(mutual).toHaveBeenCalledWith(report.conditions.map(({ planet, lon }) => ({ body: planet, lon })), {
        dignities: policy.receptionDignities, sect: report.sect.value
      });
      expect(result).toEqual(before);
    } finally { essential.mockRestore(); mutual.mockRestore(); sectSpy.mockRestore(); }
  });

  it("uses the Ascendant for sect under every engine house system, including differing first cusps", () => {
    for (const houseSystem of engine.HOUSE_SYSTEMS) {
      const result = cast({ ...questionInput, houseSystem });
      const report = evaluateEssentialCondition(result);
      expect(report.sect.ascendant).toBe(result.chart.angles.asc);
      expect(report.significators.houses.actual).toBe(result.chart.houses.system);
    }
    const fallback = cast({ ...questionInput, location: { latitude: 80, longitude: 34 }, houseSystem: "placidus" });
    expect(fallback.chart.flags).toContain("polar-fallback");
    expect(evaluateEssentialCondition(fallback).significators.houses).toEqual({ requested: "placidus", actual: "whole" });
  });
});
