import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { VISIBILITY_BODIES, enginePosition, horizonEvents } from "../src/index.js";

const SITE = { latitude: 13, longitude: -42, height: 120 };
const FROM = "2001-02-03T00:00:00Z";
const TO = "2001-02-04T00:00:00Z";

// These integration checks establish the adapter contract, not ephemeris accuracy.
describe("engine position adapter", () => {
  it.each(["Sun", ...VISIBILITY_BODIES] as const)("returns %s with the original calculation receipt", (body) => {
    const result = enginePosition(body, FROM);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error(`Position refused: ${result.reason}`);
    expect(result.body).toBe(body);
    expect(result.frame).toBe("ecliptic-true-of-date");
    expect(result.lon).toBeGreaterThanOrEqual(0);
    expect(result.lon).toBeLessThan(360);
    expect(result.lat).toBeGreaterThanOrEqual(-90);
    expect(result.lat).toBeLessThanOrEqual(90);
    expect(result.dist).toBeGreaterThan(0);
    expect(result.speeds).toBeNull();
    expect(result.cartesian).not.toBeNull();
    expect(result.cartesian && [result.cartesian.x, result.cartesian.y, result.cartesian.z].every(Number.isFinite)).toBe(true);
    expect(result.receipt.schema).toBe("zodiacs.calc-receipt.v1");
    expect(result.receipt.request).toMatchObject({
      body, frame: "ecliptic-true-of-date", center: "geocentric", zodiac: "tropical",
      flags: { correction: "apparent", speeds: false, cartesian: true, units: "degrees", deflection: false }
    });
    expect(result.receipt.instants[0]?.utc).toBe(new Date(FROM).toISOString());
    expect(result.receipt.instants[0]?.deltaT).toHaveProperty("model");
    expect(result.receipt.instants[0]?.timeScale).toHaveProperty("basis");
    expect(result.receipt.engine.name).toBe("@zodiacs/engine");
    expect(result.receipt.engine.ephemeris.name).toBe("astronomy-engine");
    expect(result.receipt.engine.version).toMatch(/^\d+\.\d+\.\d+/u);
    expect(result.receipt.conventions).toContain("correction:apparent");
    expect(result.bounds.position).toHaveProperty("basis");
  });

  it("accepts topocentric equatorial coordinates without losing observer conventions", () => {
    const result = enginePosition("Moon", FROM, { frame: "equatorial-true-of-date", observer: SITE });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error(`Position refused: ${result.reason}`);
    expect(result.frame).toBe("equatorial-true-of-date");
    expect(result.receipt.request.center).toEqual({ topocentric: SITE });
    expect(result.receipt.conventions).toContain("observer:iers2003-ellipsoid;no-polar-motion");
  });

  it("preserves the engine's out-of-range refusal", () => {
    const result = enginePosition("Moon", "1750-02-03");
    expect(result.status).toBe("refused");
    if (result.status !== "refused") throw new Error("Expected position refusal");
    expect(result.reason).toBe("out-of-range");
    expect(result.detail).toBeTruthy();
  });

  it.each([
    null, [], { frame: null }, { observer: null }, { frame: "equatorial-j2000" },
    { correction: "geometric" }, { units: "radians" }, { frame: "ecliptic-true-of-date", extra: true }
  ])("rejects invalid or unsupported position options %j", (options) => {
    expect(() => enginePosition("Moon", FROM, options as never)).toThrow(RangeError);
  });

  it("rejects unsupported bodies, invalid observers and unresolved times", () => {
    expect(() => enginePosition("Uranus" as never, FROM)).toThrow(RangeError);
    expect(() => enginePosition("Moon", "2001-02-03T00:00:00")).toThrow(RangeError);
    expect(() => enginePosition("Moon", FROM, { observer: { latitude: 0, longitude: 0, height: -10_001 } })).toThrow(RangeError);
  });
});

