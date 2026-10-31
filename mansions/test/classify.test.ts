import { describe, expect, it } from "vitest";

import { classifyLongitude } from "../src/classify.js";
import { EQUAL28_ARIES_V1 } from "../src/tables.js";
import type { BoundaryTableId } from "../src/tables.js";

const tableId = "equal28-aries-v1";
const indexAt = (longitude: number) => classifyLongitude(longitude, tableId).mansion.index;

// Independent arithmetic oracle: scale by powers of two until the supplied
// number is an integer. No IEEE bit decoder, production table or classifier
// intermediate supplies the expectation. One circle is 360 * denominator;
// floor(28 * remainder / circle) + 1 is the hand-derived equal-segment index.
function rationalIndex(longitude: number): number {
  let scaled = longitude;
  let denominator = 1n;
  while (!Number.isInteger(scaled)) {
    scaled *= 2;
    denominator *= 2n;
  }
  const circle = 360n * denominator;
  const remainder = ((BigInt(scaled) % circle) + circle) % circle;
  return Number((28n * remainder) / circle) + 1;
}

// Adjacent positive doubles, used only to construct boundary test inputs.
function neighbor(value: number, direction: -1 | 1): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  view.setBigUint64(0, view.getBigUint64(0, false) + BigInt(direction), false);
  return view.getFloat64(0, false);
}

describe("pure equal-segment longitude classification", () => {
  it("matches hand-derived integer arithmetic on an eighth-degree grid around the circle", () => {
    // x = tick/8; x/(360/28) = tick*7/720, all integer arithmetic here.
    for (let tick = 0; tick < 2880; tick += 1) {
      const expected = Number((BigInt(tick) * 7n) / 720n) + 1;
      expect(indexAt(tick / 8), `tick ${tick}`).toBe(expected);
    }
  });

  it("checks both sides of every boundary using exact integer fractions", () => {
    // On a 2^-40 degree grid, floor(i*360*2^40/28) brackets each boundary.
    // This construction does not round a rational boundary into a double first.
    const scale = 1n << 40n;
    for (let i = 1n; i < 28n; i += 1n) {
      const numerator = i * 360n * scale;
      const lowerTick = numerator / 28n;
      const exact = numerator % 28n === 0n;
      expect(indexAt(Number(lowerTick - 1n) / Number(scale))).toBe(Number(i));
      expect(indexAt(Number(lowerTick) / Number(scale))).toBe(Number(i) + (exact ? 1 : 0));
      expect(indexAt(Number(lowerTick + 1n) / Number(scale))).toBe(Number(i) + 1);
    }
  });

  it("compares nearest doubles and their immediate neighbors against every rational boundary", () => {
    for (let i = 1; i <= 28; i += 1) {
      const approximateBoundary = (360 * i) / 28;
      for (const input of [neighbor(approximateBoundary, -1), approximateBoundary,
        neighbor(approximateBoundary, 1)]) {
        expect(indexAt(input), `boundary ${i}, input ${input}`).toBe(rationalIndex(input));
        expect(indexAt(-input), `negative input ${input}`).toBe(rationalIndex(-input));
      }
    }
  });

  it("includes exact starts and excludes exact ends without a tolerance", () => {
    // The internal rational boundaries exactly representable in binary are
    // 90, 180, and 270 degrees. Aries wraps at exactly 360 degrees.
    for (const [boundary, previous, next] of [[90, 7, 8], [180, 14, 15], [270, 21, 22], [360, 28, 1]] as const) {
      expect(indexAt(neighbor(boundary, -1))).toBe(previous);
      expect(indexAt(boundary)).toBe(next);
      expect(indexAt(neighbor(boundary, 1))).toBe(next);
    }
    expect(indexAt(0)).toBe(1);
    expect(indexAt(-0)).toBe(1);
    expect(indexAt(Number.MIN_VALUE)).toBe(1);
    expect(indexAt(-Number.MIN_VALUE)).toBe(28);
  });

  it("reduces positive and negative turns without losing near-wrap or extreme values", () => {
    for (const turns of [-1024, -2, -1, 0, 1, 2, 1024]) {
      for (const longitude of [0, 1, 45, 90, 135, 180, 225, 270, 315, 359.5]) {
        expect(indexAt(longitude + turns * 360)).toBe(indexAt(longitude));
      }
    }
    for (const longitude of [Number.MAX_VALUE, -Number.MAX_VALUE,
      Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 1e100, -1e100,
      1e-100, -1e-100, 1e-310, -1e-310, Number.MIN_VALUE, -Number.MIN_VALUE]) {
      expect(indexAt(longitude), String(longitude)).toBe(rationalIndex(longitude));
    }
  });

  it("requires a supported versioned table and finite numeric input without coercion", () => {
    for (const id of [undefined, null, "", "equal28", "equal28-aries-v2", {}, 1]) {
      expect(() => classifyLongitude(0, id as BoundaryTableId)).toThrow(RangeError);
    }
    for (const input of [undefined, null, NaN, Infinity, -Infinity, "90", 90n, {}, [], new Number(90)]) {
      expect(() => classifyLongitude(input as number, tableId)).toThrow(RangeError);
    }
    if (false) {
      // The mandatory table choice is enforced for TypeScript callers too.
      // @ts-expect-error table selection is required
      classifyLongitude(90);
      // @ts-expect-error longitude must be numeric
      classifyLongitude("90", tableId);
    }
  });

  it("returns immutable cited definitions without an engine calculation or receipt claim", () => {
    const result = classifyLongitude(90, tableId);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.table).toBe(EQUAL28_ARIES_V1);
    expect(result.mansion).toBe(EQUAL28_ARIES_V1.mansions[7]);
    expect(result).not.toHaveProperty("receipt");
    expect(result.mansion.nameSource.id).toBe("biruni-sachau-1879");
  });
});
