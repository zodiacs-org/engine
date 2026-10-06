import { readFileSync } from "node:fs";

import { AstroTime, BaryState, Body, HelioVector } from "astronomy-engine";
import { describe, expect, it } from "vitest";

import { MEASURED, MEASURED_BASIS } from "./calc-bounds.js";
import { BARYCENTRE_ERROR } from "./calc-reduce.js";
import { calc } from "./calc.js";
import type { CalcPosition } from "./calc.js";

const evidence = (path: string) => readFileSync(new URL(`../docs/evidence/calc-api/${path}`, import.meta.url), "utf8");
// The comparison rerun on 0.1.1-rc.16's build, after the engine took the full
// IAU 2000B nutation; the first run, on astronomy-engine's, stays in results/.
const summary = JSON.parse(evidence("rc16/summary.json")) as { bounds: Record<string, [number, number | null, number | null]> };

const time = "2011-02-03T04:05:06Z";
const ok = (result: ReturnType<typeof calc>): CalcPosition => {
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
};

describe("the measured bounds", () => {
  it("are the committed comparison's, by the preregistered rule, but for the barycentric Sun", () => {
    const flat = Object.fromEntries(
      Object.entries(MEASURED).flatMap(([group, rows]) => Object.entries(rows).map(([body, row]) => [`${group}/${body}`, row]))
    );
    const derived = ["apparent", "astrometric", "geometric"].map((correction) => `barycentric/${correction}/Sun`);
    expect(flat).toEqual(Object.fromEntries(Object.entries(summary.bounds).filter(([key]) => !derived.includes(key))));
    for (const key of derived) expect(summary.bounds[key]).toBeDefined();
    expect(MEASURED_BASIS).toContain("docs/evidence/calc-api");
  });

  it("reach calc() results, labelled measured", () => {
    const mars = ok(calc({ body: "Mars", time }));
    const [position, distance, speed] = MEASURED["geocentric/apparent"]!["Mars"]!;
    expect(mars.bounds.position).toEqual({ value: position, unit: "arcsec", label: "measured", basis: MEASURED_BASIS });
    expect(mars.bounds.distance!.value).toBe(distance);
    expect(mars.bounds.speed).toMatchObject({ value: speed, label: "measured", method: "central-difference", stepDays: 0.001 });
    const earth = ok(calc({ body: "Earth", time, center: "heliocentric", frame: "ecliptic-j2000", flags: { correction: "geometric" } }));
    expect(earth.bounds.position.value).toBe(MEASURED["heliocentric/geometric"]!["Earth"]![0]);
    expect(earth.bounds.speed).toMatchObject({ method: "analytic", stepDays: null });
  });

  it("give a topocentric body not compared its geocentric bound, as an estimate", () => {
    const site = { topocentric: { latitude: 10, longitude: 20 } };
    for (const correction of ["apparent", "astrometric", "geometric"] as const) {
      expect(MEASURED[`topocentric/${correction}`]!["Jupiter"]).toBeUndefined();
      const jupiter = ok(calc({ body: "Jupiter", time, center: site, flags: { correction } }));
      expect(jupiter.bounds.position.value).toBe(MEASURED[`geocentric/${correction}`]!["Jupiter"]![0]);
      expect(jupiter.bounds.position.label).toBe("estimated");
      expect(jupiter.bounds.position.basis).toContain("geocentric bound");
      const moon = ok(calc({ body: "Moon", time, center: site, flags: { correction } }));
      expect(moon.bounds.position).toMatchObject({ value: MEASURED[`topocentric/${correction}`]!["Moon"]![0], label: "measured" });
    }
  });

  it("cover the lunar points, which have no distance", () => {
    for (const body of ["North Node", "Mean Node", "Black Moon Lilith"] as const) {
      const point = ok(calc({ body, time, frame: "equatorial-j2000" }));
      expect(point.bounds.position.value).toBe(MEASURED["geocentric/apparent"]![body]![0]);
      expect(point.bounds.distance).toBeNull();
    }
  });
});

type Vec = readonly [number, number, number];
const ARCSEC = 648_000 / Math.PI;
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const angle = (a: Vec, b: Vec) =>
  Math.atan2(norm([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]), dot(a, b)) * ARCSEC;
