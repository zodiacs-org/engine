import { describe, expect, it } from "vitest";
import { natalChart } from "../api.js";
import { matchAspect } from "../aspects.js";
import { aspectPatterns, chartAspectPatterns, patternContainment } from "./aspect-patterns.js";
import type { PatternEdgeInput, PatternPoint } from "./aspect-patterns.js";

/** The records a chart holds for these positions: every pair `matchAspect` admits. */
const edgesOf = (points: readonly PatternPoint[]): PatternEdgeInput[] =>
  points.flatMap((a, i) =>
    points.slice(i + 1).flatMap((b) => {
      const match = matchAspect(a.body, a.lon, b.body, b.lon);
      return match ? [{ a: a.body, b: b.body, type: match.definition.type, orb: match.orb }] : [];
    })
  );
const found = (points: PatternPoint[], edges = edgesOf(points)) => aspectPatterns(points, edges).patterns;

// One fixture per definition (Robert Hand, Horoscope Symbols, 1981, ch. 6):
// a grand trine is "three planets [that] form an equilateral triangle in the
// zodiac"; in a grand cross the planets are "ranged around the circle at 90°
// intervals so that each is in either square or opposition to the other
// planets"; "a T-square is a grand cross with one arm missing"; a kite "has a
// close grand trine, with one of the three planets closely opposed by a fourth
// planet that also lies on the midpoint of the other two in the grand trine".
const triangle = [{ body: "Mercury", lon: 0 }, { body: "Venus", lon: 120 }, { body: "Mars", lon: 240 }];
const cross = [{ body: "Mercury", lon: 0 }, { body: "Venus", lon: 90 }, { body: "Mars", lon: 180 }, { body: "Jupiter", lon: 270 }];
const tSquare = [{ body: "Mercury", lon: 0 }, { body: "Venus", lon: 180 }, { body: "Mars", lon: 90 }];
const kite = [...triangle, { body: "Jupiter", lon: 180 }];

describe("pattern definitions", () => {
  it("finds the grand trine", () => {
    expect(found(triangle).map((p) => [p.kind, p.members, p.edges.length])).toEqual([["grand-trine", ["Mercury", "Venus", "Mars"], 3]]);
  });
  it("finds the T-square and its apex", () => {
    expect(found(tSquare)).toMatchObject([{ kind: "t-square", apex: "Mars", oppositions: [["Mercury", "Venus"]], id: "t-square:Mercury,Venus,Mars:apex:Mars" }]);
  });
  it("finds the grand cross, its two oppositions and the four T-squares inside it", () => {
    const patterns = found(cross);
    expect(patterns.map((p) => p.kind)).toEqual(["grand-cross", "t-square", "t-square", "t-square", "t-square"]);
    expect(patterns[0]!.oppositions).toEqual([["Mercury", "Mars"], ["Venus", "Jupiter"]]);
    expect(patterns[0]!.edges).toHaveLength(6);
  });
  it("finds the kite and its roles", () => {
    expect(found(kite).find((p) => p.kind === "kite")).toMatchObject({
      triangle: ["Mercury", "Venus", "Mars"],
      axisVertex: "Mercury",
      opposedVertex: "Jupiter"
    });
  });
  it.each([[triangle, "grand-trine"], [tSquare, "t-square"], [cross, "grand-cross"], [kite, "kite"]] as const)(
    "needs every edge of the %#th definition",
    (positions, kind) => {
      const all = edgesOf(positions);
      for (let index = 0; index < all.length; index += 1) {
        expect(found([...positions], all.filter((_edge, i) => i !== index)).some((p) => p.kind === kind)).toBe(false);
      }
    }
  );
  it("finds nothing in a figure of minor aspects", () => {
    expect(found([{ body: "Mercury", lon: 0 }, { body: "Venus", lon: 20 }, { body: "Mars", lon: 45 }, { body: "Jupiter", lon: 70 }])).toEqual([]);
  });
});

describe("orb limits (the site's cases)", () => {
  it.each([["Mars", 97, 7], ["Sun", 98, 8]] as const)("keeps the inclusive square limit for %s", (body, longitude, orb) => {
    const points = [{ body: "Mercury", lon: 0 }, { body: "Venus", lon: 180 }, { body, lon: longitude }];
    expect(found(points)[0]!.edges.filter((e) => e.type === "square").map((e) => [e.orb, e.limit])).toEqual([[orb, orb], [orb, orb]]);
    expect(found(points.map((p) => (p.body === body ? { ...p, lon: longitude + 1e-8 } : p)))).toEqual([]);
    expect(found(points.map((p) => (p.body === body ? { ...p, lon: longitude - 1e-8 } : p)))).toHaveLength(1);
  });
  it.each([["Jupiter", 184, 4], ["Sun", 185, 5]] as const)("keeps the inclusive sextile limit for %s", (body, lon, limit) => {
    const kiteFound = found([...triangle, { body, lon }]).find((p) => p.kind === "kite")!;
    expect(kiteFound.edges.filter((e) => e.type === "sextile").every((e) => e.orb === limit && e.limit === limit)).toBe(true);
    expect(found([...triangle, { body, lon: lon + 1e-8 }]).map((p) => p.kind)).toEqual(["grand-trine"]);
  });
});

