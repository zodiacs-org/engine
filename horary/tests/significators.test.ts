import { describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { normalizeHoraryInput, selectSignificators } from "../src/index.js";
import type { HoraryCast, HouseSignificator, QuestionType } from "../src/index.js";
import { questionInput, schematicChart } from "./fixtures.js";

// These literal expectations are worked from Ptolemy I.17, not engine output.
// See fixtures.md for the sign intervals and each role-overlap derivation.
const domiciles = [
  [0, "aries", "Mars"], [30, "taurus", "Venus"], [60, "gemini", "Mercury"],
  [90, "cancer", "Moon"], [120, "leo", "Sun"], [150, "virgo", "Mercury"],
  [180, "libra", "Venus"], [210, "scorpio", "Mars"], [240, "sagittarius", "Jupiter"],
  [270, "capricorn", "Saturn"], [300, "aquarius", "Saturn"], [330, "pisces", "Jupiter"]
] as const;

function schematicCast(question: QuestionType = questionInput.question): HoraryCast {
  const chart = schematicChart();
  if (!chart.houses || !chart.angles) throw new Error("The schematic fixture must have houses and angles.");
  return {
    schema: "horary.cast/v1",
    input: normalizeHoraryInput({ ...questionInput, question, houseSystem: "whole" }),
    chart: { ...chart, houses: chart.houses, angles: chart.angles }
  };
}

describe("traditional significator selection", () => {
  it("selects house rulers and the Moon with sourced explanations", () => {
    const selected = selectSignificators(schematicCast());
    expect(selected.schema).toBe("horary.significators/v1");
    expect(selected.questionId).toBe("lost-object");
    expect(selected.houses).toEqual({ requested: "whole", actual: "whole" });
    expect(selected.assignments).toEqual([
      {
        role: "querent", planet: "Mars",
        basis: { kind: "house-cusp", house: 1, longitude: 0, sign: "aries", source: "lilly-house-ruler;ptolemy-domiciles" },
        explanation: expect.stringContaining("Mars rules that sign by domicile")
      },
      {
        role: "quesited", planet: "Venus",
        basis: { kind: "house-cusp", house: 2, longitude: 30, sign: "taurus", source: "lilly-house-ruler;ptolemy-domiciles" },
        explanation: expect.stringContaining("represents the quesited")
      },
      {
        role: "moon", planet: "Moon",
        basis: { kind: "querent-co-significator", source: "lilly-moon" },
        explanation: expect.stringContaining("Lilly")
      }
    ]);
    expect(selected.planets.map(({ planet, roles, shared }) => ({ planet, roles, shared }))).toEqual([
      { planet: "Mars", roles: ["querent"], shared: false },
      { planet: "Venus", roles: ["quesited"], shared: false },
      { planet: "Moon", roles: ["moon"], shared: false }
    ]);
  });

  it.each(domiciles)("uses the declared house %s cusp sign %s and its traditional ruler", (start, sign, planet) => {
    const house = (start / 30 + 1) as QuestionType["quesitedHouse"];
    const selected = selectSignificators(schematicCast({ id: "arbitrary-label", quesitedHouse: house }));
    expect(selected.assignments[1]).toMatchObject({ role: "quesited", planet, basis: { house, longitude: start, sign } });
  });

  it.each(domiciles)("keeps the %s-degree sign boundary exact for %s", (start, sign, planet) => {
    for (const longitude of [start, start + 15, start + 30 - 2 ** -40]) {
      const result = schematicCast();
      result.chart.houses.cusps[0] = longitude;
      result.chart.houses.cusps[1] = longitude;
      const selected = selectSignificators(result);
      expect(selected.assignments[0]).toMatchObject({ planet, basis: { sign, longitude } });
      expect(selected.assignments[1]).toMatchObject({ planet, basis: { sign, longitude } });
    }
  });

  it("delegates cusp rulership to the existing engine dignity API", () => {
    const spy = vi.spyOn(engine, "dignityRulersAt");
    try {
      selectSignificators(schematicCast());
      expect(spy.mock.calls).toEqual([[0], [30]]);
    } finally {
      spy.mockRestore();
    }
  });

  it("reads actual cusps without assuming sign-per-house spacing or using MC as house ten", () => {
    const result = schematicCast({ id: "job", quesitedHouse: 10 });
    result.chart.houses.system = "regiomontanus";
    result.chart.houses.cusps = [65, 85, 100, 125, 145, 160, 245, 265, 280, 305, 325, 340];
    result.chart.angles.asc = 65;
    result.chart.angles.mc = 125;
    const selected = selectSignificators(result);
    expect(selected.assignments[0]).toMatchObject({ planet: "Mercury", basis: { sign: "gemini", longitude: 65 } });
    expect(selected.assignments[1]).toMatchObject({ planet: "Saturn", basis: { sign: "aquarius", longitude: 305 } });
    expect(selected.houses).toEqual({ requested: "whole", actual: "regiomontanus" });
  });

  it("uses the first cusp for systems whose first cusp differs from the Ascendant", () => {
    const result = schematicCast();
    result.chart.houses.system = "equal-mc";
    result.chart.houses.cusps = [300, 330, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270];
    expect(result.chart.angles.asc).toBe(15);
    expect(selectSignificators(result).assignments[0]).toMatchObject({ planet: "Saturn", basis: { house: 1, sign: "aquarius" } });
  });

  it("preserves querent and quesited roles shared by different signs", () => {
    const result = schematicCast({ id: "shared-ruler", quesitedHouse: 6 });
    result.chart.houses.system = "regiomontanus";
    result.chart.houses.cusps = [65, 85, 100, 125, 145, 160, 245, 265, 280, 305, 325, 340];
    const selected = selectSignificators(result);
    expect(selected.assignments.slice(0, 2).map(({ planet }) => planet)).toEqual(["Mercury", "Mercury"]);
    expect(selected.planets[0]).toMatchObject({ planet: "Mercury", roles: ["querent", "quesited"], shared: true });
    expect(selected.planets[0]!.explanation).toContain("same physical planet");
    expect(selected.planets[0]!.explanation).toContain("no perfection or outcome");
  });

  it("retains the Moon role when it rules the quesited house", () => {
    const selected = selectSignificators(schematicCast({ id: "custom", quesitedHouse: 4 }));
    expect(selected.assignments[1]).toMatchObject({ role: "quesited", planet: "Moon" });
    expect(selected.assignments[2]).toMatchObject({ role: "moon", planet: "Moon" });
    expect(selected.planets[1]).toMatchObject({ planet: "Moon", roles: ["quesited", "moon"], shared: true });
  });

  it("retains every role when the first house, quesited and declared natural all use the Moon", () => {
    const result = schematicCast({ id: "self", quesitedHouse: 1, naturalSignificators: ["Moon", "Moon"] });
    result.chart.houses.cusps[0] = 90;
    const selected = selectSignificators(result);
    expect(selected.assignments.map(({ role, planet }) => [role, planet])).toEqual([
      ["querent", "Moon"], ["quesited", "Moon"], ["moon", "Moon"], ["natural", "Moon"]
    ]);
    expect(selected.planets).toEqual([{
      planet: "Moon", roles: ["querent", "quesited", "moon", "natural"], shared: true,
      explanation: expect.stringContaining("Each role is retained")
    }]);
  });

  it("retains declared naturals in first-occurrence order without replacing other roles", () => {
    const selected = selectSignificators(schematicCast({
      id: "relationship", quesitedHouse: 7, naturalSignificators: ["Venus", "Sun", "Venus", "Moon"]
    }));
    expect(selected.assignments.slice(3).map(({ role, planet, basis }) => [role, planet, basis])).toEqual([
      ["natural", "Venus", { kind: "declared-natural", source: "caller-declaration" }],
      ["natural", "Sun", { kind: "declared-natural", source: "caller-declaration" }],
      ["natural", "Moon", { kind: "declared-natural", source: "caller-declaration" }]
    ]);
    expect(selected.planets.map(({ planet, roles }) => [planet, roles])).toEqual([
      ["Mars", ["querent"]], ["Venus", ["quesited", "natural"]],
      ["Moon", ["moon", "natural"]], ["Sun", ["natural"]]
    ]);
    for (const assignment of selected.assignments.slice(3)) expect(assignment.explanation).toContain("declared by the caller");
  });

  it("does not derive naturals or houses from a question label", () => {
    const selected = selectSignificators(schematicCast({ id: "relationship", quesitedHouse: 10 }));
    expect(selected.assignments).toHaveLength(3);
    expect(selected.assignments[1]).toMatchObject({ planet: "Saturn", basis: { house: 10 } });
  });

  it("returns deeply frozen snapshots and leaves caller-owned chart arrays mutable", () => {
    const result = schematicCast({ ...questionInput.question, naturalSignificators: ["Sun"] });
    const before = structuredClone(result);
    const first = selectSignificators(result);
    const second = selectSignificators(result);
    expect(result).toEqual(before);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.assignments).not.toBe(second.assignments);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.houses)).toBe(true);
    expect(Object.isFrozen(first.assignments)).toBe(true);
    expect(Object.isFrozen(first.planets)).toBe(true);
    for (const assignment of first.assignments) {
      expect(Object.isFrozen(assignment)).toBe(true);
      expect(Object.isFrozen(assignment.basis)).toBe(true);
    }
    for (const planet of first.planets) {
      expect(Object.isFrozen(planet)).toBe(true);
      expect(Object.isFrozen(planet.roles)).toBe(true);
    }
    result.chart.houses.cusps[0] = 90;
    expect((first.assignments[0] as HouseSignificator).basis.longitude).toBe(0);
    expect(selectSignificators(result).assignments[0]!.planet).toBe("Moon");
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it.each([NaN, Infinity, -Infinity, -1, 360, 400, "30", null, undefined])("rejects edited noncanonical cusp %s", (longitude) => {
    const result = schematicCast();
    result.chart.houses.cusps[0] = longitude as number;
    expect(() => selectSignificators(result)).toThrow(RangeError);
  });

  it.each([[], Array(12), Array(13).fill(0)])("rejects missing, sparse or extra cusps", (cusps) => {
    const result = schematicCast();
    result.chart.houses.cusps = cusps;
    expect(() => selectSignificators(result)).toThrow(RangeError);
  });

  it("rejects absent or unsupported actual houses", () => {
    const result = schematicCast();
    result.chart.houses.system = "unknown" as typeof result.chart.houses.system;
    expect(() => selectSignificators(result)).toThrow(RangeError);
    result.chart.houses = null as unknown as typeof result.chart.houses;
    expect(() => selectSignificators(result)).toThrow(RangeError);
  });

  it("requires a cast result and revalidates edited question input", () => {
    expect(() => selectSignificators(null as unknown as HoraryCast)).toThrow(RangeError);
    const result = schematicCast();
    expect(() => selectSignificators({ ...result, schema: "unknown" } as unknown as HoraryCast)).toThrow(RangeError);
    const invalid = { ...result, input: { ...result.input, question: { ...result.input.question, quesitedHouse: 13 } } };
    expect(() => selectSignificators(invalid as HoraryCast)).toThrow(RangeError);
  });
});
