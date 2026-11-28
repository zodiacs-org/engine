import { describe, expect, it } from "vitest";
import {
  createDirectionConvention,
  parseDirectionConvention,
  type DirectionConvention,
  type DirectionMotion,
  type TimingKey
} from "../src/index.js";

const zodiacal = {
  system: "placidus-semiarc",
  mode: "zodiacal",
  motion: "direct",
  latitude: "zero-both",
  key: "ptolemy"
} as const satisfies DirectionConvention;

describe("explicit direction conventions", () => {
  const modes = [
    { mode: "zodiacal", latitude: "zero-both" },
    { mode: "mundane", latitude: "retain-both" }
  ] as const;
  const motions: readonly DirectionMotion[] = ["direct", "converse"];
  const keys: readonly TimingKey[] = ["ptolemy", "naibod", "solar-equatorial-birth-day"];
  for (const mode of modes) {
    for (const motion of motions) {
      for (const key of keys) {
        it(`preserves explicit ${mode.mode}, ${motion}, ${key} choices`, () => {
          const direction = motion === "direct"
            ? { motion } as const
            : { motion, converseConstruction: "placidus-role-swap" } as const;
          const input = { system: "placidus-semiarc", ...mode, ...direction, key } as const;
          const result = createDirectionConvention(input);
          expect(result).toEqual(input);
          expect(result).not.toBe(input);
          expect(Object.isFrozen(result)).toBe(true);
          expect(parseDirectionConvention(JSON.parse(JSON.stringify(result)))).toEqual(result);
        });
      }
    }
  }

  for (const field of Object.keys(zodiacal)) {
    it(`never defaults a missing or empty ${field}`, () => {
      const input: Record<string, unknown> = { ...zodiacal };
      delete input[field];
      expect(() => parseDirectionConvention(input)).toThrow(RangeError);
      for (const invalid of [undefined, null, "", "DIRECT", 0, false]) {
        expect(() => parseDirectionConvention({ ...input, [field]: invalid })).toThrow(RangeError);
      }
    });
  }

  it("rejects unimplemented systems, latitude treatments and modes", () => {
    for (const change of [
      { system: "regiomontanus" },
      { mode: "solar-arc" },
      { mode: "zodiacal", latitude: "retain-both" },
      { mode: "mundane", latitude: "zero-both" },
      { latitude: "promissor-only" },
      { key: "mean-solar-longitude" }
    ]) {
      expect(() => parseDirectionConvention({ ...zodiacal, ...change })).toThrow(RangeError);
    }
  });

  it("rejects unknown toggles instead of losing them in a copy", () => {
    expect(() => parseDirectionConvention({ ...zodiacal, secondaryMotion: true })).toThrow(RangeError);
    expect(() => parseDirectionConvention({ ...zodiacal, [Symbol("mode")]: "mundane" })).toThrow(RangeError);
  });

  it("requires the converse construction and rejects a silent reversal of rotation", () => {
    for (const converseConstruction of [undefined, null, "", "reverse-rotation", false]) {
      expect(() => parseDirectionConvention({
        ...zodiacal, motion: "converse", converseConstruction
      })).toThrow(RangeError);
    }
    expect(() => parseDirectionConvention({ ...zodiacal, motion: "converse" })).toThrow(RangeError);
    expect(() => parseDirectionConvention({
      ...zodiacal, converseConstruction: "placidus-role-swap"
    })).toThrow(RangeError);
  });

  it("accepts data objects but refuses inherited choices and accessor slots", () => {
    const nullPrototype: unknown = Object.assign(Object.create(null), zodiacal);
    expect(parseDirectionConvention(nullPrototype)).toEqual(zodiacal);
    expect(() => parseDirectionConvention(Object.create(zodiacal))).toThrow(RangeError);
    let getterCalls = 0;
    const accessor = { ...zodiacal };
    Object.defineProperty(accessor, "mode", { get() { getterCalls++; return "zodiacal"; } });
    expect(() => parseDirectionConvention(accessor)).toThrow(RangeError);
    expect(getterCalls).toBe(0);
    const hidden = { ...zodiacal };
    Object.defineProperty(hidden, "mode", { enumerable: false });
    expect(() => parseDirectionConvention(hidden)).toThrow(RangeError);
  });

  it("rejects non-object values", () => {
    for (const value of [undefined, null, true, 1, "zodiacal", [], new Date(0)]) {
      expect(() => parseDirectionConvention(value)).toThrow(RangeError);
    }
  });

  it("keeps a snapshot without freezing or changing the caller's object", () => {
    const input: Record<string, unknown> = { ...zodiacal };
    const result = parseDirectionConvention(input);
    input.motion = "converse";
    expect(result.motion).toBe("direct");
    expect(Object.isFrozen(input)).toBe(false);
    expect(() => Object.assign(result, { motion: "converse" })).toThrow(TypeError);
  });
});
