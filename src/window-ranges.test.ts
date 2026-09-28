/**
 * The birth-window enclosures against brute force: every sampled value of a
 * quantity over an interval must lie in its range, and the range must not be
 * much wider than the values it encloses.
 */
import { describe, expect, it } from "vitest";

import {
  advance,
  cosRange,
  morinusRange,
  obliqueRange,
  reaches,
  signedDelta,
  sinRange
} from "./window-ranges.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** A small deterministic generator for reproducible cases. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Whether the longitude lies in the range, modulo 360°, to 1e-10°: well
 * inside the search's 1e-9° band, and above the rounding of the checks here.
 */
const inside = (range: readonly [number, number], value: number) => reaches(range, 360, value, 1e-10);

describe("range primitives", () => {
  it("finds a multiple of the period inside a padded range", () => {
    expect(reaches([29.9, 29.99], 30, 0, 0)).toBe(false);
    expect(reaches([29.9, 30], 30, 0, 0)).toBe(true);
    expect(reaches([29.9, 29.99], 30, 0, 0.011)).toBe(true);
    expect(reaches([-0.5, 0.5], 360, 0, 0)).toBe(true);
    expect(reaches([359.5, 360.5], 360, 0, 0)).toBe(true);
    expect(reaches([10, 20], 360, 375, 0)).toBe(true);
    expect(reaches([10, 20], 360, 380.5, 0)).toBe(false);
    expect(reaches(null, 30, 0, 0)).toBe(true);
  });

  it("steps across the circle", () => {
    expect(signedDelta(359, 1)).toBe(2);
    expect(signedDelta(1, 359)).toBe(-2);
    expect(advance(350, 10)).toBe(20);
    expect(advance(10, 10 - 1e-12)).toBeLessThan(0);
    expect(advance(10, 10 - 1e-12)).toBeGreaterThan(-1e-9);
  });

  it("encloses cos and sin over any interval", () => {
    const random = generator(1);
    let outside = 0;
    let loose = 0;
    for (let trial = 0; trial < 2000; trial += 1) {
      const a1 = -720 + 1440 * random();
      const a2 = a1 + 400 * random() ** 2;
      const [clo, chi] = cosRange(a1, a2);
      const [slo, shi] = sinRange(a1, a2);
      let cmin = Infinity;
      let cmax = -Infinity;
      let smin = Infinity;
      let smax = -Infinity;
      for (let k = 0; k <= 400; k += 1) {
        const a = a1 + ((a2 - a1) * k) / 400;
        cmin = Math.min(cmin, Math.cos(a * DEG));
        cmax = Math.max(cmax, Math.cos(a * DEG));
        smin = Math.min(smin, Math.sin(a * DEG));
        smax = Math.max(smax, Math.sin(a * DEG));
      }
      // The last sample's angle can differ from a2 in its last bit.
      if (clo > cmin + 1e-14 || chi < cmax - 1e-14 || slo > smin + 1e-14 || shi < smax - 1e-14) outside += 1;
      // Tight: within the change over one sampling step.
      if (cmin - clo > 1e-3 || chi - cmax > 1e-3 || smin - slo > 1e-3 || shi - smax > 1e-3) loose += 1;
    }
    expect({ outside, loose }).toEqual({ outside: 0, loose: 0 });
  });
});

