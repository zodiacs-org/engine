import { afterEach, describe, expect, it, vi } from "vitest";
import * as matcher from "../../src/configured-aspects.js";
import { castChart } from "../src/engine.js";
import { findHarmonicAspects } from "../src/index.js";
import type { HarmonicAspectOptions, HarmonicAspectPosition } from "../src/index.js";

// Invented rows only. Expected values below follow multiplication, subtraction
// of whole turns and exact dyadic fractions. No prior library output is a reference.
const pair = (lon: number, speed = 0): HarmonicAspectPosition[] => [
  { body: "A", lon: 0, speed: 0 }, { body: "B", lon, speed }
];
const conjunction = { aspects: [{ type: "conjunction", orb: 8 }], bodies: ["A", "B"] };

afterEach(() => vi.restoreAllMocks());

describe("harmonic aspect matching", () => {
  it("delegates to the engine with transformed rows and the effective policy", () => {
    const match = vi.spyOn(matcher, "findConfiguredAspects");
    const result = findHarmonicAspects([
      { body: "Sun", lon: 10, speed: 0.25 },
      { body: "Moon", lon: 130, speed: -0.5 },
      { body: "Mercury", lon: 250, speed: 0 }
    ], 3);
    // N=3 maps 10,130,250 to 30,390-360,750-720, all 30.
    // Speeds become 3/4,-3/2,0. Every pair is exactly conjunct and moving.
    expect(result.harmonicChart.points).toEqual([
      { body: "Sun", sourceLon: 10, lon: 30, sourceSpeed: 0.25, speed: 0.75 },
      { body: "Moon", sourceLon: 130, lon: 30, sourceSpeed: -0.5, speed: -1.5 },
      { body: "Mercury", sourceLon: 250, lon: 30, sourceSpeed: 0, speed: 0 }
    ]);
    expect(match).toHaveBeenCalledTimes(1);
    expect(match.mock.calls[0]![0]).toBe(result.harmonicChart.points);
    expect(match.mock.calls[0]![1]).toBe(result.analysis.policy);
    expect(result.analysis).toBe(match.mock.results[0]!.value);
    expect(result.analysis.aspects).toEqual([
      { a: "Sun", b: "Moon", type: "conjunction", angle: 0, orb: 0, maximumOrb: 10 / 3, motion: "separating", applying: false },
      { a: "Sun", b: "Mercury", type: "conjunction", angle: 0, orb: 0, maximumOrb: 10 / 3, motion: "separating", applying: false },
      { a: "Moon", b: "Mercury", type: "conjunction", angle: 0, orb: 0, maximumOrb: 10 / 3, motion: "separating", applying: false }
    ]);
    expect(result.orbScale).toBe(1 / 3);
    expect(result.orbScaling).toBe("inverse-harmonic");
  });

  it("distinguishes inverse-harmonic from fixed harmonic-circle orb limits", () => {
    // B=120.75 becomes 362.25-360=2.25 at N=3. An N=1 orb of 6
    // becomes 2 in inverse mode, excluding it; fixed mode keeps 6, including it.
    const positions = pair(120.75);
    const policy = { ...conjunction, aspects: [{ type: "conjunction", orb: 6 }] };
    const scaled = findHarmonicAspects(positions, 3, { policy });
    expect(scaled.analysis.aspects).toEqual([]);
    const fixed = findHarmonicAspects(positions, 3, { policy, orbScaling: "fixed" });
    expect(fixed.orbScale).toBe(1);
    expect(fixed.analysis.aspects).toEqual([
      { a: "A", b: "B", type: "conjunction", angle: 0, orb: 2.25, maximumOrb: 6, motion: "stationary", applying: false }
    ]);
    expect(scaled.sourcePolicy.aspects[0]!.orb.stationary).toBe(6);
    expect(scaled.analysis.policy.aspects[0]!.orb.stationary).toBe(2);
  });

  it("includes exact orb boundaries and rejects a representable value just outside", () => {
    // N=4, B=90.5 -> 362-360=2; allowance=8/4=2, inclusive.
    // Add 2^-30 to B: harmonic distance becomes 2+2^-28, strictly outside.
    const boundary = findHarmonicAspects(pair(90.5), 4, { policy: conjunction });
    expect(boundary.analysis.aspects[0]).toMatchObject({ orb: 2, maximumOrb: 2 });
    expect(findHarmonicAspects(pair(90.5 + 2 ** -30), 4, { policy: conjunction }).analysis.aspects).toEqual([]);
    expect(findHarmonicAspects(pair(90.5 - 2 ** -30), 4, { policy: conjunction }).analysis.aspects[0]!.orb)
      .toBe(2 - 2 ** -28);
  });

  it("matches across the circular seam and preserves applying motion", () => {
    // 179.75*2=359.5 and .25*2=.5 are one degree apart across zero.
    // A's speed becomes .5 while B stays still, so the orb decreases.
    const result = findHarmonicAspects([
      { body: "A", lon: 179.75, speed: 0.25 }, { body: "B", lon: 0.25, speed: 0 }
    ], 2, { policy: { ...conjunction, aspects: [{ type: "conjunction", orb: 2 }] } });
    expect(result.analysis.aspects).toEqual([
      { a: "A", b: "B", type: "conjunction", angle: 0, orb: 1, maximumOrb: 1, motion: "applying", applying: true }
    ]);
  });

  it("keeps custom angles fixed and treats zero-orb contacts exactly", () => {
    // N=4 maps B=20 to 80, exactly the custom angle, not 4*80.
    const policy = { bodies: ["A", "B"], aspects: [{ type: "custom-eighty", angle: 80, orb: 0 }] };
    expect(findHarmonicAspects(pair(20), 4, { policy }).analysis.aspects[0])
      .toMatchObject({ type: "custom-eighty", angle: 80, orb: 0, maximumOrb: 0 });
    expect(findHarmonicAspects(pair(20 + 2 ** -30), 4, { policy }).analysis.aspects).toEqual([]);
    expect(() => findHarmonicAspects(pair(20), 4, {
      policy: { bodies: ["A", "B"], aspects: [{ type: "square", angle: 80, orb: 0 }] }
    })).toThrow(RangeError);
  });

  it("scales luminary replacements and both body caps for every motion", () => {
    // N=4: source separation 90.375 becomes 1.5. Sun replacement
    // limits 12,8,16 become 3,2,4; A caps 8,4,12 become 2,1,3;
    // Sun caps 10,6,8 become 2.5,1.5,2. Minima: 2,1,2.
    const policy = {
      bodies: ["Sun", "A"],
      aspects: [{ type: "conjunction", orb: 1, luminaryOrb: { applying: 12, separating: 8, stationary: 16 } }],
      bodyOrbs: {
        A: { applying: 8, separating: 4, stationary: 12 },
        Sun: { applying: 10, separating: 6, stationary: 8 }
      }
    };
    const run = (speed: number) => findHarmonicAspects([
      { body: "Sun", lon: 0, speed: 0 }, { body: "A", lon: 90.375, speed }
    ], 4, { policy });
    const applying = run(-0.25);
    expect(applying.analysis.aspects[0]).toMatchObject({ orb: 1.5, maximumOrb: 2, motion: "applying" });
    expect(run(0.25).analysis.aspects).toEqual([]);
    expect(run(0).analysis.aspects[0]).toMatchObject({ orb: 1.5, maximumOrb: 2, motion: "stationary" });
    expect(applying.analysis.policy.aspects[0]!.orb).toEqual({ applying: 0.25, separating: 0.25, stationary: 0.25 });
    expect(applying.sourcePolicy.aspects[0]!.orb.stationary).toBe(1);
  });

  it.each(["inverse-harmonic", "fixed"] as const)("scales the motion threshold with speeds in %s mode", (orbScaling) => {
    const policy = { ...conjunction, stationaryRelativeSpeed: 0.125 };
    // At N=4 a relative speed of 1/16 becomes 1/4, below cutoff 1/2.
    // Source speed exactly 1/8 becomes 1/2; strict '<' keeps it moving.
    const slow = findHarmonicAspects(pair(90.25, 0.0625), 4, { policy, orbScaling });
    expect(slow.analysis.policy.stationaryRelativeSpeed).toBe(0.5);
    expect(slow.analysis.aspects[0]!.motion).toBe("stationary");
    expect(findHarmonicAspects(pair(90.25, 0.125), 4, { policy, orbScaling }).analysis.aspects[0]!.motion)
      .toBe("separating");
  });

  it("preserves the closest-rule choice, definition ties and pair ordering", () => {
    // A=0, B=5, C=355. AB and AC have distance 5, equidistant from
    // custom angles 4 and 6. First definition wins; tied pairs retain input order.
    const result = findHarmonicAspects([
      ...pair(5), { body: "C", lon: 355, speed: 0 }
    ], 1, { policy: { bodies: ["A", "B", "C"], aspects: [
      { type: "first", angle: 4, orb: 1 }, { type: "second", angle: 6, orb: 1 }
    ] } });
    expect(result.analysis.aspects.map(({ a, b, type, orb }) => ({ a, b, type, orb }))).toEqual([
      { a: "A", b: "B", type: "first", orb: 1 }, { a: "A", b: "C", type: "first", orb: 1 }
    ]);
    // For distance 6.25, angle 6 is closer than 4 regardless of order.
    expect(findHarmonicAspects(pair(6.25), 1, { policy: { bodies: ["A", "B"], aspects: [
      { type: "first", angle: 4, orb: 3 }, { type: "second", angle: 6, orb: 3 }
    ] } }).analysis.aspects[0]).toMatchObject({ type: "second", orb: 0.25 });
  });

  it("keeps engine body selection defaults and allows explicit empty selections", () => {
    expect(findHarmonicAspects(pair(0), 3).analysis.aspects).toEqual([]);
    expect(findHarmonicAspects(pair(0), 3, { policy: conjunction }).analysis.aspects).toHaveLength(1);
    expect(findHarmonicAspects(pair(0), 3, { policy: { ...conjunction, bodies: [] } }).analysis.aspects).toEqual([]);
    expect(findHarmonicAspects(pair(0), 3, { policy: { ...conjunction, aspects: [] } }).analysis.aspects).toEqual([]);
  });

  it("honors a configured harmonic ceiling", () => {
    // .25*720=180, a zero-orb opposition.
    const options = { maxHarmonic: 720, policy: { bodies: ["A", "B"], aspects: [{ type: "opposition", orb: 0 }] } };
    expect(findHarmonicAspects(pair(0.25), 720, options).analysis.aspects[0])
      .toMatchObject({ angle: 180, orb: 0, maximumOrb: 0 });
    expect(() => findHarmonicAspects(pair(0.25), 720)).toThrow(RangeError);
    expect(() => findHarmonicAspects(pair(0.25), 4, { maxHarmonic: 3 })).toThrow(RangeError);
  });

  it("freezes derived results, snapshots policy input and adds no receipt", () => {
    const positions = [{ body: "A", lon: 0, speed: 0 }, { body: "B", lon: 90.5, speed: 0 }];
    const policy = { aspects: [{ type: "conjunction", orb: 8 }], bodies: ["A", "B"] };
    const result = findHarmonicAspects(positions, 4, { policy });
    positions[1]!.lon = 2;
    policy.aspects[0]!.orb = 0;
    policy.bodies[0] = "C";
    expect(result.harmonicChart.points[1]!.sourceLon).toBe(90.5);
    expect(result.sourcePolicy.bodies).toEqual(["A", "B"]);
    expect(result.sourcePolicy.aspects[0]!.orb.stationary).toBe(8);
    for (const object of [result, result.harmonicChart, result.harmonicChart.points, ...result.harmonicChart.points,
      result.sourcePolicy, result.analysis, result.analysis.policy, result.analysis.aspects, ...result.analysis.aspects]) {
      expect(Object.isFrozen(object)).toBe(true);
    }
    expect(Object.hasOwn(result, "envelope")).toBe(false);
  });

  it("analyzes cast body rows while the caller retains the source receipt", () => {
    // Integration only: no ephemeris output is pinned or treated as accuracy evidence.
    const source = castChart({ utc: "2002-04-06T03:00:00Z", latitude: 12, longitude: 24 }, { includeAngles: true });
    const envelope = JSON.stringify(source.envelope);
    const known = source.points.filter((point): point is HarmonicAspectPosition => point.speed !== undefined);
    const result = { source, harmonicAspects: findHarmonicAspects(known, 3) };
    expect(JSON.stringify(result.source.envelope)).toBe(envelope);
    expect(result.harmonicAspects.harmonicChart.points.map(({ body }) => body)).toEqual(known.map(({ body }) => body));
    expect(result.harmonicAspects.harmonicChart.points.some(({ body }) => body === "Ascendant")).toBe(false);
    expect(() => findHarmonicAspects(source.points as readonly HarmonicAspectPosition[], 3)).toThrow(RangeError);
  });
});

