import { describe, expect, it } from "vitest";

import { YALLOP_MODEL, evaluateYallop, yallopBestTime, yallopCategory } from "../src/index.js";
import type { YallopCategory, YallopGeometry } from "../src/index.js";

const SAMPLE: YallopGeometry = {
  moonAltitudeGeocentricDeg: 4,
  sunAltitudeGeocentricDeg: -5,
  elongationGeocentricDeg: 10,
  moonHorizontalParallaxArcmin: 57
};

// Adjacent binary64 inputs test strict comparison without an arbitrary epsilon.
function adjacent(value: number, direction: "up" | "down"): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const delta = (value > 0) === (direction === "up") ? 1n : -1n;
  view.setBigUint64(0, view.getBigUint64(0) + delta);
  return view.getFloat64(0);
}

describe("Yallop category boundaries", () => {
  // Yallop (1997, updated 1998), TN69, printed p.12, Table 5.
  const boundaries: readonly [number, YallopCategory, YallopCategory][] = [
    [0.216, "A", "B"], [-0.014, "B", "C"], [-0.160, "C", "D"],
    [-0.232, "D", "E"], [-0.293, "E", "F"]
  ];

  it.each(boundaries)("assigns equality at q=%s to the less-visible category", (q, above, equal) => {
    expect(yallopCategory(adjacent(q, "up"))).toBe(above);
    expect(yallopCategory(q)).toBe(equal);
    expect(yallopCategory(adjacent(q, "down"))).toBe(equal);
  });

  it("does not clamp q to its approximate descriptive range", () => {
    expect(yallopCategory(Number.MAX_VALUE)).toBe("A");
    expect(yallopCategory(-Number.MAX_VALUE)).toBe("F");
    expect(yallopCategory(0)).toBe("B");
    expect(yallopCategory(-0)).toBe("B");
  });

  it.each([NaN, Infinity, -Infinity, null, undefined, "0.2", {}, [], 0n])("rejects invalid q %s", (q) => {
    expect(() => yallopCategory(q as never)).toThrow(RangeError);
  });
});

