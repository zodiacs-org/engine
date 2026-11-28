import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

import { prepareStarSky } from "../node.mjs";
import {
  catalog, findStarContacts, natalStarHits, propagateStarDirection, searchParans,
  starPositionAtTt
} from "../src/index.js";
import type { CatalogStar, StarSkySearch } from "../src/index.js";
import {
  apply, eclipticRows, equatorRows, fromSpherical, gastHours, onChartClock,
  RA_POLE_TOLERANCE, toSpherical, transpose
} from "../src/engine.js";
import type { Mat3, Vec3 } from "../src/engine.js";

const DEG = Math.PI / 180;
const RAD_IN_MAS = 3_600_000 / DEG;
const t = Date.parse("2000-03-20T06:00:00Z");
const geometric = { limb: "centre", refraction: "none" } as const;

function synthetic(raDeg = 0, decDeg = 0, east: number | null = null, north = 0): CatalogStar {
  return { ...catalog[0]!, id: "synthetic-edge", name: "Synthetic edge", aliases: [],
    historicalAttributions: [], raDeg, decDeg, properMotion: east === null ? null : {
      raCosDecMasPerYear: east, decMasPerYear: north, sourceId: "synthetic-geometry"
    } };
}
function vectorClose(actual: Vec3, expected: Vec3, precision = 12) {
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, precision));
}
function fromTrue(rows: Mat3, direction: Vec3): CatalogStar {
  const [x, y, z] = apply(transpose(rows), direction);
  // atan2 retains the small polar distance in a constructed catalog record;
  // asin(z/length) would lose it when z/length rounds to +/-1.
  return synthetic(((Math.atan2(y, x) / DEG) % 360 + 360) % 360,
    Math.atan2(z, Math.hypot(x, y)) / DEG);
}

describe("proper motion near coordinate singularities", () => {
  it.each([1, -1])("keeps east motion finite near the %s celestial pole without a cosine division", (sign) => {
    const dec = sign * 89.999;
    for (const years of [-1, 1]) {
      // At alpha=0 the east basis is (0,1,0), at every declination.
      vectorClose(propagateStarDirection(synthetic(0, dec, RAD_IN_MAS), years * 365.25),
        [Math.cos(dec * DEG) / Math.sqrt(2), years / Math.sqrt(2), Math.sin(dec * DEG) / Math.sqrt(2)]);
    }
  });

  it.each([1, -1])("passes through the %s pole with a meridian change rather than clamping declination", (sign) => {
    // At delta=+/-60, north toward the pole has components
    // (-sqrt(3)/2,0,+/-1/2). A sqrt(3) displacement gives
    // (-1,0,+/-sqrt(3)), then (-1/2,0,+/-sqrt(3)/2).
    const star = synthetic(0, sign * 60, 0, sign * Math.sqrt(3) * RAD_IN_MAS);
    vectorClose(propagateStarDirection(star, 365.25), [-0.5, 0, sign * Math.sqrt(3) / 2]);
    const position = toSpherical(propagateStarDirection(star, 365.25));
    expect(position.lon).toBeCloseTo(180, 12);
    expect(position.lat).toBeCloseTo(sign * 60, 12);
    const atPole = synthetic(0, sign * 60, 0, sign * RAD_IN_MAS / Math.sqrt(3));
    vectorClose(propagateStarDirection(atPole, 365.25), [0, 0, sign]);
  });

  it("propagates across the RA seam on Cartesian axes in both directions", () => {
    // u=(cos(a),sin(a),0); displacement tan(1 degree) east rotates
    // the normalized direction by exactly one degree, not one radian.
    const rate = Math.tan(DEG) * RAD_IN_MAS;
    for (const [ra, years, expected] of [[359.5, 1, 0.5], [0.5, -1, 359.5]] as const) {
      vectorClose(propagateStarDirection(synthetic(ra, 0, rate), years * 365.25),
        [Math.cos(expected * DEG), Math.sin(expected * DEG), 0]);
    }
  });

  it("accepts zero and unavailable motion at both exact catalog poles, refusing nonzero ambiguous tangents", () => {
    for (const dec of [-90, 90]) for (const ra of [0, 90, 270]) {
      for (const east of [null, 0]) vectorClose(propagateStarDirection(synthetic(ra, dec, east), 365.25), [0, 0, Math.sign(dec)]);
      for (const [east, north] of [[1, 0], [0, 1], [-1, -1]]) {
        expect(() => propagateStarDirection(synthetic(ra, dec, east, north), 0)).toThrow(/pole/u);
      }
    }
  });
});

