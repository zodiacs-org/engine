import { describe, expect, it } from "vitest";

import { normalizeInstant, normalizeObserver, normalizeWindow } from "../src/index.js";
import type { Instant, Observer, TimeWindow } from "../src/index.js";

// Input-contract tests, not astronomical accuracy evidence.
describe("instant input contract", () => {
  it.each([
    ["2024-02-29", "2024-02-29T00:00:00.000Z"],
    ["2024-02-29T12:34:56.1+02:30", "2024-02-29T10:04:56.100Z"],
    ["2000-01-01T01:00:00-01:00", "2000-01-01T02:00:00.000Z"],
    ["2000-01-01T00:00:00-00:00", "2000-01-01T00:00:00.000Z"]
  ])("normalizes %s using the engine's calendar and offset rules", (given, expected) => {
    expect(normalizeInstant(given)).toBe(expected);
  });

  it("snapshots a Date without changing or freezing it", () => {
    const given = new Date("2024-02-29T12:00:00Z");
    const before = given.getTime();
    const result = normalizeInstant(given);
    expect(given.getTime()).toBe(before);
    expect(Object.isFrozen(given)).toBe(false);
    given.setUTCDate(28);
    expect(result).toBe("2024-02-29T12:00:00.000Z");
  });

  it.each([
    "2023-02-29", "1900-02-29", "2024-04-31", "2024-13-01",
    "2024-01-00", "2024-01-01T24:00:00Z", "2024-01-01T12:60:00Z",
    "2016-12-31T23:59:60Z", "2024-01-01T12:00:00", "2024-01-01T12:00:00+24:00",
    "2024-01-01T12:00:00+01:60", "2024-01-01T12:00:00.1234Z", "2024-01-01\n",
    "January 1, 2024", "", new Date(Number.NaN), 0, Number.NaN, null, undefined, {}
  ])("rejects invalid or unsupported instant %#", (given) => {
    expect(() => normalizeInstant(given as Instant)).toThrow(RangeError);
  });
});

describe("window input contract", () => {
  it("compares instants after offset normalization and snapshots its inputs", () => {
    const to = new Date("2024-01-01T00:30:00Z");
    const given = { from: "2024-01-01T01:00:00+01:00", to };
    const result = normalizeWindow(given);
    expect(result).toEqual({ from: "2024-01-01T00:00:00.000Z", to: "2024-01-01T00:30:00.000Z" });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(given)).toBe(false);
    expect(Object.isFrozen(to)).toBe(false);
    to.setUTCFullYear(2025);
    expect(result.to).toBe("2024-01-01T00:30:00.000Z");
  });

  it.each([
    { from: "2024-01-01", to: "2024-01-01" },
    { from: "2024-01-01T01:00:00+01:00", to: "2024-01-01T00:00:00Z" },
    { from: "2024-01-02", to: "2024-01-01" },
    { from: "2024-01-01" },
    { from: "2024-01-01", to: "2024-01-02", end: "2024-01-03" },
    null, [], new Date("2024-01-01")
  ])("rejects an empty, reversed or malformed window %#", (given) => {
    expect(() => normalizeWindow(given as TimeWindow)).toThrow(RangeError);
  });
});

describe("observer input contract", () => {
  it("uses zero elevation by default without mutating caller input", () => {
    const given = { latitude: 12.5, longitude: -30.25 };
    const result = normalizeObserver(given);
    expect(result).toEqual({ ...given, elevationMeters: 0 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(given)).toBe(false);
    expect(Object.keys(given)).toEqual(["latitude", "longitude"]);
    given.latitude = 15;
    expect(result.latitude).toBe(12.5);
  });

  it.each([
    { latitude: -90, longitude: -180, elevationMeters: -10_000 },
    { latitude: 90, longitude: 180, elevationMeters: 100_000 }
  ])("accepts inclusive documented coordinate boundaries %#", (given) => {
    expect(normalizeObserver(given)).toEqual(given);
  });

  it.each([
    { latitude: -90.001, longitude: 0 }, { latitude: 90.001, longitude: 0 },
    { latitude: 0, longitude: -180.001 }, { latitude: 0, longitude: 180.001 },
    { latitude: 0, longitude: 0, elevationMeters: -10_001 },
    { latitude: 0, longitude: 0, elevationMeters: 100_001 },
    { latitude: 0, longitude: 0, elevationMeters: null },
    { latitude: 0, longitude: 0, elevationMeters: Infinity },
    { latitude: Number.NaN, longitude: 0 }, { latitude: 0, longitude: -Infinity },
    { latitude: "0", longitude: 0 }, { latitude: 0 }, { longitude: 0 },
    { latitude: 0, longitude: 0, height: 5 },
    { latitude: 0, longitude: 0, [Symbol("unknown")]: 1 },
    null, [], new Date("2024-01-01")
  ])("rejects invalid coordinates or unknown fields %#", (given) => {
    expect(() => normalizeObserver(given as Observer)).toThrow(RangeError);
  });
});
