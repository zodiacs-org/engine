import { describe, expect, it } from "vitest";
import { sectOf } from "../../src/points.js";
import { essentialDignities } from "../../src/techniques/dignities.js";
import type { ClassicalPlanet } from "../../src/techniques/dignities.js";
import type { BodyName, Sect } from "../../src/types.js";
import { analyzeAngleRulers, castEventChart } from "../src/index.js";
import type { AngleRulerGeometry } from "../src/index.js";

// Invented geometry. Expectations are hand lookups of the conventions cited
// in docs/angle-rulers.md, not outputs of an ephemeris or of this helper.
const names = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"] as const;
function geometry(sun = 305) {
  const longitudes = [sun, 35, 151, 275, 211, 245, 9];
  return {
    angles: { asc: 0, mc: 90, dsc: 180, ic: 270 },
    bodies: names.map((body, index) => ({ body: body as BodyName, lon: longitudes[index]! }))
  };
}

function condition(planet: ClassicalPlanet, lon: number, sect: Sect = "day") {
  const input = geometry(sect === "day" ? 305 : 5);
  input.bodies.find(row => row.body === planet)!.lon = lon;
  // Make ASC select the requested planet without changing the required sect.
  const angleLongitudes = { Sun: 120, Moon: 90, Mercury: 60, Venus: 30,
    Mars: 0, Jupiter: 240, Saturn: 270 };
  input.angles.mc = angleLongitudes[planet];
  return analyzeAngleRulers(input).rulers[1]!.condition;
}

function expectFrozenTree(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectFrozenTree(child);
  }
}

