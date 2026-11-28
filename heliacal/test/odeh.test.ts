import { describe, expect, it } from "vitest";

import { ODEH_MODEL, evaluateOdeh, odehBestTime, odehCategory } from "../src/index.js";
import type { OdehCategory, OdehGeometry } from "../src/index.js";

const SAMPLE: OdehGeometry = {
  moonAltitudeTopocentricDeg: 4,
  sunAltitudeTopocentricDeg: -5,
  crescentWidthTopocentricArcmin: 0.5
};

function adjacent(value: number, direction: "up" | "down"): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const delta = (value > 0) === (direction === "up") ? 1n : -1n;
  view.setBigUint64(0, view.getBigUint64(0) + delta);
  return view.getFloat64(0);
}

describe("Odeh category boundaries", () => {
  // Odeh, Experimental Astronomy 18, printed p.61, equation (2) intervals.
  const boundaries: readonly [number, OdehCategory, OdehCategory][] = [
    [5.65, "A", "B"], [2, "B", "C"], [-0.96, "C", "D"]
  ];

  it.each(boundaries)("includes V=%s in the more-visible category", (v, equal, below) => {
    expect(odehCategory(adjacent(v, "up"))).toBe(equal);
    expect(odehCategory(v)).toBe(equal);
    expect(odehCategory(adjacent(v, "down"))).toBe(below);
  });

  it("accepts every finite residual without clamping or scaling it as q", () => {
    expect(odehCategory(Number.MAX_VALUE)).toBe("A");
    expect(odehCategory(-Number.MAX_VALUE)).toBe("D");
    expect(odehCategory(0)).toBe("C");
    expect(odehCategory(-0)).toBe("C");
    expect(odehCategory(0.216)).toBe("C");
  });

  it.each([NaN, Infinity, -Infinity, null, undefined, "2", {}, [], 0n])("rejects invalid V %s", (v) => {
    expect(() => odehCategory(v as never)).toThrow(RangeError);
  });
});

