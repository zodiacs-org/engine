import { describe, expect, it } from "vitest";
import { HOUSE_SYSTEMS, houseOf } from "../../src/houses.js";
import { analyzeAngularity, castEventChart } from "../src/index.js";
import type { AngularityGeometry, AngularityOptions } from "../src/index.js";
import type { BodyName } from "../../src/types.js";

// Invented geometry, not astronomical positions or timing references. Equal
// sign cusps partition [0,360) into successive 30-degree houses. The angles
// need not be the first, fourth, seventh and tenth cusps in whole signs.
const names = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"] as const;
function geometry() {
  const longitudes = [35, 359, 271, 95, 181, 194, 65];
  return {
    angles: { asc: 15, mc: 270, dsc: 195, ic: 90 },
    houses: { requested: "whole" as const, actual: "whole" as const,
      cusps: Array.from({ length: 12 }, (_, index) => index * 30) },
    bodies: names.map((body, index) => ({ body: body as BodyName, lon: longitudes[index]! }))
  };
}

function expectFrozenTree(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectFrozenTree(child);
  }
}

describe("hand-derived angularity geometry", () => {
  it("returns each classical planet with separate house and angle factors", () => {
    const result = analyzeAngularity(geometry());
    // Direct divisions by 30 give houses 2,12,10,4,7,7,3. Distances
    // of Mercury to MC, Venus to IC and Jupiter to DSC are 1,5,1 degrees.
    expect(result.planets).toEqual([
      { planet: "Sun", longitude: 35, house: 2, angularHouse: false, nearAngles: [], angular: false },
      { planet: "Moon", longitude: 359, house: 12, angularHouse: false, nearAngles: [], angular: false },
      { planet: "Mercury", longitude: 271, house: 10, angularHouse: true,
        nearAngles: [{ angle: "mc", longitude: 270, separationDegrees: 1 }], angular: true },
      { planet: "Venus", longitude: 95, house: 4, angularHouse: true,
        nearAngles: [{ angle: "ic", longitude: 90, separationDegrees: 5 }], angular: true },
      { planet: "Mars", longitude: 181, house: 7, angularHouse: true, nearAngles: [], angular: true },
      { planet: "Jupiter", longitude: 194, house: 7, angularHouse: true,
        nearAngles: [{ angle: "dsc", longitude: 195, separationDegrees: 1 }], angular: true },
      { planet: "Saturn", longitude: 65, house: 3, angularHouse: false, nearAngles: [], angular: false }
    ]);
    expect(result.angularPlanets).toEqual(["Mercury", "Venus", "Mars", "Jupiter"]);
    expect(result.label).toBe("traditional conventions, not predictions");
    expect(result.convention).toEqual({
      planets: names, angularHouses: [1, 4, 7, 10],
      houseMethod: "engine-houseOf-on-actual-cusps;no-cusp-orb",
      angleMethod: "short-ecliptic-longitude-distance;latitude-ignored",
      angleOrbDegrees: 5,
      orbBoundary: "inclusive-exact-binary64;reported-distance-rounded",
      combination: "angular-house-or-near-angle"
    });
  });

  it("keeps MC proximity distinct from whole-sign tenth-house membership", () => {
    const input = geometry();
    input.angles = { asc: 15, mc: 250, dsc: 195, ic: 70 };
    input.bodies[0]!.lon = 250; // House 9 but exactly on MC.
    input.bodies[6]!.lon = 284; // House 10 but far from every angle.
    const result = analyzeAngularity(input, { angleOrbDegrees: 0 });
    expect(result.planets[0]).toMatchObject({ house: 9, angularHouse: false,
      angular: true, nearAngles: [{ angle: "mc", separationDegrees: 0 }] });
    expect(result.planets[6]).toMatchObject({ house: 10, angularHouse: true,
      angular: true, nearAngles: [] });
  });

  it.each([
    { lon: 0, house: 1, angular: true }, { lon: 29.5, house: 1, angular: true },
    { lon: 30, house: 2, angular: false }, { lon: 89.5, house: 3, angular: false },
    { lon: 90, house: 4, angular: true }, { lon: 120, house: 5, angular: false },
    { lon: 180, house: 7, angular: true }, { lon: 210, house: 8, angular: false },
    { lon: 270, house: 10, angular: true }, { lon: 300, house: 11, angular: false },
    { lon: 359.5, house: 12, angular: false }
  ])("uses cusp starts inclusively with no cusp orb: %j", ({ lon, house, angular }) => {
    const input = geometry();
    input.bodies[0]!.lon = lon;
    const row = analyzeAngularity(input, { angleOrbDegrees: 0 }).planets[0]!;
    expect(row.house).toBe(house);
    expect(row.angularHouse).toBe(angular);
  });

  it("reuses actual unequal cusps and handles a house across longitude zero", () => {
    const input = geometry();
    const cusps = [350, 15, 50, 85, 120, 155, 170, 195, 230, 265, 300, 335];
    const result = analyzeAngularity({ ...input,
      houses: { requested: "porphyry", actual: "porphyry", cusps },
      bodies: names.map((body, index) => ({ body, lon: [0, 15, 84.5, 85, 170, 264.5, 265][index]! }))
    }, { angleOrbDegrees: 0 });
    expect(result.planets.map(row => row.house)).toEqual([1, 2, 3, 4, 7, 9, 10]);
    expect(result.planets.map(row => row.angularHouse)).toEqual([true, false, false, true, true, false, true]);
  });

  it("ignores outer planets and nodes and returns classical order regardless of input order", () => {
    const input = geometry();
    input.bodies.push(...(["Uranus", "Neptune", "Pluto", "North Node", "South Node"] as const)
      .map(body => ({ body, lon: 15 })));
    input.bodies.reverse();
    const result = analyzeAngularity(input);
    expect(result.planets.map(row => row.planet)).toEqual(names);
    expect(result.angularPlanets).toEqual(["Mercury", "Venus", "Mars", "Jupiter"]);
  });
});

