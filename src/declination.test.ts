import { MakeTime, SetDeltaTFunction, e_tilt } from "astronomy-engine";
import { describe, expect, it } from "vitest";

import { natalChart } from "./api.js";
import {
  DECLINATION_ORB,
  DECLINATION_ORB_LUMINARY,
  DEFAULT_DECLINATION_ORB_POLICY,
  MAX_DECLINATION_BODIES,
  RA_POLE_TOLERANCE,
  declinationOf,
  declinationOrb,
  declinationsForBodies,
  eclipticToEquatorial,
  findDeclinationAspects
} from "./declination.js";
import type { DeclinationBody, DeclinationOrbPolicy } from "./declination.js";
import { deltaT } from "./deltat.js";
import { computeChartDeclinations } from "./ephemeris.js";
import { createNatalEnvelope, serializeNatalEnvelope } from "./receipt.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const angularDifference = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

describe("full ecliptic to equatorial geometry", () => {
  it("reproduces equinoxes and solstices without false out-of-bounds flags", () => {
    for (const [lon, dec] of [[0, 0], [90, 23.44], [180, 0], [270, -23.44]]) {
      const result = eclipticToEquatorial(lon!, 0, 23.44);
      expect(result.raDefined).toBe(true);
      expect(angularDifference(result.ra!, lon!)).toBeLessThan(1e-12);
      expect(result.dec).toBeCloseTo(dec!, 12);
      expect(declinationsForBodies([{body: "point", lon: lon!, lat: 0}], 23.44).rows[0]!.outOfBounds).toBe(false);
    }
  });

  it("uses the supplied latitude and labels strict out-of-bounds declination", () => {
    const result = declinationsForBodies([
      {body: "north", lon: 90, lat: 8},
      {body: "south", lon: 270, lat: -8},
      {body: "on-ecliptic", lon: 90, lat: 0}
    ], 23.44);
    expect(result.rows[0]!.dec).toBeCloseTo(31.44, 12);
    expect(result.rows[1]!.dec).toBeCloseTo(-31.44, 12);
    expect(result.rows.map(row => row.outOfBounds)).toEqual([true, true, false]);
    expect(result.rows[0]!.dec - result.rows[2]!.dec).toBeCloseTo(8, 12);
    expect(result.receiptScope).toBe("not-included-in-natal-receipt");
  });

  it("is the exact identity for zero obliquity away from the poles", () => {
    for (const lon of [-0.00000001, 0, 29.999999999999996, 180, 359.99999999999994]) {
      for (const lat of [-89, -1.5, 0, 1, 1.5, 89]) {
        const result = eclipticToEquatorial(lon, lat, 0);
        expect(result.dec).toBe(lat);
        expect(result.raDefined).toBe(true);
        expect(result.ra).toBeGreaterThanOrEqual(0);
        expect(result.ra).toBeLessThan(360);
        expect(angularDifference(result.ra!, lon)).toBeLessThan(1e-12);
      }
    }
  });

  it("returns null RA at celestial poles and finite declination at ecliptic poles", () => {
    for (const [lon, lat, dec] of [[90, 90 - 23.44, 90], [270, -90 + 23.44, -90]]) {
      const result = eclipticToEquatorial(lon!, lat!, 23.44);
      expect(result.ra).toBeNull();
      expect(result.raDefined).toBe(false);
      expect(result.dec).toBeCloseTo(dec!, 12);
    }
    const eclipticPole = eclipticToEquatorial(13, 90, 23.44);
    expect(eclipticPole.raDefined).toBe(true);
    expect(eclipticPole.ra).toBeCloseTo(270, 12);
    expect(eclipticPole.dec).toBeCloseTo(66.56, 12);
    expect(eclipticToEquatorial(0, 90, 0)).toEqual({ra: null, raDefined: false, dec: 90});
    expect(RA_POLE_TOLERANCE).toBe(32 * Number.EPSILON);
  });

  it("round-trips independent equatorial unit-vector fixtures over all quadrants", () => {
    // Reverse vector rotation supplies geometric fixtures independently of the
    // forward API. These are arithmetic controls, not provider accuracy tests.
    for (const tilt of [0, 23.44, 45, 90]) {
      for (const ra of [0, 17, 90, 179, 270, 359.9]) {
        for (const dec of [-89.9, -45, -1, 0, 45, 89.9]) {
          const x = Math.cos(dec * DEG) * Math.cos(ra * DEG);
          const eqY = Math.cos(dec * DEG) * Math.sin(ra * DEG);
          const eqZ = Math.sin(dec * DEG);
          const y = eqY * Math.cos(tilt * DEG) + eqZ * Math.sin(tilt * DEG);
          const z = -eqY * Math.sin(tilt * DEG) + eqZ * Math.cos(tilt * DEG);
          const lon = Math.atan2(y, x) * RAD;
          const lat = Math.atan2(z, Math.hypot(x, y)) * RAD;
          const result = eclipticToEquatorial(lon, lat, tilt);
          expect(result.raDefined).toBe(true);
          expect(angularDifference(result.ra!, ra)).toBeLessThan(1e-9);
          expect(Math.abs(result.dec - dec)).toBeLessThan(1e-11);
        }
      }
    }
  });

  it("rejects nonfinite coordinates and invalid latitude or obliquity", () => {
    for (const invalid of [NaN, Infinity, -Infinity, "0" as unknown as number]) {
      expect(() => eclipticToEquatorial(invalid, 0, 23.44)).toThrow(RangeError);
      expect(() => eclipticToEquatorial(0, invalid, 23.44)).toThrow(RangeError);
      expect(() => eclipticToEquatorial(0, 0, invalid)).toThrow(RangeError);
    }
    for (const lat of [-90.000001, 90.000001]) expect(() => declinationOf(0, lat, 23.44)).toThrow(RangeError);
    for (const tilt of [-1, 91]) expect(() => declinationOf(0, 0, tilt)).toThrow(RangeError);
  });
});

