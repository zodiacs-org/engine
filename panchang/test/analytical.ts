import { vi } from "vitest";
import * as limbs from "../src/limbs.js";
import * as engine from "../src/engine.js";
import { nakshatraOf } from "../../src/vedic/nakshatra.js";
import { declareSiderealLongitude } from "../../src/vedic/sidereal.js";
import { luminarySnapshot } from "../src/engine.js";
import type { LimbKind } from "../src/transitions.js";

export const EPOCH = Date.parse("2024-03-20T00:00:00Z");
export const UNIT = 2 ** 26;
export const DAY = 86_400_000;
export const iso = (offset: number) => new Date(EPOCH + offset).toISOString();

// Independently prescribed linear coordinates, unrelated to the ephemeris:
// Sun=t/U, Moon=13t/U degrees, U=2^26 ms. Binary coordinates are dyadic.
// The seed supplies test-only receipt shapes. These mock snapshots are not
// published ephemeris outputs and their copied receipts certify no positions.
export function analyticalSource(direction = 1, freezeYoga = false, withMonths = false): void {
  const seed = luminarySnapshot(iso(0));
  if (seed.status !== "ok") throw new Error("Expected seed coverage");
  const wrap = (angle: number) => ((angle % 360) + 360) % 360;
  const snapshot = (at: unknown) => {
    const date = new Date(at as Date | string);
    const utc = date.toISOString();
    const t = direction * (date.getTime() - EPOCH) / UNIT;
    const sun = wrap(t);
    const moon = wrap(13 * t);
    const a = declareSiderealLongitude(freezeYoga ? 0 : sun, { ayanamsa: "lahiri", at: utc });
    const b = declareSiderealLongitude(freezeYoga ? 0 : moon, { ayanamsa: "lahiri", at: utc });
    return {
      ...seed, utc,
      sun: { tropical: { ...seed.sun.tropical, lon: sun }, sidereal: { ...seed.sun.sidereal, lon: a.lon } },
      moon: { tropical: { ...seed.moon.tropical, lon: moon }, sidereal: { ...seed.moon.sidereal, lon: b.lon } },
      nakshatra: nakshatraOf(b), tithi: limbs.tithiOf(sun, moon), karana: limbs.karanaOf(sun, moon),
      yoga: limbs.yogaOf(a, b)
    };
  };
  vi.spyOn(limbs, "instantaneousPanchang").mockImplementation(snapshot);
  if (withMonths) vi.spyOn(engine, "luminarySnapshot").mockImplementation(snapshot);
}

// Expected times are rational multiples of U, solved by hand. Rounding is
// ceiling because the new sector owns the boundary at whole milliseconds.
const period: Record<LimbKind, readonly [bigint, bigint]> = {
  tithi: [BigInt(UNIT), 1n], karana: [BigInt(UNIT), 2n],
  nakshatra: [40n * BigInt(UNIT), 39n], pada: [10n * BigInt(UNIT), 39n],
  yoga: [20n * BigInt(UNIT), 21n]
};
export function root(kind: LimbKind, multiple: number): number {
  const [numerator, denominator] = period[kind];
  const value = BigInt(multiple) * numerator;
  return Number(value >= 0n ? (value + denominator - 1n) / denominator : value / denominator);
}
