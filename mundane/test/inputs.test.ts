import { describe, expect, it } from "vitest";
import { HOUSE_SYSTEMS } from "../../src/houses.js";
import { normalizePlace, normalizeRange, normalizeRequest } from "../src/index.js";
import type { MundaneRequest, Place, RangeSelection } from "../src/index.js";

const place = { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 };

describe("place snapshots", () => {
  it("preserves signed coordinates and does not retain mutable input", () => {
    const input = { ...place };
    const result = normalizePlace(input);
    input.latitude = -10;
    expect(result).toEqual(place);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([-180, 180, 0])("accepts longitude boundary %s", longitude => {
    expect(normalizePlace({ latitude: 0, longitude }).longitude).toBe(longitude);
  });

  it.each([
    null, [], {}, { latitude: 0 }, { longitude: 0 },
    { latitude: null, longitude: 0 }, { latitude: "12", longitude: 0 },
    { latitude: NaN, longitude: 0 }, { latitude: Infinity, longitude: 0 },
    { latitude: 91, longitude: 0 }, { latitude: -91, longitude: 0 },
    { latitude: 90, longitude: 0 }, { latitude: -90, longitude: 0 },
    { latitude: 0, longitude: 181 }, { latitude: 0, longitude: -181 },
    { latitude: 0, longitude: NaN }, { latitude: 0, longitude: "1" }
  ])("rejects missing, nonnumeric, or undefined-angle coordinates: %j", input => {
    expect(() => normalizePlace(input as Place)).toThrow(RangeError);
  });

  it.each([null, "", " padded", "padded ", "line\nbreak", "\u0000", 7])(
    "rejects invalid labels: %j", name => {
      expect(() => normalizePlace({ ...place, name } as Place)).toThrow(RangeError);
    }
  );
});

describe("UTC range snapshots", () => {
  // Exact calendar expectations derived from the Gregorian leap-year rule
  // and UTC offsets, not from any ephemeris or prior engine calculation.
  it("spans a leap year between successive January boundaries", () => {
    const result = normalizeRange({ year: 2000 });
    expect(result).toEqual({ from: "2000-01-01T00:00:00.000Z", to: "2001-01-01T00:00:00.000Z" });
    expect((Date.parse(result.to) - Date.parse(result.from)) / 86_400_000).toBe(366);
    const common = normalizeRange({ year: 1900 });
    expect((Date.parse(common.to) - Date.parse(common.from)) / 86_400_000).toBe(365);
  });

  it("preserves years below 100 and astronomical year zero", () => {
    expect(normalizeRange({ year: 42 })).toEqual({
      from: "0042-01-01T00:00:00.000Z", to: "0043-01-01T00:00:00.000Z"
    });
    expect(normalizeRange({ year: 0 }).from).toBe("0000-01-01T00:00:00.000Z");
  });

  it("normalizes offset date-times and date-only UTC midnight", () => {
    expect(normalizeRange({ from: "2000-02-29T01:00:00+01:00", to: "2000-03-01" }))
      .toEqual({ from: "2000-02-29T00:00:00.000Z", to: "2000-03-01T00:00:00.000Z" });
  });

  it("detaches Date inputs and accepts epoch milliseconds", () => {
    const from = new Date("2000-01-01T00:00:00.000Z");
    const result = normalizeRange({ from, to: 946_684_800_001 });
    from.setUTCFullYear(2010);
    expect(result).toEqual({ from: "2000-01-01T00:00:00.000Z", to: "2000-01-01T00:00:00.001Z" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    null, [], {}, { year: null }, { year: "2000" }, { year: 2000.5 },
    { year: Infinity }, { year: NaN }, { year: Number.MAX_SAFE_INTEGER },
    { year: 2000, from: "2000-01-01" },
    { year: 2000, to: "2001-01-01" },
    { from: "2000-01-01" }, { to: "2001-01-01" },
    { from: "2000-01-01", to: "2000-01-01" },
    { from: "2001-01-01", to: "2000-01-01" },
    { from: "2000-02-30", to: "2001-01-01" },
    { from: "1900-02-29", to: "1901-01-01" },
    { from: "2000-01-01T12:00", to: "2001-01-01" },
    { from: "2000-01-01T24:00:00Z", to: "2001-01-01" },
    { from: "2000-01-01T00:00:60Z", to: "2001-01-01" },
    { from: new Date(NaN), to: "2001-01-01" },
    { from: 0, to: Infinity }
  ])("rejects malformed or ambiguous ranges: %j", input => {
    expect(() => normalizeRange(input as RangeSelection)).toThrow(RangeError);
  });
});

describe("request normalization", () => {
  it("defaults to whole-sign houses and freezes nested snapshots", () => {
    const input = { place: { ...place }, year: 2000 };
    const result = normalizeRequest(input);
    input.place.longitude = 10;
    expect(result).toEqual({
      place, houseSystem: "whole",
      range: { from: "2000-01-01T00:00:00.000Z", to: "2001-01-01T00:00:00.000Z" }
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.place)).toBe(true);
    expect(Object.isFrozen(result.range)).toBe(true);
  });

  it.each(HOUSE_SYSTEMS)("accepts the engine house system %s", houseSystem => {
    expect(normalizeRequest({ place, year: 2000, houseSystem }).houseSystem).toBe(houseSystem);
  });

  it.each([null, "unknown", "Whole", 0, false])("rejects unsupported house settings: %j", houseSystem => {
    expect(() => normalizeRequest({ place, year: 2000, houseSystem } as MundaneRequest)).toThrow(RangeError);
  });

  it.each([null, [], {}])("rejects incomplete requests: %j", input => {
    expect(() => normalizeRequest(input as MundaneRequest)).toThrow(RangeError);
  });
});
