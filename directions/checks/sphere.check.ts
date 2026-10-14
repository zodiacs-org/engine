import { describe, expect, it } from "vitest";
import {
  hourAngleDegrees, semiArcs, spherePosition, SphereGeometryError
} from "../src/index.js";
import {
  SPHERE_EXAMPLES, SPHERE_FIXTURE_TOLERANCES, SEMI_ARC_REFUSAL_EXAMPLES
} from "../evidence/sphere-examples.js";

type SphereInput = Parameters<typeof spherePosition>[0];
type ErrorCode = SphereGeometryError["code"];

const base = {
  ramcDegrees: 45, rightAscensionDegrees: 0,
  latitudeDegrees: 0, declinationDegrees: 0
} as const satisfies SphereInput;

function rejected(run: () => unknown, code: ErrorCode): void {
  let caught: unknown;
  try { run(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(SphereGeometryError);
  expect(caught).toBeInstanceOf(RangeError);
  expect(caught).toMatchObject({ name: "SphereGeometryError", code });
}

function rejectedInput(input: unknown, code: ErrorCode = "invalid-input"): void {
  rejected(() => spherePosition(input as SphereInput), code);
}

function near(actual: number, expected: number, tolerance: number): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

describe("independent hand-derived sphere examples", () => {
  for (const fixture of SPHERE_EXAMPLES) {
    it(fixture.id, () => {
      const { input, expected } = fixture;
      const result = spherePosition(input);
      near(hourAngleDegrees(input.ramcDegrees, input.rightAscensionDegrees),
        expected.hourAngleDegrees, SPHERE_FIXTURE_TOLERANCES.angleDegrees);
      near(result.hourAngleDegrees, expected.hourAngleDegrees, SPHERE_FIXTURE_TOLERANCES.angleDegrees);
      expect(result.ramcDegrees).toBe(input.ramcDegrees);
      expect(result.rightAscensionDegrees).toBe(input.rightAscensionDegrees);
      expect(result.kind).toBe(expected.kind);
      expect(result.quadrant).toBe(expected.quadrant);
      expect(result.boundary).toBe(expected.boundary);
      near(result.semiArcPositionDegrees, expected.semiArcPositionDegrees,
        SPHERE_FIXTURE_TOLERANCES.angleDegrees);
      expect(result.semiArcs.latitudeDegrees).toBe(input.latitudeDegrees);
      expect(result.semiArcs.declinationDegrees).toBe(input.declinationDegrees);
      const arcs = semiArcs(input.latitudeDegrees, input.declinationDegrees);
      for (const field of ["ascensionalDifferenceDegrees", "diurnalSemiArcDegrees", "nocturnalSemiArcDegrees"] as const) {
        near(arcs[field], expected[field], SPHERE_FIXTURE_TOLERANCES.angleDegrees);
        near(result.semiArcs[field], expected[field], SPHERE_FIXTURE_TOLERANCES.angleDegrees);
      }
      for (const field of ["meridianDistanceDegrees", "semiArcDegrees", "quadrantFraction"] as const) {
        const actual = result[field];
        const reference = expected[field];
        if (reference === null) {
          expect(actual).toBeNull();
        } else {
          expect(actual).not.toBeNull();
          near(actual!, reference, field === "quadrantFraction"
            ? SPHERE_FIXTURE_TOLERANCES.fraction : SPHERE_FIXTURE_TOLERANCES.angleDegrees);
        }
      }
    });
  }

  for (const fixture of SEMI_ARC_REFUSAL_EXAMPLES) {
    it(`refuses ${fixture.id}`, () => {
      const { latitudeDegrees, declinationDegrees } = fixture.input;
      rejected(() => semiArcs(latitudeDegrees, declinationDegrees), fixture.expectedReason);
      rejectedInput({ ...base, ...fixture.input }, fixture.expectedReason);
    });
  }
});

describe("hour-angle orientation and wrapping", () => {
  // Exact integer and binary-fraction subtractions, independent of the solver.
  for (const [ramc, ra, expected] of [
    [0, 0, 0], [359, 359, 0], [10, 350, 20], [350, 10, -20],
    [45, 315, 90], [315, 45, -90], [180, 0, -180], [0, 180, -180],
    [100, 280, -180], [280, 100, -180], [359.75, 0.25, -0.5],
    [0.25, 359.75, 0.5], [0.5, 0.25, 0.25], [0.25, 0.5, -0.25]
  ] as const) {
    it(`RAMC ${ramc} minus RA ${ra} gives west-positive H ${expected}`, () => {
      expect(hourAngleDegrees(ramc, ra)).toBe(expected);
    });
  }

  it("preserves representable small differences without adding a full turn first", () => {
    expect(hourAngleDegrees(Number.MIN_VALUE, 0)).toBe(Number.MIN_VALUE);
    expect(hourAngleDegrees(0, Number.MIN_VALUE)).toBe(-Number.MIN_VALUE);
    const step = 2 ** -45;
    expect(hourAngleDegrees(90 + step, 90)).toBe(step);
    expect(hourAngleDegrees(90, 90 + step)).toBe(-step);
  });

  it("reports positive zero for every coincident signed-zero input", () => {
    for (const ramc of [0, -0]) {
      for (const ra of [0, -0]) expect(Object.is(hourAngleDegrees(ramc, ra), 0)).toBe(true);
    }
  });

  it("refuses unnormalized coordinates instead of choosing an implicit normalization", () => {
    for (const invalid of [-Number.MIN_VALUE, -1, 360, 720, NaN, Infinity, -Infinity,
      "45", null, undefined, true, new Number(45)]) {
      rejected(() => hourAngleDegrees(invalid as number, 0), "invalid-input");
      rejected(() => hourAngleDegrees(0, invalid as number), "invalid-input");
    }
  });
});

describe("axis boundaries and quadrant orientation", () => {
  it("names each exact equatorial axis without inventing quadrant metadata", () => {
    for (const [ramcDegrees, boundary, position] of [
      [0, "upper-meridian", 0], [90, "setting", 90],
      [180, "lower-meridian", 180], [270, "rising", 270]
    ] as const) {
      const result = spherePosition({ ...base, ramcDegrees });
      expect(result).toMatchObject({
        kind: "boundary", boundary, quadrant: null,
        meridianDistanceDegrees: null, semiArcDegrees: null,
        quadrantFraction: null, semiArcPositionDegrees: position
      });
    }
  });

  it("does not absorb nearby nonzero positions into an axis with an epsilon", () => {
    // These dyadic differences are exact at the chosen coordinates and are
    // much smaller than the independent fixture comparison allowance.
    const step = 2 ** -38;
    for (const [ramcDegrees, rightAscensionDegrees, quadrant] of [
      [step, 0, "above-west"], [0, step, "above-east"],
      [90 - step, 0, "above-west"], [90 + step, 0, "below-west"],
      [180 - step, 0, "below-west"], [180 + step, 0, "below-east"],
      [270 - step, 0, "below-east"], [270 + step, 0, "above-east"]
    ] as const) {
      const result = spherePosition({ ...base, ramcDegrees, rightAscensionDegrees });
      expect(result.kind).toBe("quadrant");
      expect(result.quadrant).toBe(quadrant);
      expect(result.boundary).toBeNull();
      expect(result.quadrantFraction).toBeGreaterThan(0);
      expect(result.quadrantFraction).toBeLessThan(1);
      expect([0, 90, 180, 270, 360]).not.toContain(result.semiArcPositionDegrees);
    }
  });

  it("keeps lower-meridian wrapping separate from rising and setting", () => {
    const result = spherePosition({ ...base, ramcDegrees: 0, rightAscensionDegrees: 180 });
    expect(result.hourAngleDegrees).toBe(-180);
    expect(result.boundary).toBe("lower-meridian");
    expect(result.semiArcPositionDegrees).toBe(180);
  });

  it("keeps a zero-declination circle equally divided in either hemisphere", () => {
    for (const latitudeDegrees of [-89, -60, -35, 0, 35, 60, 89]) {
      const result = spherePosition({ ...base, latitudeDegrees });
      expect(result.semiArcs.diurnalSemiArcDegrees).toBe(90);
      expect(result.semiArcs.nocturnalSemiArcDegrees).toBe(90);
      expect(result.semiArcPositionDegrees).toBe(45);
      expect(result.quadrantFraction).toBe(0.5);
    }
  });

  it("does not extend tangent or circumpolar exclusions into a finite neighborhood", () => {
    for (const hemisphere of [-1, 1]) {
      for (const declinationSign of [-1, 1]) {
        const latitudeDegrees = hemisphere * 60;
        const declinationDegrees = declinationSign * (30 - 2 ** -30);
        const result = semiArcs(latitudeDegrees, declinationDegrees);
        expect(result.diurnalSemiArcDegrees).toBeGreaterThan(0);
        expect(result.diurnalSemiArcDegrees).toBeLessThan(180);
        expect(result.nocturnalSemiArcDegrees).toBeGreaterThan(0);
        expect(result.nocturnalSemiArcDegrees).toBeLessThan(180);
        rejected(() => semiArcs(latitudeDegrees, declinationSign * (30 + 2 ** -30)),
          hemisphere === declinationSign ? "circumpolar-above" : "circumpolar-below");
      }
    }
  });

  it("compares the tangent domain before a rounded magnitude sum loses the gap", () => {
    // 2^-48 is one representable step at 30 degrees. Both sums below round
    // to 90 in binary64, while their exact operands lie on opposite sides.
    const inside = 30 - 2 ** -48;
    const outside = 30 + 2 ** -48;
    expect(60 + inside).toBe(90);
    expect(60 + outside).toBe(90);
    for (const hemisphere of [-1, 1]) {
      for (const declinationSign of [-1, 1]) {
        const arcs = semiArcs(hemisphere * 60, declinationSign * inside);
        expect(arcs.diurnalSemiArcDegrees).toBeGreaterThan(0);
        expect(arcs.diurnalSemiArcDegrees).toBeLessThan(180);
        expect(arcs.nocturnalSemiArcDegrees).toBeGreaterThan(0);
        expect(arcs.nocturnalSemiArcDegrees).toBeLessThan(180);
        rejected(() => semiArcs(hemisphere * 60, declinationSign * outside),
          hemisphere === declinationSign ? "circumpolar-above" : "circumpolar-below");
      }
    }
  });

  it("retains quadrant identity when a tiny interior coordinate rounds onto an axis", () => {
    // Binary64 cannot retain this offset after adding it to a large coordinate.
    // The kind and boundary describe H, independently of the rounded coordinate.
    const west = spherePosition({ ...base, ramcDegrees: Number.MIN_VALUE });
    expect(west.kind).toBe("quadrant");
    expect(west.quadrant).toBe("above-west");
    expect(west.boundary).toBeNull();
    expect(west.hourAngleDegrees).toBe(Number.MIN_VALUE);
    const east = spherePosition({ ...base, ramcDegrees: 0, rightAscensionDegrees: Number.MIN_VALUE });
    expect(east.kind).toBe("quadrant");
    expect(east.quadrant).toBe("above-east");
    expect(east.boundary).toBeNull();
    expect(east.hourAngleDegrees).toBe(-Number.MIN_VALUE);
  });
});

describe("explicit numeric geometry and plain input data", () => {
  it("requires all four coordinate fields", () => {
    for (const field of Object.keys(base)) {
      const missing: Record<string, unknown> = { ...base };
      delete missing[field];
      rejectedInput(missing);
    }
  });

  it("requires finite unboxed numbers in each field", () => {
    for (const field of Object.keys(base)) {
      for (const invalid of [undefined, null, NaN, Infinity, -Infinity, "0", false,
        0n, {}, [], new Number(0)]) {
        rejectedInput({ ...base, [field]: invalid });
      }
    }
    for (const invalid of [-91, 91, -180, 180]) {
      rejectedInput({ ...base, latitudeDegrees: invalid });
      rejectedInput({ ...base, declinationDegrees: invalid });
    }
    for (const invalid of [-Number.MIN_VALUE, 360, 720]) {
      rejectedInput({ ...base, ramcDegrees: invalid });
      rejectedInput({ ...base, rightAscensionDegrees: invalid });
    }
  });

  it("validates semi-arc numeric inputs independently of position", () => {
    for (const invalid of [undefined, null, NaN, Infinity, -Infinity, "0", false,
      0n, {}, [], new Number(0), -91, 91]) {
      rejected(() => semiArcs(invalid as number, 0), "invalid-input");
      rejected(() => semiArcs(0, invalid as number), "invalid-input");
    }
  });

  it("accepts plain null-prototype records and frozen caller data", () => {
    expect(spherePosition(Object.assign(Object.create(null), base))).toEqual(spherePosition(base));
    expect(spherePosition(Object.freeze({ ...base }))).toEqual(spherePosition(base));
  });

  it("rejects primitives, class instances, inherited fields and unknown properties", () => {
    class Coordinates { ramcDegrees = 45; rightAscensionDegrees = 0; latitudeDegrees = 0; declinationDegrees = 0; }
    for (const invalid of [undefined, null, false, 42, "coordinates", 0n, [],
      new Date(0), new Coordinates(), () => base, Object.create(base),
      Object.assign(Object.create({ extra: 1 }), base)]) rejectedInput(invalid);
    rejectedInput({ ...base, refraction: true });
    rejectedInput({ ...base, [Symbol("declinationDegrees")]: 0 });
    rejectedInput(Object.defineProperty({ ...base }, "hidden", { value: 0 }));
  });

  it("rejects accessor and hidden coordinate fields without reading accessors", () => {
    let reads = 0;
    for (const field of Object.keys(base)) {
      rejectedInput(Object.defineProperty({ ...base }, field, {
        get() { reads++; return 0; }, enumerable: true
      }));
      rejectedInput(Object.defineProperty({ ...base }, field, { enumerable: false }));
    }
    rejectedInput(Object.defineProperty({ ...base }, "extra", {
      get() { reads++; return 0; }, enumerable: true
    }));
    const numberLike = { valueOf() { reads++; return 0; } };
    rejectedInput({ ...base, latitudeDegrees: numberLike });
    rejected(() => semiArcs(numberLike as unknown as number, 0), "invalid-input");
    rejected(() => hourAngleDegrees(numberLike as unknown as number, 0), "invalid-input");
    expect(reads).toBe(0);
  });
});

describe("pure immutable sphere snapshots", () => {
  it("copies geometry without freezing or retaining caller state", () => {
    const input = { ...base } as SphereInput;
    const result = spherePosition(input);
    const original = JSON.stringify(result);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.semiArcs)).toBe(true);
    expect(JSON.parse(original)).toEqual(result);
    Object.assign(input, { latitudeDegrees: 35, rightAscensionDegrees: 180 });
    expect(JSON.stringify(result)).toBe(original);
    expect(() => Object.assign(result, { ramcDegrees: 0 })).toThrow(TypeError);
    expect(() => Object.assign(result.semiArcs, { latitudeDegrees: 0 })).toThrow(TypeError);
    expect(spherePosition(base)).toEqual(result);
    expect(spherePosition(base)).not.toBe(result);
    expect(spherePosition(base).semiArcs).not.toBe(result.semiArcs);
  });

  it("freezes independently returned semi-arcs", () => {
    const result = semiArcs(0, 0);
    expect(Object.isFrozen(result)).toBe(true);
    expect(() => Object.assign(result, { diurnalSemiArcDegrees: 0 })).toThrow(TypeError);
    expect(semiArcs(0, 0)).toEqual(result);
    expect(semiArcs(0, 0)).not.toBe(result);
  });
});
