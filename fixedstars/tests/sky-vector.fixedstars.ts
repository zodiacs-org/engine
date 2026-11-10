import { AstroTime, Body, GeoVector as nativeGeoVector } from "astronomy-engine";
import { describe, expect, it } from "vitest";

import { catalog } from "../src/catalog.js";
import { natalChart } from "../src/engine.js";
import { propagateStarDirection } from "../src/positions.js";
import { GeoVector, STAR_BODY_SLOT, STAR_RAY_SCALE_AU, withStarVector } from "../src/sky-vector.js";
import type { CatalogStar } from "../src/types.js";

const star: CatalogStar = { ...catalog[0]!, id: "synthetic-axis", raDeg: 0, decDeg: 0, properMotion: null };
const time = new AstroTime(0);

describe("the isolated vector scope", () => {
  it("supplies a J2000 ray without precessing twice or interpreting a physical distance", () => {
    expect(STAR_BODY_SLOT).toBe(Body.Pluto);
    expect(STAR_RAY_SCALE_AU).toBe(2 ** 500);
    withStarVector(star, () => {
      const found = GeoVector(Body.Pluto, time, true);
      expect(found.x / STAR_RAY_SCALE_AU).toBe(1);
      expect(found.y).toBe(0);
      expect(found.z).toBe(0);
      expect(found.t).toBe(time);
      expect(Number.isFinite(found.Length())).toBe(true);
    });
    expect(GeoVector(Body.Pluto, time, true)).toEqual(nativeGeoVector(Body.Pluto, time, true));
  });

  it("advances motion at each sample's TT, then snapshots caller astrometry", () => {
    const pm = { raCosDecMasPerYear: 3_600_000 * 180 / Math.PI, decMasPerYear: 0, sourceId: "synthetic" };
    const mutable = { ...star, properMotion: pm };
    const later = AstroTime.FromTerrestrialTime(365.25);
    const expected = propagateStarDirection(mutable, later.tt);
    withStarVector(mutable, () => {
      mutable.raDeg = 180;
      pm.raCosDecMasPerYear = 0;
      const ray = GeoVector(Body.Pluto, later, true);
      expect([ray.x, ray.y, ray.z].map((n) => n / STAR_RAY_SCALE_AU)).toEqual(expected);
      expect(ray.x / STAR_RAY_SCALE_AU).toBeCloseTo(1 / Math.sqrt(2), 12);
      expect(ray.y / STAR_RAY_SCALE_AU).toBeCloseTo(1 / Math.sqrt(2), 12);
    });
    expect(Object.isFrozen(mutable)).toBe(false);
    expect(Object.isFrozen(pm)).toBe(false);
  });

  it("leaves every other body native while the slot is bound, and all bodies native afterwards", () => {
    const bodies = [Body.Sun, Body.Moon, Body.Mercury, Body.Venus, Body.Mars,
      Body.Jupiter, Body.Saturn, Body.Uranus, Body.Neptune, Body.Pluto];
    const expected = bodies.map((body) => nativeGeoVector(body, time, true));
    withStarVector(star, () => {
      for (const [i, body] of bodies.entries()) {
        if (body !== Body.Pluto) expect(GeoVector(body, time, true)).toEqual(expected[i]);
        // The real module itself is untouched, including its Pluto export.
        expect(nativeGeoVector(body, time, true)).toEqual(expected[i]);
      }
    });
    for (const [i, body] of bodies.entries()) expect(GeoVector(body, time, true)).toEqual(expected[i]);
  });

  it("leaves chart casting native during the binding, including the ordinary Pluto row", () => {
    const birth = { utc: "2000-03-20T06:00:00Z", latitude: 12, longitude: 30 };
    const expected = natalChart(birth);
    expect(withStarVector(star, () => natalChart(birth))).toEqual(expected);
    expect(natalChart(birth)).toEqual(expected);
  });

  it("restores the slot after a thrown callback and refuses reentrant scopes", () => {
    const sentinel = new Error("synthetic failure");
    expect(() => withStarVector(star, () => { throw sentinel; })).toThrow(sentinel);
    expect(GeoVector(Body.Pluto, time, true)).toEqual(nativeGeoVector(Body.Pluto, time, true));
    withStarVector(star, () => {
      expect(() => withStarVector({ ...star, raDeg: 90 }, () => 0)).toThrow(/reentered/u);
      expect(GeoVector(Body.Pluto, time, true).x).toBe(STAR_RAY_SCALE_AU);
    });
    expect(withStarVector(star, () => "new scope")).toBe("new scope");
  });

  it("refuses promises, incompatible vector calls and invalid stars without leaving a binding", () => {
    expect(() => withStarVector(star, () => Promise.resolve(0))).toThrow(/synchronously/u);
    expect(() => withStarVector(star, () => GeoVector(Body.Pluto, time, false))).toThrow(/call shape/u);
    expect(() => withStarVector({ ...star, raDeg: NaN }, () => 0)).toThrow(RangeError);
    expect(GeoVector(Body.Pluto, time, true)).toEqual(nativeGeoVector(Body.Pluto, time, true));
  });
});
