import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import * as signs from "../../src/signs.js";
import { separation } from "../../src/aspects.js";
import { advance, signedDelta, wrap360 } from "../../src/window-ranges.js";
import { antiscion, contraAntiscion, midpoint } from "../../src/points.js";
import * as rust from "../ts/index.js";
import { binary64Samples, expectSameNumberCall, neighbors } from "./parity-helpers.js";

beforeAll(() => {
  rust.initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url)));
});

const unaryPairs = [
  ["normalizeLongitude", rust.normalizeLongitude, signs.normalizeLongitude],
  ["signIndexForLongitude", rust.signIndexForLongitude, signs.signIndexForLongitude],
  ["degreeInSign", rust.degreeInSign, signs.degreeInSign],
  ["wrap360", rust.wrap360, wrap360],
  ["antiscion", rust.antiscion, antiscion],
  ["contraAntiscion", rust.contraAntiscion, contraAntiscion]
] as const;

const binaryPairs = [
  ["separation", rust.separation, separation],
  ["signedDelta", rust.signedDelta, signedDelta],
  ["advance", rust.advance, advance],
  ["midpoint", rust.midpoint, midpoint]
] as const;

const boundaries = [
  ...Array.from({ length: 73 }, (_, index) => (index - 36) * 30).flatMap(neighbors),
  0.1, -0.1, Number.EPSILON, -Number.EPSILON,
  Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, -Number.MAX_VALUE
];

describe("angular and sign helpers through WASM", () => {
  it("retains the TypeScript function signatures", () => {
    expectTypeOf(rust.signIndexForLongitude).toEqualTypeOf<typeof signs.signIndexForLongitude>();
    expectTypeOf(rust.degreeInSign).toEqualTypeOf<typeof signs.degreeInSign>();
    expectTypeOf(rust.signForLongitude).toEqualTypeOf<typeof signs.signForLongitude>();
    expectTypeOf(rust.separation).toEqualTypeOf<typeof separation>();
    expectTypeOf(rust.wrap360).toEqualTypeOf<typeof wrap360>();
    expectTypeOf(rust.signedDelta).toEqualTypeOf<typeof signedDelta>();
    expectTypeOf(rust.advance).toEqualTypeOf<typeof advance>();
    expectTypeOf(rust.antiscion).toEqualTypeOf<typeof antiscion>();
    expectTypeOf(rust.contraAntiscion).toEqualTypeOf<typeof contraAntiscion>();
    expectTypeOf(rust.midpoint).toEqualTypeOf<typeof midpoint>();
  });

  it("preserves frozen sign tables, aliases and sign object identity", () => {
    for (const key of ["ELEMENTS", "MODALITIES", "SIGNS", "SIGN_SLUGS", "SIGN_NAMES"] as const) {
      expect(rust[key]).toEqual(signs[key]);
      expect(Object.isFrozen(rust[key]), key).toBe(true);
    }
    expect(rust.SIGN_NAMES).toBe(rust.SIGN_SLUGS);
    for (const sign of rust.SIGNS) expect(Object.isFrozen(sign)).toBe(true);
    for (const longitude of boundaries) {
      const result = rust.signForLongitude(longitude);
      expect(result).toEqual(signs.signForLongitude(longitude));
      expect(result).toBe(rust.SIGNS[signs.signIndexForLongitude(longitude)]);
    }
  });

  it("matches every sign boundary and adjacent doubles bit for bit", () => {
    for (const input of boundaries) {
      for (const [name, implementation, reference] of unaryPairs) {
        expectSameNumberCall(() => implementation(input), () => reference(input), `${name}(${input})`);
      }
    }
  });

  it("preserves binary helper order at wraps, opposition ties and advance thresholds", () => {
    const bases = [0, -0, -360, 360, -721, 721, 188.86, 98.86, 7.6999999999999895, 359.7];
    for (const first of bases) {
      for (const second of boundaries) {
        for (const [name, implementation, reference] of binaryPairs) {
          expectSameNumberCall(() => implementation(first, second), () => reference(first, second), `${name}(${first}, ${second})`);
          expectSameNumberCall(() => implementation(second, first), () => reference(second, first), `${name}(${second}, ${first})`);
        }
      }
    }
  });

  it("matches seeded binary64 magnitudes, including intermediate overflow", () => {
    const inputs = [...binary64Samples(4096, 0x616e676c), Number.MAX_VALUE, -Number.MAX_VALUE];
    for (let index = 0; index < inputs.length; index++) {
      const first = inputs[index]!;
      const second = inputs[(index + 1) % inputs.length]!;
      for (const [name, implementation, reference] of unaryPairs) {
        expectSameNumberCall(() => implementation(first), () => reference(first), `${name}, sample=${index}`);
      }
      for (const [name, implementation, reference] of binaryPairs) {
        expectSameNumberCall(() => implementation(first, second), () => reference(first, second), `${name}, sample=${index}`);
      }
    }
  });

  it("retains NaN and Infinity behavior of each numeric helper", () => {
    for (const first of [NaN, Infinity, -Infinity]) {
      for (const [name, implementation, reference] of unaryPairs) {
        expectSameNumberCall(() => implementation(first), () => reference(first), `${name}(${first})`);
      }
      for (const second of [0, -0, NaN, Infinity, -Infinity]) {
        for (const [name, implementation, reference] of binaryPairs) {
          expectSameNumberCall(() => implementation(first, second), () => reference(first, second), `${name}(${first}, ${second})`);
          expectSameNumberCall(() => implementation(second, first), () => reference(second, first), `${name}(${second}, ${first})`);
        }
      }
    }
  });

  it("rejects non-number sign inputs without coercion", () => {
    const inputs: unknown[] = [undefined, null, true, false, "30", 30n, Symbol("synthetic"), [], {},
      { valueOf() { throw new Error("Caller coercion must not run"); } }];
    for (const input of inputs) {
      for (const key of ["normalizeLongitude", "signIndexForLongitude", "degreeInSign", "signForLongitude"] as const) {
        const reference = () => signs[key](input as number);
        const implementation = () => rust[key](input as number);
        expect(reference).toThrow(new RangeError("Longitude must be finite."));
        expect(implementation).toThrow(new RangeError("Longitude must be finite."));
      }
    }
  });
});