describe("moving vectors and true-frame pole neighborhoods", () => {
  it("checks a mixed moving direction against independent ERFA rotations at every committed fixture epoch", () => {
    const fixture = JSON.parse(readFileSync(new URL("../../src/fixtures/nutation-erfa.json", import.meta.url), "utf8")) as {
      tolerance: { rotationArcsec: number };
      epochs: { tt: number; epsA: number; deps: number; eclipticOfDate: number[] }[];
    };
    const star = synthetic(45, 30, 0.003 * RAD_IN_MAS, -0.004 * RAD_IN_MAS);
    const tolerance = fixture.tolerance.rotationArcsec * DEG / 3600;
    for (const epoch of fixture.epochs) {
      // Hand-derived u, east and north for alpha=45, delta=30. This
      // reference never calls the library's propagation or spherical helper.
      const years = epoch.tt / 365.25;
      const east = years * 0.003, north = years * -0.004;
      const w = [Math.sqrt(6) / 4 - east / Math.sqrt(2) - north * Math.sqrt(2) / 4,
        Math.sqrt(6) / 4 + east / Math.sqrt(2) - north * Math.sqrt(2) / 4,
        0.5 + north * Math.sqrt(3) / 2];
      const norm = Math.sqrt(1 + east ** 2 + north ** 2);
      const direction = w.map((value) => value / norm);
      const m = epoch.eclipticOfDate;
      const [x, y, z] = [0, 1, 2].map((row) => m[3 * row]! * direction[0]! +
        m[3 * row + 1]! * direction[1]! + m[3 * row + 2]! * direction[2]!);
      const eps = (epoch.epsA + epoch.deps) * DEG / 3600;
      const expectedEq = [x!, y! * Math.cos(eps) - z! * Math.sin(eps), y! * Math.sin(eps) + z! * Math.cos(eps)];
      const found = starPositionAtTt(star, epoch.tt);
      const ecl = fromSpherical(found.lonDeg!, found.latDeg, 1);
      const eq = fromSpherical(found.raDeg!, found.decDeg, 1);
      for (const i of [0, 1, 2]) {
        expect(Math.abs(ecl[i]! - [x, y, z][i]!)).toBeLessThan(tolerance);
        expect(Math.abs(eq[i]! - expectedEq[i]!)).toBeLessThan(tolerance);
      }
      vectorClose(found.directionJ2000, direction as unknown as Vec3);
    }
  });

  it("keeps only the singular angular coordinate unavailable on either side of the pole threshold", () => {
    // Stay well away from the threshold itself, since inverse rotations and
    // spherical encoding introduce ordinary floating-point roundoff.
    for (const tt of [-73000, 0, 73000]) for (const sign of [-1, 1]) {
      for (const frame of ["equator", "ecliptic"] as const) for (const factor of [0.25, 8]) {
        const r = RA_POLE_TOLERANCE * factor;
        const rows = frame === "equator" ? equatorRows(tt, "true") : eclipticRows(tt, "true");
        const found = starPositionAtTt(fromTrue(rows, [r, 0, sign * Math.sqrt(1 - r * r)]), tt);
        const defined = factor > 1;
        expect(frame === "equator" ? found.raDefined : found.lonDefined, `${frame}: TT ${tt}, sign ${sign}, factor ${factor}`).toBe(defined);
        const angular = frame === "equator" ? found.raDeg : found.lonDeg;
        expect(angular === null).toBe(!defined);
        expect(frame === "equator" ? found.decDeg : found.latDeg).toBeCloseTo(sign * 90, 10);
        // Celestial and ecliptic poles are distinct. The other longitude
        // stays available, as does the signed declination for matching.
        expect(frame === "equator" ? found.lonDefined : found.raDefined).toBe(true);
        const hits = findStarContacts([found], [{ targetKind: "body", targetId: "Synthetic pole target",
          lonDeg: found.lonDeg, decDeg: found.decDeg }], { conjunctionDeg: 0, parallelDeg: 0 }).hits;
        expect(hits.map(({ kind }) => kind)).toEqual(frame === "ecliptic" && !defined ?
          ["parallel"] : ["conjunction", "parallel"]);
      }
    }
  });

  it("omits angle contacts for unknown time across clock, location and polar house settings", () => {
    for (const timeScale of ["utc", "ut1", "tt"] as const) for (const latitude of [-78, 0, 78]) {
      const result = natalStarHits({ utc: t, timeScale, deltaT: 120,
        latitude, longitude: 30, timeKnown: false, houseSystem: "placidus" },
      { conjunctionDeg: 180, parallelDeg: 180 }, [synthetic()]);
      expect(result.natal.result.angles).toBeNull();
      expect(result.natal.receipt.houses.absenceReason).toBe("unknown-time");
      expect(result.targets.every(({ targetKind }) => targetKind === "body")).toBe(true);
      expect(result.hits.every(({ targetKind }) => targetKind === "body")).toBe(true);
      expect(result.hits).toHaveLength(2 * result.targets.length);
      expect(result.natal.receipt.resultFlags).toContain("no-time");
      expect(result.natal.receipt.resultFlags).not.toContain("polar-fallback");
    }
    const absent = natalStarHits({ utc: t, timeKnown: false },
      { conjunctionDeg: 180, parallelDeg: 180 }, [synthetic()]);
    expect(absent.targets.some(({ targetKind }) => targetKind === "angle")).toBe(false);
    expect(absent.natal.result.angles).toBeNull();
  });
});

