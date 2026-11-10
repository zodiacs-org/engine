import { describe, expect, it } from "vitest";
import { escapeText, foldContentLine, utcDateTime } from "../src/content-line.js";

describe("RFC 5545 content lines", () => {
  it("escapes TEXT punctuation, backslashes and all newline spellings", () => {
    expect(escapeText("a\\b,c;d:e\r\nf\rg\nh\t月")).toBe("a\\\\b\\,c\\;d:e\\nf\\ng\\nh\t月");
  });

  it("folds at 75 octets and includes the continuation space in the limit", () => {
    expect(foldContentLine("x".repeat(75))).toBe("x".repeat(75));
    expect(foldContentLine("x".repeat(150))).toBe(`${"x".repeat(75)}\r\n ${"x".repeat(74)}\r\n x`);
  });

  it("never splits UTF-8 characters and unfolds losslessly", () => {
    const logical = `SUMMARY:${"é月🌙".repeat(40)}`;
    const folded = foldContentLine(logical);
    expect(folded.replace(/\r\n /gu, "")).toBe(logical);
    expect(folded).toContain("\r\n ");
    for (const physical of folded.split("\r\n")) {
      expect(Buffer.byteLength(physical, "utf8")).toBeLessThanOrEqual(75);
      expect(Buffer.from(physical).toString("utf8")).toBe(physical);
    }
    expect(foldContentLine(`${"x".repeat(73)}🌙`)).toBe(`${"x".repeat(73)}\r\n 🌙`);
  });

  it.each(["\u0000", "\u0007", "\u000b", "\u000c", "\u001f", "\u007f", "\ud800", "\udfff"])(
    "rejects unsupported text %j", (bad) => {
      expect(() => escapeText(bad)).toThrow(RangeError);
      expect(() => foldContentLine(`SUMMARY:${bad}`)).toThrow(RangeError);
    }
  );

  it.each(["\n", "\r", "\r\n"])("rejects a raw line break in a logical line: %j", (breaks) => {
    expect(() => foldContentLine(`SUMMARY:hello${breaks}BEGIN:VEVENT`)).toThrow(RangeError);
  });
});

describe("canonical UTC dates", () => {
  it.each([
    ["0001-01-01T00:00:00.000Z", "00010101T000000Z"],
    ["0099-12-31T23:59:59.999Z", "00991231T235959Z"],
    ["2000-02-29T12:34:56.789Z", "20000229T123456Z"],
    ["9999-12-31T23:59:59.999Z", "99991231T235959Z"]
  ])("serializes %s at whole-second precision", (instant, expected) => {
    expect(utcDateTime(instant)).toBe(expected);
  });

  it.each([
    "2026-02-30T00:00:00.000Z", "1900-02-29T00:00:00.000Z",
    "2026-13-01T00:00:00.000Z", "2026-01-00T00:00:00.000Z",
    "2026-01-01T24:00:00.000Z", "2026-01-01T23:60:00.000Z",
    "2026-01-01T23:59:60.000Z", "0000-01-01T00:00:00.000Z",
    "+010000-01-01T00:00:00.000Z", "2026-01-01T00:00:00Z",
    "2026-01-01T00:00:00.0000Z", "2026-01-01T00:00:00.000+00:00",
    "2026-01-01", "2026-01-01T00:00:00.000", "2026-01-01t00:00:00.000z"
  ])("rejects invalid or noncanonical input %s", (instant) => {
    expect(() => utcDateTime(instant)).toThrow(RangeError);
  });
});
