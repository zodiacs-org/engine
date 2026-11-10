import { describe, expect, it } from "vitest";
import { SKY_RADII_KM } from "../../src/sky.js";
import { occultationGeometry } from "../src/occultation-geometry.js";
import type { OccultationGeometryInput } from "../src/occultation-geometry.js";

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const moonRadius = SKY_RADII_KM.Moon;
const base: OccultationGeometryInput = {
  separationDegrees: 0.7, moonDistanceKm: 384_000, targetDistanceKm: null,
  targetRadiusKm: 0, observerRadiusKm: 6_400
};
type V = readonly [number, number, number];
const minus = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const length = (v: V) => Math.hypot(...v);
function separation(a: V, b: V) {
  return Math.atan2(Math.hypot(
    a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]
  ), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * DEG;
}

// Synthetic Euclidean constructions establish numerical geometry only. They
// neither use ephemeris positions nor establish physical occultation accuracy.
describe("conservative lunar occultation geometry", () => {
  it("distinguishes a terrestrial star occultation from geocentric disk overlap", () => {
    const d = base.moonDistanceKm, r = base.observerRadiusKm;
    // A parallel stellar ray at terrestrial transverse coordinate r just
    // touches the lunar sphere when the lunar transverse coordinate is r+Rm.
    const theta = Math.asin((r + moonRadius) / d) * DEG;
    const moon: V = [d * Math.cos(theta * RAD), d * Math.sin(theta * RAD), 0];
    const observer: V = [0, r, 0];
    const translated = minus(moon, observer);
    expect(Math.abs(separation(translated, [1, 0, 0]) -
      Math.asin(moonRadius / length(translated)) * DEG)).toBeLessThan(1e-12);
    const geometry = occultationGeometry({ ...base, separationDegrees: theta });
    expect(geometry.geocentricClearanceDegrees).toBeGreaterThan(0);
    expect(geometry.envelopeClearanceDegrees).toBeLessThan(0);
  });

  it("retains conservative false positives outside the exact stellar shadow", () => {
    const exactLimit = Math.asin((base.observerRadiusKm + moonRadius) / base.moonDistanceKm) * DEG;
    const envelope = occultationGeometry(base).observerEnvelopeDegrees;
    const theta = (exactLimit + envelope) / 2;
    expect(base.moonDistanceKm * Math.sin(theta * RAD) - moonRadius).toBeGreaterThan(base.observerRadiusKm);
    expect(occultationGeometry({ ...base, separationDegrees: theta }).envelopeClearanceDegrees).toBeLessThan(0);
    expect(occultationGeometry({ ...base, separationDegrees: envelope + 0.01 }).envelopeClearanceDegrees)
      .toBeGreaterThan(0);
  });

  it("owns exact disk and envelope boundaries inclusively through zero clearance", () => {
    const geometry = occultationGeometry(base);
    expect(occultationGeometry({ ...base, separationDegrees: geometry.geocentricLimitDegrees })
      .geocentricClearanceDegrees).toBe(0);
    expect(occultationGeometry({ ...base, separationDegrees: geometry.observerEnvelopeDegrees })
      .envelopeClearanceDegrees).toBe(0);
  });

  it("reduces to geocentric disk geometry for a zero observer sphere", () => {
    for (const target of [
      { targetDistanceKm: null, targetRadiusKm: 0 },
      { targetDistanceKm: 1_000_000, targetRadiusKm: 20_000 }
    ]) {
      const geometry = occultationGeometry({ ...base, ...target, observerRadiusKm: 0 });
      expect(geometry.observerEnvelopeDegrees).toBe(geometry.geocentricLimitDegrees);
      expect(geometry.envelopeClearanceDegrees).toBe(geometry.geocentricClearanceDegrees);
    }
  });

  it("includes planet limb overlap even when the planet center misses the Moon", () => {
    const source = { ...base, targetDistanceKm: 1_000_000, targetRadiusKm: 20_000 };
    const geometry = occultationGeometry(source);
    const theta = geometry.moonSemidiameterDegrees + geometry.targetSemidiameterDegrees / 2;
    expect(theta).toBeGreaterThan(geometry.moonSemidiameterDegrees);
    expect(occultationGeometry({ ...source, separationDegrees: theta }).geocentricClearanceDegrees).toBeLessThan(0);
  });

  it("expands for a nearer Moon, larger observer sphere or a larger planetary disk", () => {
    const ordinary = occultationGeometry(base);
    expect(occultationGeometry({ ...base, moonDistanceKm: 360_000 }).observerEnvelopeDegrees)
      .toBeGreaterThan(ordinary.observerEnvelopeDegrees);
    expect(occultationGeometry({ ...base, observerRadiusKm: 6_500 }).observerEnvelopeDegrees)
      .toBeGreaterThan(ordinary.observerEnvelopeDegrees);
    const point = occultationGeometry({ ...base, targetDistanceKm: 1_000_000 });
    const disk = occultationGeometry({ ...base, targetDistanceKm: 1_000_000, targetRadiusKm: 10_000 });
    expect(disk.observerEnvelopeDegrees).toBeGreaterThan(point.observerEnvelopeDegrees);
    expect(point.observerEnvelopeDegrees).toBeGreaterThan(ordinary.observerEnvelopeDegrees);
  });

  it("approaches the infinite point-source model as finite target distance increases", () => {
    const infinite = occultationGeometry(base);
    const finite = occultationGeometry({ ...base, targetDistanceKm: 1e18 });
    expect(Math.abs(finite.observerEnvelopeDegrees - infinite.observerEnvelopeDegrees)).toBeLessThan(1e-11);
    expect(finite.targetSemidiameterDegrees).toBe(0);
  });

  it("never excludes an overlap across independent Cartesian observer translations", () => {
    let overlaps = 0;
    for (const observerRadiusKm of [0, 1_000, 6_000]) {
      for (const targetDistanceKm of [null, 180_000, 1_000_000_000]) {
        for (const targetRadiusKm of targetDistanceKm === null ? [0] : [0, 2_000]) {
          for (const theta of [0, 1, 3, 5, 20]) {
            const moonDistanceKm = 100_000;
            const moon: V = [moonDistanceKm * Math.cos(theta * RAD), moonDistanceKm * Math.sin(theta * RAD), 0];
            const geometry = occultationGeometry({ separationDegrees: theta, moonDistanceKm,
              observerRadiusKm, targetDistanceKm, targetRadiusKm });
            for (const lat of [-90, -45, 0, 45, 90]) {
              for (let lon = 0; lon < 360; lon += 30) {
                const observer: V = [observerRadiusKm * Math.cos(lat * RAD) * Math.cos(lon * RAD),
                  observerRadiusKm * Math.cos(lat * RAD) * Math.sin(lon * RAD), observerRadiusKm * Math.sin(lat * RAD)];
                const localMoon = minus(moon, observer);
                const localTarget: V = targetDistanceKm === null ? [1, 0, 0] : minus([targetDistanceKm, 0, 0], observer);
                const localClearance = separation(localMoon, localTarget) -
                  Math.asin(moonRadius / length(localMoon)) * DEG -
                  (targetDistanceKm === null ? 0 : Math.asin(targetRadiusKm / length(localTarget)) * DEG);
                expect(localClearance + 1e-11).toBeGreaterThanOrEqual(geometry.envelopeClearanceDegrees);
                if (localClearance <= 0) {
                  overlaps++;
                  expect(geometry.envelopeClearanceDegrees).toBeLessThanOrEqual(1e-11);
                }
              }
            }
          }
        }
      }
    }
    expect(overlaps).toBeGreaterThan(0);
  });

  it("contains exact finite point-source shadow intersections", () => {
    const d = 100_000, t = 180_000, r = 6_000;
    let exactCandidates = 0, exactMisses = 0;
    for (let theta = 0; theta <= 10; theta += 0.1) {
      const moon: V = [d * Math.cos(theta * RAD), d * Math.sin(theta * RAD), 0];
      const targetToMoon = minus(moon, [t, 0, 0]);
      // Independent cone/sphere construction: from the point source, the
      // terrestrial and lunar angular silhouettes overlap. Here the Moon
      // lies between source and Earth throughout the tested angular interval.
      const sourceAngle = separation([-t, 0, 0], targetToMoon);
      const silhouettes = Math.asin(r / t) * DEG + Math.asin(moonRadius / length(targetToMoon)) * DEG;
      const geometry = occultationGeometry({ separationDegrees: theta, moonDistanceKm: d,
        targetDistanceKm: t, targetRadiusKm: 0, observerRadiusKm: r });
      if (sourceAngle <= silhouettes) {
        exactCandidates++;
        expect(geometry.envelopeClearanceDegrees).toBeLessThanOrEqual(0);
      } else {
        exactMisses++;
      }
    }
    expect(exactCandidates).toBeGreaterThan(0);
    expect(exactMisses).toBeGreaterThan(0);
  });

  it("rejects an antipodal Moon as a candidate", () => {
    expect(occultationGeometry({ ...base, separationDegrees: 180 }).envelopeClearanceDegrees).toBeGreaterThan(0);
  });

  it.each([
    { separationDegrees: -1 }, { separationDegrees: 181 }, { separationDegrees: NaN },
    { moonDistanceKm: Infinity }, { moonDistanceKm: -1 }, { moonDistanceKm: 0 },
    { moonDistanceKm: base.observerRadiusKm + moonRadius },
    { observerRadiusKm: -1 }, { observerRadiusKm: NaN }, { observerRadiusKm: Infinity },
    { targetRadiusKm: -1 }, { targetRadiusKm: Infinity }, { targetRadiusKm: 1 },
    { targetDistanceKm: NaN }, { targetDistanceKm: Infinity }, { targetDistanceKm: -1 },
    { targetDistanceKm: 0 }, { targetDistanceKm: base.moonDistanceKm },
    { targetDistanceKm: base.moonDistanceKm + moonRadius + 2 * base.observerRadiusKm },
    { targetDistanceKm: 500_000, targetRadiusKm: 200_000 }
  ])("refuses invalid or ambiguously ordered geometry %o", (invalid) => {
    expect(() => occultationGeometry({ ...base, ...invalid })).toThrow(RangeError);
  });
});
