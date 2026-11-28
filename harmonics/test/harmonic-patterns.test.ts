import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.js";
import * as detector from "../../src/techniques/aspect-patterns.js";
import { castChart } from "../src/engine.js";
import { findHarmonicPatterns } from "../src/harmonic-patterns.js";
import type { HarmonicPatternOptions } from "../src/harmonic-patterns.js";
import type { LongitudePoint } from "../src/index.js";

// Invented source rows. Arithmetic references come from multiplication and
// subtraction of whole turns, never saved output from the library or engine.
const triangle = [
  { body: "Mercury", lon: 0 }, { body: "Venus", lon: 60 }, { body: "Mars", lon: 120 }
];
const cross = [
  { body: "Mercury", lon: 0 }, { body: "Venus", lon: 22.5 },
  { body: "Mars", lon: 45 }, { body: "Jupiter", lon: 67.5 }
];

afterEach(() => vi.restoreAllMocks());

describe("harmonic engine pattern delegation", () => {
  it("finds a hand-derived grand trine with no supplied speeds or chart call", () => {
    const cast = vi.spyOn(api, "natalChart");
    const detect = vi.spyOn(detector, "aspectPatterns");
    const contain = vi.spyOn(detector, "patternContainment");
    const result = findHarmonicPatterns(triangle, 2);
    // Twice 0,60,120 gives 0,120,240. All three shortest separations are 120.
    expect(result.harmonicChart.points.map((point) => point.lon)).toEqual([0, 120, 240]);
    expect(result.aspects).toEqual([
      { a: "Mercury", b: "Venus", type: "trine", orb: 0 },
      { a: "Mercury", b: "Mars", type: "trine", orb: 0 },
      { a: "Venus", b: "Mars", type: "trine", orb: 0 }
    ]);
    expect(result.analysis.patterns).toMatchObject([{
      kind: "grand-trine", members: ["Mercury", "Venus", "Mars"],
      edges: [{ orb: 0, limit: 7 }, { orb: 0, limit: 7 }, { orb: 0, limit: 7 }]
    }]);
    expect(detect).toHaveBeenCalledTimes(1);
    expect(detect.mock.calls[0]![0]).toEqual(result.harmonicChart.points);
    expect(detect.mock.calls[0]![1]).toBe(result.aspects);
    expect(result.analysis).toBe(detect.mock.results[0]!.value);
    expect(contain).toHaveBeenCalledWith(result.analysis.patterns);
    expect(result.containment).toBe(contain.mock.results[0]!.value);
    expect(result.containment.roots).toEqual(result.analysis.patterns);
    expect(cast).not.toHaveBeenCalled();
    expect(Object.hasOwn(result, "envelope")).toBe(false);
    expect(result.policy.arithmetic).toBe("engine-historical-binary64");
  });

  it("finds a T-square and its apex after seam reduction", () => {
    // Normalize -180 to 180, 270 to 270, 225 to 225; N=2 reduces to 0,180,90.
    const result = findHarmonicPatterns([
      { body: "Mercury", lon: -180 }, { body: "Venus", lon: 270 }, { body: "Mars", lon: 225 }
    ], 2);
    expect(result.analysis.patterns).toMatchObject([{
      kind: "t-square", apex: "Mars", oppositions: [["Mercury", "Venus"]],
      members: ["Mercury", "Venus", "Mars"]
    }]);
    expect(result.aspects.map((edge) => [edge.type, edge.orb])).toEqual([
      ["opposition", 0], ["square", 0], ["square", 0]
    ]);
  });

  it("returns the grand cross and its contained T-squares", () => {
    // N=4 maps quarter-circle source intervals 22.5 to 90 degrees.
    // Oppositions are Mercury/Mars and Venus/Jupiter; each of the other
    // four pairs is square. Removing any member leaves a T-square.
    const result = findHarmonicPatterns(cross, 4);
    expect(result.harmonicChart.points.map((point) => point.lon)).toEqual([0, 90, 180, 270]);
    expect(result.analysis.patterns.map((pattern) => pattern.kind)).toEqual([
      "grand-cross", "t-square", "t-square", "t-square", "t-square"
    ]);
    const root = result.containment.roots[0]!;
    expect(result.containment.roots).toHaveLength(1);
    expect(root.kind).toBe("grand-cross");
    expect(root.oppositions).toEqual([["Mercury", "Mars"], ["Venus", "Jupiter"]]);
    expect(root.edges).toHaveLength(6);
    expect(result.containment.included[root.id]!.map((pattern) => pattern.apex).sort()).toEqual([
      "Jupiter", "Mars", "Mercury", "Venus"
    ]);
  });

  it("finds a kite with its triangle and opposed axis", () => {
    // N=2 gives the triangle 0,120,240 plus Jupiter at 180.
    // Jupiter opposes Mercury and is 60 from both other triangle vertices.
    const result = findHarmonicPatterns([...triangle, { body: "Jupiter", lon: 90 }], 2);
    expect(result.analysis.patterns.map((pattern) => pattern.kind)).toEqual(["grand-trine", "kite"]);
    const kite = result.containment.roots[0]!;
    expect(kite).toMatchObject({
      kind: "kite", triangle: ["Mercury", "Venus", "Mars"],
      axisVertex: "Mercury", opposedVertex: "Jupiter"
    });
    expect(kite.edges).toHaveLength(6);
    expect(result.containment.included[kite.id]!.map((pattern) => pattern.kind)).toEqual(["grand-trine"]);
  });

  it("requires the complete figure and honors supported rule subsets", () => {
    // At N=2, 0,60,110 maps to 0,120,220. The last two candidate trines
    // deviate by 20 degrees, so one trine edge cannot complete the triangle.
    expect(findHarmonicPatterns([...triangle.slice(0, 2), { body: "Mars", lon: 110 }], 2)
      .analysis.patterns).toEqual([]);
    const result = findHarmonicPatterns(cross, 4, {
      policy: { aspects: [{ type: "square", orb: 7, luminaryOrb: 8 }] }
    });
    expect(result.aspects).toHaveLength(4);
    expect(result.aspects.every((edge) => edge.type === "square")).toBe(true);
    // Without opposition records neither a cross nor a T-square is complete.
    expect(result.analysis.patterns).toEqual([]);
  });

  it("honors physical-body subsets and ignores supplemental source rows", () => {
    const result = findHarmonicPatterns([
      ...triangle, { body: "North Node", lon: 60 }, { body: "Ascendant", lon: 120 }
    ], 2, { policy: { bodies: ["Mars", "Mercury"] } });
    expect(result.harmonicChart.points).toHaveLength(5);
    expect(result.analysis.points).toEqual([{ body: "Mercury", lon: 0 }, { body: "Mars", lon: 240 }]);
    expect(result.aspects).toEqual([{ a: "Mercury", b: "Mars", type: "trine", orb: 0 }]);
    expect(result.analysis.patterns).toEqual([]);
  });

  it("returns empty patterns for empty selections, no eligible points or conjunction clusters", () => {
    const detect = vi.spyOn(detector, "aspectPatterns");
    const result = findHarmonicPatterns(triangle, 2, { policy: { bodies: [] } });
    expect(result.analysis).toEqual({ points: [], patterns: [] });
    expect(result.containment).toEqual({ roots: [], included: {} });
    expect(detect).not.toHaveBeenCalled();
    expect(findHarmonicPatterns([{ body: "Ascendant", lon: 20 }], 2).analysis.points).toEqual([]);
    expect(findHarmonicPatterns(triangle, 2, { policy: { aspects: [] } }).aspects).toEqual([]);
    // N=6 maps 0,60,120 to 0,360-360,720-720: three conjunct bodies.
    const cluster = findHarmonicPatterns(triangle, 6);
    expect(cluster.aspects.map((edge) => edge.type)).toEqual(["conjunction", "conjunction", "conjunction"]);
    expect(cluster.analysis.patterns).toEqual([]);
  });
});

