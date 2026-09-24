import { describe, expect, it } from "vitest";
import { computeAngles, natalChart, normalizeLongitude, placidusCusps } from "./index.js";
import type { AngleInput } from "./index.js";

const radians = Math.PI / 180;

// Independent Cartesian horizon/east projections, not a second copy of the
// atan2 branch-selection implementation. See USNO's horizon coordinate relation:
// https://aa.usno.navy.mil/faq/alt_az
function projections(longitude: number, input: AngleInput) {
  const lambda = longitude * radians;
  const theta = (input.gastHours * 15 + input.longitude) * radians;
  const phi = input.latitude * radians;
  const epsilon = input.obliquity * radians;
  const x = Math.cos(lambda);
  const y = Math.sin(lambda) * Math.cos(epsilon);
  const z = Math.sin(lambda) * Math.sin(epsilon);
  return {
    horizon: Math.cos(phi) * (Math.cos(theta) * x + Math.sin(theta) * y) + Math.sin(phi) * z,
    east: -Math.sin(theta) * x + Math.cos(theta) * y
  };
}

describe("shared rising intersection", () => {
  it.each([
    { latitude: 80, gastHours: 18, expected: 0 },
    { latitude: -80, gastHours: 6, expected: 180 }
  ])("selects the eastern intersection at latitude $latitude", ({ expected, ...input }) => {
    const angles = computeAngles({ ...input, longitude: 0, obliquity: 23.439291111 });
    expect(Math.abs(normalizeLongitude(angles.asc - expected + 180) - 180)).toBeLessThan(1e-10);
  });

  it("satisfies the horizon and rising-direction geometry in both hemispheres", () => {
    for (const latitude of [-89, -80, -66, -45, 0, 45, 66, 80, 89]) {
      for (let ramc = 0; ramc < 360; ramc += 3) {
        const input = { latitude, gastHours: ramc / 15, longitude: 0, obliquity: 23.439291111 };
        const angles = computeAngles(input);
        const asc = projections(angles.asc, input);
        expect(Math.abs(asc.horizon)).toBeLessThan(1e-12);
        expect(asc.east).toBeGreaterThan(0);
        expect(projections(angles.dsc, input).east).toBeLessThan(0);
        expect(normalizeLongitude(angles.dsc - angles.asc)).toBeCloseTo(180, 10);
        expect(normalizeLongitude(angles.ic - angles.mc)).toBeCloseTo(180, 10);
        const equivalent = computeAngles({ ...input, gastHours: 0, longitude: ramc });
        for (const key of ["asc", "dsc", "mc", "ic"] as const) {
          expect(
            Math.abs(normalizeLongitude(equivalent[key] - angles[key] + 180) - 180)
          ).toBeLessThan(1e-10);
        }
      }
    }
  });

  it.each(["whole", "placidus"] as const)(
    "anchors public natal %s houses after correction",
    (houseSystem) => {
      for (const latitude of [-78.2232, 78.2232]) {
        for (let hour = 0; hour < 24; hour += 3) {
          const chart = natalChart({
            utc: new Date(Date.UTC(2001, 11, 21, hour)),
            latitude,
            longitude: 15.6267,
            houseSystem
          });
          expect(chart.houses?.system).toBe("whole");
          expect(chart.flags.includes("polar-fallback")).toBe(houseSystem === "placidus");
          expect(chart.houses?.cusps[0]).toBe(Math.floor(chart.angles!.asc / 30) * 30);
          expect(normalizeLongitude(chart.angles!.asc - chart.angles!.mc)).toBeLessThan(180);
        }
      }
    }
  );
});

describe("Placidus convergence", () => {
  it("converges near the supported latitude boundary", () => {
    const input = { latitude: 66, gastHours: 226.7 / 15, longitude: 0, obliquity: 23.439291111 };
    const cusps = placidusCusps(input, computeAngles(input));
    expect(cusps).not.toBeNull();
    // Independent bracketed root of alpha = RAMC+120+(2/3)asin(k sin alpha).
    // Bisection has no dependence on the engine's fixed-point iteration.
    const k = Math.tan(input.latitude * radians) * Math.tan(input.obliquity * radians);
    const residual = (alpha: number) =>
      alpha - 346.7 - ((2 / 3) * Math.asin(k * Math.sin(alpha * radians))) / radians;
    let low = 286.7;
    let high = 406.7;
    for (let step = 0; step < 60; step += 1) {
      const middle = (low + high) / 2;
      if (residual(middle) < 0) low = middle;
      else high = middle;
    }
    const alpha = ((low + high) / 2) * radians;
    const expected = normalizeLongitude(
      Math.atan2(Math.sin(alpha), Math.cos(alpha) * Math.cos(input.obliquity * radians)) / radians
    );
    expect(Math.abs(cusps![1]! - expected)).toBeLessThan(1e-7);
  });
});
