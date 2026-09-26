import { describe, expect, it } from "vitest";

import { natalChart } from "./api.js";
import {
  HOUSE_SYSTEMS,
  POLAR_FALLBACK,
  alcabitiusCusps,
  campanusCusps,
  computeAngles,
  computeHouses,
  equalCusps,
  kochCusps,
  meridianCusps,
  morinusCusps,
  regiomontanusCusps,
  topocentricCusps,
  vehlowCusps
} from "./houses.js";
import type { AngleInput } from "./houses.js";
import {
  createNatalEnvelope,
  natalReplayInput,
  parseNatalEnvelope,
  serializeNatalEnvelope
} from "./receipt.js";
import { normalizeLongitude } from "./signs.js";
import type { HouseSystem } from "./types.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const OBLIQUITY = 23.4393;

/** Signed a − b in arcseconds, across the 0/360 seam. */
const arcsec = (a: number, b: number) => (((((a - b) % 360) + 540) % 360) - 180) * 3600;

type Vector = readonly [number, number, number];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const unit = (a: Vector): Vector => {
  const length = Math.hypot(...a);
  return [a[0] / length, a[1] / length, a[2] / length];
};
const scaled = (a: Vector, by: number): Vector => [a[0] * by, a[1] * by, a[2] * by];
const sum = (a: Vector, b: Vector): Vector => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Equatorial unit vector of the ecliptic point at `longitude`. */
const eclipticPoint = (longitude: number): Vector => [
  Math.cos(longitude * DEG),
  Math.sin(longitude * DEG) * Math.cos(OBLIQUITY * DEG),
  Math.sin(longitude * DEG) * Math.sin(OBLIQUITY * DEG)
];
/** Right ascension of the ecliptic point at `longitude`. */
const rightAscension = (longitude: number) =>
  normalizeLongitude(
    Math.atan2(Math.sin(longitude * DEG) * Math.cos(OBLIQUITY * DEG), Math.cos(longitude * DEG)) * RAD
  );

/** The observer's zenith, north point of the horizon and east point, for RAMC θ and latitude φ. */
function horizon(ramc: number, latitude: number) {
  const t = ramc * DEG;
  const f = latitude * DEG;
  const zenith: Vector = [Math.cos(f) * Math.cos(t), Math.cos(f) * Math.sin(t), Math.sin(f)];
  const north: Vector = [-Math.sin(f) * Math.cos(t), -Math.sin(f) * Math.sin(t), Math.cos(f)];
  const east: Vector = [-Math.sin(t), Math.cos(t), 0];
  return { zenith, north, east };
}

/** How far the ecliptic point at `longitude` lies off the great circle through `a` and `b`. */
const offCircle = (a: Vector, b: Vector, longitude: number) =>
  Math.abs(dot(unit(cross(a, b)), eclipticPoint(longitude)));

const input = (ramc: number, latitude: number): AngleInput => ({
  gastHours: ramc / 15,
  latitude,
  longitude: 0,
  obliquity: OBLIQUITY
});

// Every 15° of RAMC at every 10° of latitude outside the polar circle.
const GRID = Array.from({ length: 13 }, (_, row) => -60 + row * 10).flatMap((latitude) =>
  Array.from({ length: 24 }, (_, column) => [column * 15 + 7.5, latitude] as const)
);
// Inside the polar circle, north and south.
const POLAR_GRID = [-80, -72, 70, 78, 85].flatMap((latitude) =>
  Array.from({ length: 36 }, (_, column) => [column * 10 + 3, latitude] as const)
);

/** Twelve distinct cusps in zodiacal order: the forward gaps are positive and go once round. */
function inOrder(cusps: readonly number[]): boolean {
  const gaps = cusps.map((cusp, index) => normalizeLongitude(cusps[(index + 1) % 12]! - cusp));
  return gaps.every((gap) => gap > 0) && Math.abs(gaps.reduce((a, b) => a + b, 0) - 360) < 1e-9;
}

