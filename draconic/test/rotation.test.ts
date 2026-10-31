import { describe, expect, it } from "vitest";
import { rotateLongitude } from "../src/index.js";

describe("rotateLongitude: hand-derived synthetic chart", () => {
  // Every value and subtraction in this table is exact in binary64.
  // Derivation: test/ARITHMETIC.md. These are invented positions, not a cast.
  const cases = [
    ["chosen north node", 75.25, 0],
    ["opposite south node", 255.25, 180],
    ["synthetic Sun", 100.5, 25.25],
    ["synthetic Moon", 15, 299.75],
    ["synthetic ascendant", 350, 274.75],
    ["synthetic midheaven", 80, 4.75],
    ["synthetic house cusp", 30, 314.75]
  ] as const;

  it.each(cases)("rotates %s", (_label, natal, expected) => {
    expect(rotateLongitude(natal, 75.25)).toBe(expected);
  });

  it.each([
    [0, 0, 0],
    [359.75, 0, 359.75],
    [0, 359.75, 0.25],
    [359.75, 0.25, 359.5],
    [0.25, 359.75, 0.5],
    [180, 180, 0],
    [0, 180, 180]
  ])("rotates boundary longitude %s with node %s to %s", (natal, node, expected) => {
    expect(rotateLongitude(natal, node)).toBe(expected);
  });

  it("returns positive zero, including rounded wraparound", () => {
    expect(Object.is(rotateLongitude(-0, 0), 0)).toBe(true);
    expect(Object.is(rotateLongitude(0, -0), 0)).toBe(true);
    expect(Object.is(rotateLongitude(0, Number.MIN_VALUE), 0)).toBe(true);
  });

  it("keeps a subnormal positive longitude when there is no rotation", () => {
    expect(rotateLongitude(Number.MIN_VALUE, 0)).toBe(Number.MIN_VALUE);
  });
});

describe("rotateLongitude validation", () => {
  const invalid: unknown[] = [
    -1, -Number.MIN_VALUE, 360, 720, NaN, Infinity, -Infinity,
    null, undefined, "75.25", true, {}, []
  ];

  it.each(invalid)("rejects invalid natal longitude %s", (value) => {
    expect(() => rotateLongitude(value as number, 75.25)).toThrow(RangeError);
  });

  it.each(invalid)("rejects invalid north-node longitude %s", (value) => {
    expect(() => rotateLongitude(100.5, value as number)).toThrow(RangeError);
  });
});