describe("site-compatible declination aspect policy", () => {
  const pair = (a: string, first: number, b: string, second: number): DeclinationBody[] => [
    {body: a, lon: 359, lat: first}, {body: b, lon: 1, lat: second}
  ];

  it("retains the site's ordinary/luminary orbs and nearest-type tie rule", () => {
    expect(declinationOrb("Mars", "Saturn")).toBe(DECLINATION_ORB);
    expect(declinationOrb("Sun", "Saturn")).toBe(DECLINATION_ORB_LUMINARY);
    expect(declinationOrb("Mars", "Moon")).toBe(1.5);
    expect(findDeclinationAspects(pair("Mars", 12, "Saturn", 12.4), 0)[0]!.type).toBe("parallel");
    expect(findDeclinationAspects(pair("Mars", 12, "Saturn", -12.4), 0)[0]!.type).toBe("contraparallel");
    const tie = findDeclinationAspects(pair("Mars", 0, "Saturn", -0.6), 0)[0]!;
    expect(tie.type).toBe("parallel");
    expect(tie.orb).toBe(0.6);
    expect(tie.separation).toBe(2);
    expect(tie.maximumOrb).toBe(1);
  });

  it("includes exact policy boundaries and reports custom allowances explicitly", () => {
    expect(findDeclinationAspects(pair("Mars", 0, "Saturn", 1), 0)).toHaveLength(1);
    expect(findDeclinationAspects(pair("Mars", 0, "Saturn", 1.0000001), 0)).toHaveLength(0);
    expect(findDeclinationAspects(pair("Sun", 0, "Saturn", 1.5), 0)).toHaveLength(1);
    const policy = {orb: 0.25, luminaryOrb: 0.5};
    expect(findDeclinationAspects(pair("Mars", 0, "Saturn", 0.4), 0, policy)).toHaveLength(0);
    expect(findDeclinationAspects(pair("Moon", 0, "Saturn", 0.4), 0, policy)[0]!.maximumOrb).toBe(0.5);
    expect(DEFAULT_DECLINATION_ORB_POLICY).toEqual({orb: 1, luminaryOrb: 1.5});
  });

  it("considers every provided identity, including nodes, without mutation", () => {
    const bodies = [{body: "North Node", lon: 0, lat: 0}, {body: "South Node", lon: 180, lat: 0}, {body: "Mars", lon: 60, lat: 0}];
    const before = JSON.stringify(bodies);
    const result = findDeclinationAspects(bodies, 0);
    expect(result).toHaveLength(3);
    expect(result.every(aspect => aspect.type === "parallel")).toBe(true);
    expect(JSON.stringify(bodies)).toBe(before);
    expect(declinationsForBodies([], 23.44).rows).toEqual([]);
  });

  it("rejects malformed policies, duplicate identities and oversized arrays", () => {
    for (const policy of [{orb: -1, luminaryOrb: 1}, {orb: 1, luminaryOrb: Infinity}, {orb: 91, luminaryOrb: 1}, {orb: 1, luminaryOrb: 1, extra: 1}]) {
      expect(() => findDeclinationAspects([], 23.44, policy)).toThrow(RangeError);
    }
    expect(() => findDeclinationAspects(pair("Mars", 0, "Mars", 1), 0)).toThrow("duplicate declination body identifier");
    const large = Array.from({length: MAX_DECLINATION_BODIES + 1}, (_, i) => ({body: `p${i}`, lon: i, lat: 0}));
    expect(() => findDeclinationAspects(large, 23.44)).toThrow(RangeError);
  });

  it("rejects stateful accessors before invoking them", () => {
    let calls = 0;
    const badPolicy = {get orb() {calls += 1; return calls === 1 ? 1 : Infinity;}, luminaryOrb: 1.5};
    expect(() => findDeclinationAspects([], 23.44, badPolicy)).toThrow(RangeError);
    expect(calls).toBe(0);
    for (const key of ["body", "lon", "lat"] as const) {
      const body = {body: "Mars", lon: 12, lat: 1};
      Object.defineProperty(body, key, {enumerable: true, get() {calls += 1; return NaN;}});
      expect(() => findDeclinationAspects([body], 23.44)).toThrow(RangeError);
      expect(calls).toBe(0);
    }
    const badLabel = "raw-private-label";
    expect(() => findDeclinationAspects(pair(badLabel, 0, badLabel, 1), 0)).toThrow(/^duplicate declination body identifier\.$/);
  });

  it("rejects sparse, decorated and accessor-bearing arrays explicitly", () => {
    const sparse = new Array<DeclinationBody>(2);
    sparse[1] = {body: "Mars", lon: 0, lat: 0};
    expect(() => findDeclinationAspects(sparse, 0)).toThrow(RangeError);
    const decorated: DeclinationBody[] = [{body: "Mars", lon: 0, lat: 0}];
    let called = false;
    Object.defineProperty(decorated, "map", {value() {called = true; return [];}});
    expect(() => findDeclinationAspects(decorated, 0)).toThrow(RangeError);
    expect(called).toBe(false);
    const accessor = [{body: "Mars", lon: 0, lat: 0}];
    Object.defineProperty(accessor, 0, {enumerable: true, get() {called = true; return {};}});
    expect(() => findDeclinationAspects(accessor, 0)).toThrow(RangeError);
    expect(called).toBe(false);
  });
});

