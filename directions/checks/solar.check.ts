import { describe, expect, it } from "vitest";
import { calc } from "../../src/calc.js";
import { prepareSolarEquatorialDay, SolarPreparationError } from "../src/solar.js";
import type { SolarEquatorialDayInput, SolarPreparationErrorCode } from "../src/solar.js";
import { directedAge } from "../src/timing.js";

// Invented instants only. Engine parity checks are integration evidence, not
// independently expected primary arcs, solar positions or astronomical accuracy.
const base = { time: { jd: 2451545, scale: "tt" }, dayScale: "tt" } as const;

function direct(time: SolarEquatorialDayInput["time"]) {
  const result = calc({
    body: "Sun", time, frame: "equatorial-true-of-date", center: "geocentric", zodiac: "tropical",
    flags: { correction: "apparent", speeds: false, cartesian: false, units: "degrees", deflection: false }
  });
  if (result.status !== "ok") throw new Error("Unexpected engine refusal in integration check");
  return result;
}

function rejected(value: unknown, code: SolarPreparationErrorCode): SolarPreparationError {
  try {
    prepareSolarEquatorialDay(value as SolarEquatorialDayInput);
    throw new Error("Expected solar sample refusal");
  } catch (error) {
    expect(error).toBeInstanceOf(SolarPreparationError);
    expect(error).toBeInstanceOf(RangeError);
    expect(error).toMatchObject({ name: "SolarPreparationError", code });
    return error as SolarPreparationError;
  }
}

function frozenData(value: unknown): void {
  expect(value).not.toBeInstanceOf(Date);
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const entry of Object.values(value)) frozenData(entry);
  }
}

describe("solar day engine integration (not independent position or arc accuracy)", () => {
  for (const scale of ["utc", "ut1", "tt"] as const) {
    for (const deltaT of [undefined, 0, 123.5]) {
      it(`samples a TT day from explicit ${scale} with ${deltaT ?? "model"} deltaT`, () => {
        const time = { jd: base.time.jd, scale, ...(deltaT === undefined ? {} : { deltaT }) };
        const result = prepareSolarEquatorialDay({ time, dayScale: "tt" });
        const resolution = direct(time);
        const startJd = resolution.receipt.instants[0]!.jdTt;
        const pin = deltaT === undefined ? {} : { deltaT };
        const start = direct({ jd: startJd, scale: "tt", ...pin });
        const end = direct({ jd: startJd + 1, scale: "tt", ...pin });
        expect(result.samples).toEqual({
          timeScale: "tt", frame: "true-equator-equinox-of-date", center: "geocentric", correction: "apparent",
          start: { jdTt: startJd, rightAscensionDegrees: start.lon },
          end: { jdTt: startJd + 1, rightAscensionDegrees: end.lon }
        });
        expect(result.samples.end.jdTt - result.samples.start.jdTt).toBe(1);
        expect(result.provenance).toEqual({
          adapter: "@zodiacs/engine/calc:Sun",
          sampling: "resolve-input-to-jd-tt;resample-start-and-start-plus-one-tt-day",
          latitude: "retain-solar-ecliptic-latitude",
          resolutionReceipt: resolution.receipt,
          start: { receipt: start.receipt, bounds: start.bounds, declinationDegrees: start.lat },
          end: { receipt: end.receipt, bounds: end.bounds, declinationDegrees: end.lat }
        });
      });
    }
  }

  it("keeps its TT interval when a UTC day contains a leap-second step", () => {
    const time = { jd: 2457754, scale: "utc" } as const;
    const result = prepareSolarEquatorialDay({ time, dayScale: "tt" });
    const resolution = direct(time);
    const laterUtcDay = direct({ ...time, jd: time.jd + 1 });
    expect(laterUtcDay.receipt.instants[0]!.jdTt - resolution.receipt.instants[0]!.jdTt).toBeGreaterThan(1);
    expect(result.samples.end.jdTt - result.samples.start.jdTt).toBe(1);
    expect(result.provenance.start.receipt.request.time).toMatchObject({ scale: "tt" });
    expect(result.provenance.end.receipt.request.time).toMatchObject({ scale: "tt" });
    expect(result.provenance.resolutionReceipt.request.time).toEqual(time);
  });

  it("preserves the represented TT interval at several Julian date fractions", () => {
    for (const jd of [2378497.123456789, 2433282.1, 2451624.99999999, 2488069.987654321, 2524592.25]) {
      const result = prepareSolarEquatorialDay({ time: { jd, scale: "tt" }, dayScale: "tt" });
      expect(result.samples.start.jdTt).toBe(jd);
      expect(result.samples.end.jdTt).toBe(jd + 1);
      expect(result.provenance.start.receipt.instants[0]!.jdTt).toBe(jd);
      expect(result.provenance.end.receipt.instants[0]!.jdTt).toBe(jd + 1);
    }
  });

  it("copies and freezes samples and receipts without freezing caller data", () => {
    const input: SolarEquatorialDayInput = { ...base, time: { ...base.time } };
    const result = prepareSolarEquatorialDay(input);
    frozenData(result);
    const original = JSON.stringify(result);
    expect(JSON.parse(original)).toEqual(result);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.time)).toBe(false);
    Object.assign(input.time, { jd: 2460000, scale: "utc" });
    expect(JSON.stringify(result)).toBe(original);
    expect(() => Object.assign(result.samples.start, { rightAscensionDegrees: 0 })).toThrow(TypeError);
    expect(() => Array.prototype.push.call(result.provenance.start.receipt.conventions, "other")).toThrow(TypeError);
  });

  it("passes engine samples to the pure timing API without changing either input", () => {
    const prepared = prepareSolarEquatorialDay(base);
    const request = {
      arcDegrees: 30, key: "solar-equatorial-birth-day", yearUnit: "julian-365.25-days", solar: prepared.samples
    } as const;
    const inputBefore = JSON.stringify(request);
    const provenanceBefore = JSON.stringify(prepared);
    const result = directedAge(request);
    expect(result.arcDegrees).toBe(request.arcDegrees);
    expect(result.key).toBe(request.key);
    expect(result.yearUnit).toBe(request.yearUnit);
    expect(result.audit.kind).toBe("solar-birth-day");
    if (result.audit.kind !== "solar-birth-day") throw new Error("Unexpected timing audit kind");
    expect(result.audit.samples).toEqual(prepared.samples);
    expect(result.audit.samples).not.toBe(prepared.samples);
    expect(result.audit.samples.start).not.toBe(prepared.samples.start);
    expect(result.audit.samples.end).not.toBe(prepared.samples.end);
    expect(JSON.stringify(request)).toBe(inputBefore);
    expect(JSON.stringify(prepared)).toBe(provenanceBefore);
    expect(Object.isFrozen(request)).toBe(false);
    frozenData(result);
  });

  it("does not leak an earlier deltaT pin into later sampling", () => {
    const initial = prepareSolarEquatorialDay({ time: { ...base.time, scale: "ut1" }, dayScale: "tt" });
    const pinned = prepareSolarEquatorialDay({ time: { ...base.time, scale: "ut1", deltaT: 86400 }, dayScale: "tt" });
    expect(pinned.samples.start.jdTt).not.toBe(initial.samples.start.jdTt);
    expect(prepareSolarEquatorialDay({ time: { ...base.time, scale: "ut1" }, dayScale: "tt" })).toEqual(initial);
  });
});

