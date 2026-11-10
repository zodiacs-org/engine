import { describe, expect, it } from "vitest";

import { onChartClock } from "../../src/ephemeris.js";
import { tilt } from "../../src/nutation.js";
import { REFERENCE_SPAN } from "../../src/reference-span.js";
import { timeBasis } from "../../src/time-scale.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { starCatalogue, starPositionAt } from "../src/index.js";
import type { StarPositionRequest, StarPositionResult } from "../src/index.js";

// Public API and engine-integration checks. Comparisons with engine clocks or
// frame constants are not independent evidence of astrometric accuracy.
const TIME = "2024-06-01T12:00:00.000Z";
const STAR = starCatalogue().stars.find((star) => star.label === "Spica")!;

function success(result: StarPositionResult): Extract<StarPositionResult, { status: "ok" }> {
  if (result.status !== "ok") throw new Error(`Unexpected refusal: ${result.reason}`);
  return result;
}

function expectDeepFrozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectDeepFrozen(child);
  }
}

describe("stellar public API and integration, not accuracy", () => {
  it("uses exact catalogue identifiers and preserves source provenance and missing distance", () => {
    const actual = success(starPositionAt({ star: STAR.id, time: TIME }));
    expect(actual.star).toBe(STAR.id);
    expect(actual.receipt.source).toEqual(STAR);
    expect(actual.receipt.catalogue).toEqual(starCatalogue().receipt);
    expect(actual.receipt.engine).toEqual({ name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: EPHEMERIS });
    expect(actual.receipt.request).toEqual({ star: STAR.id, time: TIME, observer: null, frame: "equatorial-true-of-date" });
    expect(actual.receipt.timeBasis).toEqual(timeBasis(Date.parse(TIME)));
    expect(actual.distanceAu).toBeNull();
    expect(actual.receipt.source.parallaxMas).toBeNull();
    expect(actual.receipt.source.radialVelocityKmPerSecond).toBeNull();
    expect(actual.receipt.conventions).toContain("parallax:omitted-unavailable;distance:null");
    expect(actual.receipt.conventions).toContain("deflection:none");
    expect(actual.receipt.limitations).toContain("no-contact-time-accuracy-bound");
    expect(actual.receipt.validation).toBe("astrometric-reduction-tests;catalogue-and-contact-accuracy-unmeasured");
    expect(Math.hypot(...actual.direction)).toBeCloseTo(1, 14);
    expect(actual.lon).toBeGreaterThanOrEqual(0);
    expect(actual.lon).toBeLessThan(360);
    expect(actual.lat).toBeGreaterThanOrEqual(-90);
    expect(actual.lat).toBeLessThanOrEqual(90);
  });

  it("accepts each frozen catalogue entry without substituting absent proper motion", () => {
    for (const star of starCatalogue().stars) {
      const actual = starPositionAt({ star: star.id, time: TIME });
      const complete = star.properMotion.raCosDecMasPerYear !== null && star.properMotion.decMasPerYear !== null;
      if (complete) expect(actual.status, star.id).toBe("ok");
      else expect(actual).toMatchObject({ status: "refused", reason: "proper-motion-unavailable" });
      expect(actual.receipt.source).toEqual(star);
      expect(actual.receipt.limitations).toEqual(expect.arrayContaining([...star.limitations]));
    }
  });

  it("captures own fields once and normalizes an explicit offset and observer height", () => {
    let starReads = 0;
    let elevationReads = 0;
    const actual = success(starPositionAt({
      get star() { return ++starReads === 1 ? STAR.id : "not-a-star"; },
      time: "2024-06-01T14:30:00+02:30",
      observer: { latitude: 12, longitude: -37,
        get elevationMeters() { return ++elevationReads === 1 ? 123 : Number.NaN; } }
    }));
    expect(starReads).toBe(1);
    expect(elevationReads).toBe(1);
    expect(actual.receipt.request).toEqual({ star: STAR.id, time: TIME,
      observer: { latitude: 12, longitude: -37, elevationMeters: 123 }, frame: "equatorial-true-of-date" });
    expect(actual).toEqual(starPositionAt({ star: STAR.id, time: new Date(TIME),
      observer: { latitude: 12, longitude: -37, elevationMeters: 123 } }));
    expect(success(starPositionAt({ star: STAR.id, time: TIME,
      observer: { latitude: 12, longitude: -37 } })).receipt.request.observer?.elevationMeters).toBe(0);
  });

  it("requires request and observer fields on their own records", () => {
    const request = Object.create({ star: STAR.id, time: TIME }) as StarPositionRequest;
    expect(() => starPositionAt(request)).toThrow(RangeError);
    expect(() => starPositionAt({ star: STAR.id, time: TIME,
      observer: Object.create({ latitude: 0, longitude: 0 }) })).toThrow(RangeError);
  });

  it.each([
    { star: "Spica", time: TIME }, { star: STAR.sao, time: TIME }, { star: STAR.id.toUpperCase(), time: TIME },
    { star: ` ${STAR.id}`, time: TIME }, { star: "sao:0", time: TIME }, { star: "Moon", time: TIME },
    { star: STAR.id, time: "2024-02-30" }, { star: STAR.id, time: "2024-06-01T12:00:00" },
    { star: STAR.id, time: new Date(Number.NaN) }, { star: STAR.id, time: TIME, frame: null },
    { star: STAR.id, time: TIME, frame: "equatorial-j2000" }, { star: STAR.id, time: TIME, observer: null },
    { star: STAR.id, time: TIME, observer: { latitude: 91, longitude: 0 } },
    { star: STAR.id, time: TIME, observer: { latitude: 0, longitude: Number.NaN } },
    { star: STAR.id, time: TIME, observer: { latitude: 0, longitude: 0, elevationMeters: Infinity } },
    { star: STAR.id, time: TIME, correction: "geometric" },
    { star: STAR.id, time: TIME, [Symbol("unknown")]: true }, {}, [], null
  ])("rejects malformed or unsupported requests %#", (request) => {
    expect(() => starPositionAt(request as StarPositionRequest)).toThrow(RangeError);
  });

  it("keeps equatorial and ecliptic outputs on the same true equinox and engine obliquity", () => {
    const observer = { latitude: -17, longitude: 145, elevationMeters: 620 };
    const equatorial = success(starPositionAt({ star: STAR.id, time: TIME, observer }));
    const ecliptic = success(starPositionAt({ star: STAR.id, time: TIME, observer, frame: "ecliptic-true-of-date" }));
    const epsilon = onChartClock(Date.parse(TIME), "utc", undefined, (at) => tilt(at.tt).tobl * Math.PI / 180);
    const [x, y, z] = equatorial.direction;
    const expected = [x, Math.cos(epsilon) * y + Math.sin(epsilon) * z,
      -Math.sin(epsilon) * y + Math.cos(epsilon) * z];
    ecliptic.direction.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 13));
    expect(ecliptic.frame).toBe("ecliptic-true-of-date");
    expect(ecliptic.receipt.request.frame).toBe(ecliptic.frame);
    expect(ecliptic.receipt.conventions).toContain("frame:ecliptic-true-of-date");
  });

  it("includes diurnal aberration for an equatorial observer and retains unknown stellar parallax", () => {
    const geo = success(starPositionAt({ star: STAR.id, time: TIME }));
    const site = success(starPositionAt({ star: STAR.id, time: TIME, observer: { latitude: 0, longitude: 0 } }));
    const antipode = success(starPositionAt({ star: STAR.id, time: TIME,
      observer: { latitude: 0, longitude: 180 } }));
    const first = site.direction.map((value, index) => value - geo.direction[index]!);
    const second = antipode.direction.map((value, index) => value - geo.direction[index]!);
    expect(Math.hypot(...first)).toBeGreaterThan(1e-8);
    expect(first.reduce((sum, value, index) => sum + value * second[index]!, 0)).toBeLessThan(0);
    expect(site.distanceAu).toBeNull();
    expect(site.receipt.conventions).toContain("observer:iers-2003-ellipsoid;elevation-metres;no-polar-motion");
    const pole = success(starPositionAt({ star: STAR.id, time: TIME,
      observer: { latitude: 90, longitude: 0 } }));
    // At the rotation pole the rotational velocity vanishes. Only the small
    // observer Rømer change to proper-motion propagation remains without px.
    expect(Math.hypot(...pole.direction.map((value, index) => value - geo.direction[index]!))).toBeLessThan(1e-12);
  });
});

