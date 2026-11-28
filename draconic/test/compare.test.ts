import { describe, expect, it } from "vitest";
import type { BirthInput, BodyPosition } from "../../src/index.js";
import { castNatal, compareNatal, signedLongitudeDelta, transformNatal } from "../src/index.js";
import type { DraconicSource } from "../src/index.js";

// Exact binary fractions, worked by hand in ARITHMETIC.md. No ephemeris.
function syntheticSource(): DraconicSource {
  const body = (name: BodyPosition["body"], lon: number): BodyPosition => ({
    body: name, lon, lat: 0, sign: "aries", degree: 0, speed: 0, retrograde: false
  });
  return {
    node: { kind: "true", enginePoint: "North Node", longitude: 75.25 },
    natal: {
      bodies: [body("Sun", 100.5), body("Moon", 15), body("North Node", 75.25), body("South Node", 255.25)],
      angles: { asc: 350, mc: 80, dsc: 170, ic: 260 },
      houses: { system: "whole", cusps: [330, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300] }
    }
  };
}

describe("signedLongitudeDelta hand-derived circular arithmetic", () => {
  it.each([
    [100.5, 25.25, -75.25], [15, 299.75, -75.25],
    [359.75, 0.25, 0.5], [0.25, 359.75, -0.5],
    [0, 180, 180], [180, 0, 180], [359.75, 179.75, 180],
    [0, 180 + 2 ** -45, -180 + 2 ** -45],
    [180 + 2 ** -45, 0, 180 - 2 ** -45],
    [0, 180 - 2 ** -45, 180 - 2 ** -45],
    [180 - 2 ** -45, 0, -180 + 2 ** -45],
    [0, 359.99999999999994, -(2 ** -44)],
    [Number.MIN_VALUE, 0, -Number.MIN_VALUE],
    [0, Number.MIN_VALUE, Number.MIN_VALUE]
  ])("compares natal %s to draconic %s as %s degrees", (natal, draconic, expected) => {
    expect(signedLongitudeDelta(natal, draconic)).toBe(expected);
  });

  it.each([[0, 0], [-0, 0], [0, -0], [75.25, 75.25]])("canonicalizes zero for %s to %s", (natal, draconic) => {
    expect(Object.is(signedLongitudeDelta(natal, draconic), 0)).toBe(true);
  });

  it.each([-1, -Number.MIN_VALUE, 360, 720, NaN, Infinity, -Infinity, null, undefined, "15", true, {}, []])(
    "rejects invalid longitude %s in either argument without coercion", (value) => {
      expect(() => signedLongitudeDelta(value as number, 0)).toThrow(RangeError);
      expect(() => signedLongitudeDelta(0, value as number)).toThrow(RangeError);
    }
  );
});

