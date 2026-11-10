import { describe, expect, expectTypeOf, it } from "vitest";

import { ODEH_MODEL, YALLOP_MODEL, evaluateCrescent, evaluateOdeh, evaluateYallop } from "../src/index.js";
import type { CrescentCriterionRequest, OdehCriterion, YallopCriterion } from "../src/index.js";

const YALLOP = {
  moonAltitudeGeocentricDeg: 3, sunAltitudeGeocentricDeg: -7,
  elongationGeocentricDeg: 10, moonHorizontalParallaxArcmin: 58
};
const ODEH = {
  moonAltitudeTopocentricDeg: 2, sunAltitudeTopocentricDeg: -4,
  crescentWidthTopocentricArcmin: 0.1
};

describe("explicit crescent model selection", () => {
  it("preserves each model's result and distinct static return type", () => {
    const yallop = evaluateCrescent({ model: YALLOP_MODEL.id, geometry: YALLOP });
    const odeh = evaluateCrescent({ model: ODEH_MODEL.id, geometry: ODEH });
    expectTypeOf(yallop).toEqualTypeOf<Readonly<YallopCriterion>>();
    expectTypeOf(odeh).toEqualTypeOf<Readonly<OdehCriterion>>();
    expect(yallop).toEqual(evaluateYallop(YALLOP));
    expect(odeh).toEqual(evaluateOdeh(ODEH));
    expect(yallop).toHaveProperty("q");
    expect(yallop).not.toHaveProperty("v");
    expect(odeh).toHaveProperty("v");
    expect(odeh).not.toHaveProperty("q");
  });

  it("does not equate like-named categories from different models", () => {
    const yallop = evaluateCrescent({ model: YALLOP_MODEL.id, geometry: YALLOP });
    const odeh = evaluateCrescent({ model: ODEH_MODEL.id, geometry: ODEH });
    expect(yallop.category).toBe("C");
    expect(odeh.category).toBe("C");
    expect(yallop.categoryMeaning).toBe("optical-location-may-be-needed-before-unaided-sighting");
    expect(odeh.categoryMeaning).toBe("optical-aid-only");
    expect(yallop.parameters.categoryLowerExclusiveQ).not.toEqual(odeh.parameters.categoryLowerInclusiveV);
    expect(yallop.conventions.arcOfVision).not.toBe(odeh.conventions.arcOfVision);
  });

  it("allows a union request with model-based result narrowing", () => {
    const requests: CrescentCriterionRequest[] = [
      { model: YALLOP_MODEL.id, geometry: YALLOP }, { model: ODEH_MODEL.id, geometry: ODEH }
    ];
    for (const request of requests) {
      const result = evaluateCrescent(request);
      if (result.model === YALLOP_MODEL.id) {
        expectTypeOf(result).toEqualTypeOf<Readonly<YallopCriterion>>();
        expect(Number.isFinite(result.q)).toBe(true);
      } else {
        expectTypeOf(result).toEqualTypeOf<Readonly<OdehCriterion>>();
        expect(Number.isFinite(result.v)).toBe(true);
      }
    }
  });

  it("rejects model/geometry mismatches both at compile time and runtime", () => {
    // @ts-expect-error Geocentric Yallop inputs cannot serve as Odeh geometry.
    expect(() => evaluateCrescent({ model: ODEH_MODEL.id, geometry: YALLOP })).toThrow(RangeError);
    // @ts-expect-error A topocentric width cannot serve as Yallop geometry.
    expect(() => evaluateCrescent({ model: YALLOP_MODEL.id, geometry: ODEH })).toThrow(RangeError);
  });

  it.each([undefined, null, "odeh", [], 1, {}, { geometry: ODEH }, { model: ODEH_MODEL.id }])(
    "requires an explicit complete request %s", (input) => {
      expect(() => evaluateCrescent(input as never)).toThrow(RangeError);
    }
  );

  it.each(["odeh", "yallop", "ODEH-2006/1", "odeh-2006/2", null, undefined, 0])(
    "rejects unknown models without defaulting %s", (model) => {
      expect(() => evaluateCrescent({ model, geometry: ODEH } as never)).toThrow(RangeError);
    }
  );

  it("rejects unknown options and getters without reading them", () => {
    const request = { model: ODEH_MODEL.id, geometry: ODEH };
    for (const extra of [{ extinction: 0.1 }, { [Symbol("extra")]: true }]) {
      expect(() => evaluateCrescent({ ...request, ...extra })).toThrow(RangeError);
    }
    for (const key of ["model", "geometry"]) {
      let read = false;
      const input = { ...request };
      Object.defineProperty(input, key, { get: () => { read = true; return request[key as keyof typeof request]; } });
      expect(() => evaluateCrescent(input)).toThrow(RangeError);
      expect(read).toBe(false);
    }
    expect(() => evaluateCrescent(Object.create(request) as CrescentCriterionRequest)).toThrow(RangeError);
  });
});
