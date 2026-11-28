import { afterEach, describe, expect, it, vi } from "vitest";
import { natalChart, RA_POLE_TOLERANCE } from "@zodiacs/engine";
import type { BirthInput } from "@zodiacs/engine";
import * as calcEngine from "@zodiacs/engine/calc";
import type { CalcPosition, CalcTime } from "@zodiacs/engine/calc";
import { createNatalEnvelope } from "@zodiacs/engine/receipt";
import {
  ANGULAR_BODIES, ANGULAR_CONVENTIONS, ANGULAR_DIRECTION_TOLERANCE, AngularBudgetError,
  MAX_ANGLE_EVALUATIONS, sampleAngles
} from "../src/index.js";
import type { AngularSamplingOptions, AngularSamplingResult, GeographicPoint } from "../src/index.js";
import { horizonCoincides, observerAngles } from "../src/angular-geometry.js";

vi.mock("@zodiacs/engine/calc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zodiacs/engine/calc")>();
  return { ...actual, calc: vi.fn(actual.calc), houses: vi.fn(actual.houses) };
});

// Invented birth. Direct engine comparisons check regression, not accuracy.
const birth: BirthInput = {
  utc: "2004-05-06T07:08:09.010+03:00", latitude: 10, longitude: 20,
  houseSystem: "placidus", deltaT: 65, flags: ["dst-fold"]
};
const points = [
  { latitude: 0, longitude: 0 }, { latitude: 45, longitude: 170 },
  { latitude: -89.5, longitude: -180 }, { latitude: 89.5, longitude: 180 }
];
const options: AngularSamplingOptions = { bodies: ["Sun", "Moon", "Pluto"], maxEvaluations: 7 };

function ok(result: AngularSamplingResult) {
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
}

function positionOk(result: ReturnType<typeof calcEngine.calc>): CalcPosition {
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
}

afterEach(() => vi.clearAllMocks());

