import { describe, expect, it } from "vitest";

import {
  VISIBILITY_BODIES, arcusVisibility, enginePosition, evaluateArcusVisibility,
  horizonArcusVisionis, rozenbergAirmass, sunBodyGeometry
} from "../src/index.js";

const AT = "2001-02-03T04:05:06.007Z";
const SITE = { latitude: 13, longitude: -42, height: 120 };
const SAMPLE = { body: "Venus" as const, sunAltitudeDeg: -10, bodyAltitudeDeg: 10 };
const PARAMETERS = {
  model: "arcus-visionis-altitude/1" as const,
  minimumSolarDepressionDeg: 6,
  minimumBodyAltitudeDeg: 5,
  photometry: null
};
const PHOTOMETRY = {
  magnitudeOutsideAtmosphere: -4,
  extinctionMagPerAirmass: 0.2,
  limitingMagnitude: 0,
  refractionDeg: 0.1
};

// These tests check explicit conventions and properties. Independent source
// examples and criterion arithmetic belong to the reference test file.
describe("original horizon arcus criterion", () => {
  it("keeps the target on its airless centre horizon and compares solar depression", () => {
    const result = horizonArcusVisionis(-8, 6);
    expect(result).toMatchObject({
      model: "horizon-arcus-visionis/1", bodyAltitudeDeg: 0,
      sunAltitudeDeg: -8, solarDepressionDeg: 8,
      requiredSolarDepressionDeg: 6, marginDeg: 2, passesCriterion: true
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("includes equality and does not widen the boundary", () => {
    expect(horizonArcusVisionis(-6, 6).passesCriterion).toBe(true);
    expect(horizonArcusVisionis(-6 + 1e-12, 6).passesCriterion).toBe(false);
    expect(horizonArcusVisionis(-6 - 1e-12, 6).passesCriterion).toBe(true);
    expect(horizonArcusVisionis(0, 0).passesCriterion).toBe(true);
    expect(horizonArcusVisionis(1e-12, 0).passesCriterion).toBe(false);
    expect(horizonArcusVisionis(-90, 90).passesCriterion).toBe(true);
    expect(horizonArcusVisionis(90, 0).passesCriterion).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity, "6", null, undefined, {}, 6n])(
    "rejects nonnumeric or nonfinite input %s in either argument", (value) => {
      expect(() => horizonArcusVisionis(value as never, 6)).toThrow(RangeError);
      expect(() => horizonArcusVisionis(-6, value as never)).toThrow(RangeError);
    }
  );

  it.each([[-91, 6], [91, 6], [-6, -1], [-6, 91]])("rejects out-of-domain input %s, %s", (altitude, depression) => {
    expect(() => horizonArcusVisionis(altitude!, depression!)).toThrow(RangeError);
  });
});

describe("apparent-altitude air mass", () => {
  it("stays finite across its domain and decreases as the body rises", () => {
    const values = [0, 1, 5, 15, 45, 89, 90].map(rozenbergAirmass);
    expect(values.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    for (let index = 1; index < values.length; index++) {
      expect(values[index]).toBeLessThan(values[index - 1]!);
    }
    // The published fit is used as stated, including its zenith value.
    expect(rozenbergAirmass(90)).toBeLessThan(1);
  });

  it.each([-1, -Number.MIN_VALUE, 91, NaN, Infinity, -Infinity, "10", null, undefined, {}, 10n])(
    "rejects altitude %s outside the finite apparent-altitude domain", (value) => {
      expect(() => rozenbergAirmass(value as never)).toThrow(RangeError);
    }
  );
});

describe("configurable instantaneous visibility screen", () => {
  it("requires both altitude and darkness and returns each failed gate", () => {
    const result = evaluateArcusVisibility(SAMPLE, PARAMETERS);
    expect(result).toMatchObject({
      model: PARAMETERS, sample: SAMPLE, solarDepressionDeg: 10,
      passesCriterion: true, failedCriteria: [],
      margins: { bodyAltitudeDeg: 5, solarDepressionDeg: 4, magnitude: null },
      photometry: { status: "disabled" }
    });
    const failed = evaluateArcusVisibility({ ...SAMPLE, bodyAltitudeDeg: 4, sunAltitudeDeg: -5 }, PARAMETERS);
    expect(failed.passesCriterion).toBe(false);
    expect(failed.failedCriteria).toEqual(["body-altitude", "solar-depression"]);
    expect(failed.margins).toEqual({ bodyAltitudeDeg: -1, solarDepressionDeg: -1, magnitude: null });
  });

  it("includes exact gate equality without an epsilon allowance", () => {
    const boundary = { ...SAMPLE, sunAltitudeDeg: -6, bodyAltitudeDeg: 5 };
    expect(evaluateArcusVisibility(boundary, PARAMETERS).passesCriterion).toBe(true);
    expect(evaluateArcusVisibility({ ...boundary, bodyAltitudeDeg: 5 - 1e-12 }, PARAMETERS).failedCriteria)
      .toEqual(["body-altitude"]);
    expect(evaluateArcusVisibility({ ...boundary, sunAltitudeDeg: -6 + 1e-12 }, PARAMETERS).failedCriteria)
      .toEqual(["solar-depression"]);
  });

  it("permits every target with an explicit geometric-only screen", () => {
    for (const body of VISIBILITY_BODIES) {
      expect(evaluateArcusVisibility({ ...SAMPLE, body }, PARAMETERS).photometry).toEqual({ status: "disabled" });
    }
    expect(() => evaluateArcusVisibility({ ...SAMPLE, body: "Moon" }, { ...PARAMETERS, photometry: PHOTOMETRY }))
      .toThrow(RangeError);
  });

  it("applies a magnitude gate independently of the altitude gates", () => {
    const parameters = {
      ...PARAMETERS,
      photometry: { ...PHOTOMETRY, magnitudeOutsideAtmosphere: 1, extinctionMagPerAirmass: 0, limitingMagnitude: 1 }
    };
    const boundary = evaluateArcusVisibility(SAMPLE, parameters);
    expect(boundary.passesCriterion).toBe(true);
    expect(boundary.margins.magnitude).toBe(0);
    expect(boundary.photometry).toMatchObject({
      status: "evaluated", apparentAltitudeDeg: 10.1,
      extinctionMagnitude: 0, magnitudeAtObserver: 1, marginMagnitude: 0, passesCriterion: true
    });
    const faint = evaluateArcusVisibility(SAMPLE, {
      ...parameters, photometry: { ...parameters.photometry, magnitudeOutsideAtmosphere: 1 + Number.EPSILON }
    });
    expect(faint.passesCriterion).toBe(false);
    expect(faint.failedCriteria).toEqual(["magnitude"]);
  });

  it("dims with increasing extinction and brightens with altitude or intrinsic brightness", () => {
    const parameters = { ...PARAMETERS, photometry: PHOTOMETRY };
    const baseline = evaluateArcusVisibility(SAMPLE, parameters);
    const hazier = evaluateArcusVisibility(SAMPLE, {
      ...parameters, photometry: { ...PHOTOMETRY, extinctionMagPerAirmass: 0.4 }
    });
    const brighter = evaluateArcusVisibility(SAMPLE, {
      ...parameters, photometry: { ...PHOTOMETRY, magnitudeOutsideAtmosphere: -5 }
    });
    const higher = evaluateArcusVisibility({ ...SAMPLE, bodyAltitudeDeg: 20 }, parameters);
    for (const result of [baseline, hazier, brighter, higher]) expect(result.photometry.status).toBe("evaluated");
    expect(hazier.margins.magnitude).toBeLessThan(baseline.margins.magnitude!);
    expect(brighter.margins.magnitude).toBeGreaterThan(baseline.margins.magnitude!);
    expect(higher.margins.magnitude).toBeGreaterThan(baseline.margins.magnitude!);
  });

  it.each([[-1, 0, -1], [89, 2, 91]] as const)(
    "marks photometry unavailable at airless altitude %s with correction %s", (altitude, correction, apparent) => {
      const result = evaluateArcusVisibility({ ...SAMPLE, bodyAltitudeDeg: altitude }, {
        ...PARAMETERS, photometry: { ...PHOTOMETRY, refractionDeg: correction }
      });
      expect(result.passesCriterion).toBe(false);
      expect(result.failedCriteria).toContain("photometry-unavailable");
      expect(result.failedCriteria).not.toContain("magnitude");
      expect(result.margins.magnitude).toBeNull();
      expect(result.photometry).toEqual({
        status: "unavailable", reason: "apparent-altitude-out-of-domain", apparentAltitudeDeg: apparent
      });
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  );

  it("uses explicit refraction for air mass and airless altitude for the body threshold", () => {
    const result = evaluateArcusVisibility({ ...SAMPLE, bodyAltitudeDeg: -0.5 }, {
      ...PARAMETERS, minimumBodyAltitudeDeg: 0,
      photometry: { ...PHOTOMETRY, refractionDeg: 0.5 }
    });
    expect(result.photometry).toMatchObject({ status: "evaluated", apparentAltitudeDeg: 0 });
    expect(result.failedCriteria).toContain("body-altitude");
    expect(result.failedCriteria).not.toContain("photometry-unavailable");
  });

  it("accepts the angular domain endpoints with photometry disabled", () => {
    expect(evaluateArcusVisibility({ ...SAMPLE, bodyAltitudeDeg: 90, sunAltitudeDeg: -90 }, {
      ...PARAMETERS, minimumBodyAltitudeDeg: 90, minimumSolarDepressionDeg: 90
    }).passesCriterion).toBe(true);
    const result = evaluateArcusVisibility({ ...SAMPLE, bodyAltitudeDeg: -90, sunAltitudeDeg: 90 }, PARAMETERS);
    expect(result.passesCriterion).toBe(false);
    expect(result.photometry.status).toBe("disabled");
  });

  it("snapshots and freezes every owned record and failure list", () => {
    const sample = { ...SAMPLE };
    const photometry = { ...PHOTOMETRY };
    const parameters = { ...PARAMETERS, photometry };
    const result = evaluateArcusVisibility(sample, parameters);
    sample.bodyAltitudeDeg = 20;
    parameters.minimumBodyAltitudeDeg = 15;
    photometry.extinctionMagPerAirmass = 1;
    expect(result.sample.bodyAltitudeDeg).toBe(10);
    expect(result.model.minimumBodyAltitudeDeg).toBe(5);
    expect(result.model.photometry?.extinctionMagPerAirmass).toBe(0.2);
    for (const record of [result, result.sample, result.model, result.model.photometry, result.photometry, result.margins, result.failedCriteria]) {
      expect(Object.isFrozen(record)).toBe(true);
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each([
    null, undefined, [], {}, { ...SAMPLE, body: "Sun" }, { ...SAMPLE, body: "Uranus" },
    { ...SAMPLE, bodyAltitudeDeg: 91 }, { ...SAMPLE, bodyAltitudeDeg: -91 },
    { ...SAMPLE, sunAltitudeDeg: 91 }, { ...SAMPLE, sunAltitudeDeg: -91 },
    { ...SAMPLE, bodyAltitudeDeg: NaN }, { ...SAMPLE, sunAltitudeDeg: Infinity },
    { ...SAMPLE, bodyAltitudeDeg: "10" }, { ...SAMPLE, sunAltitudeDeg: null },
    { ...SAMPLE, apparentAltitudeDeg: 10 }, { ...SAMPLE, [Symbol("units")]: "degrees" }
  ])("rejects malformed sample %j", (sample) => {
    expect(() => evaluateArcusVisibility(sample as never, PARAMETERS)).toThrow(RangeError);
  });

  it.each([
    null, undefined, [], {}, { ...PARAMETERS, model: "schaefer" },
    { ...PARAMETERS, minimumBodyAltitudeDeg: -1 }, { ...PARAMETERS, minimumBodyAltitudeDeg: 91 },
    { ...PARAMETERS, minimumSolarDepressionDeg: -1 }, { ...PARAMETERS, minimumSolarDepressionDeg: 91 },
    { ...PARAMETERS, minimumBodyAltitudeDeg: NaN }, { ...PARAMETERS, minimumSolarDepressionDeg: Infinity },
    { ...PARAMETERS, photometry: undefined }, { ...PARAMETERS, photometry: {} },
    { ...PARAMETERS, extinction: 0.2 }, { ...PARAMETERS, [Symbol("model")]: true }
  ])("rejects malformed or incomplete model %j", (parameters) => {
    expect(() => evaluateArcusVisibility(SAMPLE, parameters as never)).toThrow(RangeError);
  });

  it.each([
    { ...PHOTOMETRY, magnitudeOutsideAtmosphere: NaN }, { ...PHOTOMETRY, limitingMagnitude: Infinity },
    { ...PHOTOMETRY, magnitudeOutsideAtmosphere: "-4" }, { ...PHOTOMETRY, limitingMagnitude: null },
    { ...PHOTOMETRY, extinctionMagPerAirmass: -1 }, { ...PHOTOMETRY, extinctionMagPerAirmass: Infinity },
    { ...PHOTOMETRY, refractionDeg: -1 }, { ...PHOTOMETRY, refractionDeg: 91 },
    { ...PHOTOMETRY, refractionDeg: NaN }, { ...PHOTOMETRY, refractionDeg: undefined },
    { ...PHOTOMETRY, magnitudeOutsideAtmosphere: undefined }, { ...PHOTOMETRY, extinctionMagPerAirmass: undefined },
    { ...PHOTOMETRY, limitingMagnitude: undefined }, { ...PHOTOMETRY, pressure: 1000 },
    { ...PHOTOMETRY, [Symbol("units")]: "magnitudes" }
  ])("rejects invalid or incomplete photometry %j", (photometry) => {
    expect(() => evaluateArcusVisibility(SAMPLE, { ...PARAMETERS, photometry } as never)).toThrow(RangeError);
  });

  it("rejects accessors at each input layer without invoking them", () => {
    let reads = 0;
    const sample = { ...SAMPLE, get bodyAltitudeDeg() { reads++; return 10; } };
    const parameters = { ...PARAMETERS, get minimumBodyAltitudeDeg() { reads++; return 5; } };
    const photometry = { ...PHOTOMETRY, get refractionDeg() { reads++; return 0; } };
    expect(() => evaluateArcusVisibility(sample, PARAMETERS)).toThrow(RangeError);
    expect(() => evaluateArcusVisibility(SAMPLE, parameters)).toThrow(RangeError);
    expect(() => evaluateArcusVisibility(SAMPLE, { ...PARAMETERS, photometry })).toThrow(RangeError);
    expect(reads).toBe(0);
  });

  it("refuses nonfinite derived photometry instead of serializing it as null", () => {
    expect(() => evaluateArcusVisibility(SAMPLE, {
      ...PARAMETERS, photometry: { ...PHOTOMETRY, extinctionMagPerAirmass: Number.MAX_VALUE }
    })).toThrow(RangeError);
    expect(() => evaluateArcusVisibility(SAMPLE, {
      ...PARAMETERS, photometry: {
        ...PHOTOMETRY, extinctionMagPerAirmass: 0,
        magnitudeOutsideAtmosphere: -Number.MAX_VALUE, limitingMagnitude: Number.MAX_VALUE
      }
    })).toThrow(RangeError);
  });
});

// Engine parity establishes integration and provenance, not observational
// accuracy or the predictive performance of a visibility model.
describe("receipted instantaneous visibility", () => {
  it.each(VISIBILITY_BODIES)("uses topocentric airless geometry and preserves engine receipts for %s", (body) => {
    const result = arcusVisibility(body, AT, SITE, PARAMETERS);
    if (result.status !== "ok") throw new Error(result.detail);
    expect(result.body).toBe(body);
    expect(result.at).toBe(AT);
    expect(result.observer).toEqual(SITE);
    expect(result.receiptScope).toBe("positions");
    expect(result.geometry).toEqual(sunBodyGeometry(body, AT, SITE));
    expect(result.criterion).toEqual(evaluateArcusVisibility({
      body,
      sunAltitudeDeg: result.geometry.topocentric.sun.horizontal.altitudeDeg,
      bodyAltitudeDeg: result.geometry.topocentric.target.horizontal.altitudeDeg
    }, PARAMETERS));
    expect(result.geometry.topocentric.target.equatorial).toEqual(enginePosition(body, AT, {
      observer: SITE, frame: "equatorial-true-of-date"
    }));
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each(["1750-02-03", "2200-01-01", "+030000-01-01"])("preserves the engine refusal at %s", (at) => {
    const expected = enginePosition("Sun", at, { frame: "equatorial-true-of-date" });
    expect(expected.status).toBe("refused");
    expect(arcusVisibility("Venus", at, SITE, PARAMETERS)).toEqual(expected);
  });

  it("validates model parameters and Moon photometry before an engine refusal", () => {
    expect(() => arcusVisibility("Venus", "+030000-01-01", SITE, {
      ...PARAMETERS, minimumBodyAltitudeDeg: -1
    })).toThrow(RangeError);
    expect(() => arcusVisibility("Moon", "+030000-01-01", SITE, {
      ...PARAMETERS, photometry: PHOTOMETRY
    })).toThrow(RangeError);
  });

  it("copies observing inputs and normalizes equivalent instants", () => {
    const date = new Date(AT);
    const site = { ...SITE };
    const result = arcusVisibility("Venus", date, site, PARAMETERS);
    expect(result).toEqual(arcusVisibility("Venus", "2001-02-03T11:05:06.007+07:00", SITE, PARAMETERS));
    date.setTime(0);
    site.latitude = 0;
    if (result.status !== "ok") throw new Error(result.detail);
    expect(result.at).toBe(AT);
    expect(result.observer).toEqual(SITE);
    expect(Object.isFrozen(result.observer)).toBe(true);
  });

  it("permits polar directions whose azimuth is undefined", () => {
    const result = arcusVisibility("Moon", AT, { latitude: 90, longitude: 0 }, PARAMETERS);
    if (result.status !== "ok") throw new Error(result.detail);
    expect(result.geometry.topocentric.target.horizontal.azimuthDeg).toBeNull();
    expect(result.criterion.photometry.status).toBe("disabled");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