describe("angle orb boundaries", () => {
  it.each([
    { angle: 0, lon: 359, orb: 1, included: true, distance: 1 },
    { angle: 359, lon: 0, orb: 1, included: true, distance: 1 },
    { angle: 15, lon: 10, orb: 5, included: true, distance: 5 },
    { angle: 15, lon: 20, orb: 5, included: true, distance: 5 },
    { angle: 0, lon: 5.000000000000001, orb: 5, included: false, distance: null },
    { angle: 0, lon: 4.999999999999999, orb: 5, included: true, distance: 4.999999999999999 },
    { angle: 15, lon: 15, orb: 0, included: true, distance: 0 },
    { angle: 0, lon: Number.MIN_VALUE, orb: 0, included: false, distance: null },
    { angle: 0, lon: 180, orb: 180, included: true, distance: 180 },
    // The exact binary64 circular distance is 8 + 2^-50, even though a
    // rounded subtraction followed by wrapping can report exactly 8.
    { angle: 359.7, lon: 7.6999999999999895, orb: 8, included: false, distance: null }
  ])("compares exact supplied doubles without widening the orb: %j", ({ angle, lon, orb, included, distance }) => {
    const input = geometry();
    input.angles.asc = angle;
    input.bodies[0]!.lon = lon;
    const row = analyzeAngularity(input, { angleOrbDegrees: orb }).planets[0]!;
    const match = row.nearAngles.find(item => item.angle === "asc");
    expect(match !== undefined).toBe(included);
    if (included) expect(match!.separationDegrees).toBe(distance);
  });

  it("retains all matching angles in deterministic order when the orb is wide", () => {
    const result = analyzeAngularity(geometry(), { angleOrbDegrees: 180 });
    expect(result.planets[0]!.nearAngles).toEqual([
      { angle: "asc", longitude: 15, separationDegrees: 20 },
      { angle: "mc", longitude: 270, separationDegrees: 125 },
      { angle: "dsc", longitude: 195, separationDegrees: 160 },
      { angle: "ic", longitude: 90, separationDegrees: 55 }
    ]);
    expect(result.angularPlanets).toEqual(names);
  });

  it("allows callers to change angle proximity without changing house membership", () => {
    const narrow = analyzeAngularity(geometry(), { angleOrbDegrees: 0 });
    const broad = analyzeAngularity(geometry(), { angleOrbDegrees: 20 });
    expect(narrow.planets.map(row => row.house)).toEqual(broad.planets.map(row => row.house));
    expect(narrow.planets[1]!.angular).toBe(false);
    expect(broad.planets[1]).toMatchObject({ house: 12, angularHouse: false, angular: true,
      nearAngles: [{ angle: "asc", longitude: 15, separationDegrees: 16 }] });
    expect(broad.convention.angleOrbDegrees).toBe(20);
  });
});

