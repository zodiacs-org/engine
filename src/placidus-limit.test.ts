import { describe, expect, it } from "vitest";

import { computeChart } from "./ephemeris.js";
import { computeAngles, placidusCusps } from "./houses.js";
import { normalizeLongitude } from "./signs.js";

// The preregistered Placidus ladder in zodiacs.org's repository (brief v1 rule
// 1h; docs/platform/evidence/engine-beyond-swiss/corpora/, grid L): every three
// hours on 21 June 1800, 2000 and 2200, at ±66.05° to ±66.55°, longitude 0.
// Beside each instant, ERFA's limit from angle-grid-erfa.json: 90° − ε, with ε
// the true obliquity (obl06 plus the Δε of nut06a) on this engine's clock. The
// limit allows Placidus on 320 of the 336 cases, the count Swiss Ephemeris
// computes.
const LIMITS: ReadonlyArray<readonly [utc: string, limit: number]> = [
  ["1800-06-21T00:00:00Z", 66.532631398],
  ["1800-06-21T03:00:00Z", 66.532632224],
  ["1800-06-21T06:00:00Z", 66.532632978],
  ["1800-06-21T09:00:00Z", 66.532633659],
  ["1800-06-21T12:00:00Z", 66.532634264],
  ["1800-06-21T15:00:00Z", 66.532634791],
  ["1800-06-21T18:00:00Z", 66.532635238],
  ["1800-06-21T21:00:00Z", 66.532635604],
  ["2000-06-21T00:00:00Z", 66.562049745],
  ["2000-06-21T03:00:00Z", 66.56204832],
  ["2000-06-21T06:00:00Z", 66.562046878],
  ["2000-06-21T09:00:00Z", 66.56204542],
  ["2000-06-21T12:00:00Z", 66.562043951],
  ["2000-06-21T15:00:00Z", 66.562042474],
  ["2000-06-21T18:00:00Z", 66.562040992],
  ["2000-06-21T21:00:00Z", 66.562039508],
  ["2200-06-21T00:00:00Z", 66.589210414],
  ["2200-06-21T03:00:00Z", 66.589210855],
  ["2200-06-21T06:00:00Z", 66.589211354],
  ["2200-06-21T09:00:00Z", 66.589211913],
  ["2200-06-21T12:00:00Z", 66.58921253],
  ["2200-06-21T15:00:00Z", 66.589213204],
  ["2200-06-21T18:00:00Z", 66.589213936],
  ["2200-06-21T21:00:00Z", 66.589214725]
];
const LATITUDES = [66.05, 66.1, 66.2, 66.3, 66.4, 66.5, 66.55];

describe("the Placidus limit against the ERFA arbiter (brief v1 rule 1h)", () => {
  const cases = LIMITS.flatMap(([utc, limit]) =>
    LATITUDES.flatMap((magnitude) =>
      [magnitude, -magnitude].map((latitude) => ({ utc, latitude, limit }))
    )
  );

  it("computes Placidus exactly where the arbiter's limit allows it", () => {
    let computed = 0;
    for (const { utc, latitude, limit } of cases) {
      const chart = computeChart({
        utc: new Date(utc),
        latitude,
        longitude: 0,
        houseSystem: "placidus",
        timeKnown: true
      });
      const allowed = Math.abs(latitude) < limit;
      expect(chart.houses?.system).toBe(allowed ? "placidus" : "whole");
      expect(chart.flags.includes("polar-fallback")).toBe(!allowed);
      if (!allowed) continue;
      computed += 1;
      // Twelve distinct cusps in zodiacal order: the forward gaps go once round.
      const cusps = chart.houses!.cusps;
      const gaps = cusps.map((cusp, index) => normalizeLongitude(cusps[(index + 1) % 12]! - cusp));
      expect(gaps.every((gap) => gap > 0)).toBe(true);
      expect(gaps.reduce((sum, gap) => sum + gap, 0)).toBeCloseTo(360, 9);
    }
    expect([cases.length, computed]).toEqual([336, 320]);
  });
});

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const signed = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;
const longitudeOfAscension = (ra: number, obliquity: number) =>
  normalizeLongitude(Math.atan2(Math.sin(ra * DEG), Math.cos(ra * DEG) * Math.cos(obliquity * DEG)) * RAD);

