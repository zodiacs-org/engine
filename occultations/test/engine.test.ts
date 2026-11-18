import { describe, expect, it } from "vitest";

import { CALC_SPAN, calc } from "../../src/calc.js";
import type { CalcPosition } from "../../src/calc.js";
import { timeBasis } from "../../src/time-scale.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { SOLAR_SYSTEM_BODIES, positionAt } from "../src/index.js";
import type { PositionFrame, PositionRequest, PositionResult } from "../src/index.js";

// Delegation and receipt regression tests only. Comparing with the same engine
// does not establish occultation or ephemeris accuracy.
const SAMPLE_TIME = "2024-06-01T12:00:00.000Z";

function success(result: PositionResult): Extract<PositionResult, { status: "ok" }> {
  if (result.status !== "ok") throw new Error(`Unexpected refusal: ${result.reason}`);
  return result;
}

function engineSuccess(result: ReturnType<typeof calc>): CalcPosition {
  if (result.status !== "ok") throw new Error(`Unexpected engine refusal: ${result.reason}`);
  return result;
}

function expectDeepFrozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectDeepFrozen(child);
  }
}

describe("engine adapter integration, not accuracy", () => {
  it("captures request and observer fields once before validation and calculation", () => {
    let bodyReads = 0;
    let elevationReads = 0;
    const actual = success(positionAt({
      get body() { return ++bodyReads === 1 ? "Moon" : "Sun"; },
      time: SAMPLE_TIME,
      observer: {
        latitude: 0,
        longitude: 0,
        get elevationMeters() { return ++elevationReads === 1 ? 100 : Number.NaN; }
      }
    }));
    expect(bodyReads).toBe(1);
    expect(elevationReads).toBe(1);
    expect(actual.body).toBe("Moon");
    expect(actual.receipt.request.body).toBe("Moon");
    expect(actual.receipt.request.observer?.elevationMeters).toBe(100);
    expect(actual.receipt.calculation?.request.center).toEqual({
      topocentric: { latitude: 0, longitude: 0, height: 100 }
    });
  });

  it("requires request fields on the supplied record rather than its prototype", () => {
    const request = Object.create({ body: "Moon", time: SAMPLE_TIME }) as PositionRequest;
    expect(() => positionAt(request)).toThrow(RangeError);
  });

  it.each(SOLAR_SYSTEM_BODIES)("delegates %s to the engine and preserves its calculation receipt", (body) => {
    const actual = success(positionAt({ body, time: SAMPLE_TIME }));
    const expected = engineSuccess(calc({
      body, time: SAMPLE_TIME, frame: "equatorial-true-of-date", center: "geocentric",
      flags: { correction: "apparent", cartesian: true, speeds: false, units: "degrees", deflection: false }
    }));
    const { receipt, ...position } = actual;
    const { receipt: engineReceipt, ...enginePosition } = expected;
    expect(position).toEqual(enginePosition);
    expect(receipt.calculation).toEqual(engineReceipt);
    expect(receipt.engine).toEqual(engineReceipt.engine);
    expect(receipt.engine).toEqual({ name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: EPHEMERIS });
    expect(receipt.request).toEqual({ body, time: SAMPLE_TIME, frame: "equatorial-true-of-date", observer: null });
    expect(receipt.validation).toBe("integration-only;occultation-accuracy-unmeasured");
    expect(actual.speeds).toBeNull();
    expect(actual.cartesian).not.toBeNull();
    expect(actual.cartesian).toMatchObject({ vx: null, vy: null, vz: null });
    expect(actual.lon).toBeGreaterThanOrEqual(0);
    expect(actual.lon).toBeLessThan(360);
  });

  it.each<PositionFrame>(["equatorial-true-of-date", "ecliptic-true-of-date"])("preserves explicit %s frame and units", (frame) => {
    const actual = success(positionAt({ body: "Mars", time: SAMPLE_TIME, frame }));
    const expected = engineSuccess(calc({ body: "Mars", time: SAMPLE_TIME, frame, flags: { speeds: false, cartesian: true } }));
    expect(actual.lon).toBe(expected.lon);
    expect(actual.lat).toBe(expected.lat);
    expect(actual.cartesian).toEqual(expected.cartesian);
    expect(actual.receipt.request.frame).toBe(frame);
    expect(actual.receipt.conventions).toContain(`frame:${frame}`);
    expect(actual.receipt.conventions).toContain("angles:degrees");
    expect(actual.receipt.conventions).toContain("distance:au");
  });

  it("translates observer elevation to calc height on the stated ellipsoid", () => {
    const observer = { latitude: 24.5, longitude: -63.25, elevationMeters: 1234 };
    const actual = success(positionAt({ body: "Moon", time: SAMPLE_TIME, observer }));
    const expected = engineSuccess(calc({
      body: "Moon", time: SAMPLE_TIME, frame: "equatorial-true-of-date",
      center: { topocentric: { latitude: observer.latitude, longitude: observer.longitude, height: 1234 } },
      flags: { correction: "apparent", cartesian: true, speeds: false }
    }));
    expect(actual.lon).toBe(expected.lon);
    expect(actual.lat).toBe(expected.lat);
    expect(actual.dist).toBe(expected.dist);
    expect(actual.cartesian).toEqual(expected.cartesian);
    expect(actual.receipt.calculation).toEqual(expected.receipt);
    expect(actual.receipt.request.observer).toEqual(observer);
    expect(actual.receipt.conventions).toContain("observer:iers-2003-ellipsoid;elevation-metres");
    expect(actual.receipt.calculation?.conventions).toContain("observer:iers2003-ellipsoid;no-polar-motion");
    const geocentric = success(positionAt({ body: "Moon", time: SAMPLE_TIME }));
    expect(actual.cartesian).not.toEqual(geocentric.cartesian);
  });

  it("records the distinct geocentric and topocentric apparent Moon corrections", () => {
    const geocentric = success(positionAt({ body: "Moon", time: SAMPLE_TIME }));
    const topocentric = success(positionAt({ body: "Moon", time: SAMPLE_TIME, observer: { latitude: 0, longitude: 0 } }));
    const geoIds = geocentric.receipt.calculation!.conventions;
    const topoIds = topocentric.receipt.calculation!.conventions;
    expect(geoIds).toContain("moon:series-at-instant");
    expect(geoIds).not.toContain("light-time:newtonian");
    expect(geoIds).not.toContain("aberration:backdated-observer");
    expect(topoIds).not.toContain("moon:series-at-instant");
    expect(topoIds).toContain("light-time:newtonian");
    expect(topoIds).toContain("aberration:backdated-observer");
    expect(topocentric.receipt.request.observer?.elevationMeters).toBe(0);
  });

  it("normalizes equivalent instants consistently without retaining the caller's Date", () => {
    const date = new Date(SAMPLE_TIME);
    const fromDate = positionAt({ body: "Jupiter", time: date });
    const fromOffset = positionAt({ body: "Jupiter", time: "2024-06-01T14:30:00+02:30" });
    expect(fromDate).toEqual(fromOffset);
    expect(Object.isFrozen(date)).toBe(false);
    date.setUTCFullYear(2025);
    expect(fromDate.receipt.request.time).toBe(SAMPLE_TIME);
  });

  it.each([
    { body: "Earth", time: SAMPLE_TIME }, { body: "North Node", time: SAMPLE_TIME },
    { body: "moon", time: SAMPLE_TIME }, { body: "Regulus", time: SAMPLE_TIME },
    { body: "Moon", time: SAMPLE_TIME, frame: "equatorial-j2000" },
    { body: "Moon", time: SAMPLE_TIME, frame: null },
    { body: "Moon", time: SAMPLE_TIME, observer: null },
    { body: "Moon", time: "2024-02-30T12:00:00Z" },
    { body: "Moon", time: "2024-06-01T12:00:00" },
    { body: "Moon", time: SAMPLE_TIME, correction: "geometric" },
    { body: "Moon", time: SAMPLE_TIME, [Symbol("unknown")]: true },
    {}, null, []
  ])("rejects malformed or unsupported requests %# before calculation", (request) => {
    expect(() => positionAt(request as PositionRequest)).toThrow(RangeError);
  });
});

