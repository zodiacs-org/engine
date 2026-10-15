import { describe, expect, it } from "vitest";
import { JsonSerializationError, JSON_LIMITS, serializeJson } from "../src/json.js";
import type { JsonSerializationFailure, JsonSerializationOptions } from "../src/json.js";

function refuses(value: unknown, code: JsonSerializationFailure, options?: JsonSerializationOptions) {
  try { serializeJson(value, options); throw new Error("Expected bounded JSON refusal"); }
  catch (error) {
    expect(error).toBeInstanceOf(JsonSerializationError);
    expect((error as JsonSerializationError).code).toBe(code);
  }
}

describe("deterministic bounded JSON transport", () => {
  it("sorts object keys recursively, preserves arrays, and never rounds finite numbers", () => {
    const value = { z: [3, { b: 0.12345678901234568, a: -0 }], a: { "2": 2, "10": 10 } };
    const text = serializeJson(value);
    expect(text).toBe('{"a":{"10":10,"2":2},"z":[3,{"a":0,"b":0.12345678901234568}]}');
    expect(serializeJson({ a: value.a, z: value.z })).toBe(text);
    expect(JSON.parse(text).z[1].b).toBe(value.z[1] && (value.z[1] as { b: number }).b);
    expect(Object.is(JSON.parse(text).z[1].a, -0)).toBe(false);
    expect(serializeJson(Object.assign(Object.create(null) as object, { b: 2, a: 1 })))
      .toBe('{"a":1,"b":2}');
  });

  it("escapes control characters and unpaired surrogates without corrupting Unicode", () => {
    const value = { text: '\u0000\b\f\n\r\t"\\\u2028\u2029é星🌙\ud800\udc00\ud800x\udc00' };
    const text = serializeJson(value);
    expect(JSON.parse(text)).toEqual(value);
    expect(text).toContain("\\u0000");
    expect(text).toContain("\\ud800x\\udc00");
    expect(serializeJson(value)).toBe(text);
  });

  it("enforces exact UTF-8 byte bounds, including escape expansion", () => {
    for (const value of ["a", "é", "🌙", "\u0000", "\ud800", { "é🌙": [1, true, null] }]) {
      const text = serializeJson(value);
      const bytes = Buffer.byteLength(text, "utf8");
      expect(serializeJson(value, { maxBytes: bytes })).toBe(text);
      refuses(value, "byte-limit", { maxBytes: bytes - 1 });
    }
    expect(JSON_LIMITS.maxBytes).toBeLessThan(2_000_000);
    const biggest = "x".repeat(JSON_LIMITS.maxBytes - 2);
    expect(Buffer.byteLength(serializeJson(biggest))).toBe(JSON_LIMITS.maxBytes);
    refuses(biggest + "x", "byte-limit");
    refuses("\u0000".repeat(JSON_LIMITS.maxBytes), "byte-limit");
  });

  it("bounds nesting, repeated references and collection size", () => {
    expect(serializeJson({ a: { b: null } }, { maxDepth: 2 })).toBe('{"a":{"b":null}}');
    refuses({ a: { b: null } }, "depth-limit", { maxDepth: 1 });
    const shared = { a: true };
    expect(serializeJson([shared, shared])).toBe('[{"a":true},{"a":true}]');
    expect(serializeJson([shared, shared], { maxNodes: 5 })).toBe('[{"a":true},{"a":true}]');
    refuses([shared, shared], "node-limit", { maxNodes: 4 });
    refuses(Array(1_000_000), "node-limit");
    refuses(Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`key${i}`, 0])), "node-limit", { maxNodes: 10 });
    refuses({ ["x".repeat(1000)]: null }, "byte-limit", { maxBytes: 20 });
  });

  it.each([undefined, NaN, Infinity, -Infinity, 1n, Symbol("private"), () => 1,
    new Date(0), new Map(), new Set(), new Uint8Array([1]), /x/, new Number(1),
    { a: undefined }, [undefined], Array(1), { [Symbol("key")]: 1 },
    Object.assign([1], { extra: true })].map((value) => ({ value })))("refuses unsupported data without silently dropping it %#", ({ value }) => {
    refuses(value, "unsupported-value");
  });

  it("refuses cycles and does not execute getters or serialization hooks", () => {
    const cyclic: { child?: unknown } = {};
    cyclic.child = cyclic;
    refuses(cyclic, "circular-value");
    let calls = 0;
    refuses({ get private() { calls++; return "do-not-echo"; } }, "unsupported-value");
    refuses({ toJSON() { calls++; return "do-not-echo"; } }, "unsupported-value");
    const array = [0];
    Object.defineProperty(array, "0", { get() { calls++; return 0; } });
    refuses(array, "unsupported-value");
    expect(calls).toBe(0);
    try { serializeJson({ "do-not-echo": NaN }); }
    catch (error) { expect(String(error)).not.toContain("do-not-echo"); }
  });

  it.each([null, [], new Date(), { extra: 1 }, { maxBytes: null }, { maxBytes: 0 }, { maxBytes: Infinity },
    { maxBytes: JSON_LIMITS.maxBytes + 1 }, { maxDepth: 1.5 }, { maxDepth: 65 }, { maxNodes: -1 },
    { maxNodes: 100_001 }, { [Symbol("unknown")]: true }].map((options) => ({ options })))("validates all transport limits %#", ({ options }) => {
    expect(() => serializeJson(null, options as JsonSerializationOptions)).toThrow(RangeError);
  });

  it("captures each own transport limit once and ignores inherited limits", () => {
    let reads = 0;
    expect(serializeJson(null, { get maxBytes() { reads++; return reads === 1 ? 4 : 1; } })).toBe("null");
    expect(reads).toBe(1);
    expect(serializeJson(null, Object.create({ maxBytes: 1 }) as JsonSerializationOptions)).toBe("null");
  });
});