describe("engine-backed angular samples", () => {
  it("samples each geocentric planet once and each observer once with replayable receipts", () => {
    const result = ok(sampleAngles(birth, points, options));
    expect(result.schema).toBe("zodiacs.relocation-angles.v1");
    expect(result.conventions).toBe(ANGULAR_CONVENTIONS);
    expect(result.evaluations).toEqual({ positions: 3, houses: 4 });
    expect(calcEngine.calc).toHaveBeenCalledTimes(3);
    expect(calcEngine.houses).toHaveBeenCalledTimes(4);
    for (const position of result.positions) {
      expect(position.engine).toEqual(calcEngine.calc(position.engine.receipt.request));
      expect(position.rightAscension).toBe(position.engine.lon);
      expect(position.declination).toBe(position.engine.lat);
      expect(position.raUndefined).toBeNull();
      expect(position.engine.receipt.request).toMatchObject({ frame: "equatorial-true-of-date",
        center: "geocentric", flags: { speeds: false, units: "degrees", correction: "apparent" } });
      expect(position.engine.receipt.engine).toMatchObject({ name: "@zodiacs/engine", version: "1.0.0",
        ephemeris: { name: "astronomy-engine", version: "2.1.19" } });
      expect(position.engine.receipt.conventions).toContain("nutation:iau2000b");
    }
    for (const [index, sample] of result.samples.entries()) {
      if (sample.status !== "ok") throw new Error(sample.reason);
      expect(sample.index).toBe(index);
      expect(sample.point).toEqual(points[index]);
      expect(sample.engine).toEqual(calcEngine.houses(sample.engine.receipt.request));
      expect(sample.engine.receipt.instants).toEqual(result.positions[0]!.engine.receipt.instants);
      expect(sample.eclipticAngles).toEqual(sample.engine.angles);
      expect(sample.ascendantUndefined).toBeNull();
      expect(sample.engine.requested).toBe("placidus");
      expect(sample.engine.system).toBe(Math.abs(sample.point.latitude) > 80 ? "whole" : "placidus");
      for (const [positionIndex, row] of sample.bodies.entries()) {
        const position = result.positions[positionIndex]!;
        expect(row.body).toBe(position.body);
        expect(row.positionIndex).toBe(positionIndex);
        expect(Math.hypot(row.east, row.north, row.up)).toBeCloseTo(1, 14);
        // Independently compute the local up projection from a Cartesian dot
        // product. This checks the library rotation on the engine's direction.
        const radians = Math.PI / 180;
        const ra = position.rightAscension! * radians;
        const dec = position.declination * radians;
        const theta = sample.engine.armc * radians;
        const phi = sample.point.latitude * radians;
        const up = Math.cos(dec) * Math.cos(ra) * Math.cos(phi) * Math.cos(theta)
          + Math.cos(dec) * Math.sin(ra) * Math.cos(phi) * Math.sin(theta) + Math.sin(dec) * Math.sin(phi);
        expect(row.altitude).toBeCloseTo(Math.asin(up) / radians, 11);
        expect(row.residuals.ASC).toBe(row.altitude);
        expect(row.residuals.DSC).toBe(row.altitude);
        expect(row.residuals.MC).toBe(row.hourAngle);
      }
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("defaults to the bounded planet list and preserves requested body order", () => {
    const result = ok(sampleAngles(birth, [points[0]!], { maxEvaluations: 11 }));
    expect(result.positions.map((row) => row.body)).toEqual(ANGULAR_BODIES);
    expect(result.evaluations).toEqual({ positions: 10, houses: 1 });
    const reversed = ok(sampleAngles(birth, [points[0]!], { bodies: ["Pluto", "Moon"], maxEvaluations: 3 }));
    expect(reversed.samples[0]!.bodies.map((row) => row.body)).toEqual(["Pluto", "Moon"]);
    expect(Object.isFrozen(ANGULAR_BODIES)).toBe(true);
    expect(Object.isFrozen(ANGULAR_CONVENTIONS)).toBe(true);
  });

  it("keeps time scales and pins, with the actual converted clock in every calc receipt", () => {
    for (const timeScale of ["utc", "ut1", "tt"] as const) {
      for (const pinned of [false, true]) {
        const input: BirthInput = { utc: birth.utc, houseSystem: "koch", timeScale,
          ...(pinned ? { deltaT: 72.25 } : {}) };
        const chart = natalChart(input);
        const expectedTime: CalcTime = timeScale === "utc"
          ? { iso: chart.input.utc.toISOString(), ...(pinned ? { deltaT: 72.25 } : {}) }
          : { jd: 2_451_545 + (chart.input.utc.getTime() - 946_728_000_000) / 86_400_000,
            scale: timeScale, ...(pinned ? { deltaT: 72.25 } : {}) };
        for (const source of [input, chart, createNatalEnvelope(chart)]) {
          const result = ok(sampleAngles(source, [points[0]!], { bodies: ["Moon"], maxEvaluations: 2 }));
          expect(result.time).toEqual(expectedTime);
          expect(result.positions[0]!.engine).toEqual(calcEngine.calc({ body: "Moon", time: expectedTime,
            frame: "equatorial-true-of-date", flags: { speeds: false } }));
          expect(result.positions[0]!.engine.receipt.instants[0]!.timeScale.input).toBe(timeScale);
          expect(result.positions[0]!.engine.receipt.instants[0]!.deltaT.model === "pinned").toBe(pinned);
          expect(result.samples[0]!.status).toBe("ok");
          if (result.samples[0]!.status === "ok") {
            expect(result.samples[0]!.engine.requested).toBe("koch");
            expect(result.samples[0]!.engine.receipt.instants).toEqual(result.positions[0]!.engine.receipt.instants);
          }
        }
      }
    }
  });

  it("does not reuse imported source positions or attribute imported provenance to fresh angles", () => {
    const envelope = createNatalEnvelope(natalChart(birth), {
      extensions: { note: "synthetic imported source" }, provenance: { runtime: { name: "synthetic" } }
    });
    // The receipt codec checks structure, not the truth of an imported latitude.
    envelope.result.bodies[0]!.lat = 89;
    const result = ok(sampleAngles(envelope, [points[0]!], { bodies: ["Sun"], maxEvaluations: 2 }));
    expect(result.natal).toEqual(envelope);
    expect(result.positions[0]!.engine).toEqual(ok(sampleAngles(birth, [points[0]!], {
      bodies: ["Sun"], maxEvaluations: 2
    })).positions[0]!.engine);
    expect(result.positions[0]!.engine.receipt).not.toHaveProperty("provenance");
    const snapshot = structuredClone(result);
    envelope.result.bodies[0]!.lat = 88;
    expect(result).toEqual(snapshot);
  });

  it("uses the engine's natal angles and recalculates polar fallback independently of the source", () => {
    const source = natalChart({ ...birth, latitude: 89.5, houseSystem: "koch" });
    const result = ok(sampleAngles(source, points, { bodies: ["Moon"], maxEvaluations: 5 }));
    expect(result.natal.receipt.houses.actual).toBe("whole");
    for (const sample of result.samples) {
      if (sample.status !== "ok") throw new Error(sample.reason);
      const direct = natalChart({ ...birth, ...sample.point, houseSystem: "koch" });
      expect(sample.engine.angles).toEqual(direct.angles);
      expect(sample.engine.cusps).toEqual(direct.houses?.cusps);
      expect(sample.engine.system).toBe(direct.houses?.system);
      expect(sample.engine.receipt.request.houseSystem).toBe("koch");
    }
  });

  it("owns caller coordinates and separate observer receipts", () => {
    const input = points.map((point) => ({ ...point }));
    const result = ok(sampleAngles(birth, input, options));
    const snapshot = structuredClone(result);
    input[0]!.latitude = 80;
    expect(result).toEqual(snapshot);
    const first = result.samples[0]!;
    const second = result.samples[1]!;
    if (first.status !== "ok" || second.status !== "ok") throw new Error("Expected valid samples");
    expect(first.engine.receipt).not.toBe(second.engine.receipt);
    expect(first.engine.cusps).not.toBe(second.engine.cusps);
  });

  it("treats the antimeridian aliases as equivalent engine directions", () => {
    const result = ok(sampleAngles(birth, [{ latitude: 35, longitude: -180 }, { latitude: 35, longitude: 180 }],
      { bodies: ["Moon"], maxEvaluations: 3 }));
    const first = result.samples[0]!;
    const second = result.samples[1]!;
    expect(first.bodies).toEqual(second.bodies);
    expect(first.point.longitude).toBe(-180);
    expect(second.point.longitude).toBe(180);
  });

  it("refuses an unknown-time source without evaluating directions or inventing a time", () => {
    const result = sampleAngles({ ...birth, timeKnown: false }, points, options);
    expect(result).toMatchObject({ status: "refused", reason: "unknown-time", engineRefusal: null,
      evaluations: { positions: 0, houses: 0 }, positions: [], samples: [] });
    expect(result.natal.receipt.instant).toBe("2004-05-06T04:08:09.010Z");
    expect(calcEngine.calc).not.toHaveBeenCalled();
    expect(calcEngine.houses).not.toHaveBeenCalled();
  });

  it("returns an unchanged engine refusal outside calc coverage with no partial geometry", () => {
    const result = sampleAngles({ utc: "2304-05-06T07:08:09Z" }, points, options);
    expect(result).toMatchObject({ status: "refused", reason: "engine-refusal",
      engineRefusal: { status: "refused", reason: "out-of-range", span: calcEngine.CALC_SPAN },
      positions: [], samples: [], evaluations: { positions: 1, houses: 0 } });
    expect(calcEngine.houses).not.toHaveBeenCalled();
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("also refuses a pin that moves TT outside calc coverage", () => {
    const result = sampleAngles({ utc: "2199-12-31T12:00:00Z", deltaT: 86_400 }, points, options);
    expect(result).toMatchObject({ status: "refused", engineRefusal: { reason: "out-of-range" } });
  });

  it("does not leak partial samples when an observer engine call refuses", () => {
    const refusal = { status: "refused", reason: "not-in-this-version", detail: "synthetic refusal" } as const;
    vi.mocked(calcEngine.houses).mockReturnValueOnce(refusal);
    const result = sampleAngles(birth, points, options);
    expect(result).toMatchObject({ status: "refused", reason: "engine-refusal", engineRefusal: refusal,
      evaluations: { positions: 3, houses: 1 }, positions: [], samples: [] });
  });
});

describe("undefined angular directions", () => {
  it("keeps exact geographic poles as undefined samples and evaluates no engine houses there", () => {
    const result = ok(sampleAngles(birth, [
      { latitude: -90, longitude: 0 }, { latitude: 90, longitude: 180 }, points[0]!
    ], { bodies: ["Moon"], maxEvaluations: 2 }));
    expect(result.evaluations).toEqual({ positions: 1, houses: 1 });
    expect(result.samples.slice(0, 2)).toEqual([
      { index: 0, point: { latitude: -90, longitude: 0 }, status: "undefined", reason: "geographic-pole", engine: null, bodies: [] },
      { index: 1, point: { latitude: 90, longitude: 180 }, status: "undefined", reason: "geographic-pole", engine: null, bodies: [] }
    ]);
  });

  it("masks arbitrary RA at a numerical celestial pole and retains the supplied engine result", () => {
    const real = positionOk(calcEngine.calc({ body: "Moon", time: "2004-05-06", frame: "equatorial-true-of-date" }));
    // Branch injection only: this is not a Moon ephemeris fixture or accuracy claim.
    const singular: CalcPosition = { ...real, lon: 123, lat: 90 };
    vi.mocked(calcEngine.calc).mockReturnValueOnce(singular);
    const result = ok(sampleAngles(birth, [points[0]!], { bodies: ["Moon"], maxEvaluations: 2 }));
    expect(result.positions[0]).toMatchObject({ rightAscension: null, declination: 90,
      raUndefined: "celestial-pole", engine: singular });
    expect(result.samples[0]!.bodies[0]).toMatchObject({ hourAngle: null, altitude: 0, azimuth: 0,
      horizonMotion: "stationary", residuals: { MC: null, IC: null, ASC: 0, DSC: 0 } });
  });

  it("makes azimuth undefined at the zenith of an actual sampled engine direction", () => {
    const seed = ok(sampleAngles(birth, [points[0]!], { bodies: ["Moon"], maxEvaluations: 2 }));
    const sample = seed.samples[0]!;
    if (sample.status !== "ok") throw new Error(sample.reason);
    const position = seed.positions[0]!;
    const longitude = ((position.rightAscension! - sample.engine.armc + 180) % 360 + 360) % 360 - 180;
    const result = ok(sampleAngles(birth, [{ latitude: position.declination, longitude }],
      { bodies: ["Moon"], maxEvaluations: 2 }));
    expect(result.samples[0]!.bodies[0]).toMatchObject({ azimuth: null, azimuthUndefined: "zenith-or-nadir" });
    expect(result.samples[0]!.bodies[0]!.altitude).toBeCloseTo(90, 12);
  });

  it("marks the engine's ecliptic ASC/DSC undefined at horizon coincidence", () => {
    const seed = ok(sampleAngles(birth, [points[0]!], { bodies: ["Sun"], maxEvaluations: 2 }));
    const seedSample = seed.samples[0]!;
    if (seedSample.status !== "ok") throw new Error(seedSample.reason);
    const latitude = 90 - seedSample.engine.obliquity;
    const longitude = ((270 - seedSample.engine.armc + 180) % 360 + 360) % 360 - 180;
    const result = ok(sampleAngles(birth, [{ latitude, longitude }], { bodies: ["Sun"], maxEvaluations: 2 }));
    const sample = result.samples[0]!;
    if (sample.status !== "ok") throw new Error(sample.reason);
    expect(sample.ascendantUndefined).toBe("ecliptic-horizon-coincidence");
    expect(sample.eclipticAngles.asc).toBeNull();
    expect(sample.eclipticAngles.dsc).toBeNull();
    expect(sample.eclipticAngles.mc).toBe(sample.engine.angles.mc);
    expect(sample.engine).toEqual(calcEngine.houses(sample.engine.receipt.request));
    // Planetary horizon projection still has a meaning, independently of
    // whether the ecliptic plane has a unique rising intersection.
    expect(Number.isFinite(sample.bodies[0]!.altitude)).toBe(true);
  });
});

describe("angular preflight and work bounds", () => {
  it("refuses excess work before reading a source or calling either engine function", () => {
    const getter = vi.fn(() => { throw new Error("Source must not be read"); });
    const source = Object.defineProperty({}, "utc", { get: getter }) as BirthInput;
    expect(() => sampleAngles(source, points, { ...options, maxEvaluations: 6 })).toThrow(AngularBudgetError);
    try { sampleAngles(source, points, { ...options, maxEvaluations: 6 }); } catch (error) {
      expect(error).toMatchObject({ name: "AngularBudgetError", requiredEvaluations: 7, maxEvaluations: 6 });
    }
    expect(getter).not.toHaveBeenCalled();
    expect(calcEngine.calc).not.toHaveBeenCalled();
    expect(calcEngine.houses).not.toHaveBeenCalled();
  });

  it("caps both budgets and point arrays, including all-pole input that makes no houses calls", () => {
    const poles = Array.from({ length: MAX_ANGLE_EVALUATIONS }, () => ({ latitude: 90, longitude: 0 }));
    const result = ok(sampleAngles(birth, poles, { bodies: ["Sun"], maxEvaluations: MAX_ANGLE_EVALUATIONS }));
    expect(result.samples).toHaveLength(MAX_ANGLE_EVALUATIONS);
    expect(result.evaluations).toEqual({ positions: 1, houses: 0 });
    expect(() => sampleAngles(birth, [...poles, poles[0]!], options)).toThrow(RangeError);
    const nonpolar = Array.from({ length: MAX_ANGLE_EVALUATIONS }, () => points[0]!);
    expect(() => sampleAngles(birth, nonpolar, { bodies: ["Sun"], maxEvaluations: MAX_ANGLE_EVALUATIONS }))
      .toThrow(AngularBudgetError);
  });

  it.each([null, [], {}, { maxEvaluations: 0 }, { maxEvaluations: 1.5 }, { maxEvaluations: Infinity },
    { maxEvaluations: "7" }, { maxEvaluations: MAX_ANGLE_EVALUATIONS + 1 },
    { ...options, bodies: [] }, { ...options, bodies: ["Moon", "Moon"] },
    { ...options, bodies: ["Earth"] }, { ...options, bodies: ["North Node"] },
    { ...options, bodies: ["sun"] }, { ...options, bodies: ["Moon", , "Sun"] },
    { ...options, bodies: null }
  ])("rejects malformed options: %j", (input) => {
    expect(() => sampleAngles(birth, points, input as AngularSamplingOptions)).toThrow(RangeError);
  });

  it.each([null, [], {}, [null], [{}], [{ latitude: 91, longitude: 0 }],
    [{ latitude: 0, longitude: -181 }], [{ latitude: NaN, longitude: 0 }],
    [{ latitude: 0, longitude: Infinity }], [{ latitude: "0", longitude: 0 }], [points[0], , points[1]]
  ])("rejects malformed point arrays: %j", (input) => {
    expect(() => sampleAngles(birth, input as GeographicPoint[], options)).toThrow(RangeError);
  });

  it("rejects accessors without invoking them and accepts frozen ordinary data", () => {
    const getter = vi.fn(() => { throw new Error("Not data"); });
    const bodyArray = Object.defineProperty(["Moon"], "0", { get: getter });
    expect(() => sampleAngles(birth, points, { ...options, bodies: bodyArray as never })).toThrow(RangeError);
    const pointArray = Object.defineProperty([points[0]!], "0", { get: getter });
    expect(() => sampleAngles(birth, pointArray, options)).toThrow(RangeError);
    const point = Object.defineProperty({ longitude: 0 }, "latitude", { get: getter });
    expect(() => sampleAngles(birth, [point as GeographicPoint], options)).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
    expect(ok(sampleAngles(birth, Object.freeze([Object.freeze({ ...points[0]! })]),
      Object.freeze({ bodies: Object.freeze(["Moon"] as const), maxEvaluations: 2 }))).status).toBe("ok");
  });
});

describe("spherical projection definitions on artificial directions", () => {
  it("selects the eastern rising and western setting horizon branches", () => {
    const rising = observerAngles(90, 0, 0, 0);
    const setting = observerAngles(270, 0, 0, 0);
    expect(rising).toMatchObject({ hourAngle: -90, azimuth: 90, horizonMotion: "rising" });
    expect(setting).toMatchObject({ hourAngle: 90, azimuth: 270, horizonMotion: "setting" });
    expect(rising.altitude).toBeCloseTo(0, 13);
    expect(setting.altitude).toBeCloseTo(0, 13);
  });

  it("distinguishes upper and lower meridians even when neither is on the horizon", () => {
    const upper = observerAngles(0, 20, 0, 30);
    const lower = observerAngles(180, 20, 0, 30);
    expect(upper.residuals.MC).toBe(0);
    expect(upper.residuals.IC).toBe(-180);
    expect(upper.altitude).toBeCloseTo(80, 13);
    expect(lower.residuals.MC).toBe(-180);
    expect(lower.residuals.IC).toBe(0);
    expect(lower.altitude).toBeCloseTo(-40, 13);
    expect(upper.horizonMotion).toBe("stationary");
    expect(lower.horizonMotion).toBe("stationary");
  });

  it("makes azimuth null at zenith and nadir instead of reporting an arbitrary direction", () => {
    expect(observerAngles(0, 30, 0, 30)).toMatchObject({ altitude: 90, azimuth: null,
      azimuthUndefined: "zenith-or-nadir" });
    expect(observerAngles(180, -30, 0, 30)).toMatchObject({ altitude: -90, azimuth: null,
      azimuthUndefined: "zenith-or-nadir" });
    expect(observerAngles(0, 30.001, 0, 30).azimuth).toBe(0);
    expect(ANGULAR_DIRECTION_TOLERANCE).toBe(RA_POLE_TOLERANCE);
  });

  it("detects ecliptic/horizon coincidence in both hemispheres", () => {
    expect(horizonCoincides(66.5, 270, 23.5)).toBe(true);
    expect(horizonCoincides(-66.5, 90, 23.5)).toBe(true);
    expect(horizonCoincides(66.5, 90, 23.5)).toBe(false);
    expect(horizonCoincides(66.499, 270, 23.5)).toBe(false);
    expect(horizonCoincides(-66.5, 270, 23.5)).toBe(false);
  });
});