describe("chart-clock declination derivation", () => {
  const birth = {utc: "2026-09-22T12:00:00Z", latitude: 51.5, longitude: -0.12, houseSystem: "whole" as const};

  it("records observation/Delta-T and uses the provider's pinned true obliquity", () => {
    const chart = natalChart({...birth, deltaT: 86_400_000});
    let expected: number;
    try {
      SetDeltaTFunction(() => 86_400_000);
      expected = e_tilt(MakeTime(chart.input.utc)).tobl;
    } finally { SetDeltaTFunction(deltaT); }
    const result = computeChartDeclinations(chart);
    expect(result.utc).toBe(chart.input.utc.toISOString());
    expect(result.deltaT).toEqual(chart.deltaT);
    expect(result.trueObliquity).toBe(expected!);
    expect(result.rows).toHaveLength(chart.bodies.length);
    for (const body of chart.bodies) {
      const row = result.rows.find(item => item.body === body.body)!;
      expect(row.dec).toBe(declinationOf(body.lon, body.lat, expected!));
      expect(row.lat).toBe(body.lat);
    }
    const time = MakeTime(chart.input.utc);
    expect((time.tt - time.ut) * 86400).toBeCloseTo(deltaT(time.ut), 6);
  });

  it("restores the provider clock when body validation throws", () => {
    const chart = natalChart({...birth, deltaT: 100000});
    const invalid = {...chart, bodies: chart.bodies.map((body, index) => index === 0 ? {...body, lat: NaN} : body)};
    expect(() => computeChartDeclinations(invalid)).toThrow(RangeError);
    const time = MakeTime(chart.input.utc);
    expect((time.tt - time.ut) * 86400).toBeCloseTo(deltaT(time.ut), 6);
  });

  it("preserves chart numerics and existing natal receipt bytes", () => {
    const chart = natalChart(birth);
    const before = serializeNatalEnvelope(createNatalEnvelope(chart));
    const snapshot = JSON.stringify(chart);
    const derived = computeChartDeclinations(chart);
    expect(derived.receiptScope).toBe("not-included-in-natal-receipt");
    expect(JSON.stringify(chart)).toBe(snapshot);
    expect(serializeNatalEnvelope(createNatalEnvelope(chart))).toBe(before);
  });
});
