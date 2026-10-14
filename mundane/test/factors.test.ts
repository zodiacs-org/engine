import { describe, expect, it } from "vitest";
import {
  analyzeFactors, castEventChart, searchIngresses, searchLunations
} from "../src/index.js";
import type { AngularityGeometry, AngularityOptions, ChartFactorAnalysis } from "../src/index.js";

// Invented geometry and hand table lookups from docs/angle-rulers.md.
// Equal cusps make house membership floor(longitude / 30) + 1.
function geometry(sun = 305) {
  const names = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"] as const;
  const longitudes = [sun, 35, 151, 275, 211, 245, 9];
  return {
    angles: { asc: 0, mc: 90, dsc: 180, ic: 270 },
    houses: { requested: "whole" as const, actual: "whole" as const,
      cusps: Array.from({ length: 12 }, (_, index) => index * 30) },
    bodies: names.map((body, index) => ({ body, lon: longitudes[index]! }))
  };
}

function frozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) frozen(child);
  }
}

function resolveSource(result: ChartFactorAnalysis, pointer: string): unknown {
  let value: unknown = result;
  for (const part of pointer.slice(1).split("/")) {
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

describe("traditional factor wording from hand-derived synthetic geometry", () => {
  it("lists only angular planets, followed by all angle rulers in fixed order", () => {
    const result = analyzeFactors(geometry());
    expect(result.factors.label).toBe("traditional conventions, not predictions");
    expect(result.factors.convention).toBe("descriptive-factors;no-ranking-or-score");
    expect(result.factors.items.map(row => row.id)).toEqual([
      "angular-planet:Venus", "angular-planet:Saturn",
      "angle-ruler:asc", "angle-ruler:mc", "angle-ruler:dsc", "angle-ruler:ic"
    ]);
    expect(result.factors.items.filter(row => row.kind === "angular-planet").map(row => row.text)).toEqual([
      "Venus is in angular house 10 (whole houses); within the configured longitude orb of: lower meridian.",
      "Saturn is in angular house 1 (whole houses)."
    ]);
    expect(new Set(result.factors.items.map(row => row.id)).size).toBe(result.factors.items.length);
  });

  it("keeps ruler factors when no classical planet is angular", () => {
    const input = geometry();
    const longitudes = [45, 55, 135, 145, 225, 235, 315];
    input.bodies.forEach((row, index) => { row.lon = longitudes[index]!; });
    const result = analyzeFactors(input);
    expect(result.angularity.angularPlanets).toEqual([]);
    expect(result.factors.items.map(row => row.id)).toEqual([
      "angle-ruler:asc", "angle-ruler:mc", "angle-ruler:dsc", "angle-ruler:ic"
    ]);
  });

  it("preserves simultaneous dignities, debilities, and the peregrine explanation", () => {
    const result = analyzeFactors(geometry());
    expect(result.factors.items.filter(row => row.kind === "angle-ruler").map(row => row.text)).toEqual([
      "The ascendant in Aries is ruled by Mars. Mars in Scorpio: dignities domicile, Egyptian term, Chaldean face; debilities none.",
      "The midheaven in Cancer is ruled by Moon. Moon in Taurus: dignities exaltation; debilities none.",
      "The descendant in Libra is ruled by Venus. Venus in Capricorn: dignities day triplicity; debilities none.",
      "The lower meridian in Capricorn is ruled by Saturn. Saturn in Aries: dignities none; debilities fall; peregrine (no essential dignity)."
    ]);
    const input = geometry();
    input.bodies.find(row => row.body === "Saturn")!.lon = 27;
    const mixed = analyzeFactors(input).factors.items.find(row => row.id === "angle-ruler:ic")!;
    expect(mixed.text).toBe("The lower meridian in Capricorn is ruled by Saturn. Saturn in Aries: dignities Egyptian term; debilities fall.");
  });

  it("describes chart sect and repeated rulers without collapsing rows", () => {
    const result = analyzeFactors(geometry(5));
    expect(result.factors.items.find(row => row.id === "angle-ruler:asc")!.text)
      .toContain("domicile, night triplicity, Egyptian term, Chaldean face");
    expect(result.factors.items.find(row => row.id === "angle-ruler:dsc")!.text)
      .toContain("dignities none; debilities none; peregrine (no essential dignity)");
    const repeated = geometry();
    repeated.angles = { asc: 60, mc: 150, dsc: 240, ic: 330 };
    expect(analyzeFactors(repeated).factors.items.filter(row => row.kind === "angle-ruler").map(row => row.ruler))
      .toEqual(["Mercury", "Mercury", "Jupiter", "Jupiter"]);
    expect(analyzeFactors(repeated).factors.items.find(row => row.id === "angle-ruler:asc")!.text)
      .toContain("dignities domicile, exaltation, Egyptian term");
  });

  it("distinguishes angular houses from proximity and honors exact orb boundaries", () => {
    const input = geometry();
    // Sun 85 is house 3 and exactly 5 degrees from MC 90; 84.5 lies outside.
    input.bodies[0]!.lon = 85;
    const factor = () => analyzeFactors(input).factors.items.find(row => row.id === "angular-planet:Sun");
    expect(factor()!.text).toBe("Sun is within the configured longitude orb of: midheaven.");
    input.bodies[0]!.lon = 84.5;
    expect(factor()).toBeUndefined();
    expect(analyzeFactors(input, { angleOrbDegrees: 6 }).factors.items.some(row => row.id === "angular-planet:Sun"))
      .toBe(true);
    input.bodies[0]!.lon = 90;
    expect(analyzeFactors(input, { angleOrbDegrees: 0 }).factors.items.find(row => row.id === "angular-planet:Sun")!.text)
      .toBe("Sun is in angular house 4 (whole houses); within the configured longitude orb of: midheaven.");
    expect(analyzeFactors(input, { angleOrbDegrees: 180 }).factors.items[0]!.text)
      .toContain("ascendant, midheaven, descendant, lower meridian");
  });

  it("provides resolvable sources for every factor and no caller-supplied prose", () => {
    const input = { ...geometry(), sect: "night", text: "promises success", sign: "pisces" };
    const result = analyzeFactors(input);
    for (const item of result.factors.items) {
      const source = resolveSource(result, item.source);
      expect(source).toBeDefined();
      if (item.kind === "angular-planet") expect(source).toMatchObject({ planet: item.planet, angular: true });
      if (item.kind === "angle-ruler") expect(source).toMatchObject({ angle: item.angle, ruler: item.ruler });
    }
    expect(JSON.stringify(result.factors)).not.toMatch(/promises|success|prediction[^s]|score":|rank":/i);
    expect(result.angleRulers.sect).toBe("day");
    const reordered = { ...input, bodies: [...input.bodies].reverse() };
    expect(analyzeFactors(reordered)).toEqual(result);
  });

  it("detaches and freezes the JSON-compatible result without freezing input", () => {
    const input = geometry();
    const result = analyzeFactors(input);
    const snapshot = JSON.parse(JSON.stringify(result));
    input.angles.asc = 200;
    input.houses.cusps[0] = 200;
    input.bodies[0]!.lon = 100;
    expect(result).toEqual(snapshot);
    frozen(result);
    expect(Object.isFrozen(input)).toBe(false);
  });

  it("delegates geometry and option validation to the existing analyses", () => {
    const invalid = geometry();
    invalid.bodies.pop();
    expect(() => analyzeFactors(invalid)).toThrow(RangeError);
    expect(() => analyzeFactors(null as unknown as AngularityGeometry)).toThrow(RangeError);
    expect(() => analyzeFactors(geometry(), { angleOrbDegrees: -1 })).toThrow(RangeError);
    expect(() => analyzeFactors(geometry(), { score: true } as unknown as AngularityOptions)).toThrow(RangeError);
  });
});

describe("factor integration at invented places", () => {
  const place = { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 };

  it.each(["placidus", "koch"] as const)("explains actual polar houses after requested %s fallback", houseSystem => {
    const chart = castEventChart({ at: "2000-03-20T12:00:00Z",
      place: { name: "Synthetic Polar", latitude: 80, longitude: 20 }, houseSystem });
    const result = analyzeFactors(chart);
    expect(chart.flags).toContain("polar-fallback");
    expect(result.factors.items[0]).toEqual({
      kind: "house-system-fallback", id: "house-system-fallback", source: "/angularity/houses",
      text: `Requested ${houseSystem} houses; chart uses whole houses. Angular house factors use whole.`
    });
    expect(resolveSource(result, result.factors.items[0]!.source)).toEqual({ requested: houseSystem, actual: "whole" });
    for (const row of result.factors.items.filter(row => row.kind === "angular-planet")) {
      expect(row.text).not.toContain(`${houseSystem} houses`);
    }
  });

  it("attaches the same labelled factors to ingress and lunation events", () => {
    const input = { place, from: "2000-03-01", to: "2000-04-01" };
    const ingress = searchIngresses(input);
    const lunations = searchLunations(input);
    expect(ingress.status).toBe("complete");
    expect(lunations.status).toBe("complete");
    expect(ingress.ingresses.length).toBeGreaterThan(0);
    expect(lunations.lunations.length).toBeGreaterThan(0);
    for (const event of [...ingress.ingresses, ...lunations.lunations]) {
      const expected = analyzeFactors(event.chart);
      expect(event.factors).toEqual(expected.factors);
      for (const item of event.factors.items) expect(resolveSource(event, item.source)).toBeDefined();
      frozen(event.factors);
      expect(JSON.parse(JSON.stringify(event.factors))).toEqual(event.factors);
    }
  });
});