describe("pure Yallop criterion", () => {
  it("records its source, fixed parameters and mixed coordinate conventions", () => {
    const result = evaluateYallop(SAMPLE);
    expect(result).toMatchObject({
      model: "yallop-1997/1", parameters: YALLOP_MODEL, sample: SAMPLE,
      arcOfVisionDeg: 9,
      receiptScope: "none;caller-supplied-geometry",
      conventions: {
        epoch: "caller-supplied-best-time;not-verified",
        arcOfVision: "geocentric-moon-minus-sun-centre-altitude;airless;degrees",
        width: "Yallop-eq3.8-3.10;parallax-adjusted-semidiameter;geocentric-elongation;arcminutes"
      }
    });
    expect(result.category).toBe(yallopCategory(result.q));
    expect(result).not.toHaveProperty("visible");
    expect(result).not.toHaveProperty("receipt");
    expect(result).not.toHaveProperty("at");
  });

  it("returns independent immutable data without freezing the caller's sample", () => {
    const input = { ...SAMPLE };
    const result = evaluateYallop(input);
    input.moonAltitudeGeocentricDeg = 30;
    expect(result.sample).toEqual(SAMPLE);
    expect(result.sample).not.toBe(input);
    expect(Object.isFrozen(input)).toBe(false);
    for (const value of [result, result.sample, result.conventions, result.parameters,
      result.parameters.arcOfVisionPolynomialDeg, result.parameters.categoryLowerExclusiveQ,
      result.parameters.bestTimeLagFraction]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(evaluateYallop(SAMPLE)).toEqual(result);
  });

  it("uses geocentric lunar altitude for the signed semidiameter correction", () => {
    const zero = evaluateYallop({ ...SAMPLE, moonAltitudeGeocentricDeg: 0 });
    const high = evaluateYallop({ ...SAMPLE, moonAltitudeGeocentricDeg: 30 });
    const low = evaluateYallop({ ...SAMPLE, moonAltitudeGeocentricDeg: -30 });
    expect(zero.topocentricSemidiameterArcmin).toBe(zero.geocentricSemidiameterArcmin);
    expect(high.topocentricSemidiameterArcmin).toBeGreaterThan(zero.topocentricSemidiameterArcmin);
    expect(low.topocentricSemidiameterArcmin).toBeLessThan(zero.topocentricSemidiameterArcmin);
    expect(high.crescentWidthArcmin).toBeGreaterThan(zero.crescentWidthArcmin);
    expect(low.crescentWidthArcmin).toBeLessThan(zero.crescentWidthArcmin);
  });

  it("handles exact coincidence and small separations without cancellation to zero", () => {
    const zero = evaluateYallop({ ...SAMPLE, elongationGeocentricDeg: 0 });
    expect(zero.crescentWidthArcmin).toBe(0);
    expect(zero.referenceArcOfVisionDeg).toBe(11.8371);
    const tiny = evaluateYallop({ ...SAMPLE, elongationGeocentricDeg: 1e-8 });
    expect(tiny.crescentWidthArcmin).toBeGreaterThan(0);
    expect(tiny.crescentWidthArcmin).toBeLessThan(1e-18);
  });

  it("keeps q arithmetic separate from daylight, lunar phase or horizon eligibility", () => {
    // Numerical inputs deliberately are not an observing opportunity. A future
    // caller must check that separately; these are not predicted sightings.
    const result = evaluateYallop({
      ...SAMPLE, moonAltitudeGeocentricDeg: -80, sunAltitudeGeocentricDeg: -90,
      elongationGeocentricDeg: 180
    });
    expect(result.category).toBe("A");
    expect(result.categoryMeaning).toBe("unaided-eye-easy");
    expect(result.conventions.scope).toBe("criterion-calculation;not-observation-or-sighting-probability");
    expect(result.crescentWidthArcmin).toBe(2 * result.topocentricSemidiameterArcmin);
  });

  it.each(["moonAltitudeGeocentricDeg", "sunAltitudeGeocentricDeg", "elongationGeocentricDeg",
    "moonHorizontalParallaxArcmin"] as const)("rejects invalid field %s", (key) => {
    for (const value of [NaN, Infinity, -Infinity, "4", null, undefined, {}, [], 4n]) {
      expect(() => evaluateYallop({ ...SAMPLE, [key]: value } as never)).toThrow(RangeError);
    }
    const missing = { ...SAMPLE } as Partial<YallopGeometry>;
    delete missing[key];
    expect(() => evaluateYallop(missing as YallopGeometry)).toThrow(RangeError);
  });

  it.each([
    { moonAltitudeGeocentricDeg: -90.001 }, { moonAltitudeGeocentricDeg: 90.001 },
    { sunAltitudeGeocentricDeg: -90.001 }, { sunAltitudeGeocentricDeg: 90.001 },
    { elongationGeocentricDeg: -Number.MIN_VALUE }, { elongationGeocentricDeg: 180.001 },
    { moonHorizontalParallaxArcmin: 0 }, { moonHorizontalParallaxArcmin: -1 },
    { moonHorizontalParallaxArcmin: 5400 }, { moonHorizontalParallaxArcmin: 6000 }
  ])("rejects an out-of-domain value %j", (change) => {
    expect(() => evaluateYallop({ ...SAMPLE, ...change })).toThrow(RangeError);
  });

  it.each([undefined, null, [], "geometry", 1, true])("rejects nonobjects or missing geometry %s", (value) => {
    expect(() => evaluateYallop(value as never)).toThrow(RangeError);
  });

  it("rejects unknown options and accessors without invoking them", () => {
    for (const extra of [
      { extinctionMagPerAirmass: 0.2 }, { refractionDeg: 0 }, { limitingMagnitude: 6 },
      { model: "odeh" }, { elongationTopocentricDeg: 9 }, { [Symbol("extra")]: 0 }
    ]) {
      expect(() => evaluateYallop({ ...SAMPLE, ...extra })).toThrow(RangeError);
    }
    let read = false;
    const input = { ...SAMPLE };
    Object.defineProperty(input, "moonAltitudeGeocentricDeg", { get: () => { read = true; return 4; } });
    expect(() => evaluateYallop(input)).toThrow(RangeError);
    expect(read).toBe(false);
    expect(() => evaluateYallop(Object.create(SAMPLE) as YallopGeometry)).toThrow(RangeError);
  });
});

describe("Yallop evening best time", () => {
  it("returns normalized times and a published-rule receipt scope, without mutating input Dates", () => {
    const sunset = new Date("2001-02-03T18:00:00Z");
    const moonset = new Date("2001-02-03T18:45:00Z");
    const result = yallopBestTime(sunset, moonset);
    expect(result).toMatchObject({
      model: "yallop-1997/1", sunset: sunset.toISOString(), moonset: moonset.toISOString(),
      at: "2001-02-03T18:20:00.000Z", lagMilliseconds: 2700000, offsetMilliseconds: 1200000,
      receiptScope: "none;caller-supplied-setting-times",
      conventions: { scope: "evening-only;no-morning-symmetry-extension" }
    });
    expect(sunset.toISOString()).toBe("2001-02-03T18:00:00.000Z");
    expect(moonset.toISOString()).toBe("2001-02-03T18:45:00.000Z");
    sunset.setTime(0);
    moonset.setTime(0);
    expect(result.at).toBe("2001-02-03T18:20:00.000Z");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.conventions)).toBe(true);
  });

  it("applies the offset to negative and extreme valid epochs without large-epoch loss", () => {
    for (const start of [-8640000000000000, -1, 0, 8639999999999991]) {
      expect(yallopBestTime(start, start + 9).at).toBe(new Date(start + 4).toISOString());
    }
    // Exact rational arithmetic: 4*(2^53-1)/9 = 4003199668773773 + 7/9.
    const result = yallopBestTime(-4503599627370495, 4503599627370496);
    expect(result.offsetMilliseconds).toBe(4003199668773774);
  });

  it("uses elapsed instants, including explicit offsets, instead of local clock subtraction", () => {
    expect(yallopBestTime("2001-02-03T23:50:00-05:00", "2001-02-04T01:35:00-04:00").at)
      .toBe("2001-02-04T05:10:00.000Z");
  });

  it("does not wrap a nonpositive lag or silently truncate an unsafe lag", () => {
    expect(() => yallopBestTime(1, 1)).toThrow(RangeError);
    expect(() => yallopBestTime(2, 1)).toThrow(RangeError);
    expect(() => yallopBestTime(-8640000000000000, 8640000000000000)).toThrow(RangeError);
  });

  it.each(["2001-02-29", "2001-02-03T18:00:00", new Date(NaN), Infinity, NaN, undefined, null])(
    "uses the engine's strict instant validation for either setting %s", (value) => {
      expect(() => yallopBestTime(value as never, "2001-02-04")).toThrow(RangeError);
      expect(() => yallopBestTime("2001-02-03", value as never)).toThrow(RangeError);
    }
  );
});