describe("fixed engine limits on harmonic circles", () => {
  it.each([
    ["conjunction", 0, 8, 10], ["sextile", 60, 4, 5], ["square", 90, 7, 8],
    ["trine", 120, 7, 8], ["opposition", 180, 8, 10]
  ] as const)("keeps the inclusive %s boundary for ordinary and luminary pairs", (type, angle, orb, luminaryOrb) => {
    for (const [body, limit] of [["Venus", orb], ["Sun", luminaryOrb]] as const) {
      // At N=2 the source separation (angle +/- limit)/2 transforms to
      // angle +/- limit, exactly at the fixed harmonic-circle allowance.
      const direction = angle === 180 ? -1 : 1;
      const lon = (angle + direction * limit) / 2;
      const points = [{ body: "Mercury", lon: 0 }, { body, lon }];
      const result = findHarmonicPatterns(points, 2);
      expect(result.aspects).toEqual([{ a: "Mercury", b: body, type, orb: limit }]);
      expect(result.policy.aspects.find((rule) => rule.type === type)).toMatchObject({ angle, orb, luminaryOrb });
      // One source increment of 2^-20 makes the harmonic orb larger by 2^-19.
      const outside = [{ body: "Mercury", lon: 0 }, { body, lon: lon + direction * 2 ** -20 }];
      expect(findHarmonicPatterns(outside, 2).aspects).toEqual([]);
    }
  });

  it.each([["Mars", 48.5, 7], ["Sun", 49, 8]] as const)(
    "keeps square limits fixed in a complete %s T-square", (body, lon, limit) => {
      // N=2 gives 0,180 and 97 (or 98). Both square orbs are 7 (or 8).
      const points = [{ body: "Mercury", lon: 0 }, { body: "Venus", lon: 90 }, { body, lon }];
      const result = findHarmonicPatterns(points, 2);
      expect(result.orbScaling).toBe("fixed");
      expect(result.analysis.patterns).toHaveLength(1);
      expect(result.analysis.patterns[0]!.edges.filter((edge) => edge.type === "square")
        .map((edge) => [edge.orb, edge.limit])).toEqual([[limit, limit], [limit, limit]]);
      expect(findHarmonicPatterns(points.map((point) => point.body === body
        ? { ...point, lon: lon + 2 ** -20 } : point), 2).analysis.patterns).toEqual([]);
    }
  );
});

