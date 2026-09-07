import { describe, expect, it } from "vitest";

import { parseReceiptJson } from "./receipt-json.js";

const LIMITS = { depth: 12, nodes: 4096 };

describe("receipt JSON preflight", () => {
  it.each([
    "null",
    "true",
    "false",
    "0",
    "-0",
    "1.2345678901234567",
    "1e-12",
    "-2.5E+3",
    "1e400",
    '"scalar"',
    '"\\uD83E\\uDE90"',
    '"\\ud800"',
    "[]",
    "{}",
    ' { "one": [true, false, null, -2.25e+3], "two": { "nested": [] } }\n',
    '{"a":1,"A":2,"é":3,"é":4}',
    '{"one":{"same":1},"two":{"same":2}}',
    '{"quote\\\"key":"escaped \\\"quote\\\"","slash\\\\key":"\\\\","control":"\\b\\f\\n\\r\\t\\/"}',
    '"literal line separator: \u2028 and paragraph separator: \u2029"',
    '{"message":"braces { } [ ] : , and \\\"schema\\\": 1, \\\"schema\\\":2 are data"}'
  ])("accepts valid JSON without changing native value semantics: %s", (json) => {
    expect(parseReceiptJson(json, LIMITS)).toEqual({ ok: true, value: JSON.parse(json) });
  });

  it.each([
    '{"schema":1,"schema":2}',
    '{"requiredFeatures":["unknown"],"requiredFeatures":[]}',
    '{"extensions":{"nested":{"a":1,"a":2}}}',
    '{"a":1,"\\u0061":2}',
    '{"\\u0061":1,"a":2}',
    '{"\\uD83E\\uDE90":1,"🪐":2}',
    '{"a\\\"b":1,"a\\u0022b":2}',
    '{"a\\\\b":1,"a\\u005Cb":2}',
    '{"\\ud800":1,"\\uD800":2}',
    '[{"valid":true},{"same":1,"same":2}]'
  ])("rejects duplicate decoded keys at every object: %s", (json) => {
    expect(parseReceiptJson(json, LIMITS)).toEqual({ ok: false, code: "invalid_json" });
  });

  it.each([
    "",
    " ",
    "undefined",
    "NaN",
    "Infinity",
    "true false",
    "nullx",
    "[truefalse]",
    "01",
    "-01",
    "+1",
    ".1",
    "1.",
    "1e",
    "1e+",
    "--1",
    "0x10",
    "[1 2]",
    "[1,]",
    "[,1]",
    "[1,,2]",
    "{,}",
    '{"a":1,}',
    '{"a" 1}',
    "{a:1}",
    '{"a":}',
    '{"a":1 "b":2}',
    '{"a":1]:2}',
    "[}",
    "{]",
    "[",
    "{",
    "{}[]",
    "'single'",
    '"unclosed',
    '"trailing\\',
    '"bad\\x20"',
    '"bad\\a"',
    '"bad\\u000"',
    '"bad\\u00GG"',
    '"raw\nnewline"',
    '"raw\ttab"',
    '"raw\u0000nul"',
    "\uFEFF{}",
    "\u00A0{}",
    "/* comment */{}",
    "{} // comment"
  ])("rejects JSON grammar near misses without raw errors: %s", (json) => {
    expect(parseReceiptJson(json, LIMITS)).toEqual({ ok: false, code: "invalid_json" });
  });

  it("counts the root and each value, but not object member names", () => {
    const json = '{"a":[1,{"b":null}]}'; // root, array, number, object, null
    expect(parseReceiptJson(json, { depth: 3, nodes: 5 }).ok).toBe(true);
    expect(parseReceiptJson(json, { depth: 3, nodes: 4 })).toEqual({
      ok: false,
      code: "complexity_limit"
    });
    expect(parseReceiptJson(json, { depth: 2, nodes: 5 })).toEqual({
      ok: false,
      code: "complexity_limit"
    });
  });

  it("allows a scalar or empty container at depth zero", () => {
    for (const json of ["null", "[]", "{}"]) {
      expect(parseReceiptJson(json, { depth: 0, nodes: 1 }).ok).toBe(true);
    }
    expect(parseReceiptJson("[null]", { depth: 0, nodes: 2 })).toEqual({
      ok: false,
      code: "complexity_limit"
    });
  });

  it("accepts the exact limits and rejects the first excess value or level", () => {
    expect(parseReceiptJson(`[${"0,".repeat(4094)}0]`, LIMITS).ok).toBe(true);
    expect(parseReceiptJson(`[${"0,".repeat(4095)}0]`, LIMITS)).toEqual({
      ok: false,
      code: "complexity_limit"
    });
    expect(parseReceiptJson("[".repeat(12) + "0" + "]".repeat(12), LIMITS).ok).toBe(true);
    expect(parseReceiptJson("[".repeat(13) + "0" + "]".repeat(13), LIMITS)).toEqual({
      ok: false,
      code: "complexity_limit"
    });
  });

  it("rejects deep input with bounded iterative state rather than exhausting the call stack", () => {
    const deep = "[".repeat(20_000) + "0" + "]".repeat(20_000);
    expect(parseReceiptJson(deep, LIMITS)).toEqual({ ok: false, code: "complexity_limit" });
  });

  it("leaves prototype-like names as native JSON data for the envelope policy to reject", () => {
    const result = parseReceiptJson(
      '{"__proto__":{"receiptPolluted":true},"constructor":null}',
      LIMITS
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected parsed JSON");
    expect(Object.getPrototypeOf(result.value)).toBe(Object.prototype);
    expect(Object.hasOwn(result.value as object, "__proto__")).toBe(true);
    expect(({} as { receiptPolluted?: boolean }).receiptPolluted).toBeUndefined();
  });

  it.each([
    { depth: -1, nodes: 1 },
    { depth: 1.5, nodes: 1 },
    { depth: Infinity, nodes: 1 },
    { depth: 1, nodes: 0 },
    { depth: 1, nodes: NaN },
    { depth: 1, nodes: 1.5 }
  ])("rejects unusable structural limits: %j", (limits) => {
    expect(parseReceiptJson("null", limits)).toEqual({ ok: false, code: "complexity_limit" });
  });
});