describe("hand-derived angle rulers and essential conditions", () => {
  it("evaluates rulers at their own longitudes in a synthetic day chart", () => {
    const result = analyzeAngleRulers(geometry());
    expect(result.sect).toBe("day");
    expect(result.rulers).toEqual([
      { angle: "asc", longitude: 0, sign: "aries", ruler: "Mars", condition: {
        planet: "Mars", lon: 211, sign: "scorpio", sect: "day",
        dignities: ["domicile", "term", "face"], debilities: [], peregrine: false
      } },
      { angle: "mc", longitude: 90, sign: "cancer", ruler: "Moon", condition: {
        planet: "Moon", lon: 35, sign: "taurus", sect: "day",
        dignities: ["exaltation"], debilities: [], peregrine: false
      } },
      { angle: "dsc", longitude: 180, sign: "libra", ruler: "Venus", condition: {
        planet: "Venus", lon: 275, sign: "capricorn", sect: "day",
        dignities: ["triplicity"], debilities: [], peregrine: false
      } },
      { angle: "ic", longitude: 270, sign: "capricorn", ruler: "Saturn", condition: {
        planet: "Saturn", lon: 9, sign: "aries", sect: "day",
        dignities: [], debilities: ["fall"], peregrine: true
      } }
    ]);
    expect(result.label).toBe("traditional conventions, not predictions");
    expect(result.convention).toEqual({
      angleRuler: "traditional-domicile",
      sectMethod: "engine-sectOf-on-ascendant-and-sun",
      horizonBoundary: "sun-on-ascendant-night;sun-on-descendant-day",
      triplicity: "dorothean-chart-sect-lord;participating-not-counted",
      terms: "egyptian", faces: "chaldean", peregrine: "no-essential-dignity"
    });
  });

  it("changes only sect-dependent dignities for the same rulers at night", () => {
    const night = analyzeAngleRulers(geometry(5));
    expect(night.sect).toBe("night");
    expect(night.rulers.map(row => row.condition.dignities)).toEqual([
      ["domicile", "triplicity", "term", "face"], ["exaltation", "triplicity"], [], []
    ]);
    expect(night.rulers.map(row => row.condition.peregrine)).toEqual([false, false, true, true]);
    expect(night.rulers.map(row => row.condition.debilities)).toEqual([[], [], [], ["fall"]]);
  });

  // Each sign's start and end-side sample, using the classical domicile
  // assignments cited to Ptolemy I.17. No production table supplies these.
  it.each([
    [0, "aries", "Mars"], [30, "taurus", "Venus"], [60, "gemini", "Mercury"],
    [90, "cancer", "Moon"], [120, "leo", "Sun"], [150, "virgo", "Mercury"],
    [180, "libra", "Venus"], [210, "scorpio", "Mars"], [240, "sagittarius", "Jupiter"],
    [270, "capricorn", "Saturn"], [300, "aquarius", "Saturn"], [330, "pisces", "Jupiter"]
  ] as const)("uses the traditional domicile at %s degrees (%s)", (start, sign, ruler) => {
    for (const lon of [start, start + 29.5]) {
      const input = geometry();
      input.angles.mc = lon;
      expect(analyzeAngleRulers(input).rulers[1]).toMatchObject({ longitude: lon, sign, ruler });
    }
  });

  it("retains repeated rulers as separate angle rows", () => {
    const input = geometry();
    input.angles = { asc: 60, mc: 150, dsc: 240, ic: 330 };
    const result = analyzeAngleRulers(input);
    expect(result.rulers.map(row => row.ruler)).toEqual(["Mercury", "Mercury", "Jupiter", "Jupiter"]);
    expect(result.rulers[0]!.condition).toEqual(result.rulers[1]!.condition);
    expect(result.rulers[0]!.condition.dignities).toEqual(["domicile", "exaltation", "term"]);
  });

  it("preserves simultaneous domicile and exaltation without choosing one", () => {
    expect(condition("Mercury", 151)).toMatchObject({ sign: "virgo",
      dignities: ["domicile", "exaltation", "term"], debilities: [], peregrine: false });
  });

  it("counts only the sect's triplicity lord, not a participating lord", () => {
    expect(condition("Jupiter", 245, "day").dignities).toEqual(["domicile", "term"]);
    expect(condition("Jupiter", 245, "night").dignities).toEqual(["domicile", "triplicity", "term"]);
    // The participating air lord also owns Gemini's first Chaldean face,
    // but receives no triplicity dignity (al-Biruni section 451).
    expect(condition("Jupiter", 65).dignities).toEqual(["face"]);
    expect(condition("Jupiter", 65, "night").dignities).toEqual(["face"]);
    expect(condition("Mercury", 65, "day").dignities).toEqual(["domicile", "term"]);
    expect(condition("Mercury", 65, "night").dignities).toEqual(["domicile", "triplicity", "term"]);
  });

  it("preserves debilities alongside dignities and the no-dignity peregrine rule", () => {
    expect(condition("Saturn", 9)).toMatchObject({ dignities: [], debilities: ["fall"], peregrine: true });
    expect(condition("Saturn", 27)).toMatchObject({ dignities: ["term"], debilities: ["fall"], peregrine: false });
    expect(condition("Mercury", 335)).toMatchObject({ dignities: [],
      debilities: ["detriment", "fall"], peregrine: true });
    expect(condition("Sun", 305)).toMatchObject({ dignities: [], debilities: ["detriment"], peregrine: true });
  });

  it("inherits inclusive term and face starts without adding a boundary orb", () => {
    expect(condition("Venus", 5.5).dignities).toEqual([]);
    expect(condition("Venus", 6).dignities).toEqual(["term"]);
    expect(condition("Venus", 11.5).dignities).toEqual(["term"]);
    expect(condition("Venus", 12).dignities).toEqual([]);
    expect(condition("Mars", 9.5).dignities).toEqual(["domicile", "face"]);
    expect(condition("Mars", 10).dignities).toEqual(["domicile"]);
    expect(condition("Mars", 29.5).dignities).toEqual(["domicile"]);
    expect(condition("Mars", 30).dignities).toEqual([]);
    expect(condition("Mars", 30).debilities).toEqual(["detriment"]);
  });
});

describe("sect geometry", () => {
  it.each([
    [0, 0, "night"], [0, 179.5, "night"], [0, 180, "day"], [0, 359.5, "day"],
    [350, 350, "night"], [350, 0, "night"], [350, 170, "day"], [350, 349.5, "day"]
  ] as const)("uses the engine horizon convention for ASC %s and Sun %s", (asc, sun, sect) => {
    const input = geometry(sun);
    input.angles.asc = asc;
    input.angles.dsc = (asc + 180) % 360;
    expect(analyzeAngleRulers(input).sect).toBe(sect);
    expect(analyzeAngleRulers(input).rulers.every(row => row.condition.sect === sect)).toBe(true);
  });

  it("derives sect from supplied longitudes even if unrelated metadata asserts day", () => {
    const input = { ...geometry(5), sect: "day" };
    expect(analyzeAngleRulers(input).sect).toBe("night");
  });
});

