import { describe, expect, it } from "vitest";
import type { BodyPosition } from "../../src/index.js";
import { castNatal, rotateLongitude, transformNatal } from "../src/index.js";
import type { DraconicSource } from "../src/index.js";

// Invented positions with exact binary fractions, derived in ARITHMETIC.md.
// This fixture deliberately needs no instant, ephemeris or natal casting.
function syntheticSource(): DraconicSource {
  const row = (body: BodyPosition["body"], lon: number, sign: BodyPosition["sign"], degree: number): BodyPosition => ({
    body, lon, sign, degree, lat: 1.25, speed: -0.125, retrograde: true
  });
  return {
    node: { kind: "true", enginePoint: "North Node", longitude: 75.25 },
    natal: {
      bodies: [
        row("Sun", 100.5, "cancer", 10.5),
        row("Moon", 15, "aries", 15),
        row("North Node", 75.25, "gemini", 15.25),
        row("South Node", 255.25, "sagittarius", 15.25),
        row("Mercury", 105.25, "cancer", 15.25),
        row("Venus", 75, "gemini", 15),
        row("Saturn", 330, "pisces", 0),
        row("Jupiter", 0, "aries", 0)
      ],
      angles: { asc: 350, mc: 80, dsc: 170, ic: 260 },
      houses: { system: "whole", cusps: [330, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300] }
    }
  };
}

function deepFreeze(value: object): void {
  Object.values(value).forEach((child: unknown) => {
    if (child !== null && typeof child === "object") deepFreeze(child);
  });
  Object.freeze(value);
}

describe("transformNatal hand-derived synthetic chart", () => {
  it("rotates all bodies and refreshes signs, degrees and longitude house assignments", () => {
    const result = transformNatal(syntheticSource());
    expect(result.bodies).toEqual([
      { body: "Sun", lon: 25.25, lat: 1.25, sign: "aries", degree: 25.25, house: 5 },
      { body: "Moon", lon: 299.75, lat: 1.25, sign: "capricorn", degree: 29.75, house: 2 },
      { body: "North Node", lon: 0, lat: 1.25, sign: "aries", degree: 0, house: 4 },
      { body: "South Node", lon: 180, lat: 1.25, sign: "libra", degree: 0, house: 10 },
      { body: "Mercury", lon: 30, lat: 1.25, sign: "taurus", degree: 0, house: 5 },
      { body: "Venus", lon: 359.75, lat: 1.25, sign: "pisces", degree: 29.75, house: 4 },
      { body: "Saturn", lon: 254.75, lat: 1.25, sign: "sagittarius", degree: 14.75, house: 1 },
      { body: "Jupiter", lon: 284.75, lat: 1.25, sign: "capricorn", degree: 14.75, house: 2 }
    ]);
    expect(result.bodies[0]).not.toHaveProperty("speed");
    expect(result.bodies[0]).not.toHaveProperty("retrograde");
    expect(result).not.toHaveProperty("aspects");
    expect(result).not.toHaveProperty("engineVersion");
  });

  it("rotates every angle and cusp in place in the sequence, preserving the whole-sign system label", () => {
    const result = transformNatal(syntheticSource());
    expect(result.angles).toEqual({ asc: 274.75, mc: 4.75, dsc: 94.75, ic: 184.75 });
    expect(result.houses).toEqual({
      system: "whole",
      cusps: [254.75, 284.75, 314.75, 344.75, 14.75, 44.75, 74.75, 104.75, 134.75, 164.75, 194.75, 224.75]
    });
    // Recasting whole signs from the rotated ascendant would start at 270.
    expect(result.houses!.cusps[0]).not.toBe(270);
    expect(result.node).toEqual({ kind: "true", enginePoint: "North Node", longitude: 75.25 });
  });

  it("uses the selected mean longitude and retains true nodes among the bodies", () => {
    const source = syntheticSource();
    source.node = { kind: "mean", enginePoint: "Mean Node", longitude: 75 };
    const result = transformNatal(source);
    expect(result.node).toEqual(source.node);
    expect(result.bodies[0]!.lon).toBe(25.5);
    expect(result.bodies[2]!.lon).toBe(0.25);
    expect(result.bodies[3]!.lon).toBe(180.25);
    expect(result.bodies[5]!.lon).toBe(0);
  });

  it("annotates canonical longitudes immediately below sign and circle boundaries without renormalizing", () => {
    const source = syntheticSource();
    source.node.longitude = 0;
    source.natal.houses = null;
    source.natal.angles = null;
    source.natal.bodies[0]!.lon = 29.999999999999996;
    source.natal.bodies[1]!.lon = 359.99999999999994;
    const result = transformNatal(source);
    expect(result.bodies[0]).toMatchObject({ lon: 29.999999999999996, sign: "aries", degree: 29.999999999999996, house: null });
    expect(result.bodies[1]).toMatchObject({ lon: 359.99999999999994, sign: "pisces", degree: 29.999999999999943, house: null });
  });

  it("accepts frozen inputs and allocates independent output objects", () => {
    const source = syntheticSource();
    const before = structuredClone(source);
    deepFreeze(source);
    const result = transformNatal(source);
    expect(source).toEqual(before);
    result.node.longitude = 0;
    result.bodies[0]!.lon = 0;
    result.angles!.asc = 0;
    result.houses!.cusps[0] = 0;
    result.houses!.system = "equal";
    expect(source).toEqual(before);
    expect(transformNatal(source).bodies[0]!.lon).toBe(25.25);
  });
});

