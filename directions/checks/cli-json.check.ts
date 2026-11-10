import { describe, expect, it } from "vitest";
import {
  CLI_MAX_INPUT_BYTES, CLI_MAX_JSON_DEPTH, CliJsonError, parseCliJson
} from "../src/cli-json.js";

describe("strict CLI JSON decoding", () => {
  it("exports the transport byte limit and parser depth limit", () => {
    expect(CLI_MAX_INPUT_BYTES).toBe(1_048_576);
    expect(CLI_MAX_JSON_DEPTH).toBe(64);
  });

  it("matches JSON.parse for finite values, escapes and number rounding", () => {
    const documents = [
      "null", "true", "false", "0", "-0", "0.125", "1e3", "-2.5E-4",
      "1e-999", "9007199254740993", "1.7976931348623157e308",
      '""', '"a\\\"b\\\\c\\/d\\b\\f\\n\\r\\t"',
      '"\\u0061\\uD83D\\uDE00\\ud800"', '"literal 😀 and é"',
      '"\\u0000"', "[]", "{}", '[0,true,null,"a",{},[]]',
      '{"z":1,"2":2,"1":3,"a":{"z":4},"b":[false]}',
      " \r\n\t {\"spaced\" : [ 1 , 2 ] } \t\r\n "
    ];
    for (const document of documents) {
      expect(parseCliJson(document), document).toStrictEqual(JSON.parse(document));
    }
    expect(Object.is(parseCliJson("-0"), -0)).toBe(true);
  });

  it("rejects duplicate decoded keys at every object depth", () => {
    for (const document of [
      '{"a":1,"a":2}', '{"a":1,"\\u0061":2}',
      '{"\\u0061":1,"a":2}', '{"":1,"":2}',
      '{"parent":{"a":1,"a":2}}', '[{"a":1,"a":2}]',
      '{"😀":1,"\\ud83d\\ude00":2}',
      '{"a\\nb":1,"a\\u000ab":2}',
      '{"__proto__":1,"__proto__":2}'
    ]) {
      expect(() => parseCliJson(document), document).toThrow(CliJsonError);
    }
    expect(parseCliJson('{"a":{"x":1},"b":{"x":2}}')).toEqual({ a: { x: 1 }, b: { x: 2 } });
    expect(parseCliJson('{"a":1,"A":2,"á":3,"a\\u0301":4}')).toEqual({ a: 1, A: 2, á: 3, "á": 4 });
  });

  it("creates ordinary objects with safe own properties", () => {
    const result = parseCliJson(
      '{"__proto__":{"polluted":true},"constructor":1,"toString":2}'
    ) as Record<string, unknown>;
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(result, "__proto__")).toEqual({
      value: { polluted: true }, enumerable: true, configurable: true, writable: true
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(result.constructor).toBe(1);
    expect(result.toString).toBe(2);
    expect(JSON.stringify(result)).toBe('{"__proto__":{"polluted":true},"constructor":1,"toString":2}');
  });

  it("rejects numeric overflow wherever it occurs", () => {
    for (const document of ["1e999", "-1e999", "1.7976931348623159e308", "[1e999]", '{"n":-1e999}']) {
      expect(() => parseCliJson(document)).toThrow(CliJsonError);
    }
  });

  it("rejects malformed syntax, extra content and non-JSON whitespace", () => {
    for (const document of [
      "", " ", "undefined", "NaN", "Infinity", "-Infinity", "TRUE", "NULL",
      "01", "-01", "+1", ".5", "1.", "1e", "1e+", "--1", "0x10", "1_000",
      "nullx", "true false", "{}[]", "[] trailing", "{", "[", "}", "]",
      "[,]", "[1,]", "[1,,2]", "[1 2]", "[1;2]", '{"a":1,}', '{"a":}',
      "{a:1}", "{'a':1}", '{"a" 1}', '{"a":1 "b":2}',
      '"unterminated', '"bad\\q"', '"bad\\u12xz"', '"bad\\u123"', '"bad\\',
      '"raw\nnewline"', '"raw\ttab"', '"raw\u0000control"',
      "\uFEFF{}", "{}\uFEFF", "\u00A0{}", "\v{}", "\f{}",
      "// comment\n{}", "/* comment */{}", "{/* comment */}", "{}// comment"
    ]) {
      expect(() => parseCliJson(document), JSON.stringify(document)).toThrow(CliJsonError);
    }
  });

  it("counts each object and array container toward the depth limit", () => {
    const arrayAt = (depth: number) => "[".repeat(depth) + "0" + "]".repeat(depth);
    const objectAt = (depth: number) => '{"a":'.repeat(depth) + "0" + "}".repeat(depth);
    const mixedAt = (depth: number) => {
      let document = "0";
      for (let level = 0; level < depth; level++) {
        document = level % 2 ? `[${document}]` : `{"a":${document}}`;
      }
      return document;
    };
    for (const documentAt of [arrayAt, objectAt, mixedAt]) {
      expect(parseCliJson(documentAt(CLI_MAX_JSON_DEPTH))).toStrictEqual(JSON.parse(documentAt(CLI_MAX_JSON_DEPTH)));
      expect(() => parseCliJson(documentAt(CLI_MAX_JSON_DEPTH + 1))).toThrow(CliJsonError);
      expect(() => parseCliJson(documentAt(10_000))).toThrow(CliJsonError);
    }
    expect(() => parseCliJson("[".repeat(63) + "{}" + "]".repeat(63))).not.toThrow();
    expect(() => parseCliJson("[".repeat(64) + "{}" + "]".repeat(64))).toThrow(CliJsonError);
  });

  it("emits generic errors without the submitted token or key", () => {
    for (const document of ['"private-marker" trailing', '{"private-marker":1,"private-marker":2}', '{"private-marker":1e999}']) {
      let caught: unknown;
      try { parseCliJson(document); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(CliJsonError);
      expect((caught as Error).name).toBe("CliJsonError");
      expect((caught as Error).message).toBe("Invalid CLI JSON input.");
      expect((caught as Error).cause).toBeUndefined();
    }
  });
});
