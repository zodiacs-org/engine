/**
 * The `@zodiacs/engine/houses` entry against its definitions.
 *
 * These are consistency and geometry checks: each position, co-ascendant and
 * speed is set against an independent construction of the same definition
 * (a vector test that a body lies on its house circle, a numerical search of
 * a body's diurnal circle, a central difference) or against the root entry's
 * own cusps and angles. The agreement with Swiss Ephemeris given the same
 * inputs is measured separately, in
 * docs/evidence/houses-extra-2026-09-29/.
 */
import { describe, expect, it } from "vitest";

import { SIDEREAL_RATE, SIDEREAL_TIME_RATE, coAscendants, housePosition, houseSpeeds } from "./houses-extra.js";
import { HOUSE_SYSTEMS, computeAngles, computeHouses, eastPointOf } from "./houses.js";
import type { AngleInput } from "./houses.js";
import type { HouseSystem } from "./types.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const OBLIQUITY = 23.4392911;
const normalize = (value: number) => ((value % 360) + 360) % 360;
/** Signed a − b in degrees, across the 0/360 seam. */
const gap = (a: number, b: number) => normalize(a - b + 180) - 180;

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
const along = (a: Vector, by: number): Vector => [a[0] * by, a[1] * by, a[2] * by];
const plus = (a: Vector, b: Vector): Vector => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const input = (ramc: number, latitude: number, obliquity = OBLIQUITY): AngleInput => ({
  gastHours: ramc / 15,
  latitude,
  longitude: 0,
  obliquity
});

/** Equatorial unit vector of ecliptic longitude and latitude. */
function equatorial(lon: number, lat: number, obliquity = OBLIQUITY): Vector {
  const l = lon * DEG;
  const b = lat * DEG;
  const e = obliquity * DEG;
  return [
    Math.cos(b) * Math.cos(l),
    Math.cos(b) * Math.sin(l) * Math.cos(e) - Math.sin(b) * Math.sin(e),
    Math.cos(b) * Math.sin(l) * Math.sin(e) + Math.sin(b) * Math.cos(e)
  ];
}

const rightAscension = (v: Vector) => normalize(Math.atan2(v[1], v[0]) * RAD);
const declination = (v: Vector) => Math.atan2(v[2], Math.hypot(v[0], v[1])) * RAD;

/** The zenith, north point and east point of the horizon at RAMC θ and latitude φ. */
function horizon(ramc: number, latitude: number) {
  const t = ramc * DEG;
  const f = latitude * DEG;
  const zenith: Vector = [Math.cos(f) * Math.cos(t), Math.cos(f) * Math.sin(t), Math.sin(f)];
  const north: Vector = [-Math.sin(f) * Math.cos(t), -Math.sin(f) * Math.sin(t), Math.cos(f)];
  const east: Vector = [-Math.sin(t), Math.cos(t), 0];
  return { zenith, north, east };
}

/** Mundane position in degrees, (p − 1) × 30. */
const mundane = (position: number) => (position - 1) * 30;

// Every 15° of RAMC at every 10° of latitude outside the polar circle, as in house-systems.test.ts.
const GRID = Array.from({ length: 13 }, (_, row) => -60 + row * 10).flatMap((latitude) =>
  Array.from({ length: 24 }, (_, column) => [column * 15 + 7.5, latitude] as const)
);
const POLAR_GRID = [-80, -72, 70, 78, 85].flatMap((latitude) =>
  Array.from({ length: 36 }, (_, column) => [column * 10 + 3, latitude] as const)
);
// Bodies off the ecliptic: every 40° of longitude at four latitudes.
const BODIES = [-17, -5.2, 3.1, 11.3].flatMap((lat) =>
  Array.from({ length: 9 }, (_, index) => ({ lon: index * 40 + 13.7, lat }))
);

describe("the rate of sidereal time", () => {
  it("is Meeus's, and SIDEREAL_RATE, deprecated, is the same value", () => {
    expect(SIDEREAL_TIME_RATE).toBe(360.98564736629);
    expect(SIDEREAL_RATE).toBe(SIDEREAL_TIME_RATE);
  });
});