let sky: StarSkySearch;
beforeAll(async () => { sky = await prepareStarSky(); });

// A direction placed at a specified true hour angle and declination, using
// only the existing engine clock and inverse frame for construction.
function atPhase(ms: number, hourAngle: number, decDeg: number): CatalogStar {
  return onChartClock(ms, "utc", undefined, (time) => {
    const ra = gastHours(time) * 15 - hourAngle;
    return fromTrue(equatorRows(time.tt, "true"), fromSpherical(ra, decDeg, 1));
  });
}

// Independent local-horizontal dot products. Frame rows are engine inputs;
// no sky state function, star-position result or saved event is the oracle.
function horizontal(star: CatalogStar, latitude: number, ms: number) {
  return onChartClock(ms, "utc", undefined, (time) => {
    const a = star.raDeg * DEG, d = star.decDeg * DEG;
    const u = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
    const rows = equatorRows(time.tt, "true");
    const [x, y, z] = [0, 1, 2].map((i) => rows[3 * i]! * u[0]! + rows[3 * i + 1]! * u[1]! + rows[3 * i + 2]! * u[2]!);
    const theta = gastHours(time) * 15 * DEG, phi = latitude * DEG;
    const radial = x! * Math.cos(theta) + y! * Math.sin(theta);
    const east = -x! * Math.sin(theta) + y! * Math.cos(theta);
    const north = -radial * Math.sin(phi) + z! * Math.cos(phi);
    const up = radial * Math.cos(phi) + z! * Math.sin(phi);
    return { east, north, up, altitude: Math.atan2(up, Math.hypot(east, north)) / DEG };
  });
}

describe("constructed whole-millisecond sky boundaries", () => {
  const phases = [
    ["rise", -90, "Ascendant"], ["set", 90, "Descendant"],
    ["upper-transit", 0, "Midheaven"], ["lower-transit", 180, "Imum Coeli"]
  ] as const;
  it.each(phases)("places %s between milliseconds and admits it only in the window starting at its first millisecond", (kind, hour, angle) => {
    // The continuous construction lies halfway between t and t+1. Thus
    // the native first-whole-millisecond result is exactly t+1, derived
    // before calling the solver, with a margin from rounding at t itself.
    const star = atPhase(t + 0.5, hour, 10);
    const site = { latitude: 0, longitude: 0 };
    const expected = t + 1;
    const before = horizontal(star, 0, t), after = horizontal(star, 0, expected);
    if (kind === "rise" || kind === "set") {
      const sign = kind === "rise" ? 1 : -1;
      expect(sign * before.up).toBeLessThan(0);
      expect(sign * after.up).toBeGreaterThan(0);
    } else {
      // east=-cos(delta)sin(H): negative after upper transit, positive
      // after lower transit. No circular RA subtraction at the seam.
      const sign = kind === "upper-transit" ? -1 : 1;
      expect(sign * before.east).toBeLessThan(0);
      expect(sign * after.east).toBeGreaterThan(0);
    }
    const wide = sky.starEvents(star, site, t - 60_000, t + 60_000, geometric);
    expect(wide.status).toBe("complete");
    expect(wide.events.map(({ kind, at }) => [kind, at.getTime()])).toEqual([[kind, expected]]);
    const ending = sky.starEvents(star, site, expected - 1, expected, geometric);
    const starting = sky.starEvents(star, site, expected, expected + 1, geometric);
    const later = sky.starEvents(star, site, expected + 1, expected + 2, geometric);
    expect(ending.events).toEqual([]);
    expect(starting.events).toEqual(wide.events);
    expect(later.events).toEqual([]);
    expect(starting.provenance.response.events[0]!.at).toBe(new Date(expected).toISOString());
    const paired = searchParans(sky, { observer: site, from: expected, to: expected + 1,
      stars: [star], bodies: [], starOptions: geometric, orbMs: 0, angles: [{ angle, at: expected }] });
    expect(paired.status).toBe("complete");
    expect(paired.hits.map(({ starEvent, targetId, orbMs }) => [starEvent, targetId, orbMs])).toEqual([[kind, angle, 0]]);
    expect(() => searchParans(sky, { observer: site, from: expected - 1, to: expected,
      stars: [star], bodies: [], orbMs: 1000, angles: [{ angle, at: expected }] })).toThrow(RangeError);
  });
});