/** The rate of the direction r / |r|, radians a day. */
function directionRate(r: Vec, v: Vec): Vec {
  const along = dot(r, v) / dot(r, r);
  const d = norm(r);
  return [(v[0] - along * r[0]) / d, (v[1] - along * r[1]) / d, (v[2] - along * r[2]) / d];
}
/** The longitude rate times the cosine of the latitude, and the latitude rate, as the comparison measures them. */
function lonLatRates([x, y, z]: Vec, [vx, vy, vz]: Vec): [number, number] {
  const plane = x * x + y * y;
  const square = plane + z * z;
  return [((x * vy - y * vx) / plane) * Math.sqrt(plane / square), (vz * plane - z * (x * vx + y * vy)) / (square * Math.sqrt(plane))];
}

/** Horizons's barycentric Sun (DE441, ICRF, au and au/day) in a committed response. */
function horizons(name: string): { jd: number; r: Vec; v: Vec }[] {
  const table = evidence(`horizons/${name}`).split("$$SOE")[1]!.split("$$EOE")[0]!.trim();
  return table.split("\n").map((line) => {
    const cells = line.split(",").map(Number);
    return { jd: cells[0]!, r: [cells[2]!, cells[3]!, cells[4]!], v: [cells[5]!, cells[6]!, cells[7]!] };
  });
}

// GM(Sun) / GM(body), DE440 (Park et al. 2021), as the comparison's diagnostics.py takes them. The
// Earth–Moon barycentre is put at the Earth, which moves the barycentre by under 1e-10 au.
const SUN_OVER: readonly [Body, number][] = [
  [Body.Mercury, 6023657.33],
  [Body.Venus, 408523.72],
  [Body.Earth, 328900.56],
  [Body.Mars, 3098703.59],
  [Body.Jupiter, 1047.348644],
  [Body.Saturn, 3497.901768],
  [Body.Uranus, 22902.98161],
  [Body.Neptune, 19412.25977],
  [Body.Pluto, 136045556]
];
const TOTAL = 1 + SUN_OVER.reduce((sum, [, ratio]) => sum + 1 / ratio, 0);
/** The Sun about the full Newtonian barycentre of astronomy-engine's own heliocentric positions; Pluto's may be given. */
function newtonian(time: AstroTime, pluto?: Vec): Vec {
  let [x, y, z] = [0, 0, 0];
  for (const [body, ratio] of SUN_OVER) {
    const p = body === Body.Pluto && pluto ? { x: pluto[0], y: pluto[1], z: pluto[2] } : HelioVector(body, time);
    x -= p.x / ratio / TOTAL;
    y -= p.y / ratio / TOTAL;
    z -= p.z / ratio / TOTAL;
  }
  return [x, y, z];
}