describe("harmonic aspect input validation", () => {
  it.each([undefined, null, "0", NaN, Infinity, -Infinity, 1n])("rejects unknown or invalid speed %s even on unselected rows", (speed) => {
    const positions = [...pair(0), { body: "Unselected", lon: 20, speed }];
    expect(() => findHarmonicAspects(positions as readonly HarmonicAspectPosition[], 3, { policy: conjunction })).toThrow(RangeError);
  });

  it("rejects overflow of transformed speeds or thresholds", () => {
    expect(() => findHarmonicAspects(pair(0, Number.MAX_VALUE), 2)).toThrow(RangeError);
    expect(() => findHarmonicAspects(pair(0), 2, { policy: { stationaryRelativeSpeed: Number.MAX_VALUE } })).toThrow(RangeError);
  });

  it.each([null, [], "options", { orbScaling: null }, { orbScaling: "linear" }, { orbScalling: "fixed" },
    { policy: null }, { policy: { aspects: [{ type: "conjunction", orb: -1 }] } },
    { policy: { bodies: ["A", "A"] } }, { policy: { bodies: ["A"], bodyOrbs: { B: 1 } } }])(
    "rejects invalid options %j", (options) => {
      expect(() => findHarmonicAspects(pair(0), 3, options as unknown as HarmonicAspectOptions)).toThrow(RangeError);
    }
  );

  it("rejects invalid positions and engine row-count excess", () => {
    for (const positions of [[], null, new Array(2), [null], pair(Infinity), [pair(0)[0], pair(1)[0]],
      Array.from({ length: 257 }, (_, i) => ({ body: `P${i}`, lon: i, speed: 0 }))]) {
      expect(() => findHarmonicAspects(positions as readonly HarmonicAspectPosition[], 1)).toThrow(RangeError);
    }
  });
});
