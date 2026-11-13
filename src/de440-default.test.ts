/**
 * The default source: a plain call, outside `withEphemeris`, computes on the
 * DE440 pack the package ships, and on astronomy-engine where the pack does
 * not reach.
 *
 * The accuracy arbiter is not this engine: the conformance suite's 240 L1
 * vectors, JPL Horizons's apparent geocentric places from DE441 at 24 TT
 * instants from 1851 to 2148 for ten bodies, carried into the IAU 2006/2000A
 * true ecliptic of date (`conformance/arbiters/l1/`). The instants are TT on
 * both sides, so no ΔT model enters. The other tests here pin behaviour:
 * which ephemeris a call uses, and that the fallback is 1.1.0-rc.7's.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { calc, chart as calcChart } from "./calc.js";
import { DE440_PACK, shippedDe440Source } from "./de440-pack.js";
import { bodyLongitude } from "./ephemeris.js";
import { EPHEMERIS, defaultEphemeris, natalChart, positions, setDefaultEphemeris, withEphemeris } from "./index.js";
import { createNatalEnvelope } from "./receipt.js";

interface Vector {
  id: string;
  input: { body: string; jd_tt: number };
  expected: { lon: number; lat: number };
  tolerance: { lon: { abs: number; unit: string }; lat: { abs: number; unit: string } };
}
const vectors: Vector[] = JSON.parse(readFileSync(new URL("../conformance/vectors/L1-positions.json", import.meta.url), "utf8")).vectors;
const dateOfJd = (jd: number): Date => new Date(Math.round((jd - 2440587.5) * 86_400_000));
/** a − b on the circle, arcseconds. */
const wrapArcsec = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360 - 180) * 3600;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const ttDate = (ttDays: number): Date => new Date(J2000_MS + Math.round(ttDays * 86_400_000));
const DE440 = { name: "jpl-de440", version: DE440_PACK.sha256 };

// The suite's setup file (src/test-setup.ts) puts every other test file on
// astronomy-engine; this file tests the package's own default.
beforeEach(() => setDefaultEphemeris("de440"));
afterEach(() => setDefaultEphemeris("de440"));

