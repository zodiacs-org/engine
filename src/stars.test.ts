import { readFileSync } from "node:fs";

import { AstroTime } from "astronomy-engine";
import { describe, expect, it } from "vitest";

import { findFixedStar, fixedStarPosition, fixedStars } from "./stars.js";

interface Reference {
  readonly source: string;
  readonly cases: ReadonlyArray<readonly [string, number, number, number]>;
}

const REF = JSON.parse(readFileSync(new URL("./fixtures/stars-erfa.json", import.meta.url), "utf8")) as Reference;
const TOLERANCE_ARCSEC = 0.01;

describe("fixed stars", () => {
  it("carries the 411 IAU-named Hipparcos stars and the Galactic Center", () => {
    expect(fixedStars()).toHaveLength(411);
    expect(new Set(fixedStars().map((s) => s.name)).size).toBe(411);
  });

  it("finds stars by name, designation and Hipparcos number", () => {
    expect(findFixedStar("regulus")?.hip).toBe(49669);
    expect(findFixedStar("alpha  Leo")?.name).toBe("Regulus");
    expect(findFixedStar("alf Tau")?.name).toBe("Aldebaran");
    expect(findFixedStar("HIP 21421")?.name).toBe("Aldebaran");
    expect(findFixedStar("Galactic Center")?.hip).toBe(0);
    expect(findFixedStar("HIP 0")).toBeUndefined();
    expect(findFixedStar("Nope")).toBeUndefined();
    expect(() => fixedStarPosition("Nope", new Date())).toThrow(RangeError);
  });

  it(`matches ERFA's apparent places within ${TOLERANCE_ARCSEC}" (${REF.cases.length} cases)`, () => {
    expect(REF.cases.length).toBe(1644);
    let worst = 0;
    for (const [name, jd, lon, lat] of REF.cases) {
      const p = fixedStarPosition(name, AstroTime.FromTerrestrialTime(jd - 2451545));
      const dlon = ((p.longitude - lon + 540) % 360) - 180;
      const err = Math.hypot(dlon * Math.cos((lat * Math.PI) / 180), p.latitude - lat) * 3600;
      worst = Math.max(worst, err);
      if (err > TOLERANCE_ARCSEC) throw new Error(`${name} at JD ${jd}: ${err.toFixed(4)}"`);
    }
    console.log(`fixed stars vs ERFA: worst ${worst.toFixed(4)}" over ${REF.cases.length} cases`);
  });

  it("astrometric mean place differs from the apparent by aberration-sized amounts only", () => {
    const t = AstroTime.FromTerrestrialTime(9497);
    const a = fixedStarPosition("Spica", t);
    const m = fixedStarPosition("Spica", t, { apparent: false });
    const d = Math.abs(((a.longitude - m.longitude + 540) % 360) - 180) * 3600;
    expect(d).toBeGreaterThan(0.1);
    expect(d).toBeLessThan(60);
    expect(a.distanceParsecs).toBeGreaterThan(50);
  });
});