describe("house systems by their definitions", () => {
  it.each(GRID)("Regiomontanus: circles through the north point cut the equator every 30°, RAMC %s at %s°", (ramc, latitude) => {
    const angles = computeAngles(input(ramc, latitude));
    const cusps = regiomontanusCusps(input(ramc, latitude), angles);
    const { north } = horizon(ramc, latitude);
    const equator = (ra: number): Vector => [Math.cos(ra * DEG), Math.sin(ra * DEG), 0];
    ([[10, 30], [11, 60], [1, 120], [2, 150]] as const).forEach(([index, offset]) => {
      expect(offCircle(north, equator(ramc + offset), cusps[index]!)).toBeLessThan(1e-12);
    });
    expect(cusps[0]).toBeCloseTo(angles.asc, 10);
    expect(cusps[9]).toBeCloseTo(angles.mc, 10);
    expect(inOrder(cusps)).toBe(true);
  });

  it.each(GRID)("Campanus: circles through the north point cut the prime vertical every 30°, RAMC %s at %s°", (ramc, latitude) => {
    const angles = computeAngles(input(ramc, latitude));
    const cusps = campanusCusps(input(ramc, latitude), angles);
    const { zenith, north, east } = horizon(ramc, latitude);
    const vertical = (fromZenith: number) =>
      sum(scaled(zenith, Math.cos(fromZenith * DEG)), scaled(east, Math.sin(fromZenith * DEG)));
    ([[10, 30], [11, 60], [1, 120], [2, 150]] as const).forEach(([index, fromZenith]) => {
      expect(offCircle(north, vertical(fromZenith), cusps[index]!)).toBeLessThan(1e-12);
    });
    expect(cusps[0]).toBeCloseTo(angles.asc, 10);
    expect(cusps[9]).toBeCloseTo(angles.mc, 10);
    expect(inOrder(cusps)).toBe(true);
  });

  it.each(GRID)("Koch: the ascendants a third and two thirds of the midheaven's semi-arc away, RAMC %s at %s°", (ramc, latitude) => {
    const angles = computeAngles(input(ramc, latitude));
    const cusps = kochCusps(input(ramc, latitude), angles)!;
    const declination = Math.asin(Math.sin(OBLIQUITY * DEG) * Math.sin(angles.mc * DEG)) * RAD;
    const semiArc = 90 + Math.asin(Math.tan(latitude * DEG) * Math.tan(declination * DEG)) * RAD;
    ([[10, -2], [11, -1], [1, 1], [2, 2]] as const).forEach(([index, thirds]) => {
      const rising = computeAngles(input(ramc + (thirds * semiArc) / 3, latitude)).asc;
      expect(Math.abs(arcsec(cusps[index]!, rising))).toBeLessThan(1e-6);
    });
    expect(inOrder(cusps)).toBe(true);
  });

  it.each(GRID)("Topocentric: ascendants at a third and two thirds of the latitude's tangent, RAMC %s at %s°", (ramc, latitude) => {
    const angles = computeAngles(input(ramc, latitude));
    const cusps = topocentricCusps(input(ramc, latitude), angles);
    const pole = (share: number) => Math.atan(Math.tan(latitude * DEG) * share) * RAD;
    ([[10, -60, 1 / 3], [11, -30, 2 / 3], [1, 30, 2 / 3], [2, 60, 1 / 3]] as const).forEach(
      ([index, shift, share]) => {
        const rising = computeAngles(input(ramc + shift, pole(share))).asc;
        expect(Math.abs(arcsec(cusps[index]!, rising))).toBeLessThan(1e-6);
      }
    );
    expect(inOrder(cusps)).toBe(true);
  });

  it.each(GRID)("Alcabitius: the ascendant's semi-arcs in thirds along hour circles, RAMC %s at %s°", (ramc, latitude) => {
    const angles = computeAngles(input(ramc, latitude));
    const cusps = alcabitiusCusps(input(ramc, latitude), angles);
    const declination = Math.asin(Math.sin(OBLIQUITY * DEG) * Math.sin(angles.asc * DEG)) * RAD;
    const day = Math.acos(-Math.tan(latitude * DEG) * Math.tan(declination * DEG)) * RAD;
    const night = 180 - day;
    ([[10, day / 3], [11, (2 * day) / 3], [1, 180 - (2 * night) / 3], [2, 180 - night / 3]] as const).forEach(
      ([index, offset]) => {
        expect(Math.abs(arcsec(rightAscension(cusps[index]!), ramc + offset))).toBeLessThan(1e-6);
      }
    );
    expect(cusps[0]).toBeCloseTo(angles.asc, 10);
    expect(cusps[9]).toBeCloseTo(angles.mc, 10);
    expect(inOrder(cusps)).toBe(true);
  });

  it.each(GRID)("Meridian and Morinus divide the equator from the midheaven, RAMC %s at %s°", (ramc, latitude) => {
    const meridian = meridianCusps(input(ramc, latitude));
    const morinus = morinusCusps(input(ramc, latitude));
    meridian.forEach((cusp, index) => {
      expect(Math.abs(arcsec(rightAscension(cusp), ramc + 90 + index * 30))).toBeLessThan(1e-6);
    });
    morinus.forEach((cusp, index) => {
      // The equator point, turned into the ecliptic frame, has this longitude.
      const ra = (ramc + 90 + index * 30) * DEG;
      const y = Math.sin(ra) * Math.cos(OBLIQUITY * DEG);
      const z = -Math.sin(ra) * Math.sin(OBLIQUITY * DEG);
      expect(Math.abs(z)).toBeLessThanOrEqual(Math.sin(OBLIQUITY * DEG));
      expect(Math.abs(arcsec(cusp, Math.atan2(y, Math.cos(ra)) * RAD))).toBeLessThan(1e-6);
    });
    expect(meridian[9]).toBeCloseTo(computeAngles(input(ramc, latitude)).mc, 10);
    expect(inOrder(meridian) && inOrder(morinus)).toBe(true);
  });

  it("Equal and Vehlow count thirty degrees from the ascendant and from fifteen before it", () => {
    const angles = computeAngles(input(123.4, 51.5));
    equalCusps(angles).forEach((cusp, index) =>
      expect(cusp).toBeCloseTo(normalizeLongitude(angles.asc + index * 30), 12)
    );
    vehlowCusps(angles).forEach((cusp, index) =>
      expect(cusp).toBeCloseTo(normalizeLongitude(angles.asc - 15 + index * 30), 12)
    );
  });
});