describe("near horizon tangencies through the unchanged sky solver", () => {
  it.each([1, -1])("finds both crossings of a short horizon excursion at hemisphere %s, even between coarse samples", (sign) => {
    const latitude = sign * 60;
    const site = { latitude, longitude: 0 };
    const from = t - 30 * 60_000, to = t + 30 * 60_000;
    for (const phase of ["upper", "lower"] as const) {
      const hour = phase === "upper" ? 0 : 180;
      // Upper tangent: delta=-sign*30. Lower tangent: delta=sign*30.
      // Move 0.01 degree into the horizon, or away from it. Each excursion
      // is shorter than the native hour-long coarse search cell.
      const grazingDec = sign * (phase === "upper" ? -29.99 : 29.99);
      const clearDec = sign * (phase === "upper" ? -30.01 : 30.01);
      const graze = atPhase(t, hour, grazingDec), clear = atPhase(t, hour, clearDec);
      const tangent = atPhase(t, hour, sign * (phase === "upper" ? -30 : 30));
      expect(Math.abs(horizontal(tangent, latitude, t).altitude)).toBeLessThan(1e-10);
      const inside = phase === "upper" ? 1 : -1;
      expect(inside * horizontal(graze, latitude, t).altitude).toBeCloseTo(0.01, 10);
      expect(inside * horizontal(clear, latitude, t).altitude).toBeCloseTo(-0.01, 10);
      for (const ms of [from, to]) expect(inside * horizontal(graze, latitude, ms).up).toBeLessThan(0);
      const found = sky.starEvents(graze, site, from, to, geometric);
      expect(found.status).toBe("complete");
      const horizon = found.events.filter(({ kind }) => kind === "rise" || kind === "set");
      expect(horizon.map(({ kind }) => kind)).toEqual(phase === "upper" ? ["rise", "set"] : ["set", "rise"]);
      expect(horizon[0]!.at.getTime()).toBeLessThan(t);
      expect(horizon[1]!.at.getTime()).toBeGreaterThan(t);
      expect(horizon[1]!.at.getTime() - horizon[0]!.at.getTime()).toBeLessThan(3_600_000);
      for (const value of horizon) {
        const ms = value.at.getTime();
        const reached = value.kind === "rise" ? 1 : -1;
        expect(reached * horizontal(graze, latitude, ms - 1).up).toBeLessThan(0);
        expect(reached * horizontal(graze, latitude, ms).up).toBeGreaterThanOrEqual(0);
        expect(Math.abs(value.altitude)).toBeLessThan(1e-5);
        expect(value.altitude).toBeCloseTo(horizontal(graze, latitude, ms).altitude, 10);
      }
      expect(found.flags).toEqual([]);
      const miss = sky.starEvents(clear, site, from, to, geometric);
      expect(miss.status).toBe("complete");
      expect(miss.events.map(({ kind }) => kind)).toEqual([`${phase}-transit`]);
      expect(miss.flags).toEqual([phase === "upper" ? "never-rises" : "never-sets"]);

      // Small budgets and a budget one short of completion must all refuse.
      // The unrestricted count is only an integration trigger, not a reference.
      for (const maxSamples of [1, 8, 32, found.samples - 1]) {
        const refused = sky.starEvents(graze, site, from, to, { ...geometric, maxSamples });
        expect(refused.status).toBe("refused");
        expect(refused.events).toEqual([]);
        expect(refused.flags).toEqual([]);
        expect(refused.samples).toBeLessThanOrEqual(maxSamples);
        expect(refused.provenance.response).toMatchObject({ status: "refused", reason: "sample-budget", events: [] });
        const parans = searchParans(sky, { observer: site, from, to, stars: [graze], bodies: [],
          starOptions: { ...geometric, maxSamples }, orbMs: to - from,
          angles: [{ angle: phase === "upper" ? "Midheaven" : "Imum Coeli", at: t }] });
        expect(parans.status).toBe("refused");
        expect(parans.hits).toEqual([]);
        expect(parans.stars[0]!.status).toBe("refused");
      }
      const enough = sky.starEvents(graze, site, from, to, { ...geometric, maxSamples: found.samples });
      expect(enough.status).toBe("complete");
      expect(enough.events).toEqual(found.events);
    }
  });
});