/**
 * The fixed-point iteration alone, as placidusCusps ran it before its
 * bracketed fallback: null where it does not settle within 64 steps.
 */
function iterationAlone(ramc: number, latitude: number, obliquity: number, offset: number, multiplier: number): number | null {
  const phi = latitude * DEG;
  let ra = ramc + offset;
  for (let index = 0; index < 64; index += 1) {
    const lon = longitudeOfAscension(normalizeLongitude(ra), obliquity);
    const declination = Math.asin(Math.sin(obliquity * DEG) * Math.sin(lon * DEG)) * RAD;
    const argument = Math.tan(phi) * Math.tan(declination * DEG);
    if (Math.abs(argument) >= 1) return null;
    const ascensionalDifference = Math.asin(argument) * RAD;
    const next = ramc + offset + multiplier * ascensionalDifference;
    if (Math.abs(normalizeLongitude(next - ra + 180) - 180) < 1e-9) {
      return longitudeOfAscension(normalizeLongitude(next), obliquity);
    }
    ra = next;
  }
  return null;
}

/**
 * α − RAMC − offset − m·AD(α) without the cancellation near |tan φ tan δ| = 1:
 * 1 − |tan φ tan ε sin α| is formed as (1 − q) + q (1 − |sin α|), with
 * 1 − q = sin(90° − |φ| − ε) / (cos φ cos ε) (the subtraction is exact in
 * binary) and 1 − |sin α| = 2 sin²(d/2), d the distance from α to 90° or 270°.
 */
function residual(alpha: number, ramc: number, latitude: number, obliquity: number, offset: number, multiplier: number): number {
  const phi = Math.abs(latitude);
  const oneMinusQ = Math.sin((90 - phi - obliquity) * DEG) / (Math.cos(phi * DEG) * Math.cos(obliquity * DEG));
  const sine = Math.sin(alpha * DEG);
  const toTop = signed(alpha - (sine >= 0 ? 90 : 270));
  const oneMinusX = oneMinusQ + (1 - oneMinusQ) * 2 * Math.sin((toTop / 2) * DEG) ** 2;
  const ascensionalDifference = Math.sign(latitude) * Math.sign(sine) * (90 - 2 * Math.asin(Math.sqrt(oneMinusX / 2)) * RAD);
  return signed(alpha - ramc - offset - multiplier * ascensionalDifference);
}

/** The cusp by bisection on that residual, which increases with α. */
function referenceCusp(ramc: number, latitude: number, obliquity: number, offset: number, multiplier: number): number {
  let low = ramc + offset - 90 * multiplier - 1;
  let high = ramc + offset + 90 * multiplier + 1;
  for (let index = 0; index < 200; index += 1) {
    const middle = (low + high) / 2;
    if (!(middle > low && middle < high)) break;
    if (residual(middle, ramc, latitude, obliquity, offset, multiplier) < 0) low = middle;
    else high = middle;
  }
  return longitudeOfAscension(normalizeLongitude((low + high) / 2), obliquity);
}

/** The largest double below x, less `steps` - 1 further units in the last place. */
function below(x: number, steps: number): number {
  const buffer = new Float64Array([x]);
  const bits = new BigInt64Array(buffer.buffer);
  bits[0] = bits[0]! - BigInt(steps);
  return buffer[0]!;
}

// The 11th, 12th, 2nd and 3rd cusps: offset, multiplier, index in the cusp list.
const INTERMEDIATE = [
  [30, 1 / 3, 10],
  [60, 2 / 3, 11],
  [120, 2 / 3, 1],
  [150, 1 / 3, 2]
] as const;