describe("range and receipt integration, not accuracy", () => {
  it("refuses a lower boundary instant whose TT is inside but UT1 is outside", () => {
    const time = "1799-12-31T23:59:59.999Z";
    const basis = timeBasis(Date.parse(time));
    const lower = (Date.parse(CALC_SPAN.from) - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
    expect(basis.ut1Days).toBeLessThan(lower);
    expect(basis.ttDays).toBeGreaterThan(lower);
    expect(positionAt({ body: "Moon", time })).toMatchObject({ status: "refused", reason: "out-of-range" });
    expect(positionAt({ body: "Moon", time: CALC_SPAN.from }).status).toBe("ok");
  });

  it("refuses an upper boundary instant whose UT1 is inside but TT is outside", () => {
    const time = "2199-12-31T23:59:59.000Z";
    const basis = timeBasis(Date.parse(time));
    const upper = (Date.parse(CALC_SPAN.to) - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
    expect(basis.ut1Days).toBeLessThan(upper);
    expect(basis.ttDays).toBeGreaterThan(upper);
    expect(positionAt({ body: "Moon", time })).toMatchObject({ status: "refused", reason: "out-of-range" });
    expect(positionAt({ body: "Moon", time: "2199-12-31T00:00:00Z" }).status).toBe("ok");
    expect(positionAt({ body: "Moon", time: CALC_SPAN.to })).toMatchObject({ status: "refused", reason: "out-of-range" });
  });

  it("retains a normalized request and engine identity on refusal without inventing a calculation receipt", () => {
    const actual = positionAt({ body: "Saturn", time: "1700-01-01", observer: { latitude: 10, longitude: 20 } });
    expect(actual).toMatchObject({ status: "refused", reason: "out-of-range", span: CALC_SPAN });
    expect(actual.receipt.request).toEqual({
      body: "Saturn", time: "1700-01-01T00:00:00.000Z", frame: "equatorial-true-of-date",
      observer: { latitude: 10, longitude: 20, elevationMeters: 0 }
    });
    expect(actual.receipt.calculation).toBeNull();
    expect(actual.receipt.engine).toEqual({ name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: EPHEMERIS });
    expectDeepFrozen(actual);
  });

  it("freezes result trees without freezing caller data or shared engine constants", () => {
    const observer = { latitude: 10, longitude: 20, elevationMeters: 30 };
    const date = new Date(SAMPLE_TIME);
    const request = { body: "Venus" as const, time: date, observer };
    const spanFrozenBefore = Object.isFrozen(CALC_SPAN);
    const ephemerisFrozenBefore = Object.isFrozen(EPHEMERIS);
    const actual = success(positionAt(request));
    const refused = positionAt({ body: "Moon", time: "1700-01-01" });
    expectDeepFrozen(actual);
    expectDeepFrozen(refused);
    expect(Object.isFrozen(CALC_SPAN)).toBe(spanFrozenBefore);
    expect(Object.isFrozen(EPHEMERIS)).toBe(ephemerisFrozenBefore);
    expect(Object.isFrozen(request)).toBe(false);
    expect(Object.isFrozen(observer)).toBe(false);
    expect(Object.isFrozen(date)).toBe(false);
    expect(observer).toEqual({ latitude: 10, longitude: 20, elevationMeters: 30 });
    expect(date.getTime()).toBe(Date.parse(SAMPLE_TIME));
    observer.longitude = -70;
    date.setUTCFullYear(2025);
    expect(actual.receipt.request.observer?.longitude).toBe(20);
    expect(actual.receipt.request.time).toBe(SAMPLE_TIME);
    expect(() => { (actual.cartesian as { x: number }).x = 0; }).toThrow(TypeError);
  });

  it.each([SAMPLE_TIME, "1700-01-01"])("round-trips every result and receipt through JSON at %s", (time) => {
    const actual = positionAt({ body: "Moon", time, observer: { latitude: -20, longitude: 75 } });
    const restored = JSON.parse(JSON.stringify(actual)) as PositionResult;
    expect(restored).toEqual(actual);
    expect(restored.receipt.schema).toBe("zodiacs.occultations.position-receipt.v1");
    const { body, time: at, frame, observer } = restored.receipt.request;
    expect(positionAt({ body, time: at, frame, ...(observer === null ? {} : { observer }) })).toEqual(actual);
  });
});