describe("integration and immutable snapshots", () => {
  it.each([
    { latitude: 0, houseSystem: "whole" as const, at: "2000-03-20T12:00:00Z", sect: "day" },
    { latitude: 0, houseSystem: "equal" as const, at: "2000-03-20T00:00:00Z", sect: "night" },
    { latitude: 78.5, houseSystem: "placidus" as const, at: "2000-02-29T12:34:56.789Z" },
    { latitude: -78.5, houseSystem: "koch" as const, at: "2000-02-29T12:34:56.789Z" }
  ])("analyzes a cast chart without replacing its geometry or provenance: %j", input => {
    const chart = castEventChart({ at: input.at, place: { latitude: input.latitude, longitude: 0 },
      houseSystem: input.houseSystem });
    const before = JSON.stringify(chart);
    const result = analyzeAngleRulers(chart);
    const sun = chart.bodies.find(row => row.body === "Sun")!;
    expect(result.sect).toBe(sectOf(chart.angles.asc, sun.lon));
    if (input.sect !== undefined) expect(result.sect).toBe(input.sect);
    for (const row of result.rulers) {
      expect(row.longitude).toBe(chart.angles[row.angle]);
      const body = chart.bodies.find(body => body.body === row.ruler)!;
      expect(row.condition).toEqual(essentialDignities(row.ruler, body.lon, result.sect));
    }
    expect(JSON.stringify(chart)).toBe(before);
    expectFrozenTree(result);
  });

  it("ignores valid outer planets and nodes and is independent of input row order", () => {
    const input = geometry();
    const expected = analyzeAngleRulers(input);
    input.bodies.push(...(["Uranus", "Neptune", "Pluto", "North Node", "South Node"] as const)
      .map(body => ({ body, lon: 0 })));
    input.bodies.reverse();
    expect(analyzeAngleRulers(input)).toEqual(expected);
  });

  it("uses longitudes rather than supplied sign or degree annotations", () => {
    const input = geometry();
    const annotated = { ...input,
      bodies: input.bodies.map(row => ({ ...row, sign: "pisces", degree: 0 })) };
    expect(analyzeAngleRulers(annotated)).toEqual(analyzeAngleRulers(input));
  });

  it("detaches and deeply freezes JSON-compatible output without freezing callers", () => {
    const input = geometry();
    const before = structuredClone(input);
    const result = analyzeAngleRulers(input);
    expect(input).toEqual(before);
    expectFrozenTree(result);
    expect(Object.isFrozen(input.angles)).toBe(false);
    expect(Object.isFrozen(input.bodies[4])).toBe(false);
    input.angles.asc = 60;
    input.bodies[4]!.lon = 90;
    expect(result.rulers[0]).toMatchObject({ longitude: 0, ruler: "Mars", condition: { lon: 211 } });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(Reflect.set(result.rulers[0]!.condition, "peregrine", true)).toBe(false);
  });
});

describe("angle ruler input validation", () => {
  it.each([NaN, Infinity, -1, 360, "15", null, undefined])("rejects invalid longitudes: %j", lon => {
    const input = geometry();
    for (const angle of ["asc", "mc", "dsc", "ic"] as const) {
      expect(() => analyzeAngleRulers({ ...input, angles: { ...input.angles, [angle]: lon } } as AngleRulerGeometry))
        .toThrow(RangeError);
    }
    expect(() => analyzeAngleRulers({ ...input,
      bodies: [{ body: "Sun", lon }, ...input.bodies.slice(1)] } as AngleRulerGeometry)).toThrow(RangeError);
    expect(() => analyzeAngleRulers({ ...input,
      bodies: [...input.bodies, { body: "Pluto", lon }] } as AngleRulerGeometry)).toThrow(RangeError);
  });

  it.each([null, [], {}, { angles: null }, { ...geometry(), angles: {} },
    { ...geometry(), bodies: null }, { ...geometry(), bodies: [null] },
    { ...geometry(), bodies: [{ body: "sun", lon: 15 }] },
    { ...geometry(), bodies: [{ body: "toString", lon: 15 }] },
    { ...geometry(), bodies: [...geometry().bodies, { body: "Sun", lon: 15 }] },
    { ...geometry(), bodies: [...geometry().bodies, { body: "Pluto", lon: 15 }, { body: "Pluto", lon: 15 }] },
    { ...geometry(), bodies: Array(7) }
  ])("rejects malformed or ambiguous geometry: %j", input => {
    expect(() => analyzeAngleRulers(input as AngleRulerGeometry)).toThrow(RangeError);
  });

  it.each(names)("requires a unique row for %s even if it rules no angle", body => {
    const input = geometry();
    input.bodies = input.bodies.filter(row => row.body !== body);
    expect(() => analyzeAngleRulers(input)).toThrow(RangeError);
  });
});
