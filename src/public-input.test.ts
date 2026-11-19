import { describe, expect, it } from "vitest";

import { resolveBirth } from "./geo.js";
import { chartPoints, moonPhase, natalChart, positions, progressedInstant, saturnReturn, synastry, transits } from "./index.js";
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
    // The mapping is arithmetic, so it shows the resolved instant at any date.
    expect(progressedInstant(input, input).toISOString()).toBe(expected);
    // The ephemeris evaluates only EPHEMERIS_SPAN (years 1 to 3998) and refuses the rest.
    const year = Number(expected.slice(0, expected.indexOf("-", 1)));
    if (year >= 2) expect(moonPhase(input).at.toISOString()).toBe(expected);
    else expect(() => moonPhase(input)).toThrow(/outside the ephemeris span/);
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
  it.each(["gauquelin", "Placidus", "Koch", "", 0, false, null, {}])(
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
    expect(natalChart({ utc: "2024-02-29T00:00:00Z" }).input).toMatchObject({
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

  it("refuses a calendar date with no time unless the birth time is declared unknown", () => {
    const refusal = /calendar date with no time.*timeKnown: false/;
    // Synthetic dates. A bare date reads as 00:00 UTC, which is not a birth time anyone gave.
    expect(() => natalChart({ utc: "1990-05-03" })).toThrow(RangeError);
    expect(() => natalChart({ utc: "1990-05-03" })).toThrow(refusal);
    expect(() => natalChart({ utc: "1990-05-03", timeKnown: true })).toThrow(refusal);
    expect(() => natalChart({ utc: "1990-05-03", latitude: 40, longitude: -74 })).toThrow(refusal);
    expect(() => transits({ utc: "1990-05-03" }, "2024-02-29T00:00:00Z")).toThrow(refusal);
    expect(() => synastry({ utc: "1990-05-03T08:30:00+02:00" }, { utc: "1991-07-09" })).toThrow(refusal);
    expect(() => saturnReturn({ utc: "1990-05-03" })).toThrow(refusal);
    expect(() => chartPoints({ utc: "1990-05-03", latitude: 40, longitude: -74 })).toThrow(refusal);
    expect(() => natalChart({ utc: "+001990-05-03" })).toThrow(refusal);
    expect(() => natalChart({ utc: "1990-05-03", timeScale: "tt" })).toThrow(refusal);
    // saturnReturn refuses a bare date given in place of a birth as it refuses one given as a birth's utc.
    expect(() => saturnReturn("1990-05-03")).toThrow(RangeError);
    expect(() => saturnReturn("1990-05-03")).toThrow(/calendar date with no time.*timeKnown: false/);
    expect(() => saturnReturn("+001990-05-03")).toThrow(/calendar date with no time/);
    // The date's own checks and the ephemeris span come first, with their own messages.
    for (const invalid of ["hello", "1990-02-30"]) {
      expect(() => saturnReturn(invalid), invalid).toThrow(RangeError);
      expect(() => saturnReturn(invalid), invalid).not.toThrow(/calendar date with no time/);
    }
    expect(() => saturnReturn("3950-01-01")).toThrow(/^The instant is outside the ephemeris span/);
    expect(saturnReturn({ utc: "1990-05-03", timeKnown: false }).seasons).toEqual(saturnReturn("1990-05-03T00:00:00Z").seasons);
    expect(saturnReturn({ utc: "1990-05-03", timeKnown: false }).ephemeris).toBeTypeOf("string");

    const untimed = natalChart({ utc: "1990-05-03", timeKnown: false });
    expect(untimed.input.timeKnown).toBe(false);
    expect(untimed.input.utc.toISOString()).toBe("1990-05-03T00:00:00.000Z");
    expect(untimed.flags).toContain("no-time");
    expect(untimed.houses).toBeNull();

    // A full instant, a Date and an epoch number say which instant is meant and are read as before.
    for (const utc of ["1990-05-03T00:00:00Z", "1990-05-03T08:30:00+02:00", new Date("1990-05-03T00:00:00Z"), Date.UTC(1990, 4, 3)]) {
      expect(natalChart({ utc }).input.timeKnown).toBe(true);
    }
  });

  it("validates birth settings even when Saturn returns do not use houses", () => {
    expect(() =>
      saturnReturn({ utc: "2024-02-29", timeKnown: "false" } as unknown as BirthInput)
    ).toThrow(/timeKnown/);
    expect(() =>
      saturnReturn({ utc: "2024-02-29", houseSystem: "gauquelin" } as unknown as BirthInput)
    ).toThrow(/houseSystem/);
  });

  it.each([
    ["transits", (chart: ReturnType<typeof natalChart>) => transits(chart, "2024-02-29")],
    ["synastry", (chart: ReturnType<typeof natalChart>) => synastry(chart, chart)],
    ["saturnReturn", (chart: ReturnType<typeof natalChart>) => saturnReturn(chart)]
  ])("validates the instant and settings when %s reuses a chart", (_label, calculate) => {
    const chart = natalChart({ utc: "2024-02-29T00:00:00Z" });
    chart.input.utc = new Date(NaN);
    expect(() => calculate(chart)).toThrow(RangeError);
    chart.input.utc = new Date("2024-02-29T00:00:00Z");
    Object.assign(chart.input, { timeKnown: "false" });
    expect(() => calculate(chart)).toThrow(/timeKnown/);
  });
});

describe("near-miss birth keys", () => {
  // Synthetic birth data. The table is the refused list, name for name: a name
  // dropped from the engine's list fails its row here.
  const utc = "2000-01-01T12:00:00Z";
  const nearMiss: [string, string][] = [
    ["lat", "latitude"],
    ["lng", "longitude"],
    ["lon", "longitude"],
    ["long", "longitude"],
    ["house", "houseSystem"],
    ["houses", "houseSystem"],
    ["hsys", "houseSystem"],
    ["housesystem", "houseSystem"],
    ["scale", "timeScale"],
    ["time_scale", "timeScale"],
    ["delta_t", "deltaT"],
    ["time_known", "timeKnown"],
    ["unknownTime", "timeKnown"]
  ];
  const fields = ["utc", "timeScale", "latitude", "longitude", "houseSystem", "timeKnown", "flags", "deltaT"];

  it.each(nearMiss)("refuses %j and names %j", (key, field) => {
    const birth = { utc, latitude: 0, longitude: 0, [key]: 1 } as never;
    expect(() => natalChart(birth)).toThrow(RangeError);
    expect(() => natalChart(birth)).toThrow(`"${field}"`);
    expect(() => natalChart(birth)).toThrow(`birth has no field "${key}"`);
    // In any letter case.
    const upper = { utc, [key.toUpperCase()]: 1 } as never;
    expect(() => natalChart(upper)).toThrow(RangeError);
    expect(() => natalChart(upper)).toThrow(`"${field}"`);
  });

  it("names the right field for the first-time call with lat and lng", () => {
    expect(() => natalChart({ utc, lat: 51.5, lng: -0.12 } as never)).toThrow(
      'birth has no field "lat"; use "latitude".'
    );
    expect(() => natalChart({ utc, Lat: 1, LNG: 2 } as never)).toThrow(/"Lat".*"latitude"/);
    expect(() => natalChart({ utc, LNG: 2 } as never)).toThrow('birth has no field "LNG"; use "longitude".');
    expect(() => natalChart({ utc, long: 2 } as never)).toThrow('birth has no field "long"; use "longitude".');
    // Refused even beside the real field.
    expect(() => natalChart({ utc, latitude: 1, longitude: 2, lat: 1 } as never)).toThrow(/use "latitude"/);
    // Every real field, each the near-miss of its own lower-case spelling, is still taken.
    const real = { utc, latitude: 1, longitude: 2, houseSystem: "koch", timeScale: "tt", deltaT: 64, timeKnown: true } as const;
    expect(natalChart(real).input.houseSystem).toBe("koch");
  });

  it("keeps the letter-case message for timescale, character for character", () => {
    expect(() => natalChart({ utc, latitude: 0, longitude: 0, timescale: "tt" } as never)).toThrow(
      new RangeError('birth has no field "timescale"; field names are case-sensitive: "timeScale".')
    );
    expect(() => natalChart({ utc, housesystem: "koch" } as never)).toThrow(
      new RangeError('birth has no field "housesystem"; field names are case-sensitive: "houseSystem".')
    );
  });

  it("refuses lat in every function that takes a birth", () => {
    const lat = { utc, lat: 51.5, lng: -0.12 } as never;
    const birth = { utc, latitude: 51.5, longitude: -0.12 };
    const refusal = 'birth has no field "lat"; use "latitude".';
    expect(() => natalChart(lat)).toThrow(refusal);
    expect(() => transits(lat, "2024-02-29T00:00:00Z")).toThrow(refusal);
    expect(() => synastry(lat, birth)).toThrow(refusal);
    expect(() => synastry(birth, lat)).toThrow(refusal);
    expect(() => chartPoints(lat)).toThrow(refusal);
    expect(() => saturnReturn(lat)).toThrow(refusal);
  });

  it("ignores a caller's other columns, as before", () => {
    const birth = { utc, latitude: 51.5, longitude: -0.12 };
    const chart = natalChart(birth);
    expect(chart.angles).not.toBeNull();
    expect(natalChart({ ...birth, id: 7, name: "x", notes: "y" } as never)).toEqual(chart);
    expect(natalChart({ ...birth, date: "2000-01-01", timezone: "Europe/Paris", dt: 5 } as never)).toEqual(chart);
    expect(natalChart({ ...birth, location: "Paris", city: "Paris", label: "x" } as never)).toEqual(chart);
    // A near-miss name on the prototype is not the caller's own key.
    const inherited = Object.assign(Object.create({ lat: 1, lng: 2 }) as object, birth);
    expect(natalChart(inherited as never)).toEqual(chart);
  });

  it("ignores 500 random keys that are neither a field nor a near-miss name (fixed seed)", () => {
    // mulberry32, seed 284.
    let seed = 284;
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const taken = new Set([...nearMiss.map(([key]) => key), ...fields].map((name) => name.toLowerCase()));
    const birth = { utc, latitude: 51.5, longitude: -0.12, houseSystem: "placidus" as const };
    const chart = natalChart(birth);
    let checked = 0;
    while (checked < 500) {
      const length = 1 + Math.floor(random() * 12);
      let key = "";
      for (let i = 0; i < length; i++) key += letters[Math.floor(random() * letters.length)];
      if (taken.has(key.toLowerCase())) continue;
      expect(natalChart({ ...birth, [key]: key } as never), key).toEqual(chart);
      checked++;
    }
  });

  it("keeps utc's message for a chart read back from JSON, as on main", () => {
    // A stored chart has a top-level `houses` but no top-level utc: utc is checked first.
    const stored = JSON.parse(JSON.stringify(natalChart({ utc, latitude: 51.5, longitude: -0.12 }))) as never;
    const message =
      "birth.utc must be a valid Date, finite epoch-millisecond timestamp, or ISO calendar date/date-time with an explicit UTC offset.";
    expect(() => natalChart(stored)).toThrow(new RangeError(message));
    expect(() => transits(stored, "2024-02-29T00:00:00Z")).toThrow(new RangeError(message));
  });

  it("resolveBirth already refuses lat, as it refuses every unknown key", () => {
    expect(() =>
      resolveBirth({ date: "2000-01-01", time: "12:00", timeZone: "Europe/London", lat: 51.5, lng: -0.12 } as never)
    ).toThrow(new RangeError('Unknown local birth field "lat".'));
  });
});