describe("the barycentric Sun's bounds", () => {
  const review = horizons("bary-NONE-10-2130.txt");
  const scanned = horizons("bary-NONE-10-scan.txt");
  const checks = [
    ...review.map((row) => ({ ...row, time: "2130-03-05T00:00:00Z" as const })),
    ...[...horizons("bary-NONE-10.txt"), ...scanned].map((row) => ({ ...row, time: { jd: row.jd, scale: "tt" as const } }))
  ];

  it("come from the barycentre's error, and cover the difference from Horizons at 2130-03-05 and where a daily scan finds it worst", () => {
    expect(checks).toHaveLength(88);
    for (const check of checks) {
      const sun = ok(calc({ body: "Sun", time: check.time, center: "barycentric", frame: "equatorial-icrs", flags: { correction: "geometric", cartesian: true } }));
      const r: Vec = [sun.cartesian!.x, sun.cartesian!.y, sun.cartesian!.z];
      const v: Vec = [sun.cartesian!.vx!, sun.cartesian!.vy!, sun.cartesian!.vz!];
      const { position, distance, speed } = sun.bounds;
      for (const b of [position, distance!, speed!]) {
        expect(b.label).toBe("estimated");
        expect(b.basis).toContain(`${BARYCENTRE_ERROR.au.toExponential()} au`);
      }
      expect(angle(r, check.r)).toBeLessThanOrEqual(position.value!);
      expect(Math.abs(sun.dist! - norm(check.r)) / norm(check.r)).toBeLessThanOrEqual(distance!.value!);
      expect(norm(sub(directionRate(r, v), directionRate(check.r, check.v))) * ARCSEC).toBeLessThanOrEqual(speed!.value!);
      const [a, b] = [lonLatRates(r, v), lonLatRates(check.r, check.v)];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1]) * ARCSEC).toBeLessThanOrEqual(speed!.value!);
    }

    // The review's case: 2.66° and 1.8% from Horizons, which the measured 520″ and 0.0042 did not cover.
    const [first] = review;
    const sun = ok(calc({ body: "Sun", time: "2130-03-05T00:00:00Z", center: "barycentric", flags: { cartesian: true } }));
    const turned = ok(calc({ body: "Sun", time: "2130-03-05T00:00:00Z", center: "barycentric", frame: "equatorial-icrs", flags: { cartesian: true } }));
    const r: Vec = [turned.cartesian!.x, turned.cartesian!.y, turned.cartesian!.z];
    expect(angle(r, first!.r) / 3600).toBeGreaterThan(2.66);
    expect(angle(r, first!.r) / 3600).toBeLessThan(2.67);
    expect(Math.abs(turned.dist! - norm(first!.r)) / norm(first!.r)).toBeGreaterThan(0.018);
    expect(sun.bounds.position.value).toBe(turned.bounds.position.value);
    expect([sun.bounds.position.value, sun.bounds.distance!.value, sun.bounds.speed!.value]).toEqual([27_000, 0.15, 3_400]);
    expect(ok(calc({ body: "Sun", time: "2130-03-05T00:00:00Z", center: "barycentric", flags: { speeds: false } })).bounds.speed).toBeNull();
  });

  it("rest on the barycentre's error, which a daily scan of 1800 to 2200 against the full Newtonian barycentre and Horizons bear out", () => {
    // The Newtonian barycentre's own difference from DE441, at the Horizons instants; velocities as the scan finds them.
    let residual = 0;
    let residualRate = 0;
    for (const check of checks) {
      const sun = ok(calc({ body: "Sun", time: check.time, center: "barycentric", flags: { speeds: false } }));
      const at = new AstroTime(sun.receipt.instants[0]!.jdUt1 - 2_451_545);
      residual = Math.max(residual, norm(sub(newtonian(at), check.r)));
      const rate = sub(newtonian(at.AddDays(1)), newtonian(at.AddDays(-1))).map((x) => x / 2) as unknown as Vec;
      residualRate = Math.max(residualRate, norm(sub(rate, check.v)));
    }
    expect(residual).toBeLessThan(1.2e-6);
    expect(residualRate).toBeLessThan(2e-9);

    // Every day from 1800 to 2200, on JD x.5; Pluto moves slowly and is taken every ten days, linearly between.
    const start = 2_378_496.5;
    const days = 146_097;
    const plutos: Vec[] = [];
    for (let k = 0; k * 10 <= days + 11; k++) {
      const p = HelioVector(Body.Pluto, new AstroTime(start - 1 + 10 * k - 2_451_545));
      plutos.push([p.x, p.y, p.z]);
    }
    const plutoAt = (i: number): Vec => {
      const k = Math.floor((i + 1) / 10);
      const f = (i + 1) / 10 - k;
      const [a, b] = [plutos[k]!, plutos[k + 1]!];
      return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2])];
    };
    const reference = (i: number) => newtonian(new AstroTime(start + i - 2_451_545), plutoAt(i));
    let [before, now] = [reference(-1), reference(0)];
    let worst = { au: 0, jd: 0 };
    let worstRate = 0;
    let closest = { au: Infinity, jd: 0 };
    for (let i = 0; i < days; i++) {
      const after = reference(i + 1);
      const state = BaryState(Body.Sun, new AstroTime(start + i - 2_451_545));
      const r: Vec = [state.x, state.y, state.z];
      const au = norm(sub(r, now));
      if (au > worst.au) worst = { au, jd: start + i };
      const rate = sub(after, before).map((x) => x / 2) as unknown as Vec;
      worstRate = Math.max(worstRate, norm(sub([state.vx, state.vy, state.vz], rate)));
      if (norm(r) < closest.au) closest = { au: norm(r), jd: start + i };
      [before, now] = [now, after];
    }
    expect(worst.au + residual).toBeLessThanOrEqual(BARYCENTRE_ERROR.au);
    expect(worstRate + residualRate).toBeLessThanOrEqual(BARYCENTRE_ERROR.auPerDay);
    // The Sun keeps well clear of the barycentre, where the bound would say nothing.
    expect(closest.au).toBeGreaterThan(7 * BARYCENTRE_ERROR.au);
    // Horizons was asked for the scan's worst day and its closest approach.
    expect(scanned.map((row) => row.jd)).toEqual(expect.arrayContaining([worst.jd, closest.jd]));
  }, 120_000);
});