describe("invariance and records", () => {
  it.each([triangle, tSquare, cross, kite].map((points) => ({ points })))("ignores input order, rotation, mirroring and wrap", ({ points }) => {
    const ids = found(points).map((p) => p.id);
    for (const [rotation, direction] of [[0, 1], [359, 1], [63.3, -1], [-720, -1]] as const) {
      const shifted = points.map((p) => ({ ...p, lon: p.lon * direction + rotation })).reverse();
      const edges = edgesOf(shifted).reverse().map((e) => ({ ...e, a: e.b, b: e.a, sourceId: `source:${e.b}:${e.a}` }));
      expect(found(shifted, edges).map((p) => p.id)).toEqual(ids);
      expect(found(shifted, edges).every((p) => p.edges.every((e) => e.sourceIds[0]!.startsWith("source:")))).toBe(true);
    }
  });
  it("keeps overlapping kites, and one triangle under two parents", () => {
    const patterns = found([...kite, { body: "Saturn", lon: 180 }]);
    expect(patterns.filter((p) => p.kind === "grand-trine")).toHaveLength(1);
    expect(patterns.filter((p) => p.kind === "kite")).toHaveLength(2);
    expect(found([...triangle, { body: "Saturn", lon: 0 }]).filter((p) => p.kind === "grand-trine")).toHaveLength(2);
  });
  it("merges a reversed duplicate record, keeping both source ids", () => {
    const edges = edgesOf(triangle);
    const duplicate = { ...edges[0]!, a: edges[0]!.b, b: edges[0]!.a, sourceId: "reversed" };
    expect(found(triangle, [...edges, duplicate])[0]!.edges.find((e) => e.sourceIds.includes("reversed"))!.sourceIds).toHaveLength(2);
  });
  it("refuses malformed data with the site's reasons", () => {
    const edges = edgesOf(triangle);
    const refusals: [PatternPoint[], PatternEdgeInput[], string][] = [
      [[...triangle, triangle[0]!], [], "Invalid or duplicate body positions."],
      [[{ body: "Mercury", lon: Number.NaN }], [], "Invalid or duplicate body positions."],
      [[], [], "No eligible body positions."],
      [[{ body: "ASC", lon: 0 }], [], "No eligible body positions."],
      [triangle, [...edges, { ...edges[0]!, orb: Number.NaN }], "Invalid aspect data."],
      [triangle, [...edges, { ...edges[0]!, type: "square" }], "Aspect records disagree with the positions."],
      [triangle, [...edges, { ...edges[0]!, b: "Sun" }], "An aspect has missing or repeated members."],
      [triangle, [edges[0]!, { ...edges[0]!, orb: edges[0]!.orb + 1e-12 }], "Contradictory duplicate aspect records."]
    ];
    for (const [points, records, reason] of refusals) expect(() => aspectPatterns(points, records)).toThrow(reason);
    // The nodes take part in no pattern.
    expect(found(triangle.map((p) => (p.body === "Mars" ? { ...p, body: "North Node" } : p)))).toEqual([]);
  });
});

describe("containment", () => {
  it("puts the four T-squares inside the grand cross", () => {
    const { roots, included } = patternContainment(found(cross));
    expect(roots.map((p) => p.kind)).toEqual(["grand-cross"]);
    expect(included[roots[0]!.id]!.map((p) => p.kind)).toEqual(["t-square", "t-square", "t-square", "t-square"]);
  });
  it("keeps a triangle under both of its kites, and needs the edges as well as the members", () => {
    const points = [...triangle, { body: "Jupiter", lon: 180 }, { body: "Saturn", lon: 180 }];
    const { roots, included } = patternContainment(found(points));
    expect(roots.map((p) => p.kind)).toEqual(["kite", "kite"]);
    expect(included[roots[0]!.id]![0]!.id).toBe(included[roots[1]!.id]![0]!.id);
    const outer = roots[0]!;
    const inner = included[outer.id]![0]!;
    expect(patternContainment([outer, { ...inner, edges: [{ ...inner.edges[0]!, key: "different-edge" }] }]).roots).toHaveLength(2);
  });
});

describe("chartAspectPatterns", () => {
  it("reads a chart's own bodies and aspects", () => {
    // An invented instant.
    const chart = natalChart({ utc: "2003-10-11T02:00:00Z" });
    const direct = aspectPatterns(
      chart.bodies.map((row) => ({ body: row.body, lon: row.lon })),
      chart.aspects.map((row) => ({ a: row.a, b: row.b, type: row.type, orb: row.orb }))
    );
    expect(chartAspectPatterns(chart)).toEqual(direct);
    expect(direct.points.map((p) => p.body)).toEqual(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]);
  });
});