describe("policy refusal, determinism and provenance", () => {
  it.each([
    { orbScaling: "inverse-harmonic" },
    { policy: { aspects: [{ type: "quintile", orb: 1 }] } },
    { policy: { aspects: [{ type: "custom", angle: 120, orb: 7, luminaryOrb: 8 }] } },
    { policy: { aspects: [{ type: "trine", orb: 6, luminaryOrb: 8 }] } },
    { policy: { aspects: [{ type: "trine", orb: 7 }] } },
    { policy: { aspects: [{ type: "trine", orb: { applying: 7, separating: 6, stationary: 7 }, luminaryOrb: 8 }] } },
    { policy: { bodies: ["Mercury", "Ascendant"] } },
    { policy: { bodyOrbs: { Mercury: 7 } } },
    { policy: { stationaryRelativeSpeed: 0 } },
    { policy: null }, { policy: { unknown: true } },
    null, [], { unknown: true }, { [Symbol("unknown")]: true }
  ])("refuses unsupported or malformed options %j before graph detection", (options) => {
    const detect = vi.spyOn(detector, "aspectPatterns");
    expect(() => findHarmonicPatterns(triangle, 2, options as unknown as HarmonicPatternOptions))
      .toThrow(RangeError);
    expect(detect).not.toHaveBeenCalled();
  });

  it("validates supplied rows and the harmonic ceiling", () => {
    for (const invalid of [0, 1.5, 181, NaN, Infinity]) {
      expect(() => findHarmonicPatterns(triangle, invalid)).toThrow(RangeError);
    }
    expect(() => findHarmonicPatterns(triangle, 2, { maxHarmonic: 1 })).toThrow(RangeError);
    expect(() => findHarmonicPatterns(triangle, 2, { maxHarmonic: null } as unknown as HarmonicPatternOptions))
      .toThrow(RangeError);
    for (const invalid of [[], [triangle[0], triangle[0]], [{ body: "Mercury", lon: Infinity }], [{ body: " Sun", lon: 0 }]]) {
      expect(() => findHarmonicPatterns(invalid as LongitudePoint[], 2)).toThrow(RangeError);
    }
    // At N=720, 0,1/8,1/4,3/8 maps to 0,90,180,270.
    const extended = findHarmonicPatterns(cross.map((point) => ({ ...point, lon: point.lon / 180 })),
      720, { maxHarmonic: 720 });
    expect(extended.harmonicChart.maxHarmonic).toBe(720);
    expect(extended.containment.roots[0]!.kind).toBe("grand-cross");
  });

  it("keeps ids, roles and containment stable under source order and rotations", () => {
    // At N=4 adding 90 source degrees adds a whole harmonic turn;
    // adding 89.75 adds 359 degrees, moving the figure across the seam.
    const expected = [
      "grand-cross:Mercury,Venus,Mars,Jupiter:oppositions:Mercury,Mars;Venus,Jupiter",
      "t-square:Mercury,Venus,Jupiter:apex:Mercury",
      "t-square:Mercury,Venus,Mars:apex:Venus",
      "t-square:Mercury,Mars,Jupiter:apex:Jupiter",
      "t-square:Venus,Mars,Jupiter:apex:Mars"
    ].sort();
    for (const shift of [0, 90, 89.75, -180]) {
      const result = findHarmonicPatterns(cross.map((point) => ({ ...point, lon: point.lon + shift })).reverse(), 4);
      expect(result.analysis.patterns.map((pattern) => pattern.id)).toEqual(expected);
      expect(result.analysis.points.map((point) => point.body)).toEqual(["Mercury", "Venus", "Mars", "Jupiter"]);
    }
  });

  it("freezes independent results without changing source data or policy", () => {
    const points = triangle.map((point) => ({ ...point }));
    const policy = { bodies: ["Mercury", "Venus", "Mars"] };
    const result = findHarmonicPatterns(points, 2, { policy, orbScaling: "fixed" });
    points[0]!.lon = 10;
    policy.bodies.pop();
    expect(result.harmonicChart.points[0]!.sourceLon).toBe(0);
    expect(result.policy.bodies).toEqual(["Mercury", "Venus", "Mars"]);
    const frozenTree = (value: unknown): void => {
      if (value && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        for (const child of Object.values(value)) frozenTree(child);
      }
    };
    frozenTree(result);
  });

  it("analyzes cast rows without another chart call or changing the natal envelope", () => {
    const cast = vi.spyOn(api, "natalChart");
    // Invented instant and coordinates. Comparisons below establish receipt
    // preservation and delegation, not astronomical accuracy expectations.
    const source = castChart({ utc: "2002-04-06T03:00:00Z", latitude: 12, longitude: 24 }, {
      includeAngles: true, includeChartPoints: true
    });
    const before = structuredClone(source.envelope);
    const result = { source, harmonicPatterns: findHarmonicPatterns(source.points, 3) };
    expect(cast).toHaveBeenCalledTimes(1);
    expect(result.source).toBe(source);
    expect(result.source.envelope).toEqual(before);
    expect(result.harmonicPatterns.analysis.points).toHaveLength(10);
    expect(result.harmonicPatterns.harmonicChart.points.some((point) => point.body === "Ascendant")).toBe(true);
    expect(Object.hasOwn(result.harmonicPatterns, "envelope")).toBe(false);
  });
});
