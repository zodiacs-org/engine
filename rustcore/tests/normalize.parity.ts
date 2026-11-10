import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import { normalizeLongitude as reference } from "../../src/signs.js";
import { initRustCore, normalizeLongitude } from "../ts/index.js";
import { normalizeLongitude as rawWasm } from "../pkg/zodiacs_rustcore.js";

beforeAll(() => {
  initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url)));
});

function bits(value: number): bigint {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  return view.getBigUint64(0, false);
}

describe("normalizeLongitude through the built WASM module", () => {
  it("retains the TypeScript function signature", () => {
    expectTypeOf(normalizeLongitude).toEqualTypeOf<typeof reference>();
  });

  it("matches finite boundaries bit for bit, including positive zero", () => {
    const cases = [
      0, -0, 1, -1, 30, -30, 180, -180, 360, -360, 720, -720,
      0.1, -0.1, 359.99999999999994, 360.00000000000006,
      -359.99999999999994, -360.00000000000006,
      Number.MIN_VALUE, -Number.MIN_VALUE, Number.EPSILON, -Number.EPSILON,
      Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER,
      Number.MAX_VALUE, -Number.MAX_VALUE
    ];
    for (const input of cases) {
      expect(bits(normalizeLongitude(input)), `input=${input}`).toBe(bits(reference(input)));
    }
    expect(Object.is(normalizeLongitude(-0), 0)).toBe(true);
    // Preserve the reference's rounding when a tiny negative value is added
    // to a full turn. A mathematically rearranged remainder need not agree.
    expect(normalizeLongitude(-Number.MIN_VALUE)).toBe(0);
  });

  it("matches a deterministic corpus across binary64 magnitudes", () => {
    let seed = 0x7a6f6469;
    const next = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed >>> 0;
    };
    const view = new DataView(new ArrayBuffer(8));
    for (let sample = 0; sample < 8192; sample++) {
      view.setUint32(0, next(), false);
      view.setUint32(4, next(), false);
      const input = view.getFloat64(0, false);
      if (!Number.isFinite(input)) continue;
      expect(bits(normalizeLongitude(input)), `sample=${sample}, input=${input}`).toBe(bits(reference(input)));
    }
  });

  it.each([NaN, Infinity, -Infinity])("rejects %s with the reference RangeError", (input) => {
    for (const implementation of [reference, normalizeLongitude, rawWasm]) {
      expect(() => implementation(input)).toThrow(RangeError);
      expect(() => implementation(input)).toThrow("Longitude must be finite.");
    }
  });

  it("does not coerce non-number JavaScript inputs at the wrapper boundary", () => {
    const inputs: unknown[] = [undefined, null, true, "15", 15n, Symbol("synthetic"), [], {},
      { valueOf() { throw new Error("Must not coerce caller data"); } }];
    for (const input of inputs) {
      for (const implementation of [reference, normalizeLongitude]) {
        expect(() => implementation(input as number)).toThrow(RangeError);
        expect(() => implementation(input as number)).toThrow("Longitude must be finite.");
      }
    }
  });
});