describe("oblique longitude ranges", () => {
  const oblique = (a: number, K: number, c: number) =>
    Math.atan2(Math.sin(a * DEG), Math.cos(a * DEG) * c - K) * RAD;

  /** Values along the arc, unwrapped continuously from its start. */
  function sampled(a1: number, a2: number, K: number, c: number, steps: number): number[] {
    const values: number[] = [];
    let previous = oblique(a1, K, c);
    let at = previous;
    values.push(at);
    for (let k = 1; k <= steps; k += 1) {
      const current = oblique(a1 + ((a2 - a1) * k) / steps, K, c);
      at += signedDelta(previous, current);
      values.push(at);
      previous = current;
    }
    return values;
  }

  it("contains, and closely bounds, the ascendant and the circle cusps", () => {
    const random = generator(2);
    let checked = 0;
    let outside = 0;
    let loose = 0;
    let fast = 0;
    let unknown = 0;
    for (let trial = 0; trial < 3000; trial += 1) {
      const epsilon = 22 + 3 * random();
      const c = Math.cos(epsilon * DEG);
      // Poles from the equator to 89.99°, either hemisphere, crowded near the polar circle.
      const pole = (random() < 0.5 ? -1 : 1) * (random() < 0.3 ? 66.5 + random() * 0.2 - 0.1 : 89.99 * random());
      const tanPole = Math.tan(pole * DEG);
      const K = tanPole * Math.sin(epsilon * DEG);
      const a1 = -360 + 720 * random();
      const a2 = a1 + 60 * random() ** 3;
      const found = obliqueRange(a1, a2, K, c, tanPole, 0);
      if (found === null) {
        if (Math.abs(Math.abs(K) - c) >= 1e-5) unknown += 1;
        continue;
      }
      // Every value, computed directly, is inside.
      for (let k = 0; k <= 4000; k += 1) {
        if (!inside(found.range, oblique(a1 + ((a2 - a1) * k) / 4000, K, c))) outside += 1;
      }
      // The range is exact up to the sampling step and the rounding pad; the
      // continuously unwrapped samples give the extent of the values.
      const values = sampled(a1, a2, K, c, 4000);
      const step = found.rate * ((a2 - a1) / 4000);
      if (found.range[1] - found.range[0] > Math.max(...values) - Math.min(...values) + 2 * step + 1e-6) loose += 1;
      // The rate bound holds along the arc.
      for (let k = 1; k < values.length; k += 1) {
        if (Math.abs(values[k]! - values[k - 1]!) > step * (1 + 1e-9) + 1e-9) fast += 1;
      }
      checked += 1;
    }
    expect({ outside, loose, fast, unknown }).toEqual({ outside: 0, loose: 0, fast: 0, unknown: 0 });
    expect(checked).toBeGreaterThan(2900);
  });

  it("widens for an obliquity that moves within dEps", () => {
    const random = generator(3);
    let outside = 0;
    for (let trial = 0; trial < 1000; trial += 1) {
      const epsilon = 23 + random();
      const dEps = 1e-4 * random();
      const pole = 89 * random();
      const tanPole = Math.tan(pole * DEG);
      const a1 = 360 * random();
      const a2 = a1 + 30 * random();
      const found = obliqueRange(a1, a2, tanPole * Math.sin(epsilon * DEG), Math.cos(epsilon * DEG), tanPole, dEps);
      if (found === null) continue;
      for (const moved of [epsilon - dEps, epsilon + dEps]) {
        const K = tanPole * Math.sin(moved * DEG);
        const c = Math.cos(moved * DEG);
        for (let k = 0; k <= 50; k += 1) {
          if (!inside(found.range, oblique(a1 + ((a2 - a1) * k) / 50, K, c))) outside += 1;
        }
      }
    }
    expect(outside).toBe(0);
  });

  it("turns back only where the origin lies outside the ellipse", () => {
    // |K| < c: increasing through a full turn; |K| > c: less than 180° in all.
    const c = Math.cos(23.44 * DEG);
    const inner = obliqueRange(0, 179, 0.5, c, 0.5 / Math.sin(23.44 * DEG), 0)!;
    expect(inner.range[1] - inner.range[0]).toBeGreaterThan(170);
    for (let a = -360; a < 360; a += 30) {
      const outer = obliqueRange(a, a + 179, 3, c, 3 / Math.sin(23.44 * DEG), 0)!;
      expect(outer.range[1] - outer.range[0]).toBeLessThan(180);
    }
  });
});

describe("Morinus ranges", () => {
  it("contains every value over the interval", () => {
    const random = generator(4);
    let outside = 0;
    let loose = 0;
    for (let trial = 0; trial < 2000; trial += 1) {
      const epsilon = 22 + 3 * random();
      const c = Math.cos(epsilon * DEG);
      const a1 = -360 + 720 * random();
      const a2 = a1 + 45 * random();
      const range = morinusRange(a1, a2, c, 0)!;
      for (let k = 0; k <= 200; k += 1) {
        const a = a1 + ((a2 - a1) * k) / 200;
        if (!inside(range, Math.atan2(Math.sin(a * DEG) * c, Math.cos(a * DEG)) * RAD)) outside += 1;
      }
      if (range[1] - range[0] > (a2 - a1) / c + 1e-9) loose += 1;
    }
    expect({ outside, loose }).toEqual({ outside: 0, loose: 0 });
  });
});
