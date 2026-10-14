import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalog, propagateStarDirection, starPositionAtTt, starPositions } from "../src/index.js";
import type { CatalogStar, StarPositionTime } from "../src/index.js";
import {
  apply, chartDeclinations, eclipticOfDate, eclipticRows, eclipticToEquatorial, equatorRows,
  fromSpherical, natalChart, tilt, transpose
} from "../src/engine.js";
import type { Vec3 } from "../src/engine.js";

const DEG = Math.PI / 180;
const ARCSEC = DEG / 3600;
// A deliberately large synthetic angular rate: one radian per Julian year.
const RAD_IN_MAS = 3_600_000 / DEG;
function synthetic(raDeg = 0, decDeg = 0, east: number | null = 0, north = 0): CatalogStar {
  return {
    ...catalog[0]!, id: "synthetic-direction", name: "Synthetic direction", aliases: [],
    raDeg, decDeg, historicalAttributions: [],
    properMotion: east === null ? null : {
      raCosDecMasPerYear: east, decMasPerYear: north, sourceId: "synthetic-geometric-construction"
    }
  };
}
function expectVector(actual: Vec3, expected: Vec3, precision = 12): void {
  for (const [i, coordinate] of expected.entries()) expect(actual[i]).toBeCloseTo(coordinate, precision);
}

describe("hand-derived normalized tangent motion on J2000 axes", () => {
  it("leaves the J2000 epoch unchanged without applying a second bias", () => {
    expectVector(propagateStarDirection(synthetic(0, 0, RAD_IN_MAS, RAD_IN_MAS), 0), [1, 0, 0]);
    expectVector(propagateStarDirection(synthetic(90, 0), 0), [0, 1, 0]);
    expectVector(propagateStarDirection(synthetic(0, 90, null), 0), [0, 0, 1]);
  });

  it.each([1, -1])("gives atan(1) eastward displacement after %s Julian years", (sign) => {
    expectVector(propagateStarDirection(synthetic(0, 0, RAD_IN_MAS), sign * 365.25),
      [Math.SQRT1_2, sign * Math.SQRT1_2, 0]);
  });

  it("keeps both tangent components in the same vector before normalization", () => {
    expectVector(propagateStarDirection(synthetic(0, 0, 3 * RAD_IN_MAS, 4 * RAD_IN_MAS), 365.25),
      [1 / Math.sqrt(26), 3 / Math.sqrt(26), 4 / Math.sqrt(26)]);
  });

  it("does not divide mu_alpha_star by cos(dec) at nonzero declination", () => {
    expectVector(propagateStarDirection(synthetic(0, 60, RAD_IN_MAS), 365.25),
      [0.5 / Math.sqrt(2), 1 / Math.sqrt(2), Math.sqrt(3) / (2 * Math.sqrt(2))]);
  });

  it("rotates the tangent bases with catalog RA and signed north motion", () => {
    // At alpha=90, delta=0: u=(0,1,0), east=(-1,0,0), north=(0,0,1).
    expectVector(propagateStarDirection(synthetic(90, 0, RAD_IN_MAS, -RAD_IN_MAS), 365.25),
      [-1 / Math.sqrt(3), 1 / Math.sqrt(3), -1 / Math.sqrt(3)]);
  });

  it("distinguishes unavailable motion from tabulated zero", () => {
    for (const days of [-73000, 0, 73000]) {
      expectVector(propagateStarDirection(synthetic(0, 0, null), days), [1, 0, 0]);
      expectVector(propagateStarDirection(synthetic(0, 0), days), [1, 0, 0]);
    }
    expect(starPositionAtTt(synthetic(0, 0, null), 0).motion).toBe("unavailable");
    expect(starPositionAtTt(synthetic(), 0).motion).toBe("linear-tangent");
  });

  it("rejects incompatible frames, epochs, units, motion and pole tangents", () => {
    const invalid = [
      { frame: "icrs" }, { epochJulianYear: 1991.25 }, { raDeg: -1 }, { raDeg: 360 },
      { raDeg: NaN }, { decDeg: 91 }, { decDeg: Infinity }, { id: "" },
      { properMotion: undefined }, { properMotion: { raCosDecMasPerYear: NaN, decMasPerYear: 0 } }
    ];
    for (const patch of invalid) expect(() => propagateStarDirection({ ...synthetic(), ...patch } as CatalogStar, 0)).toThrow(RangeError);
    expect(() => propagateStarDirection(synthetic(0, 90, 1), 0)).toThrow(RangeError);
    expect(() => propagateStarDirection(synthetic(0, -90, 0, 1), 0)).toThrow(RangeError);
    for (const days of [NaN, Infinity, -Infinity]) expect(() => propagateStarDirection(synthetic(), days)).toThrow(RangeError);
    expect(() => propagateStarDirection(synthetic(0, 0, Number.MAX_VALUE), Number.MAX_VALUE)).toThrow(RangeError);
  });
});