describe("engine horizon adapter", () => {
  it("carries solver metadata and position receipts at each event instant", () => {
    const result = horizonEvents("Moon", SITE, FROM, TO);
    expect(result.status).toBe("complete");
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.receiptScope).toBe("event-positions");
    expect(result.engine.name).toBe("@zodiacs/engine");
    expect(result.engine.ephemeris.name).toBe("astronomy-engine");
    expect(result.observer).toEqual(SITE);
    expect(result.from.toISOString()).toBe(new Date(FROM).toISOString());
    expect(result.to.toISOString()).toBe(new Date(TO).toISOString());
    expect(result.samples).toBeGreaterThan(0);
    expect(result.conventions).toEqual({ limb: "upper", refraction: "standard", refractionArcmin: 34 });
    for (const event of result.events) {
      expect(event.at.getTime()).toBeGreaterThanOrEqual(Date.parse(FROM));
      expect(event.at.getTime()).toBeLessThan(Date.parse(TO));
      expect(Number.isFinite(event.altitude)).toBe(true);
      expect(event.azimuth).toBeGreaterThanOrEqual(0);
      expect(event.azimuth).toBeLessThan(360);
      expect(event.position.status).toBe("ok");
      if (event.position.status !== "ok") throw new Error(`Event position refused: ${event.position.reason}`);
      expect(event.position.receipt.instants[0]?.utc).toBe(event.at.toISOString());
      expect(event.position.receipt.engine).toEqual(result.engine);
      expect(event.position.receipt.request.center).toEqual({ topocentric: SITE });
      expect(event.position.frame).toBe("equatorial-true-of-date");
    }
    const times = result.events.map((event) => event.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("preserves half-open event windows when split exactly at an event", () => {
    const whole = horizonEvents("Sun", SITE, FROM, TO);
    const cut = whole.events[1]?.at;
    expect(cut).toBeInstanceOf(Date);
    if (!cut) throw new Error("The synthetic site must have multiple daily solar events");
    const before = horizonEvents("Sun", SITE, FROM, cut);
    const after = horizonEvents("Sun", SITE, cut, TO);
    expect(before.events.some((event) => event.at.getTime() === cut.getTime())).toBe(false);
    expect(after.events[0]?.at.getTime()).toBe(cut.getTime());
    const keys = (events: typeof whole.events) => events.map((event) => [event.kind, event.at.toISOString()]);
    expect(keys([...before.events, ...after.events])).toEqual(keys(whole.events));
  });

  it("preserves whole-search budget refusal without event positions", () => {
    const result = horizonEvents("Moon", SITE, FROM, TO, { maxSamples: 1 });
    expect(result.status).toBe("refused");
    if (result.status !== "refused") throw new Error("Expected search refusal");
    expect(result.reason).toBe("sample-budget");
    expect(result.events).toEqual([]);
    expect(result.samples).toBeLessThanOrEqual(1);
    expect(result.receiptScope).toBe("event-positions");
  });

  it("retains successful sky events whose position receipts are out of range", () => {
    const result = horizonEvents("Sun", SITE, "1750-02-03", "1750-02-04");
    expect(result.status).toBe("complete");
    expect(result.flags).toContain("outside-reference-span");
    expect(result.events.length).toBeGreaterThan(0);
    for (const event of result.events) {
      expect(event.position.status).toBe("refused");
      if (event.position.status !== "refused") throw new Error("Expected out-of-range position");
      expect(event.position.reason).toBe("out-of-range");
    }
  });

  it.each([
    ["2001-06-21", "2001-06-22", "never-sets"],
    ["2001-12-21", "2001-12-22", "never-rises"]
  ] as const)("preserves polar flags and transits on %s", (from, to, flag) => {
    const result = horizonEvents("Sun", { latitude: 78, longitude: 15 }, from, to);
    expect(result.status).toBe("complete");
    expect(result.flags).toContain(flag);
    expect(result.events.some((event) => event.kind === "rise" || event.kind === "set")).toBe(false);
    expect(result.events.some((event) => event.kind === "upper-transit")).toBe(true);
    expect(result.events.some((event) => event.kind === "lower-transit")).toBe(true);
  });

  it("passes explicit centre and geometric horizon conventions to the solver", () => {
    const result = horizonEvents("Venus", SITE, FROM, TO, { limb: "centre", refraction: "none" });
    expect(result.status).toBe("complete");
    expect(result.conventions).toEqual({ limb: "centre", refraction: "none", refractionArcmin: 0 });
  });

  it.each([null, [], { unknown: true }, { maxSamples: 0 }, { refraction: "weather" }])(
    "rejects invalid sky options %j", (options) => {
      expect(() => horizonEvents("Sun", SITE, FROM, TO, options as never)).toThrow(RangeError);
    }
  );

  it("rejects invalid targets, observer data, limbs and ranges", () => {
    expect(() => horizonEvents("Pluto" as never, SITE, FROM, TO)).toThrow(RangeError);
    expect(() => horizonEvents("Sun", { latitude: 91, longitude: 0 }, FROM, TO)).toThrow(RangeError);
    expect(() => horizonEvents("Venus", SITE, FROM, TO, { limb: "upper" })).toThrow(RangeError);
    expect(() => horizonEvents("Sun", SITE, FROM, FROM)).toThrow(RangeError);
  });
});

// Independent reference: US Naval Observatory, Complete Sun and Moon Data
// for One Day, API v4.0.1, 2024-06-21, latitude 38.89, longitude -77.03,
// tz=0. The existing fixture records the source URL and retrieval date.
// The gate is fixed before execution: 60 seconds accommodates minute-rounded
// tabulation and the Sun-radius convention difference. It is not a general
// visibility-model or horizon-time accuracy claim.
const USNO_TOLERANCE_MS = 60_000;
type ReferenceDay = {
  url: string;
  latitude: number;
  longitude: number;
  date: string;
  events: ["Sun" | "Moon", "rise" | "set" | "upper-transit", string][];
};
const reference = (JSON.parse(readFileSync(new URL("../../src/sky/fixtures/usno-rstt.json", import.meta.url), "utf8")) as {
  days: ReferenceDay[];
}).days[0]!;

describe("published USNO horizon example", () => {
  it("matches each listed Sun and Moon event within the declared gate", () => {
    expect(reference.url).toBe("https://aa.usno.navy.mil/api/rstt/oneday?date=2024-06-21&coords=38.89,-77.03&tz=0");
    const from = new Date(`${reference.date}T00:00:00Z`);
    const to = new Date(from.getTime() + 86_400_000);
    for (const body of ["Sun", "Moon"] as const) {
      const result = horizonEvents(body, { latitude: reference.latitude, longitude: reference.longitude }, from, to);
      expect(result.status).toBe("complete");
      for (const [listedBody, kind, time] of reference.events) {
        if (listedBody !== body) continue;
        const expectedAt = Date.parse(`${reference.date}T${time}:00Z`);
        const candidates = result.events.filter((event) => event.kind === kind);
        expect(candidates.length, `${body} ${kind} is listed by USNO`).toBeGreaterThan(0);
        const error = Math.min(...candidates.map((event) => Math.abs(event.at.getTime() - expectedAt)));
        expect(error, `${body} ${kind} compared with USNO ${time} UT`).toBeLessThanOrEqual(USNO_TOLERANCE_MS);
      }
    }
  });
});