describe("house systems inside the polar circle", () => {
  it("falls back from Koch as from Placidus, and flags it", () => {
    const polar = natalChart({ utc: "2001-12-21T09:30:00Z", latitude: 69.6492, longitude: 18.9553, houseSystem: "koch" });
    expect(polar.houses?.system).toBe(POLAR_FALLBACK);
    expect(polar.flags).toContain("polar-fallback");
    const outside = natalChart({ utc: "2001-12-21T09:30:00Z", latitude: 59.9, longitude: 10.75, houseSystem: "koch" });
    expect(outside.houses?.system).toBe("koch");
    expect(outside.flags).not.toContain("polar-fallback");
  });

  it("turns Regiomontanus, Campanus and Topocentric cusps with the ascendant", () => {
    let turned = 0;
    for (const [ramc, latitude] of POLAR_GRID) {
      const angles = computeAngles(input(ramc, latitude));
      for (const cusps of [
        regiomontanusCusps(input(ramc, latitude), angles),
        campanusCusps(input(ramc, latitude), angles),
        topocentricCusps(input(ramc, latitude), angles)
      ]) {
        expect(cusps[0]).toBeCloseTo(angles.asc, 9);
        const onMidheaven = Math.abs(arcsec(cusps[9]!, angles.mc)) < 1e-6;
        const onLowerMeridian = Math.abs(arcsec(cusps[9]!, angles.ic)) < 1e-6;
        expect(onMidheaven || onLowerMeridian).toBe(true);
        if (onLowerMeridian) turned += 1;
        cusps.slice(0, 6).forEach((cusp, index) =>
          expect(Math.abs(arcsec(cusps[index + 6]!, cusp + 180))).toBeLessThan(1e-6)
        );
      }
    }
    expect(turned).toBeGreaterThan(0);
  });

  it("keeps the midheaven on Alcabitius's 10th cusp and computes every other system", () => {
    for (const [ramc, latitude] of POLAR_GRID) {
      const angles = computeAngles(input(ramc, latitude));
      const alcabitius = alcabitiusCusps(input(ramc, latitude), angles);
      expect(alcabitius[0]).toBeCloseTo(angles.asc, 9);
      expect(alcabitius[9]).toBeCloseTo(angles.mc, 9);
      for (const system of HOUSE_SYSTEMS) {
        const { houses, fellBack } = computeHouses(system, input(ramc, latitude), angles);
        expect(houses.cusps).toHaveLength(12);
        expect(houses.cusps.every(Number.isFinite)).toBe(true);
        expect(fellBack).toBe(system === "placidus" || system === "koch");
      }
    }
  });
});