describe("the entry's angles are the root's", () => {
  it("computes the same ascendant and midheaven, bit for bit", () => {
    // λ − asc is exactly 0, and the position exactly 1, only when the two
    // ascendants are the same double; likewise 10 at the midheaven in Porphyry.
    for (const [ramc, latitude] of [...GRID, ...POLAR_GRID]) {
      const angles = computeAngles(input(ramc, latitude));
      expect(housePosition("equal", input(ramc, latitude), { lon: angles.asc })).toBe(1);
      expect(housePosition("porphyry", input(ramc, latitude), { lon: angles.mc })).toBe(10);
    }
  });

  it("puts the root's cusps at whole house positions, for every system, in and out of the polar circle", () => {
    let checked = 0;
    for (const [ramc, latitude] of [...GRID, ...POLAR_GRID]) {
      const angles = computeAngles(input(ramc, latitude));
      for (const system of HOUSE_SYSTEMS) {
        // Inside the polar circle Topocentric circles cross near the horizon, so a
        // cusp there can lie on two of them (tested below, not here).
        if (system === "topocentric" && Math.abs(latitude) >= 90 - OBLIQUITY) continue;
        const { houses, fellBack } = computeHouses(system, input(ramc, latitude), angles);
        if (fellBack) continue;
        houses.cusps.forEach((cusp, index) => {
          const position = housePosition(system, input(ramc, latitude), { lon: cusp, lat: 0 });
          expect(position, `${system} cusp ${index + 1} at ${ramc}, ${latitude}`).not.toBeNull();
          // Within 1e-6 of a mundane degree of the cusp's own house boundary.
          expect(Math.abs(gap(mundane(position!), index * 30)), `${system} cusp ${index + 1} at ${ramc}, ${latitude}`)
            .toBeLessThan(1e-6);
          checked += 1;
        });
      }
    }
    expect(checked).toBeGreaterThan(40_000);
  });

  it("orders ecliptic points between the cusps: positions rise with longitude, once round", () => {
    for (const [ramc, latitude] of GRID.filter((_, index) => index % 5 === 0)) {
      for (const system of HOUSE_SYSTEMS) {
        if (system === "whole") continue;
        const positions = Array.from({ length: 720 }, (_, step) =>
          mundane(housePosition(system, input(ramc, latitude), { lon: step / 2 })!)
        );
        const steps = positions.map((value, index) => normalize(positions[(index + 1) % 720]! - value));
        expect(steps.every((step) => step < 180), `${system} at ${ramc}, ${latitude}`).toBe(true);
        expect(steps.reduce((sum, step) => sum + step, 0), `${system} at ${ramc}, ${latitude}`).toBeCloseTo(360, 6);
      }
    }
  });

  it("gives whole sign, Equal, Vehlow, Equal from the midheaven, Porphyry and Morinus by longitude alone", () => {
    for (const [ramc, latitude] of [...GRID, ...POLAR_GRID]) {
      for (const system of ["whole", "equal", "vehlow", "equal-mc", "porphyry", "morinus"] as const) {
        for (const body of BODIES) {
          expect(housePosition(system, input(ramc, latitude), body)).toBe(
            housePosition(system, input(ramc, latitude), { lon: body.lon, lat: 0 })
          );
        }
      }
    }
  });
});