describe("the default source", () => {
  it("is the shipped DE440 pack, a day inside each end of its coverage", () => {
    const status = defaultEphemeris();
    expect(status.name).toBe("de440");
    expect(status.de440).toEqual({
      opened: true,
      version: DE440_PACK.sha256,
      fromTtDays: shippedDe440Source().pack.startEtSecTdb / 86_400 + 1,
      toTtDays: shippedDe440Source().pack.stopEtSecTdb / 86_400 - 1,
      error: null
    });
    // The pack covers the calendar years 1790 to 2210, so the default is the pack from 1790-01-02 to 2209-12-31 at least.
    expect(status.de440.fromTtDays!).toBeLessThanOrEqual((Date.UTC(1790, 0, 2) - J2000_MS) / 86_400_000);
    expect(status.de440.toTtDays!).toBeGreaterThanOrEqual((Date.UTC(2209, 11, 31) - J2000_MS) / 86_400_000);
    expect(Object.isFrozen(status) && Object.isFrozen(status.de440)).toBe(true);
  });

  it("puts a plain natalChart within 1″ of Horizons (DE441) at all 240 L1 vectors", () => {
    expect(vectors).toHaveLength(240);
    let largestLon = 0;
    let largestLat = 0;
    let within = 0;
    for (const vector of vectors) {
      expect(vector.tolerance.lon).toMatchObject({ abs: 1, unit: "arcsec" });
      expect(vector.tolerance.lat).toMatchObject({ abs: 1, unit: "arcsec" });
      const chart = natalChart({ utc: dateOfJd(vector.input.jd_tt), timeScale: "tt", timeKnown: false });
      expect(chart.ephemeris).toEqual(DE440);
      const body = chart.bodies.find((candidate) => candidate.body === vector.input.body)!;
      const dLon = Math.abs(wrapArcsec(body.lon, vector.expected.lon));
      const dLat = Math.abs((body.lat - vector.expected.lat) * 3600);
      if (dLon <= 1 && dLat <= 1) within += 1;
      largestLon = Math.max(largestLon, dLon);
      largestLat = Math.max(largestLat, dLat);
    }
    expect(within).toBe(240);
    // The largest differences, rounded up: 0.0127″ in longitude and 0.0011″ in latitude, both the Moon's.
    expect(largestLon).toBeLessThanOrEqual(0.0127);
    expect(largestLat).toBeLessThanOrEqual(0.0011);
  });

  it("gives what withEphemeris on the shipped source gives, and a receipt that names the pack", () => {
    const input = { utc: "1990-04-15T08:30:00Z", latitude: 51.5, longitude: -0.12 };
    const plain = natalChart(input);
    expect(plain.ephemeris).toEqual(DE440);
    expect(plain.bodies).toEqual(withEphemeris(shippedDe440Source(), () => natalChart(input)).bodies);
    const envelope = createNatalEnvelope(plain);
    expect(envelope.receipt.engine.ephemeris).toEqual(DE440);
    expect(envelope.requiredFeatures).toContain("ephemeris-jpl-de440");
  });

  it('computes on astronomy-engine after setDefaultEphemeris("astronomy-engine"), and says so', () => {
    const input = { utc: "1990-04-15T08:30:00Z", latitude: 51.5, longitude: -0.12 };
    const de440 = natalChart(input);
    setDefaultEphemeris("astronomy-engine");
    expect(defaultEphemeris().name).toBe("astronomy-engine");
    const chart = natalChart(input);
    expect(chart.ephemeris).toBeUndefined();
    expect(createNatalEnvelope(chart).receipt.engine.ephemeris).toEqual({ name: EPHEMERIS.name, version: EPHEMERIS.version });
    const neptune = (from: typeof chart): number => from.bodies.find((row) => row.body === "Neptune")!.lon;
    expect(neptune(chart)).not.toBe(neptune(de440));
    // The two ephemerides are within astronomy-engine's own published limit for Neptune, 22″ (src/calc-bounds.ts).
    expect(Math.abs(wrapArcsec(neptune(chart), neptune(de440)))).toBeLessThan(22);
    // withEphemeris still overrides the setting.
    expect(withEphemeris(shippedDe440Source(), () => natalChart(input)).ephemeris).toEqual(DE440);
    expect(() => setDefaultEphemeris("swiss" as never)).toThrow(TypeError);
  });

  it("falls back to astronomy-engine outside the pack, position and speed together, and says so", () => {
    const { fromTtDays, toTtDays } = defaultEphemeris().de440;
    const outside = [ttDate(fromTtDays! - 0.01), ttDate(toTtDays! + 0.01), new Date("1700-06-01T00:00:00Z"), new Date("2300-06-01T00:00:00Z")];
    for (const utc of outside) {
      const input = { utc, timeScale: "tt" as const, timeKnown: false };
      const chart = natalChart(input);
      expect(chart.ephemeris, utc.toISOString()).toBeUndefined();
      setDefaultEphemeris("astronomy-engine");
      const fallback = natalChart(input);
      setDefaultEphemeris("de440");
      expect(chart.bodies).toEqual(fallback.bodies);
    }
    // Just inside each end the chart, its speeds included, is the pack's.
    for (const utc of [ttDate(fromTtDays! + 0.01), ttDate(toTtDays! - 0.01)]) {
      const input = { utc, timeScale: "tt" as const, timeKnown: false };
      const chart = natalChart(input);
      expect(chart.ephemeris).toEqual(DE440);
      expect(chart.bodies).toEqual(withEphemeris(shippedDe440Source(), () => natalChart(input)).bodies);
    }
  });

  it("is followed by the root's other position functions", () => {
    const at = "1990-04-15T08:30:00Z";
    const inside = withEphemeris(shippedDe440Source(), () => ({ rows: positions(at), sun: bodyLongitude("Sun", new Date(at)) }));
    expect(positions(at)).toEqual(inside.rows);
    expect(bodyLongitude("Sun", new Date(at))).toBe(inside.sun);
  });

  it("leaves the calc entry on astronomy-engine, which its receipts name", () => {
    const request = { body: "Neptune", time: "1990-04-15T08:30:00Z" } as const;
    const birth = { time: "1990-04-15T08:30:00Z", place: { latitude: 51.5, longitude: -0.12 } } as const;
    const position = calc(request);
    const whole = calcChart(birth as never);
    setDefaultEphemeris("astronomy-engine");
    expect(calc(request)).toEqual(position);
    expect(calcChart(birth as never)).toEqual(whole);
    expect(JSON.stringify(position)).toContain(`ephemeris:astronomy-engine@${EPHEMERIS.version}`);
    expect(JSON.stringify(position)).not.toContain("jpl-de440");
  });
});