describe("stellar range, snapshot and receipt contract", () => {
  it("requires both TT and UT1 inside the engine span at each boundary", () => {
    const lowerTime = "1799-12-31T23:59:59.999Z";
    const upperTime = "2199-12-31T23:59:59.000Z";
    const j2000 = Date.UTC(2000, 0, 1, 12);
    const lower = (Date.parse(REFERENCE_SPAN.from) - j2000) / 86_400_000;
    const upper = (Date.parse(REFERENCE_SPAN.to) - j2000) / 86_400_000;
    expect(timeBasis(Date.parse(lowerTime)).ut1Days).toBeLessThan(lower);
    expect(timeBasis(Date.parse(lowerTime)).ttDays).toBeGreaterThan(lower);
    expect(timeBasis(Date.parse(upperTime)).ut1Days).toBeLessThan(upper);
    expect(timeBasis(Date.parse(upperTime)).ttDays).toBeGreaterThan(upper);
    for (const time of [lowerTime, upperTime, REFERENCE_SPAN.to]) {
      expect(starPositionAt({ star: STAR.id, time })).toMatchObject({ status: "refused", reason: "out-of-range" });
    }
    expect(starPositionAt({ star: STAR.id, time: REFERENCE_SPAN.from }).status).toBe("ok");
    expect(starPositionAt({ star: STAR.id, time: "2199-12-31" }).status).toBe("ok");
  });

  it.each(["1700-01-01", new Date(8_640_000_000_000_000), new Date(-8_640_000_000_000_000)])(
    "retains provenance on refusal without a fabricated time basis at %s", (time) => {
      const actual = starPositionAt({ star: STAR.id, time, observer: { latitude: -12, longitude: 37 } });
      expect(actual).toMatchObject({ status: "refused", reason: "out-of-range" });
      expect(actual.receipt.timeBasis).toBeNull();
      expect(actual.receipt.source).toEqual(STAR);
      expect(actual.receipt.request.observer).toEqual({ latitude: -12, longitude: 37, elevationMeters: 0 });
      expectDeepFrozen(actual);
    });

  it("freezes snapshots without freezing callers or engine constants", () => {
    const observer = { latitude: 10, longitude: 20, elevationMeters: 30 };
    const time = new Date(TIME);
    const request = { star: STAR.id, time, observer };
    const spanFrozen = Object.isFrozen(REFERENCE_SPAN);
    const ephemerisFrozen = Object.isFrozen(EPHEMERIS);
    const actual = success(starPositionAt(request));
    expectDeepFrozen(actual);
    expect(Object.isFrozen(request)).toBe(false);
    expect(Object.isFrozen(time)).toBe(false);
    expect(Object.isFrozen(observer)).toBe(false);
    expect(Object.isFrozen(REFERENCE_SPAN)).toBe(spanFrozen);
    expect(Object.isFrozen(EPHEMERIS)).toBe(ephemerisFrozen);
    time.setUTCFullYear(2025);
    observer.longitude = -70;
    expect(actual.receipt.request.time).toBe(TIME);
    expect(actual.receipt.request.observer?.longitude).toBe(20);
    expect(() => { (actual.direction as unknown as number[])[0] = 0; }).toThrow(TypeError);
  });

  it.each([TIME, "1700-01-01"])("round-trips and replays a successful or refused receipt at %s", (time) => {
    const actual = starPositionAt({ star: STAR.id, time, observer: { latitude: 10, longitude: 20 } });
    const restored = JSON.parse(JSON.stringify(actual)) as StarPositionResult;
    expect(restored).toEqual(actual);
    expect(restored.receipt.schema).toBe("zodiacs.occultations.star-position-receipt.v1");
    const { star, time: at, frame, observer } = restored.receipt.request;
    expect(starPositionAt({ star, time: at, frame, ...(observer === null ? {} : { observer }) })).toEqual(actual);
  });
});