describe("house circles through a body off the ecliptic", () => {
  it("Campanus: the circle through the north point and the prime vertical at the body's position holds the body", () => {
    for (const [ramc, latitude] of [...GRID, ...POLAR_GRID]) {
      const { zenith, north, east } = horizon(ramc, latitude);
      for (const body of BODIES) {
        const p = mundane(housePosition("campanus", input(ramc, latitude), body)!) * DEG;
        // The prime vertical point p from the east point toward the nadir.
        const vertical = plus(along(east, Math.cos(p)), along(zenith, -Math.sin(p)));
        const point = equatorial(body.lon, body.lat);
        expect(Math.abs(dot(unit(cross(north, vertical)), point))).toBeLessThan(1e-12);
        expect(dot(vertical, point)).toBeGreaterThanOrEqual(-1e-12);
      }
    }
  });

  it("Regiomontanus: the circle through the north point and the equator at the body's position holds the body", () => {
    for (const [ramc, latitude] of [...GRID, ...POLAR_GRID]) {
      const { north } = horizon(ramc, latitude);
      for (const body of BODIES) {
        const p = mundane(housePosition("regiomontanus", input(ramc, latitude), body)!);
        const a = (ramc + 90 + p) * DEG;
        const equator: Vector = [Math.cos(a), Math.sin(a), 0];
        const point = equatorial(body.lon, body.lat);
        expect(Math.abs(dot(unit(cross(north, equator)), point))).toBeLessThan(1e-12);
        // On the same half of the circle as the equator point: their parts
        // perpendicular to the north–south axis point the same way.
        const across = (v: Vector) => plus(v, along(north, -dot(v, north)));
        expect(dot(across(equator), across(point))).toBeGreaterThanOrEqual(-1e-12);
      }
    }
  });

  it("Meridian and Alcabitius: hour circles, so the body's right ascension alone decides", () => {
    for (const [ramc, latitude] of GRID) {
      for (const body of BODIES) {
        const point = equatorial(body.lon, body.lat);
        const p = mundane(housePosition("meridian", input(ramc, latitude), body)!);
        expect(Math.abs(gap(p, rightAscension(point) - ramc - 90))).toBeLessThan(1e-9);
        // The ecliptic point of the same right ascension has the same Alcabitius position.
        const alpha = rightAscension(point) * DEG;
        const lon = normalize(Math.atan2(Math.sin(alpha), Math.cos(alpha) * Math.cos(OBLIQUITY * DEG)) * RAD);
        expect(
          Math.abs(
            gap(
              mundane(housePosition("alcabitius", input(ramc, latitude), body)!),
              mundane(housePosition("alcabitius", input(ramc, latitude), { lon, lat: 0 })!)
            )
          )
        ).toBeLessThan(1e-9);
      }
    }
  });

  it("Placidus: the fraction of the body's own semi-arc, from its diurnal circle searched numerically", () => {
    for (const [ramc, latitude] of GRID) {
      const phi = latitude * DEG;
      for (const body of BODIES) {
        const point = equatorial(body.lon, body.lat);
        const dec = declination(point) * DEG;
        const altitude = (hourAngle: number) =>
          Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle * DEG);
        // The setting hour angle in [0, 180]: where the altitude, falling, reaches 0.
        let setting: number;
        if (altitude(180) >= 0) setting = 180;
        else if (altitude(0) <= 0) setting = 0;
        else {
          let low = 0;
          let high = 180;
          for (let step = 0; step < 80; step += 1) {
            const middle = (low + high) / 2;
            if (altitude(middle) > 0) low = middle;
            else high = middle;
          }
          setting = (low + high) / 2;
        }
        const hourAngle = gap(ramc, rightAscension(point));
        const west = hourAngle >= 0;
        const h = Math.abs(hourAngle);
        // Above the horizon: from the midheaven (270°) toward the angle; below, from the angle to the imum coeli.
        const expected =
          h < setting
            ? west
              ? 270 - (90 * h) / setting
              : 270 + (90 * h) / setting
            : west
              ? 180 - (90 * (h - setting)) / (180 - setting)
              : (90 * (h - setting)) / (180 - setting);
        const p = mundane(housePosition("placidus", input(ramc, latitude), body)!);
        expect(Math.abs(gap(p, expected)), `${body.lon}, ${body.lat} at ${ramc}, ${latitude}`).toBeLessThan(1e-6);
      }
    }
  });

  it("Koch: the body is on the horizon of the sidereal time its position names, within the house circles", () => {
    let defined = 0;
    let undefinedCount = 0;
    for (const [ramc, latitude] of [...GRID, ...POLAR_GRID]) {
      const phi = latitude * DEG;
      const mc = computeAngles(input(ramc, latitude)).mc;
      const mcDeclination = Math.asin(Math.sin(OBLIQUITY * DEG) * Math.sin(mc * DEG));
      /** The diurnal semi-arc of a declination, searched on the altitude; 180° or 0° if it never sets or rises. */
      const semiArc = (dec: number) => {
        const altitude = (h: number) => Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h * DEG);
        if (altitude(180) >= 0) return 180;
        if (altitude(0) <= 0) return 0;
        let low = 0;
        let high = 180;
        for (let step = 0; step < 80; step += 1) {
          const middle = (low + high) / 2;
          if (altitude(middle) > 0) low = middle;
          else high = middle;
        }
        return (low + high) / 2;
      };
      const day = semiArc(mcDeclination);
      for (const body of BODIES) {
        const position = housePosition("koch", input(ramc, latitude), body);
        const point = equatorial(body.lon, body.lat);
        const alpha = rightAscension(point);
        const eastern = normalize(alpha - ramc) < 180;
        const arc = semiArc(declination(point) * DEG);
        // East of the meridian the body rises at α − arc; west of it, it sets at α + arc.
        const time = gap(eastern ? alpha - arc : alpha + arc, ramc);
        const inside = day > 0 && Math.abs(time) <= day;
        expect(position !== null, `${body.lon}, ${body.lat} at ${ramc}, ${latitude}`).toBe(inside);
        if (position === null) {
          undefinedCount += 1;
          continue;
        }
        defined += 1;
        const expected = (eastern ? 0 : 180) + (90 * time) / day;
        expect(Math.abs(gap(mundane(position), expected)), `${body.lon}, ${body.lat} at ${ramc}, ${latitude}`).toBeLessThan(1e-6);
        if (arc > 0 && arc < 180) {
          const { zenith, east } = horizon(ramc + time, latitude);
          expect(Math.abs(dot(zenith, point))).toBeLessThan(1e-9);
          expect(dot(east, point) > 0).toBe(eastern);
        }
      }
    }
    expect(defined).toBeGreaterThan(0);
    expect(undefinedCount).toBeGreaterThan(0);
  });

  it("Topocentric: the body is on the circle of its position, a horizon of pole height atan(s tan φ)", () => {
    for (const [ramc, latitude] of GRID) {
      for (const body of BODIES) {
        const point = equatorial(body.lon, body.lat);
        if (Math.abs(Math.tan(latitude * DEG) * Math.tan(declination(point) * DEG)) >= 1) continue;
        const p = mundane(housePosition("topocentric", input(ramc, latitude), body)!);
        // Positions 270°–360° (and, for the antipode, 90°–180°) lie on the circle
        // s = (p − 270) / 90 of the upper family; 0°–90° (and 180°–270°) on the lower one.
        const q = normalize(p);
        const upper = q >= 270 || (q >= 90 && q < 180);
        const s = upper ? normalize(q - 270) % 180 / 90 : (q % 180) / 90;
        const share = upper ? s : 1 - s;
        const ascension = upper ? ramc + 90 * s : ramc + 90 + 90 * s;
        const pole = Math.atan(share * Math.tan(latitude * DEG)) * RAD;
        const { zenith } = horizon(ascension - 90, pole);
        expect(Math.abs(dot(zenith, point)), `${body.lon}, ${body.lat} at ${ramc}, ${latitude}`).toBeLessThan(1e-9);
      }
    }
  });
});