describe("cast chart integration and immutable output", () => {
  // These checks compare engine integration, not astronomical accuracy.
  it.each(HOUSE_SYSTEMS)("analyzes the engine's actual %s houses without recasting", houseSystem => {
    const chart = castEventChart({ at: "2000-02-29T12:34:56.789Z",
      place: { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 }, houseSystem });
    const result = analyzeAngularity(chart);
    expect(result.houses).toEqual({ requested: houseSystem, actual: chart.houses.actual });
    for (const row of result.planets) {
      const body = chart.bodies.find(item => item.body === row.planet)!;
      expect(row.longitude).toBe(body.lon);
      expect(row.house).toBe(houseOf(body.lon, chart.houses.cusps));
    }
  });

  it.each([78.5, -78.5])("uses whole-sign fallback at synthetic latitude %s", latitude => {
    const input = { at: "2000-02-29T12:34:56.789Z", place: { latitude, longitude: -31.25 } };
    const fallback = analyzeAngularity(castEventChart({ ...input, houseSystem: "placidus" }));
    const whole = analyzeAngularity(castEventChart({ ...input, houseSystem: "whole" }));
    expect(fallback.houses).toEqual({ requested: "placidus", actual: "whole" });
    expect(fallback.planets).toEqual(whole.planets);
  });

  it("detaches and freezes results without freezing or modifying supplied geometry", () => {
    const input = geometry();
    const options = { angleOrbDegrees: 5 };
    const before = structuredClone(input);
    const result = analyzeAngularity(input, options);
    expect(input).toEqual(before);
    expectFrozenTree(result);
    expect(Object.isFrozen(input.angles)).toBe(false);
    expect(Object.isFrozen(input.houses.cusps)).toBe(false);
    expect(Object.isFrozen(input.bodies[0])).toBe(false);
    expect(Object.isFrozen(options)).toBe(false);
    input.bodies[2]!.lon = 0;
    input.angles.mc = 0;
    input.houses.cusps[0] = 1;
    options.angleOrbDegrees = 20;
    expect(result.planets[2]).toMatchObject({ longitude: 271,
      nearAngles: [{ longitude: 270, separationDegrees: 1 }] });
    expect(result.convention.angleOrbDegrees).toBe(5);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(Reflect.set(result.planets[0]!, "house", 12)).toBe(false);
  });
});

describe("angularity input validation", () => {
  it.each([null, [], 5, "5", { angleOrb: 5 }, { angleOrbDegrees: null },
    { angleOrbDegrees: "5" }, { angleOrbDegrees: NaN }, { angleOrbDegrees: Infinity },
    { angleOrbDegrees: -1 }, { angleOrbDegrees: 180.5 }])("rejects invalid options: %j", options => {
    expect(() => analyzeAngularity(geometry(), options as AngularityOptions)).toThrow(RangeError);
  });

  it.each([NaN, Infinity, -1, 360, "15", null, undefined])("rejects invalid geometry longitudes: %j", lon => {
    const input = geometry();
    expect(() => analyzeAngularity({ ...input, angles: { ...input.angles, asc: lon } } as AngularityGeometry))
      .toThrow(RangeError);
    expect(() => analyzeAngularity({ ...input,
      bodies: [{ body: "Sun", lon }, ...input.bodies.slice(1)] } as AngularityGeometry)).toThrow(RangeError);
    const cusps = [...input.houses.cusps];
    cusps[0] = lon as number;
    expect(() => analyzeAngularity({ ...input, houses: { ...input.houses, cusps } })).toThrow(RangeError);
  });

  it.each([null, [], {}, { angles: null }, { ...geometry(), houses: null },
    { ...geometry(), angles: {} }, { ...geometry(), bodies: null },
    { ...geometry(), bodies: [null] }, { ...geometry(), bodies: [{ body: "sun", lon: 15 }] },
    { ...geometry(), houses: { ...geometry().houses, requested: "unsupported" } },
    { ...geometry(), houses: { ...geometry().houses, actual: "unsupported" } },
    { ...geometry(), houses: { ...geometry().houses, cusps: Array(12) } },
    { ...geometry(), houses: { ...geometry().houses, cusps: [0] } },
    { ...geometry(), bodies: geometry().bodies.slice(1) },
    { ...geometry(), bodies: [...geometry().bodies, { body: "Sun", lon: 15 }] },
    { ...geometry(), bodies: Array(7) }
  ])("rejects incomplete or malformed chart geometry: %j", input => {
    expect(() => analyzeAngularity(input as AngularityGeometry)).toThrow(RangeError);
  });
});