describe("house-system receipts", () => {
  const NEW: HouseSystem[] = [
    "equal",
    "vehlow",
    "koch",
    "regiomontanus",
    "campanus",
    "topocentric",
    "alcabitius",
    "morinus",
    "meridian"
  ];
  const envelope = (houseSystem: HouseSystem, latitude = 40.7128, longitude = -74.006) =>
    serializeNatalEnvelope(
      createNatalEnvelope(
        natalChart({ utc: new Date("1990-06-15T18:30:00Z"), latitude, longitude, houseSystem, timeKnown: true })
      )
    );
  const edit = (json: string, change: (envelope: any) => void) => {
    const parsed = JSON.parse(json);
    change(parsed);
    return JSON.stringify(parsed);
  };

  it.each(NEW)("records, reads and replays %s", (system) => {
    const json = envelope(system);
    const parsed = parseNatalEnvelope(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.receipt.houses).toEqual({ requested: system, actual: system, absenceReason: null });
    const replay = natalChart(natalReplayInput(parsed.envelope));
    expect(replay.houses).toEqual(parsed.envelope.result.houses);
  });

  it.each(NEW)("refuses %s cusps that break the system's shape", (system) => {
    const moved = edit(envelope(system), (e) => {
      e.result.houses.cusps[6] = normalizeLongitude(e.result.houses.cusps[6] + 0.001);
    });
    expect(parseNatalEnvelope(moved)).toMatchObject({ ok: false, code: "inconsistent_result" });
  });

  it("refuses a new system in a receipt that names an engine before rc.9", () => {
    const older = edit(envelope("koch"), (e) => {
      e.receipt.engine.version = "0.1.1-rc.8";
    });
    expect(parseNatalEnvelope(older)).toMatchObject({ ok: false, code: "inconsistent_result" });
    const placidus = edit(envelope("placidus"), (e) => {
      e.receipt.engine.version = "0.1.1-rc.8";
    });
    expect(parseNatalEnvelope(placidus).ok).toBe(true);
  });

  it("reads Koch's polar fallback and refuses a turned 10th cusp outside the polar circle", () => {
    const fallback = parseNatalEnvelope(envelope("koch", 69.6492, 18.9553));
    expect(fallback.ok).toBe(true);
    if (fallback.ok) {
      expect(fallback.envelope.receipt.houses).toMatchObject({ requested: "koch", actual: "whole" });
      expect(fallback.envelope.receipt.resultFlags).toContain("polar-fallback");
    }
    const turned = edit(envelope("regiomontanus"), (e) => {
      const cusps = e.result.houses.cusps;
      [cusps[3], cusps[9]] = [cusps[9], cusps[3]];
    });
    expect(parseNatalEnvelope(turned)).toMatchObject({ ok: false, code: "inconsistent_result" });
  });
});