describe("where a system defines no position", () => {
  it("Koch has none outside its house circles, and none where the midheaven never rises", () => {
    // At 60° N a body of declination about 40° never sets: it has a position
    // only where its lower culmination, taken as its rising, falls within the
    // midheaven's diurnal semi-arc of the RAMC.
    const high = { lon: 90, lat: 17 };
    const at = (ramc: number) => housePosition("koch", input(ramc, 60), high);
    const found = Array.from({ length: 72 }, (_, step) => at(step * 5));
    expect(found.some((position) => position === null)).toBe(true);
    expect(found.some((position) => position !== null)).toBe(true);
    // At 70° N the midheaven never rises at some sidereal times: no position at all there.
    let none = 0;
    for (let ramc = 0; ramc < 360; ramc += 5) {
      const mc = computeAngles(input(ramc, 70)).mc;
      const mcDeclination = Math.asin(Math.sin(OBLIQUITY * DEG) * Math.sin(mc * DEG)) * RAD;
      if (Math.tan(70 * DEG) * Math.tan(mcDeclination * DEG) > -1) continue;
      none += 1;
      for (const body of BODIES) expect(housePosition("koch", input(ramc, 70), body)).toBeNull();
    }
    expect(none).toBeGreaterThan(0);
  });

  it("Topocentric has none where no circle of the quadrant passes through a body that never rises or sets", () => {
    let none = 0;
    let some = 0;
    for (const [ramc, latitude] of [...GRID, ...POLAR_GRID]) {
      for (const body of BODIES) {
        const position = housePosition("topocentric", input(ramc, latitude), body);
        const circumpolar = Math.abs(Math.tan(latitude * DEG) * Math.tan(declination(equatorial(body.lon, body.lat)) * DEG)) > 1;
        if (!circumpolar) expect(position).not.toBeNull();
        else if (position === null) none += 1;
        else some += 1;
      }
    }
    expect(none).toBeGreaterThan(0);
    expect(some).toBeGreaterThan(0);
  });

  it("Placidus follows Otto Ludwig for circumpolar bodies: 10th to 12th house east, 7th to 9th west", () => {
    // A body of declination about +40° at 70° N never sets.
    for (let ramc = 1; ramc < 360; ramc += 7) {
      const body = { lon: 90, lat: 17 };
      const position = housePosition("placidus", input(ramc, 70), body)!;
      const eastern = normalize(rightAscension(equatorial(90, 17)) - ramc) < 180;
      expect(position >= (eastern ? 10 : 7) && position < (eastern ? 13 : 10)).toBe(true);
    }
    // Every system but Koch and Topocentric defines every position, at every latitude.
    for (const [ramc, latitude] of [...GRID, ...POLAR_GRID]) {
      for (const system of HOUSE_SYSTEMS) {
        if (system === "koch" || system === "topocentric") continue;
        for (const body of BODIES) {
          const position = housePosition(system, input(ramc, latitude), body);
          expect(position !== null && position >= 1 && position < 13, `${system} ${body.lon}, ${body.lat} at ${ramc}, ${latitude}`).toBe(true);
        }
      }
    }
  });

  it("refuses invalid input", () => {
    expect(() => housePosition("koch-ish" as HouseSystem, input(0, 0), { lon: 0 })).toThrow(RangeError);
    expect(() => housePosition("placidus", input(0, 91), { lon: 0 })).toThrow(RangeError);
    expect(() => housePosition("placidus", input(Number.NaN, 0), { lon: 0 })).toThrow(RangeError);
    expect(() => housePosition("placidus", input(0, 0, 0), { lon: 0 })).toThrow(RangeError);
    expect(() => housePosition("placidus", input(0, 0), { lon: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(() => housePosition("placidus", input(0, 0), { lon: 0, lat: 95 })).toThrow(RangeError);
    expect(() => housePosition("placidus", null as unknown as AngleInput, { lon: 0 })).toThrow(RangeError);
    expect(() => coAscendants(input(0, -90.5))).toThrow(RangeError);
    expect(() => houseSpeeds("equal", input(0, 0, 90))).toThrow(RangeError);
  });
});

describe("docs/houses.md", () => {
  it("gives the example's position (a regression pin, not accuracy evidence)", () => {
    const example = { gastHours: 21.5, longitude: 12.4, latitude: 47.1, obliquity: 23.4362 };
    expect(housePosition("placidus", example, { lon: 203.7, lat: 4.9 })).toBeCloseTo(5.542417975727636, 12);
  });
});

describe("co-ascendants and the polar ascendant", () => {
  const ALL = [
    ...[-89, -66.9, -40, -1e-9, 0, 1e-9, 23.5, 51.5, 66.6, 78, 89].flatMap((latitude) =>
      [7, 37, 90, 145, 200, 271, 333].map((ramc) => [ramc, latitude] as const)
    ),
    ...GRID
  ];

  it("takes the equatorial ascendant as the East Point", () => {
    for (const [ramc, latitude] of ALL) {
      expect(coAscendants(input(ramc, latitude)).equatorialAscendant).toBe(eastPointOf(input(ramc, latitude)));
    }
  });

  it("puts Koch's co-ascendant and the polar ascendant on the horizon of RAMC + 180°, opposite each other", () => {
    for (const [ramc, latitude] of ALL) {
      const { kochCoAscendant, polarAscendant } = coAscendants(input(ramc, latitude));
      expect(Math.abs(gap(kochCoAscendant, polarAscendant + 180))).toBeLessThan(1e-12);
      const { zenith } = horizon(ramc + 180, latitude);
      expect(Math.abs(dot(zenith, equatorial(polarAscendant, 0)))).toBeLessThan(1e-12);
      // Outside the polar circle it is that horizon's ascendant.
      if (Math.abs(latitude) < 90 - OBLIQUITY) {
        expect(Math.abs(gap(polarAscendant, computeAngles(input(ramc + 180, latitude)).asc))).toBeLessThan(1e-9);
      }
    }
  });

  it("puts Munkasey's co-ascendant on the horizon of the colatitude at the RAMC", () => {
    for (const [ramc, latitude] of ALL) {
      const colatitude = latitude >= 0 ? 90 - latitude : -90 - latitude;
      const { munkaseyCoAscendant } = coAscendants(input(ramc, latitude));
      const { zenith } = horizon(ramc, colatitude);
      expect(Math.abs(dot(zenith, equatorial(munkaseyCoAscendant, 0))), `${ramc}, ${latitude}`).toBeLessThan(1e-9);
      if (Math.abs(colatitude) < 90 - OBLIQUITY) {
        expect(Math.abs(gap(munkaseyCoAscendant, computeAngles(input(ramc, colatitude)).asc))).toBeLessThan(1e-9);
      }
    }
  });
});

describe("speeds", () => {
  /** The engine's cusps and angles at RAMC θ, with the other inputs fixed. */
  const values = (system: HouseSystem, ramc: number, latitude: number) => {
    const angles = computeAngles(input(ramc, latitude));
    const { houses, fellBack } = computeHouses(system, input(ramc, latitude), angles);
    return { cusps: houses.cusps, asc: angles.asc, mc: angles.mc, fellBack };
  };
  /** Richardson's extrapolation of central differences at h and h/2, in degrees per day. */
  const richardson = (at: (ramc: number) => number, ramc: number, h = 1e-3) => {
    const central = (step: number) => gap(at(ramc + step), at(ramc - step)) / (2 * step);
    return ((4 * central(h / 2) - central(h)) / 3) * SIDEREAL_TIME_RATE;
  };

  it("agree with a central difference of the root's own cusps and angles", () => {
    let compared = 0;
    for (const [ramc, latitude] of GRID) {
      for (const system of HOUSE_SYSTEMS) {
        const speeds = houseSpeeds(system, input(ramc, latitude));
        expect(speeds.fellBack).toBe(false);
        expect(speeds.system).toBe(system);
        speeds.cusps.forEach((speed, index) => {
          const numeric = richardson((at) => values(system, at, latitude).cusps[index]!, ramc);
          // Placidus iterates to 1e-9° of right ascension, which the difference magnifies.
          const tolerance = (system === "placidus" ? 1e-3 : 1e-6) + 1e-8 * Math.abs(speed);
          expect(Math.abs(speed - numeric), `${system} cusp ${index + 1} at ${ramc}, ${latitude}`).toBeLessThan(tolerance);
          compared += 1;
        });
        expect(Math.abs(speeds.angles.asc - richardson((at) => values(system, at, latitude).asc, ramc))).toBeLessThan(
          1e-6 + 1e-8 * Math.abs(speeds.angles.asc)
        );
        expect(Math.abs(speeds.angles.mc - richardson((at) => values(system, at, latitude).mc, ramc))).toBeLessThan(
          1e-6 + 1e-8 * Math.abs(speeds.angles.mc)
        );
        expect(speeds.angles.dsc).toBe(speeds.angles.asc);
        expect(speeds.angles.ic).toBe(speeds.angles.mc);
      }
    }
    expect(compared).toBe(GRID.length * HOUSE_SYSTEMS.length * 12);
  });

  it("carries the midheaven at the sidereal rate on average: its speed integrates to 360° a sidereal day", () => {
    // ∫ dMC/dθ dθ over a turn of RAMC is 360°; in time, a sidereal day of 360/SIDEREAL_TIME_RATE days.
    let sum = 0;
    const steps = 3600;
    for (let step = 0; step < steps; step += 1) {
      sum += houseSpeeds("equal", input((step + 0.5) * (360 / steps), 45)).angles.mc * (360 / steps / SIDEREAL_TIME_RATE);
    }
    expect(sum).toBeCloseTo(360, 9);
  });

  it("falls back with Placidus and Koch inside the polar circle, as computeHouses does", () => {
    for (const [ramc, latitude] of POLAR_GRID) {
      for (const system of ["placidus", "koch"] as const) {
        const speeds = houseSpeeds(system, input(ramc, latitude));
        const { houses, fellBack } = computeHouses(system, input(ramc, latitude), computeAngles(input(ramc, latitude)));
        expect([speeds.system, speeds.fellBack]).toEqual([houses.system, fellBack]);
        expect(speeds.cusps).toEqual(Array.from({ length: 12 }, () => 0));
      }
    }
  });

  it("differentiates the cusps of every other system inside the polar circle, away from their jumps", () => {
    let compared = 0;
    for (const [ramc, latitude] of POLAR_GRID) {
      for (const system of HOUSE_SYSTEMS) {
        const speeds = houseSpeeds(system, input(ramc, latitude));
        if (speeds.fellBack) continue;
        speeds.cusps.forEach((speed, index) => {
          const at = (r: number) => values(system, r, latitude).cusps[index]!;
          const centre = at(ramc);
          // A jump (the ascendant turning, a whole sign changing) voids the difference.
          if ([-1e-3, -5e-4, 5e-4, 1e-3].some((step) => Math.abs(gap(at(ramc + step), centre)) > 1)) return;
          expect(Math.abs(speed - richardson(at, ramc)), `${system} cusp ${index + 1} at ${ramc}, ${latitude}`).toBeLessThan(
            1e-6 + 1e-7 * Math.abs(speed)
          );
          compared += 1;
        });
      }
    }
    expect(compared).toBeGreaterThan(POLAR_GRID.length * 10 * 11);
  });
});