describe("transformNatal validation", () => {
  it.each([NaN, Infinity, -1, 360])("rejects invalid longitudes %s wherever consumed", (invalid) => {
    const mutations = [
      (source: DraconicSource) => { source.node.longitude = invalid; },
      (source: DraconicSource) => { source.natal.bodies[0]!.lon = invalid; },
      (source: DraconicSource) => { source.natal.angles!.ic = invalid; },
      (source: DraconicSource) => { source.natal.houses!.cusps[5] = invalid; }
    ];
    for (const mutate of mutations) {
      const source = syntheticSource();
      mutate(source);
      expect(() => transformNatal(source)).toThrow(RangeError);
    }
  });

  it.each([NaN, Infinity, -91, 91])("rejects invalid latitude %s", (lat) => {
    const source = syntheticSource();
    source.natal.bodies[0]!.lat = lat;
    expect(() => transformNatal(source)).toThrow(RangeError);
  });

  it("rejects incomplete and sparse cusp arrays", () => {
    const source = syntheticSource();
    source.natal.houses!.cusps.pop();
    expect(() => transformNatal(source)).toThrow(RangeError);
    source.natal.houses!.cusps = new Array<number>(12);
    expect(() => transformNatal(source)).toThrow(RangeError);
  });

  it("rejects contradictory node labels", () => {
    const source = syntheticSource();
    source.node = { kind: "true", enginePoint: "Mean Node", longitude: 75 } as unknown as DraconicSource["node"];
    expect(() => transformNatal(source)).toThrow(RangeError);
  });
});

describe("transformNatal engine integration (wiring only)", () => {
  it.each(["true", "mean"] as const)("transforms an engine natal chart using its %s node", (node) => {
    const source = castNatal({
      utc: "2000-04-05T06:07:08Z", latitude: 12.5, longitude: 45.25, houseSystem: "equal"
    }, { node });
    const result = transformNatal(source);
    expect(result.bodies.map((body) => body.lon)).toEqual(
      source.natal.bodies.map((body) => rotateLongitude(body.lon, source.node.longitude))
    );
    expect(result.houses!.cusps).toEqual(
      source.natal.houses!.cusps.map((cusp) => rotateLongitude(cusp, source.node.longitude))
    );
    expect(result.node).toEqual(source.node);
  });
});
