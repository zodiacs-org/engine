import { describe, expect, it } from "vitest";

import { computeChart } from "./ephemeris.js";

// ERFA's ascendant and midheaven for twelve cases of the preregistered angle
// grid in zodiacs.org's repository
// (docs/platform/evidence/engine-beyond-swiss/corpora/angle-grid-erfa.json,
// grid sha256 82a5466caefb919df66060dd46861ac4f68a678ef9ce3c16bfc423a94042cd9d).
// pyerfa 2.0.1.5: gst06a with UT1 taken as UTC, and the true obliquity (obl06
// plus the Δε of nut06a), on this engine's own clock. Longitude 0 throughout.
// The first two were the grid's worst ascendants on the mean obliquity: 506.8″
// from ERFA at −66° in 1950, and 512.5″ from Swiss at +66° in 2100.
const CASES: ReadonlyArray<readonly [utc: string, latitude: number, asc: number, mc: number]> = [
  ["1950-03-21T18:00:00Z", -66, 135.48915566, 88.789425669],
  ["2100-03-21T06:00:00Z", 66, 320.516526998, 268.946408931],
  ["2025-03-21T18:00:00Z", -66, 160.24744343, 89.545955783],
  ["2025-03-21T18:00:00Z", -65, 172.365737282, 89.545955783],
  ["2025-03-21T18:00:00Z", -63, 176.387074777, 89.545955783],
  ["2025-03-21T18:00:00Z", -45, 179.047837705, 89.545955783],
  ["2025-03-21T06:00:00Z", 45, 358.099828743, 269.093777149],
  ["2025-03-21T06:00:00Z", 63, 352.812319343, 269.093777149],
  ["2025-03-21T06:00:00Z", 65, 345.000728526, 269.093777149],
  ["2025-03-21T06:00:00Z", 66, 324.256594767, 269.093777149],
  ["2150-03-21T18:00:00Z", -66, 151.632786592, 89.295134095],
  ["1800-03-21T06:00:00Z", 0, 358.377100684, 268.634366381]
];

/** Signed a − b in arcseconds, across the 0/360 seam. */
const arcsec = (a: number, b: number) => (((((a - b) % 360) + 540) % 360) - 180) * 3600;

describe("the angles against the ERFA arbiter (brief v1 rule 1b)", () => {
  it.each(CASES)("%s at %s°", (utc, latitude, asc, mc) => {
    const { angles } = computeChart({
      utc: new Date(utc),
      latitude,
      longitude: 0,
      houseSystem: "whole",
      timeKnown: true
    });
    // The rule's gates: 8″ everywhere, 0.5″ within 45° of the equator.
    const gate = Math.abs(latitude) <= 45 ? 0.5 : 8;
    expect(Math.abs(arcsec(angles!.asc, asc))).toBeLessThan(gate);
    expect(Math.abs(arcsec(angles!.mc, mc))).toBeLessThan(0.25);
  });
});