describe("engine true equator and ecliptic rotations", () => {
  it("applies the hand-derived J2000 nutation geometry to the x basis", () => {
    // At J2000 mean-equator precession is identity; the nutation angles are
    // supplied by the engine. This checks composition, not nutation accuracy.
    const at = tilt(0);
    const psi = at.dpsi * ARCSEC;
    const eps = at.tobl * DEG;
    const result = starPositionAtTt(synthetic(), 0);
    expectVector(fromSpherical(result.lonDeg!, result.latDeg, 1), [Math.cos(psi), Math.sin(psi), 0]);
    expectVector(fromSpherical(result.raDeg!, result.decDeg, 1),
      [Math.cos(psi), Math.sin(psi) * Math.cos(eps), Math.sin(psi) * Math.sin(eps)]);
    expect(result.elapsedJulianYears).toBe(0);
  });

  it("places constructed directions against the existing independent ERFA fixture", () => {
    // Read the parent's independent arbiter fixture without copying or changing it.
    const fixture = JSON.parse(readFileSync(new URL("../../src/fixtures/nutation-erfa.json", import.meta.url), "utf8")) as {
      tolerance: { rotationArcsec: number };
      epochs: { tt: number; epsA: number; deps: number; eclipticOfDate: number[] }[];
    };
    const tolerance = fixture.tolerance.rotationArcsec * ARCSEC;
    for (const epoch of fixture.epochs) {
      // These three directions are exact Cartesian basis vectors at J2000,
      // constructed independently of fromSpherical and of propagation output.
      const cases = [[synthetic(), [1, 0, 0]], [synthetic(90), [0, 1, 0]],
        [synthetic(0, 90, null), [0, 0, 1]]] as const;
      const eps = (epoch.epsA + epoch.deps) * ARCSEC;
      for (const [star, direction] of cases) {
        const m = epoch.eclipticOfDate;
        const [x, y, z] = [0, 1, 2].map((row) =>
          m[3 * row]! * direction[0] + m[3 * row + 1]! * direction[1] + m[3 * row + 2]! * direction[2]) as [number, number, number];
        const expectedEq: Vec3 = [x, y * Math.cos(eps) - z * Math.sin(eps), y * Math.sin(eps) + z * Math.cos(eps)];
        const result = starPositionAtTt(star, epoch.tt);
        const foundEcl = fromSpherical(result.lonDeg!, result.latDeg, 1);
        const foundEq = fromSpherical(result.raDeg!, result.decDeg, 1);
        for (const i of [0, 1, 2]) {
          expect(Math.abs(foundEcl[i]! - [x, y, z][i]!)).toBeLessThan(tolerance);
          expect(Math.abs(foundEq[i]! - expectedEq[i]!)).toBeLessThan(tolerance);
        }
      }
    }
  });

  it("agrees with the engine chart's ecliptic and declination geometry for the full catalog", () => {
    for (const days of [-73000, 0, 73000]) for (const star of catalog) {
      const result = starPositionAtTt(star, days);
      const direct = eclipticOfDate(...result.directionJ2000, days);
      expect(result.lonDeg).toBeCloseTo(direct.lon, 11);
      expect(result.latDeg).toBeCloseTo(direct.lat, 11);
      const eq = eclipticToEquatorial(result.lonDeg!, result.latDeg, tilt(days).tobl);
      expect(result.raDeg).toBeCloseTo(eq.ra!, 11);
      expect(result.decDeg).toBeCloseTo(eq.dec, 11);
    }
  });

  it("preserves undefined coordinates at constructed true-frame poles", () => {
    // An inverse existing engine rotation constructs this integration case.
    // The expected null coordinate follows the geometric pole, not a saved value.
    for (const sign of [1, -1]) {
      const pole = apply(transpose(equatorRows(0, "true")), [0, 0, sign]);
      const ra = (Math.atan2(pole[1], pole[0]) / DEG + 360) % 360;
      const dec = Math.atan2(pole[2], Math.hypot(pole[0], pole[1])) / DEG;
      const result = starPositionAtTt(synthetic(ra, dec, null), 0);
      expect(result.raDeg).toBeNull();
      expect(result.raDefined).toBe(false);
      expect(result.decDeg).toBeCloseTo(sign * 90, 10);
      const eclPole = apply(transpose(eclipticRows(0, "true")), [0, 0, sign]);
      const eclRa = (Math.atan2(eclPole[1], eclPole[0]) / DEG + 360) % 360;
      const eclDec = Math.atan2(eclPole[2], Math.hypot(eclPole[0], eclPole[1])) / DEG;
      const eclResult = starPositionAtTt(synthetic(eclRa, eclDec, null), 0);
      expect(eclResult.lonDeg).toBeNull();
      expect(eclResult.lonDefined).toBe(false);
      expect(eclResult.latDeg).toBeCloseTo(sign * 90, 10);
    }
  });

  it("rejects TT outside the engine span before rotating", () => {
    for (const days of [NaN, Infinity, -730001, 730001]) {
      expect(() => starPositionAtTt(synthetic(), days)).toThrow(RangeError);
    }
  });
});