describe("pure Odeh criterion", () => {
  it("retains source, direct-width units, topocentric frame and unscaled residual", () => {
    const result = evaluateOdeh(SAMPLE);
    expect(result).toMatchObject({
      model: "odeh-2006/1", parameters: ODEH_MODEL, sample: SAMPLE,
      arcOfVisionDeg: 9, crescentWidthArcmin: 0.5,
      receiptScope: "none;caller-supplied-geometry",
      conventions: {
        epoch: "caller-supplied-best-time;not-verified",
        arcOfVision: "topocentric-moon-minus-sun-centre-altitude;airless;degrees",
        width: "caller-supplied-topocentric-crescent-width;arcminutes;no-geocentric-substitution"
      }
    });
    expect(result.v).toBe(result.arcOfVisionDeg - result.referenceArcOfVisionDeg);
    expect(result.category).toBe(odehCategory(result.v));
    for (const field of ["visible", "receipt", "q", "at", "probability"]) expect(result).not.toHaveProperty(field);
  });

  it("copies and freezes its output without freezing caller data", () => {
    const input = { ...SAMPLE };
    const result = evaluateOdeh(input);
    input.crescentWidthTopocentricArcmin = 10;
    expect(result.sample).toEqual(SAMPLE);
    expect(result.sample).not.toBe(input);
    expect(Object.isFrozen(input)).toBe(false);
    for (const value of [result, result.sample, result.conventions, result.parameters,
      result.parameters.arcOfVisionPolynomialDeg, result.parameters.categoryLowerInclusiveV,
      result.parameters.bestTimeLagFraction]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(evaluateOdeh(SAMPLE)).toEqual(result);
  });

  it("keeps eligibility, weather and atmospheric adjustments outside the pure classifier", () => {
    const above = evaluateOdeh({ ...SAMPLE, moonAltitudeTopocentricDeg: 5, sunAltitudeTopocentricDeg: 0 });
    const below = evaluateOdeh({ ...SAMPLE, moonAltitudeTopocentricDeg: -5, sunAltitudeTopocentricDeg: -10 });
    expect(above.v).toBe(below.v);
    expect(above.category).toBe(below.category);
    expect(below.conventions.scope).toBe("criterion-calculation;not-observation-or-sighting-probability");
    expect(below.parameters.atmosphericAdjustment).toBe("none;empirical-calibration");
  });

  it("preserves zero width and tiny positive direct widths", () => {
    const zero = evaluateOdeh({ ...SAMPLE, crescentWidthTopocentricArcmin: -0 });
    expect(Object.is(zero.crescentWidthArcmin, 0)).toBe(true);
    expect(zero.referenceArcOfVisionDeg).toBe(7.1651);
    const tiny = evaluateOdeh({ ...SAMPLE, crescentWidthTopocentricArcmin: Number.MIN_VALUE });
    expect(tiny.crescentWidthArcmin).toBe(Number.MIN_VALUE);
  });

  it("bounds arithmetic geometrically without declaring a calibrated width range", () => {
    const extreme = evaluateOdeh({
      moonAltitudeTopocentricDeg: -90, sunAltitudeTopocentricDeg: 90,
      crescentWidthTopocentricArcmin: adjacent(10800, "down")
    });
    expect(extreme.arcOfVisionDeg).toBe(-180);
    expect(Number.isFinite(extreme.v)).toBe(true);
    expect(Number.isFinite(extreme.referenceArcOfVisionDeg)).toBe(true);
  });

  it.each(["moonAltitudeTopocentricDeg", "sunAltitudeTopocentricDeg", "crescentWidthTopocentricArcmin"] as const)(
    "rejects invalid or missing %s", (key) => {
      for (const value of [NaN, Infinity, -Infinity, "4", null, undefined, {}, [], 4n]) {
        expect(() => evaluateOdeh({ ...SAMPLE, [key]: value } as never)).toThrow(RangeError);
      }
      const missing = { ...SAMPLE } as Partial<OdehGeometry>;
      delete missing[key];
      expect(() => evaluateOdeh(missing as OdehGeometry)).toThrow(RangeError);
    }
  );

  it.each([
    { moonAltitudeTopocentricDeg: -90.001 }, { moonAltitudeTopocentricDeg: 90.001 },
    { sunAltitudeTopocentricDeg: -90.001 }, { sunAltitudeTopocentricDeg: 90.001 },
    { crescentWidthTopocentricArcmin: -Number.MIN_VALUE },
    { crescentWidthTopocentricArcmin: 10800 }, { crescentWidthTopocentricArcmin: Number.MAX_VALUE }
  ])("rejects out-of-domain geometry %j", (change) => {
    expect(() => evaluateOdeh({ ...SAMPLE, ...change })).toThrow(RangeError);
  });

  it.each([undefined, null, [], "geometry", 1, true])("rejects invalid objects %s", (input) => {
    expect(() => evaluateOdeh(input as never)).toThrow(RangeError);
  });

  it("rejects unrelated parameters, inherited fields and accessors", () => {
    for (const extra of [
      { extinctionMagPerAirmass: 0.2 }, { refractionDeg: 0 }, { limitingMagnitude: 6 },
      { height: 20 }, { crescentWidthArcsec: 30 }, { elongationGeocentricDeg: 10 },
      { moonAltitudeGeocentricDeg: 4 }, { model: "yallop" }, { [Symbol("extra")]: 0 }
    ]) {
      expect(() => evaluateOdeh({ ...SAMPLE, ...extra })).toThrow(RangeError);
    }
    let read = false;
    const input = { ...SAMPLE };
    Object.defineProperty(input, "crescentWidthTopocentricArcmin", { get: () => { read = true; return 0.5; } });
    expect(() => evaluateOdeh(input)).toThrow(RangeError);
    expect(read).toBe(false);
    expect(() => evaluateOdeh(Object.create(SAMPLE) as OdehGeometry)).toThrow(RangeError);
  });
});

describe("Odeh evening best time", () => {
  it("uses Odeh equation (1) with its own model metadata and no inferred morning rule", () => {
    const sunset = new Date("2001-02-03T18:00:00Z");
    const moonset = new Date("2001-02-03T18:45:00Z");
    const result = odehBestTime(sunset, moonset);
    expect(result).toMatchObject({
      model: ODEH_MODEL.id, sunset: sunset.toISOString(), moonset: moonset.toISOString(),
      at: "2001-02-03T18:20:00.000Z", lagMilliseconds: 2700000, offsetMilliseconds: 1200000,
      receiptScope: "none;caller-supplied-setting-times",
      conventions: {
        rule: "Odeh-eq1;sunset-plus-four-ninths-positive-moonset-lag",
        scope: "evening-only;no-morning-symmetry-extension"
      }
    });
    const fraction = ODEH_MODEL.bestTimeLagFraction;
    expect(result.offsetMilliseconds * fraction.denominator).toBe(result.lagMilliseconds * fraction.numerator);
    sunset.setTime(0);
    moonset.setTime(0);
    expect(result.at).toBe("2001-02-03T18:20:00.000Z");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.conventions)).toBe(true);
  });

  it("retains strict date validation and refuses nonpositive or unsafe lag", () => {
    expect(() => odehBestTime("2001-02-29", "2001-03-01")).toThrow(RangeError);
    expect(() => odehBestTime("2001-02-03", "2001-02-03T18:00:00")).toThrow(RangeError);
    expect(() => odehBestTime(1, 1)).toThrow(RangeError);
    expect(() => odehBestTime(2, 1)).toThrow(RangeError);
    expect(() => odehBestTime(-8640000000000000, 8640000000000000)).toThrow(RangeError);
  });
});
