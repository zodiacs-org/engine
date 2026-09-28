import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MEASURED, MEASURED_BASIS } from "./calc-bounds.js";
import { calc } from "./calc.js";
import type { CalcPosition } from "./calc.js";

const summary = JSON.parse(
  readFileSync(new URL("../docs/evidence/calc-api/results/summary.json", import.meta.url), "utf8")
) as { bounds: Record<string, [number, number | null, number | null]> };

const time = "2011-02-03T04:05:06Z";
const ok = (result: ReturnType<typeof calc>): CalcPosition => {
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
};

describe("the measured bounds", () => {
  it("are the committed comparison's, by the preregistered rule", () => {
    const flat = Object.fromEntries(
      Object.entries(MEASURED).flatMap(([group, rows]) => Object.entries(rows).map(([body, row]) => [`${group}/${body}`, row]))
    );
    expect(flat).toEqual(summary.bounds);
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
    expect(MEASURED["topocentric/apparent"]!["Jupiter"]).toBeUndefined();
    const jupiter = ok(calc({ body: "Jupiter", time, center: { topocentric: { latitude: 10, longitude: 20 } } }));
    expect(jupiter.bounds.position.value).toBe(MEASURED["geocentric/apparent"]!["Jupiter"]![0]);
    expect(jupiter.bounds.position.label).toBe("estimated");
    const moon = ok(calc({ body: "Moon", time, center: { topocentric: { latitude: 10, longitude: 20 } } }));
    expect(moon.bounds.position).toMatchObject({ value: MEASURED["topocentric/apparent"]!["Moon"]![0], label: "measured" });
  });

  it("cover the lunar points, which have no distance", () => {
    for (const body of ["North Node", "Mean Node", "Black Moon Lilith"] as const) {
      const point = ok(calc({ body, time, frame: "equatorial-j2000" }));
      expect(point.bounds.position.value).toBe(MEASURED["geocentric/apparent"]![body]![0]);
      expect(point.bounds.distance).toBeNull();
    }
  });
});