describe("the native engine chart clock", () => {
  it("uses a Julian year on TT and honors pinned UT1 offsets", () => {
    const oneYear = starPositions({ utc: "2000-12-31T18:00:00Z", timeScale: "tt", deltaT: 0 }, [synthetic(0, 0, RAD_IN_MAS)]);
    expect(oneYear.timeBasis.ttDays).toBe(365.25);
    expect(oneYear.positions[0]!.elapsedJulianYears).toBe(1);
    expectVector(oneYear.positions[0]!.directionJ2000, [Math.SQRT1_2, Math.SQRT1_2, 0]);
    const result = starPositions({ utc: "2001-01-01T18:00:00Z", timeScale: "tt", deltaT: 120 }, [synthetic(0, 0, RAD_IN_MAS)]);
    expect(result.timeBasis.ttDays).toBe(366.25);
    expect(result.timeBasis.ut1Days).toBeCloseTo(366.25 - 120 / 86400, 12);
    expect(result.positions[0]!.elapsedJulianYears).toBe(366.25 / 365.25);
    const atEpoch = starPositions({ utc: "2000-01-01T12:00:00Z", timeScale: "tt", deltaT: 120 });
    expect(atEpoch.timeBasis.ttDays).toBeCloseTo(0, 15);
    expect(atEpoch.timeBasis.deltaT.model).toBe("pinned");
  });

  it.each(["utc", "ut1", "tt"] as const)("uses the same %s time basis as a synthetic natal chart", (timeScale) => {
    for (const deltaT of [undefined, 120]) {
      const input = { utc: "2000-03-20T06:00:00Z", timeScale, ...(deltaT === undefined ? {} : { deltaT }) };
      const chart = natalChart({ ...input, latitude: 12, longitude: 30 });
      const result = starPositions(input);
      expect(result.timeBasis.deltaT).toEqual(chart.deltaT);
      expect(result.timeBasis.timeScale).toEqual(chart.timeScale);
      expect(result.trueObliquityDeg).toBe(chartDeclinations(chart).trueObliquity);
      expect(result.positions.map(({ starId }) => starId)).toEqual(catalog.map(({ id }) => id));
      for (const position of result.positions) expect(position.ttDays).toBeCloseTo(result.timeBasis.ttDays, 10);
    }
  });

  it("keeps caller inputs and catalog records intact and keeps output order", () => {
    const instant = new Date("2000-01-01T12:00:00Z");
    const before = instant.getTime();
    const stars = [catalog[2]!, catalog[0]!];
    const result = starPositions({ utc: instant }, stars);
    expect(instant.getTime()).toBe(before);
    expect(result.positions.map(({ starId }) => starId)).toEqual(stars.map(({ id }) => id));
    expect(Object.isFrozen(result.positions)).toBe(true);
    expect(Object.isFrozen(result.positions[0]!.directionJ2000)).toBe(true);
    expect(starPositions({ utc: instant }, []).positions).toEqual([]);
  });

  it("rejects invalid instants, scales, pins and ambiguous star selections", () => {
    for (const input of [
      null, { utc: "2000-02-30" }, { utc: "2000-01-01T12:00" },
      { utc: "2000-01-01", timeScale: null }, { utc: "2000-01-01", timeScale: "TAI" },
      { utc: "2000-01-01", deltaT: null }, { utc: "2000-01-01", deltaT: NaN },
      { utc: "2000-01-01", deltaT: 1e10 + 1 }, { utc: "5000-01-01" }
    ]) expect(() => starPositions(input as StarPositionTime)).toThrow(RangeError);
    expect(() => starPositions({ utc: "2000-01-01" }, [synthetic(), synthetic()])).toThrow(RangeError);
    expect(() => starPositions({ utc: "2000-01-01" }, [undefined] as unknown as CatalogStar[])).toThrow(RangeError);
  });
});
