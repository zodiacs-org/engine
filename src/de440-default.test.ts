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
import { calc, chart as calcChart, events } from "./calc.js";
import { DE440_PACK, shippedDe440Source } from "./de440-pack.js";
import { bodyLongitude } from "./ephemeris.js";
import { EPHEMERIS, defaultEphemeris, findLongitudeCrossings, natalChart, positions, setDefaultEphemeris, withEphemeris } from "./index.js";
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

  it('computes on astronomy-engine after setDefaultEphemeris("astronomy-engine"), names it, and flags no fallback', () => {
    const input = { utc: "1990-04-15T08:30:00Z", latitude: 51.5, longitude: -0.12 };
    const de440 = natalChart(input);
    expect(de440.flags).toEqual([]);
    expect(de440.bodies.every((row) => row.ephemeris === "jpl-de440" && !("fallback" in row))).toBe(true);
    setDefaultEphemeris("astronomy-engine");
    expect(defaultEphemeris().name).toBe("astronomy-engine");
    const chart = natalChart(input);
    // The caller's choice is named on the result, and is not a fallback.
    expect(chart.ephemeris).toEqual({ name: EPHEMERIS.name, version: EPHEMERIS.version });
    expect(chart.flags).toEqual([]);
    expect(chart.bodies.every((row) => row.ephemeris === "astronomy-engine" && !("fallback" in row))).toBe(true);
    expect(createNatalEnvelope(chart).receipt.engine.ephemeris).toEqual({ name: EPHEMERIS.name, version: EPHEMERIS.version });
    const neptune = (from: typeof chart): number => from.bodies.find((row) => row.body === "Neptune")!.lon;
    expect(neptune(chart)).not.toBe(neptune(de440));
    // The two ephemerides are within astronomy-engine's own published limit for Neptune, 22″ (src/calc-bounds.ts).
    expect(Math.abs(wrapArcsec(neptune(chart), neptune(de440)))).toBeLessThan(22);
    // withEphemeris still overrides the setting.
    expect(withEphemeris(shippedDe440Source(), () => natalChart(input)).ephemeris).toEqual(DE440);
    expect(() => setDefaultEphemeris("swiss" as never)).toThrow(TypeError);
  });

  it("falls back to astronomy-engine outside the pack, position and speed together, and flags it on the chart and each row", () => {
    const { fromTtDays, toTtDays } = defaultEphemeris().de440;
    const outside = [ttDate(fromTtDays! - 0.01), ttDate(toTtDays! + 0.01), new Date("1700-06-01T00:00:00Z"), new Date("2300-06-01T00:00:00Z")];
    for (const utc of outside) {
      const input = { utc, timeScale: "tt" as const, timeKnown: false };
      const chart = natalChart(input);
      expect(chart.ephemeris, utc.toISOString()).toEqual({ name: EPHEMERIS.name, version: EPHEMERIS.version });
      expect(chart.flags.at(-1)).toBe("outside-de440-span");
      expect(chart.bodies.every((row) => row.ephemeris === "astronomy-engine" && row.fallback === "outside-de440-span")).toBe(true);
      setDefaultEphemeris("astronomy-engine");
      const chosen = natalChart(input);
      setDefaultEphemeris("de440");
      // The same numbers as the caller's own choice of astronomy-engine gives, which carries no fallback.
      expect(chosen.flags).not.toContain("outside-de440-span");
      expect(chart.bodies.map(({ fallback: _why, ...row }) => row)).toEqual(chosen.bodies);
    }
    // Just inside each end the chart, its speeds included, is the pack's.
    for (const utc of [ttDate(fromTtDays! + 0.01), ttDate(toTtDays! - 0.01)]) {
      const input = { utc, timeScale: "tt" as const, timeKnown: false };
      const chart = natalChart(input);
      expect(chart.ephemeris).toEqual(DE440);
      expect(chart.flags).not.toContain("outside-de440-span");
      expect(chart.bodies).toEqual(withEphemeris(shippedDe440Source(), () => natalChart(input)).bodies);
    }
  });

  it("is followed by the root's other position functions", () => {
    const at = "1990-04-15T08:30:00Z";
    const inside = withEphemeris(shippedDe440Source(), () => ({ rows: positions(at), sun: bodyLongitude("Sun", new Date(at)) }));
    expect(positions(at)).toEqual(inside.rows);
    expect(bodyLongitude("Sun", new Date(at))).toBe(inside.sun);
  });

  it("gives calc(), chart() and events() the same source as natalChart(), named in their receipts", () => {
    const at = "1990-04-15T08:30:00Z";
    const rows = positions(at);
    for (const row of rows) {
      const position = calc({ body: row.body, time: at });
      if (position.status !== "ok") throw new Error(position.reason);
      // To the bit: longitude, latitude and longitude speed.
      expect([position.lon, position.lat, position.speeds!.lon], row.body).toEqual([row.lon, row.lat, row.speed]);
      expect(position.receipt.engine.ephemeris).toEqual(DE440);
      expect(position.receipt.conventions).toContain(`ephemeris:jpl-de440@${DE440_PACK.sha256}`);
      expect(position.flags).toEqual([]);
    }
    const birth = { time: at, place: { latitude: 51.5, longitude: -0.12 } } as const;
    const whole = calcChart(birth);
    if (whole.status !== "ok") throw new Error(whole.reason);
    expect(whole.chart).toEqual(natalChart({ utc: at, latitude: 51.5, longitude: -0.12 }));
    expect(whole.receipt.engine.ephemeris).toEqual(DE440);
    const found = events({ kind: "longitude-crossing", body: "Sun", longitude: 30, from: "1990-01-01T00:00:00Z", to: "1991-01-01T00:00:00Z" });
    if (found.status !== "ok") throw new Error(found.reason);
    expect(found.receipt.engine.ephemeris).toEqual(DE440);
    expect(found.flags).toEqual([]);
    expect(found.events.map((event) => event.at)).toEqual(
      findLongitudeCrossings("Sun", 30, new Date("1990-01-01T00:00:00Z"), new Date("1991-01-01T00:00:00Z")).map((crossing) => crossing.at.toISOString())
    );
    // After the caller's own choice of astronomy-engine they follow it, and say so, with no fallback flag.
    setDefaultEphemeris("astronomy-engine");
    const chosen = calc({ body: "Neptune", time: at });
    if (chosen.status !== "ok") throw new Error(chosen.reason);
    expect(chosen.receipt.engine.ephemeris).toEqual({ name: EPHEMERIS.name, version: EPHEMERIS.version });
    expect(chosen.flags).toEqual([]);
    expect(chosen.lon).toBe(positions(at).find((row) => row.body === "Neptune")!.lon);
  });

  it("leaves on astronomy-engine, by its receipt's own word, what the pack's reduction does not give", () => {
    const at = "1990-04-15T08:30:00Z";
    const requests = [
      { body: "Mars", time: at, center: "heliocentric" },
      { body: "Mars", time: at, center: "barycentric" },
      { body: "Mars", time: at, center: { topocentric: { latitude: 10, longitude: 20 } } },
      { body: "Mars", time: at, flags: { correction: "astrometric" } },
      { body: "Mars", time: at, flags: { correction: "geometric" } },
      { body: "Earth", time: at, center: "heliocentric" }
    ] as const;
    for (const request of requests) {
      const position = calc(request);
      if (position.status !== "ok") throw new Error(position.reason);
      expect(position.receipt.engine.ephemeris, JSON.stringify(request)).toEqual({ name: EPHEMERIS.name, version: EPHEMERIS.version });
      // Not a fallback: these are never the pack's.
      expect(position.flags).toEqual([]);
    }
  });

  it("gives calc() the pack's place in every frame, turned from the true ecliptic of date", () => {
    const at = "1990-04-15T08:30:00Z";
    for (const frame of ["ecliptic-mean-of-date", "ecliptic-j2000", "ecliptic-icrs", "equatorial-true-of-date", "equatorial-mean-of-date", "equatorial-j2000", "equatorial-icrs"] as const) {
      const here = calc({ body: "Jupiter", time: at, frame, flags: { cartesian: true } });
      setDefaultEphemeris("astronomy-engine");
      const there = calc({ body: "Jupiter", time: at, frame, flags: { cartesian: true } });
      setDefaultEphemeris("de440");
      if (here.status !== "ok" || there.status !== "ok") throw new Error("refused");
      expect(here.receipt.engine.ephemeris).toEqual(DE440);
      expect(here.bounds.position.label).toBe("estimated");
      // The two ephemerides' directions differ by under astronomy-engine's own limit for Jupiter, 17″ (src/calc-bounds.ts).
      const dot = (here.cartesian!.x * there.cartesian!.x + here.cartesian!.y * there.cartesian!.y + here.cartesian!.z * there.cartesian!.z) / (here.dist! * there.dist!);
      expect(Math.acos(Math.min(1, dot)) * 206_264.806).toBeLessThan(17);
      expect(Math.abs(here.dist! / there.dist! - 1)).toBeLessThan(7.9e-5);
    }
  });
});