describe("compareNatal synthetic chart", () => {
  it("returns paired body, angle and ordered cusp longitudes with explicit signed units", () => {
    const result = compareNatal(syntheticSource());
    expect(result.conventions).toEqual({
      units: "degrees", longitudeRange: "[0, 360)", deltaDirection: "draconic-minus-natal",
      deltaRange: "(-180, 180]", antipodalDelta: 180
    });
    expect(result.node).toEqual({ kind: "true", enginePoint: "North Node", longitude: 75.25 });
    expect(result.bodies).toEqual([
      { body: "Sun", natalLongitude: 100.5, draconicLongitude: 25.25, deltaDegrees: -75.25 },
      { body: "Moon", natalLongitude: 15, draconicLongitude: 299.75, deltaDegrees: -75.25 },
      { body: "North Node", natalLongitude: 75.25, draconicLongitude: 0, deltaDegrees: -75.25 },
      { body: "South Node", natalLongitude: 255.25, draconicLongitude: 180, deltaDegrees: -75.25 }
    ]);
    expect(result.angles).toEqual({
      asc: { natalLongitude: 350, draconicLongitude: 274.75, deltaDegrees: -75.25 },
      mc: { natalLongitude: 80, draconicLongitude: 4.75, deltaDegrees: -75.25 },
      dsc: { natalLongitude: 170, draconicLongitude: 94.75, deltaDegrees: -75.25 },
      ic: { natalLongitude: 260, draconicLongitude: 184.75, deltaDegrees: -75.25 }
    });
    expect(result.houses).toEqual({
      system: "whole",
      cusps: [
        [330, 254.75], [0, 284.75], [30, 314.75], [60, 344.75], [90, 14.75], [120, 44.75],
        [150, 74.75], [180, 104.75], [210, 134.75], [240, 164.75], [270, 194.75], [300, 224.75]
      ].map(([natalLongitude, draconicLongitude], index) => ({
        house: index + 1, natalLongitude, draconicLongitude, deltaDegrees: -75.25
      }))
    });
  });

  it("uses an explicitly selected mean node without substituting natal true-node rows", () => {
    const source = syntheticSource();
    source.node = { kind: "mean", enginePoint: "Mean Node", longitude: 75 };
    const result = compareNatal(source);
    expect(result.node).toEqual(source.node);
    expect(result.bodies.map((row) => [row.body, row.draconicLongitude, row.deltaDegrees])).toEqual([
      ["Sun", 25.5, -75], ["Moon", 300, -75], ["North Node", 0.25, -75], ["South Node", 180.25, -75]
    ]);
  });

  it.each([[0, 100.5, 0], [180, 280.5, 180], [359.75, 100.75, 0.25]])(
    "compares a chart rotated by node %s using the shortest signed delta", (node, sun, delta) => {
      const source = syntheticSource();
      source.node.longitude = node;
      const result = compareNatal(source);
      expect(result.bodies[0]).toEqual({
        body: "Sun", natalLongitude: 100.5, draconicLongitude: sun, deltaDegrees: delta
      });
      expect(result.bodies.every((row) => row.deltaDegrees === delta)).toBe(true);
      expect(Object.is(result.bodies[0]!.deltaDegrees, -0)).toBe(false);
    }
  );

  it("compares the actual rounded position rather than reporting a nominal rotation", () => {
    const source = syntheticSource();
    source.node.longitude = Number.MIN_VALUE;
    source.natal.bodies[0]!.lon = 0;
    // 0 - MIN_VALUE + 360 rounds to 360, canonicalized to 0 by rotation.
    expect(compareNatal(source).bodies[0]).toEqual({
      body: "Sun", natalLongitude: 0, draconicLongitude: 0, deltaDegrees: 0
    });
  });

  it("retains empty bodies and absent angles or houses independently", () => {
    const source = syntheticSource();
    source.natal.bodies = [];
    source.natal.angles = null;
    expect(compareNatal(source)).toMatchObject({ bodies: [], angles: null, houses: { system: "whole" } });
    source.natal.angles = { asc: 350, mc: 80, dsc: 170, ic: 260 };
    source.natal.houses = null;
    expect(compareNatal(source)).toMatchObject({ angles: { asc: { deltaDegrees: -75.25 } }, houses: null });
  });

  it("does not mutate frozen input or share mutable output between calls", () => {
    const source = syntheticSource();
    const before = structuredClone(source);
    const freeze = (object: object): void => {
      Object.values(object).forEach((child: unknown) => {
        if (child !== null && typeof child === "object") freeze(child);
      });
      Object.freeze(object);
    };
    freeze(source);
    const result = compareNatal(source);
    const again = compareNatal(source);
    const expected = structuredClone(again);
    result.node.longitude = 0;
    result.bodies[0]!.deltaDegrees = 0;
    result.angles!.asc.draconicLongitude = 0;
    result.houses!.cusps[0]!.natalLongitude = 0;
    result.houses!.system = "equal";
    expect(result.conventions).not.toBe(again.conventions);
    expect(source).toEqual(before);
    expect(again).toEqual(expected);
    expect(compareNatal(source)).toEqual(expected);
    expect(JSON.parse(JSON.stringify(again))).toEqual(expected);
  });

  it("propagates transformation validation rather than comparing invalid positions", () => {
    const source = syntheticSource();
    source.natal.bodies[0]!.lon = NaN;
    expect(() => compareNatal(source)).toThrow(RangeError);
  });
});

describe("compareNatal engine integration (wiring only)", () => {
  const instant = { utc: "2000-04-05T06:07:08Z" };
  const births: BirthInput[] = [
    instant,
    { ...instant, latitude: 12.5, longitude: 45.25, timeKnown: false },
    { ...instant, latitude: 12.5, longitude: 45.25, houseSystem: "equal" },
    { ...instant, latitude: 78.25, longitude: 15.5, houseSystem: "placidus" }
  ];
  it.each(["true", "mean"] as const)("pairs the same engine chart under %s-node rotation", (node) => {
    for (const birth of births) {
      const source = castNatal(birth, { node });
      const before = structuredClone(source);
      const rotated = transformNatal(source);
      const result = compareNatal(source);
      expect(result.bodies.map((row) => row.natalLongitude)).toEqual(source.natal.bodies.map((row) => row.lon));
      expect(result.bodies.map((row) => row.draconicLongitude)).toEqual(rotated.bodies.map((row) => row.lon));
      for (const row of result.bodies) {
        expect(row.deltaDegrees).toBe(signedLongitudeDelta(row.natalLongitude, row.draconicLongitude));
      }
      if (rotated.angles === null) expect(result.angles).toBeNull();
      else {
        for (const key of ["asc", "mc", "dsc", "ic"] as const) {
          expect(result.angles![key].natalLongitude).toBe(source.natal.angles![key]);
          expect(result.angles![key].draconicLongitude).toBe(rotated.angles[key]);
        }
      }
      if (rotated.houses === null) expect(result.houses).toBeNull();
      else {
        expect(result.houses!.system).toBe(source.natal.houses!.system);
        expect(result.houses!.cusps.map((row) => row.natalLongitude)).toEqual(source.natal.houses!.cusps);
        expect(result.houses!.cusps.map((row) => row.draconicLongitude)).toEqual(rotated.houses.cusps);
      }
      expect(source).toEqual(before);
    }
  });
});