describe("Placidus just below the polar limit", () => {
  it("keeps Placidus at every millisecond of the review's reproduction, where the iteration alone fell back", () => {
    // 2000-03-20T00:00Z at 92.16879370494166° E: the RAMC passes 270°, where
    // the 2nd and 3rd cusps reach right ascension 270°. The review took
    // 66.56186339751429°, 1.07e-5″ below the polar limit on astronomy-engine's
    // five-term nutation. That obliquity was 0.00498″ below ERFA's (obl06 plus
    // nut06a's Δε), and the full IAU 2000B series puts it 0.00030″ above: the
    // review's latitude is now inside the polar circle, as ERFA puts it
    // (docs/evidence/nutation-2026-09-29/results/test-expectations.json). The
    // latitude here is the same 1.07e-5″ below the engine's limit now.
    const t0 = Date.UTC(2000, 2, 20);
    let placidus = 0;
    for (let time = t0 - 1_000; time <= t0 + 1_200; time += 1) {
      const chart = computeChart({
        utc: new Date(time),
        latitude: 66.56186193124925,
        longitude: 92.16879370494166,
        houseSystem: "placidus",
        timeKnown: true
      });
      if (chart.houses?.system === "placidus" && !chart.flags.includes("polar-fallback")) placidus += 1;
    }
    expect(placidus).toBe(2_201);
  });

  it("solves every cusp within 1e-6° of the limit, at the sidereal times where the iteration alone fails", () => {
    // A cusp's right ascension reaches 90° or 270° at these RAMCs, where
    // |tan φ tan δ| comes within rounding of 1 as |φ| approaches 90° − ε.
    const sensitive = { north: [30, 150, 210, 270, 330], south: [30, 90, 150, 210, 330] };
    const distances = [0, 1e-12, 1e-10, 1e-9, 1e-8, 1e-7, 1e-6];
    let cases = 0;
    let nulls = 0;
    let failedAlone = 0;
    let differsFromIteration = 0;
    let unordered = 0;
    let worst = 0;
    for (const obliquity of [23.4392911, 23.4271]) {
      for (const hemisphere of [1, -1]) {
        for (const distance of distances) {
          // Zero stands for the largest latitude below the limit.
          const magnitude = distance === 0 ? below(90 - obliquity, 1) : 90 - obliquity - distance;
          const latitude = hemisphere * magnitude;
          for (const value of hemisphere > 0 ? sensitive.north : sensitive.south) {
            for (let step = -50; step <= 50; step += 1) {
              const input = { gastHours: (value + step * 1e-4) / 15, latitude, longitude: 0, obliquity };
              const ramc = normalizeLongitude(input.gastHours * 15);
              const cusps = placidusCusps(input, computeAngles(input));
              cases += 1;
              if (cusps === null) {
                nulls += 1;
                continue;
              }
              const gaps = cusps.map((cusp, index) => normalizeLongitude(cusps[(index + 1) % 12]! - cusp));
              if (!gaps.every((gap) => gap > 0) || Math.abs(gaps.reduce((sum, gap) => sum + gap, 0) - 360) > 1e-9) {
                unordered += 1;
              }
              for (const [offset, multiplier, index] of INTERMEDIATE) {
                const alone = iterationAlone(ramc, latitude, obliquity, offset, multiplier);
                if (alone === null) failedAlone += 1;
                else if (alone !== cusps[index]) differsFromIteration += 1;
                const reference = referenceCusp(ramc, latitude, obliquity, offset, multiplier);
                worst = Math.max(worst, Math.abs(signed(cusps[index]! - reference)));
              }
            }
          }
        }
      }
    }
    expect({ cases, nulls, unordered, differsFromIteration }).toEqual({
      cases: 2 * 2 * distances.length * 5 * 101,
      nulls: 0,
      unordered: 0,
      differsFromIteration: 0
    });
    // The sweep reaches the inputs that made the iteration alone fall back.
    expect(failedAlone).toBeGreaterThan(0);
    // asin's rounding near ±1 limits the accuracy here, the same with or without the fallback.
    expect(worst).toBeLessThan(1e-6);
  });
});
