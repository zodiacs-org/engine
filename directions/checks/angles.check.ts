import { describe, expect, it } from "vitest";
import {
  angleConjunctionArc, AngleDirectionError, SphereGeometryError
} from "../src/index.js";
import type {
  AngleConjunctionInput, AngleDirectionErrorCode, DirectionAngle, SphereGeometryErrorCode
} from "../src/index.js";
import { ANGLE_EXAMPLES, ANGLE_FIXTURE_TOLERANCES } from "../evidence/angle-examples.js";
import { prepareNatal } from "../src/natal.js";

const coordinates = {
  ramcDegrees: 315, rightAscensionDegrees: 0,
  latitudeDegrees: 0, declinationDegrees: 0
};
const base = { coordinates, angle: "mc", motion: "direct" } as const satisfies AngleConjunctionInput;
const targets = ["mc", "ic", "asc", "dsc"] as const satisfies readonly DirectionAngle[];
const boundaries = {
  mc: "upper-meridian", ic: "lower-meridian", asc: "rising", dsc: "setting"
} as const;

function refused(input: unknown, code: AngleDirectionErrorCode = "invalid-input"): void {
  let caught: unknown;
  try { angleConjunctionArc(input as AngleConjunctionInput); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(AngleDirectionError);
  expect(caught).toBeInstanceOf(RangeError);
  expect(caught).toMatchObject({ name: "AngleDirectionError", code });
}

function sphereRefused(input: unknown, code: SphereGeometryErrorCode = "invalid-input"): void {
  let caught: unknown;
  try { angleConjunctionArc(input as AngleConjunctionInput); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(SphereGeometryError);
  expect(caught).not.toBeInstanceOf(AngleDirectionError);
  expect(caught).toMatchObject({ name: "SphereGeometryError", code });
}

function near(actual: number, expected: number): void {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(ANGLE_FIXTURE_TOLERANCES.angleDegrees);
}

describe("independent hand-derived primary conjunction arcs to angles", () => {
  for (const fixture of ANGLE_EXAMPLES) {
    it(fixture.id, () => {
      const result = angleConjunctionArc({
        coordinates: fixture.coordinates, angle: fixture.angle, motion: "direct"
      });
      const { expected } = fixture;
      expect(result).toMatchObject({
        kind: "conjunction-to-angle", angle: fixture.angle,
        motion: "direct", construction: "placidus-direct"
      });
      near(result.arcDegrees, expected.arcDegrees);
      expect(result.arcDegrees).toBeGreaterThanOrEqual(0);
      expect(result.arcDegrees).toBeLessThan(360);
      const { geometry } = result;
      near(geometry.initial.hourAngleDegrees, expected.initialHourAngleDegrees);
      near(geometry.targetHourAngleDegrees, expected.targetHourAngleDegrees);
      near(geometry.unreducedArcDegrees,
        expected.targetHourAngleDegrees - expected.initialHourAngleDegrees);
      expect(geometry.wholeTurnsAdded).toBe(expected.wholeTurnsAdded);
      expect(geometry.targetBoundary).toBe(boundaries[fixture.angle]);
      expect(geometry.rotation).toBe("westward");
      expect(geometry.initial.ramcDegrees).toBe(fixture.coordinates.ramcDegrees);
      expect(geometry.initial.rightAscensionDegrees).toBe(fixture.coordinates.rightAscensionDegrees);
      const arcs = geometry.initial.semiArcs;
      expect(arcs.latitudeDegrees).toBe(fixture.coordinates.latitudeDegrees);
      expect(arcs.declinationDegrees).toBe(fixture.coordinates.declinationDegrees);
      for (const field of ["diurnalSemiArcDegrees", "nocturnalSemiArcDegrees", "ascensionalDifferenceDegrees"] as const) {
        near(arcs[field], expected[field]);
      }
    });
  }
});

describe("first westward contact and exact coincidences", () => {
  it("reports zero at each exact equatorial target, including the wrapped IC", () => {
    for (const [angle, ramcDegrees] of [["mc", 0], ["ic", 180], ["asc", 270], ["dsc", 90]] as const) {
      const result = angleConjunctionArc({ ...base, angle, coordinates: { ...coordinates, ramcDegrees } });
      expect(Object.is(result.arcDegrees, 0)).toBe(true);
      expect(result.geometry).toMatchObject({
        coincident: true, wholeTurnsAdded: 0, unreducedArcDegrees: 0,
        initial: { kind: "boundary", boundary: boundaries[angle] }
      });
    }
  });

  it("retains the first forward arc when it exceeds a half turn", () => {
    // H = 45; upper culmination follows after 315 degrees of westward rotation.
    const result = angleConjunctionArc({ ...base, coordinates: { ...coordinates, ramcDegrees: 45 } });
    expect(result.arcDegrees).toBe(315);
    expect(result.geometry).toMatchObject({
      targetHourAngleDegrees: 0, unreducedArcDegrees: -45,
      wholeTurnsAdded: 1, coincident: false
    });
  });

  it("preserves tiny positive arcs without tolerance snapping or adding a turn first", () => {
    // H = -epsilon; MC is epsilon farther west. These operands are exact.
    for (const epsilon of [Number.MIN_VALUE, 2 ** -45]) {
      const result = angleConjunctionArc({ ...base, coordinates: {
        ...coordinates, ramcDegrees: 0, rightAscensionDegrees: epsilon
      } });
      expect(result.arcDegrees).toBe(epsilon);
      expect(result.geometry).toMatchObject({
        coincident: false, wholeTurnsAdded: 0, unreducedArcDegrees: epsilon
      });
    }
  });

  it("preserves a tiny forward IC arc when the unreduced difference rounds to a full turn", () => {
    // H = 180 - gap is gap before the lower meridian. IC's signed target
    // is -180, so direct subtraction loses the gap while crossing the cut.
    const gap = 2 ** -45;
    const result = angleConjunctionArc({ ...base, angle: "ic", coordinates: {
      ...coordinates, ramcDegrees: 180 - gap
    } });
    expect(result.arcDegrees).toBe(gap);
    expect(result.geometry).toMatchObject({
      targetHourAngleDegrees: -180, unreducedArcDegrees: -360,
      wholeTurnsAdded: 1, coincident: false
    });
  });

  it("keeps representable near-full turns and refuses a turn rounded to 360", () => {
    // H is just past MC. A full turn minus this dyadic gap is representable.
    const gap = 2 ** -38;
    const result = angleConjunctionArc({ ...base, coordinates: { ...coordinates, ramcDegrees: gap } });
    expect(result.arcDegrees).toBe(360 - gap);
    expect(result.geometry.coincident).toBe(false);
    expect(result.geometry.wholeTurnsAdded).toBe(1);
    // More than half a representable step below 360 rounds to its predecessor.
    // Splitting this long rotation at 180 would round twice and lose the gap.
    for (const tinyGap of [3e-14, 4e-14]) {
      const nearFull = angleConjunctionArc({ ...base, coordinates: {
        ...coordinates, ramcDegrees: tinyGap
      } });
      expect(nearFull.arcDegrees).toBe(360 - 2 ** -44);
      expect(nearFull.geometry.coincident).toBe(false);
    }
    // At this gap the first forward arc cannot be represented below 360.
    refused({ ...base, coordinates: { ...coordinates, ramcDegrees: Number.MIN_VALUE } }, "numerical-degeneracy");
  });
});

describe("explicit motion construction and strict data boundary", () => {
  it("refuses the named Placidus converse-angle construction for every target", () => {
    for (const angle of targets) {
      refused({ ...base, angle, motion: "converse", converseConstruction: "placidus-role-swap" },
        "unsupported-converse-angle");
      refused({ ...base, angle, motion: "converse" });
      refused({ ...base, angle, motion: "converse", converseConstruction: "reverse-rotation" });
    }
  });

  it("requires every field and rejects extra convention choices", () => {
    for (const field of Object.keys(base)) {
      const input: Record<string, unknown> = { ...base };
      delete input[field];
      refused(input);
    }
    refused({ ...base, converseConstruction: "placidus-role-swap" });
    refused({ ...base, converseConstruction: undefined });
    refused({ ...base, key: "ptolemy" });
    refused({ ...base, [Symbol("angle")]: "mc" });
    refused(Object.defineProperty({ ...base }, "hidden", { value: true }));
    for (const angle of [undefined, null, "MC", "vertex", 0]) refused({ ...base, angle });
    for (const motion of [undefined, null, "Direct", "reverse", true]) refused({ ...base, motion });
  });

  it("accepts plain null-prototype and frozen records without changing the contract", () => {
    const result = angleConjunctionArc(base);
    expect(angleConjunctionArc(Object.assign(Object.create(null), base))).toEqual(result);
    expect(angleConjunctionArc(Object.freeze({ ...base,
      coordinates: Object.freeze({ ...coordinates }) }))).toEqual(result);
  });

  it("rejects non-data inputs and inherited requests", () => {
    class Request { coordinates = coordinates; angle = "mc"; motion = "direct"; }
    for (const input of [null, undefined, false, 0, "mc", [], () => base,
      new Request(), Object.create(base), Object.assign(Object.create({ extra: 1 }), base)]) refused(input);
  });

  it("rejects accessor and non-enumerable fields without evaluating accessors", () => {
    let reads = 0;
    for (const field of Object.keys(base)) {
      refused(Object.defineProperty({ ...base }, field, {
        get() { reads++; return base[field as keyof typeof base]; }, enumerable: true
      }));
      refused(Object.defineProperty({ ...base }, field, { enumerable: false }));
    }
    refused(Object.defineProperty({ ...base, motion: "converse" }, "converseConstruction", {
      get() { reads++; return "placidus-role-swap"; }, enumerable: true
    }));
    expect(reads).toBe(0);
  });

  it("delegates strict coordinate validation without hiding sphere error types", () => {
    const { declinationDegrees: _declination, ...missing } = coordinates;
    for (const invalid of [undefined, null, missing, { ...coordinates, longitudeDegrees: 0 },
      { ...coordinates, ramcDegrees: 360 }, { ...coordinates, rightAscensionDegrees: "0" },
      { ...coordinates, latitudeDegrees: NaN }, { ...coordinates, declinationDegrees: 91 }]) {
      sphereRefused({ ...base, coordinates: invalid });
    }
    let reads = 0;
    const accessor = Object.defineProperty({ ...coordinates }, "declinationDegrees", {
      get() { reads++; return 0; }, enumerable: true
    });
    sphereRefused({ ...base, coordinates: accessor });
    expect(reads).toBe(0);
  });
});

describe("sphere domain and immutable audit metadata", () => {
  it("preserves adapter coordinates in a synthetic integration call, without claiming arc accuracy", () => {
    const natal = prepareNatal({
      utc: "2000-01-01T12:00:00Z", timeScale: "ut1", timeKnown: true,
      latitude: 35, longitude: 15, houseSystem: "placidus", deltaT: 64
    });
    const row = natal.equatorial.rows.find(body => body.body === "Sun");
    if (!row || row.ra === null) throw new Error("Synthetic Sun row needs a defined right ascension");
    const result = angleConjunctionArc({ angle: "mc", motion: "direct", coordinates: {
      ramcDegrees: natal.geometry.ramcDegrees,
      rightAscensionDegrees: row.ra,
      latitudeDegrees: natal.geometry.latitudeDegrees,
      declinationDegrees: row.dec
    } });
    expect(result.geometry.initial.ramcDegrees).toBe(natal.geometry.ramcDegrees);
    expect(result.geometry.initial.rightAscensionDegrees).toBe(row.ra);
    expect(result.geometry.initial.semiArcs.latitudeDegrees).toBe(natal.geometry.latitudeDegrees);
    expect(result.geometry.initial.semiArcs.declinationDegrees).toBe(row.dec);
  });

  it("propagates the crossing-semiarc restrictions even for meridian targets", () => {
    // Independent domain examples from M3-derivations.md, reused to verify
    // this API propagates refusals instead of silently changing its method.
    for (const [latitudeDegrees, declinationDegrees, code] of [
      [90, 0, "geographic-pole"], [0, 90, "celestial-pole"],
      [60, 30, "horizon-tangency"], [60, 45, "circumpolar-above"],
      [60, -45, "circumpolar-below"]] as const) {
      for (const angle of targets) {
        sphereRefused({ ...base, angle, coordinates: {
          ...coordinates, latitudeDegrees, declinationDegrees
        } }, code);
      }
    }
  });

  it("returns deeply frozen fresh snapshots without retaining or freezing caller data", () => {
    const input: AngleConjunctionInput = { ...base, coordinates: { ...coordinates } };
    const before = JSON.stringify(input);
    const result = angleConjunctionArc(input);
    const encoded = JSON.stringify(result);
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.coordinates)).toBe(false);
    for (const snapshot of [result, result.geometry, result.geometry.initial, result.geometry.initial.semiArcs]) {
      expect(Object.isFrozen(snapshot)).toBe(true);
    }
    Object.assign(input.coordinates, { ramcDegrees: 0, declinationDegrees: 15 });
    Object.assign(input, { angle: "asc" });
    expect(JSON.stringify(result)).toBe(encoded);
    expect(() => Object.assign(result, { arcDegrees: 0 })).toThrow(TypeError);
    expect(() => Object.assign(result.geometry, { coincident: true })).toThrow(TypeError);
    expect(() => Object.assign(result.geometry.initial, { hourAngleDegrees: 0 })).toThrow(TypeError);
    expect(() => Object.assign(result.geometry.initial.semiArcs, { latitudeDegrees: 45 })).toThrow(TypeError);
    const again = angleConjunctionArc(base);
    expect(again).toEqual(result);
    expect(again).not.toBe(result);
    expect(again.geometry).not.toBe(result.geometry);
    expect(again.geometry.initial).not.toBe(result.geometry.initial);
    expect(again.geometry.initial.semiArcs).not.toBe(result.geometry.initial.semiArcs);
  });
});