describe("solar sample input and engine refusals", () => {
  it("requires both explicit input and day scales", () => {
    for (const value of [null, undefined, [], true, "time", new Date(0), Object.create(base)]) {
      rejected(value, "invalid-input");
    }
    for (const dayScale of [undefined, null, "utc", "ut1", "TT", "", false]) {
      rejected({ ...base, dayScale }, "invalid-input");
    }
    rejected({ time: base.time }, "invalid-input");
    for (const scale of [undefined, null, "TT", "", false, "tai"]) {
      rejected({ ...base, time: { ...base.time, scale } }, "invalid-input");
    }
    rejected({ ...base, time: { jd: base.time.jd } }, "invalid-input");
    rejected({ ...base, time: "2000-01-01T12:00:00Z" }, "invalid-input");
  });

  it("requires finite Julian dates and a valid optional deltaT", () => {
    for (const jd of [undefined, null, NaN, Infinity, -Infinity, "2451545"]) {
      rejected({ ...base, time: { ...base.time, jd } }, "invalid-input");
    }
    for (const deltaT of [undefined, null, NaN, Infinity, "64", 1e10 + 1, -1e10 - 1]) {
      rejected({ ...base, time: { ...base.time, deltaT } }, "invalid-input");
    }
  });

  it("rejects unsupported, hidden, inherited and accessor fields without reading getters", () => {
    expect(prepareSolarEquatorialDay(Object.assign(Object.create(null), base))).toEqual(prepareSolarEquatorialDay(base));
    rejected({ ...base, key: "other" }, "invalid-input");
    rejected({ ...base, time: { ...base.time, correction: "geometric" } }, "invalid-input");
    rejected({ ...base, time: Object.create(base.time) }, "invalid-input");
    rejected({ ...base, [Symbol("dayScale")]: "tt" }, "invalid-input");
    let reads = 0;
    for (const key of ["jd", "scale", "deltaT"]) {
      const time = { ...base.time };
      Object.defineProperty(time, key, { enumerable: true, get() { reads++; return 0; } });
      rejected({ ...base, time }, "invalid-input");
    }
    const hidden = { ...base.time };
    Object.defineProperty(hidden, "scale", { enumerable: false });
    rejected({ ...base, time: hidden }, "invalid-input");
    expect(reads).toBe(0);
  });

  it("preserves resolution and next-day out-of-reference-span refusals", () => {
    const historical = rejected({ ...base, time: { jd: 2341972.5, scale: "tt" } }, "engine-refusal");
    expect(historical.message).toContain("resolution");
    expect(historical.cause).toMatchObject({ status: "refused", reason: "out-of-range" });
    const nearEnd = rejected({ ...base, time: { jd: 2524593, scale: "tt" } }, "engine-refusal");
    expect(nearEnd.message).toContain("end sample");
    expect(nearEnd.cause).toMatchObject({ status: "refused", reason: "out-of-range" });
    expect(Object.isFrozen(nearEnd.cause)).toBe(true);
  });
});
