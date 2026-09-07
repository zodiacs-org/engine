import { describe, expect, it } from "vitest";

import { moonPhase, natalChart, positions, saturnReturn, synastry, transits } from "./index.js";
import type { BirthInput, DateInput } from "./types.js";

describe("public resolved-instant inputs", () => {
  const invalid: [string, unknown][] = [
    ["non-leap February 29", "2023-02-29"],
    ["century non-leap February 29", "1900-02-29"],
    ["February 30", "2024-02-30T12:00:00Z"],
    ["April 31", "2024-04-31T12:00:00+07:00"],
    ["zero month", "2024-00-01"],
    ["month 13", "2024-13-01"],
    ["zero day", "2024-01-00"],
    ["day 32", "2024-01-32"],
    ["24:00 rollover", "2024-02-29T24:00:00Z"],
    ["minute 60", "2024-02-29T12:60:00Z"],
    ["leap second", "2016-12-31T23:59:60Z"],
    ["unresolved local date-time", "2024-11-03T01:30:00"],
    ["unresolved local minutes", "2024-03-10T02:30"],
    ["offset hour 24", "2024-02-29T12:00:00+24:00"],
    ["offset minute 60", "2024-02-29T12:00:00+01:60"],
    ["compact offset", "2024-02-29T12:00:00+0700"],
    ["sub-millisecond precision", "2024-02-29T12:00:00.0001Z"],
    ["empty fraction", "2024-02-29T12:00:00.Z"],
    ["fractional minute", "2024-02-29T12:00.5Z"],
    ["slash date", "02/29/2024"],
    ["English date", "February 29, 2024"],
    ["space separator", "2024-02-29 12:00:00Z"],
    ["partial date", "2024-02"],
    ["non-padded date", "2024-2-9"],
    ["leading whitespace", " 2024-02-29"],
    ["trailing newline", "2024-02-29\n"],
    ["negative zero year", "-000000-02-29T12:00:00Z"],
    ["empty string", ""],
    ["null", null],
    ["boolean", false],
    ["undefined", undefined],
    ["date array", [2024, 2, 29]],
    ["coercible object", { valueOf: () => 0 }],
    ["boxed timestamp", new Number(0)],
    ["NaN", NaN],
    ["positive infinity", Infinity],
    ["negative infinity", -Infinity],
    ["unrepresentable timestamp", 8_640_000_000_000_001],
    ["invalid Date", new Date(NaN)]
  ];

  it.each(invalid)("rejects %s before calculating", (_label, input) => {
    expect(() => positions(input as DateInput)).toThrow(RangeError);
  });

  it.each([
    ["2000-02-29", "2000-02-29T00:00:00.000Z"],
    ["2024-02-29T12:00Z", "2024-02-29T12:00:00.000Z"],
    ["2024-02-29T12:00:00.1Z", "2024-02-29T12:00:00.100Z"],
    ["2024-02-29T12:00:00.12+00:00", "2024-02-29T12:00:00.120Z"],
    ["2024-02-29T12:00:00-00:00", "2024-02-29T12:00:00.000Z"],
    ["2024-02-29T12:00:00.123Z", "2024-02-29T12:00:00.123Z"],
    ["2024-03-01T00:15:00+05:45", "2024-02-29T18:30:00.000Z"],
    ["2023-12-31T23:30:00-01:00", "2024-01-01T00:30:00.000Z"],
    ["0099-01-01T00:00:00Z", "0099-01-01T00:00:00.000Z"],
    ["0000-02-29T00:00:00Z", "0000-02-29T00:00:00.000Z"],
    ["-000001-01-01T00:00:00Z", "-000001-01-01T00:00:00.000Z"]
  ])("resolves %s without calendar or century coercion", (input, expected) => {
    expect(moonPhase(input).at.toISOString()).toBe(expected);
  });

  it("keeps Date and epoch milliseconds equivalent without mutating the Date", () => {
    const source = new Date("2024-02-29T12:00:00.123Z");
    const timestamp = source.getTime();
    const fromDate = moonPhase(source);
    const fromNumber = moonPhase(timestamp);
    expect(fromDate).toEqual(fromNumber);
    expect(fromDate.at).not.toBe(source);
    expect(source.getTime()).toBe(timestamp);
  });

  const invalidCalendar = "2024-02-30T12:00:00Z";
  it.each([
    ["natalChart", () => natalChart({ utc: invalidCalendar })],
    ["moonPhase", () => moonPhase(invalidCalendar)],
    ["transits instant", () => transits({ utc: "2024-02-29" }, invalidCalendar)],
    ["transits birth", () => transits({ utc: invalidCalendar }, "2024-02-29")],
    ["synastry birth", () => synastry({ utc: "2024-02-29" }, { utc: invalidCalendar })],
    ["saturnReturn instant", () => saturnReturn(invalidCalendar)],
    ["saturnReturn birth", () => saturnReturn({ utc: invalidCalendar })]
  ])("uses the same rejection contract in %s", (_label, calculate) => {
    expect(calculate).toThrow(RangeError);
  });
});

describe("public birth settings", () => {
  it.each(["equal", "Placidus", "", 0, false, null, {}])(
    "rejects unsupported house system %j even without coordinates",
    (houseSystem) => {
      expect(() => natalChart({ utc: "2024-02-29", houseSystem } as BirthInput)).toThrow(
        /houseSystem/
      );
    }
  );

  it.each(["false", "true", 0, 1, null, [], {}])("rejects nonboolean timeKnown %j", (timeKnown) => {
    expect(() => natalChart({ utc: "2024-02-29", timeKnown } as BirthInput)).toThrow(/timeKnown/);
  });

  it("preserves defaults, explicit house systems, and unknown birth time", () => {
    expect(natalChart({ utc: "2024-02-29" }).input).toMatchObject({
      houseSystem: "whole",
      timeKnown: true
    });
    const unknown = natalChart({
      utc: "2024-02-29",
      latitude: 40,
      longitude: -74,
      houseSystem: "placidus",
      timeKnown: false
    });
    expect(unknown.input.houseSystem).toBe("placidus");
    expect(unknown.houses).toBeNull();
    expect(unknown.angles).toBeNull();
    expect(unknown.flags).toContain("no-time");
  });

  it("validates birth settings even when Saturn returns do not use houses", () => {
    expect(() =>
      saturnReturn({ utc: "2024-02-29", timeKnown: "false" } as unknown as BirthInput)
    ).toThrow(/timeKnown/);
    expect(() =>
      saturnReturn({ utc: "2024-02-29", houseSystem: "equal" } as unknown as BirthInput)
    ).toThrow(/houseSystem/);
  });

  it.each([
    ["transits", (chart: ReturnType<typeof natalChart>) => transits(chart, "2024-02-29")],
    ["synastry", (chart: ReturnType<typeof natalChart>) => synastry(chart, chart)],
    ["saturnReturn", (chart: ReturnType<typeof natalChart>) => saturnReturn(chart)]
  ])("validates the instant and settings when %s reuses a chart", (_label, calculate) => {
    const chart = natalChart({ utc: "2024-02-29" });
    chart.input.utc = new Date(NaN);
    expect(() => calculate(chart)).toThrow(RangeError);
    chart.input.utc = new Date("2024-02-29T00:00:00Z");
    Object.assign(chart.input, { timeKnown: "false" });
    expect(() => calculate(chart)).toThrow(/timeKnown/);
  });
});
