import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { natalChart } from "../../src/api.js";
import { HOUSE_SYSTEMS } from "../../src/houses.js";
import { createNatalEnvelope } from "../../src/receipt.js";
import { ENGINE_VERSION, EPHEMERIS } from "../../src/types.js";
import { castEventChart } from "../src/index.js";
import type { EventChartInput } from "../src/index.js";

const place = { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 };
const at = "2000-02-29T12:34:56.789Z";

// Comparisons with natalChart below are integration checks, not independent
// astronomical accuracy evidence. These arbitrary instants identify no event.
describe("event chart engine integration", () => {
  it.each(HOUSE_SYSTEMS)("preserves the engine chart using %s houses", houseSystem => {
    const expected = natalChart({ utc: at, ...place, houseSystem });
    const result = castEventChart({ at, place, houseSystem });
    expect(result.at).toBe(expected.input.utc.toISOString());
    expect(result.place).toEqual(place);
    expect(result.angles).toEqual(expected.angles);
    expect(result.houses).toEqual({
      requested: houseSystem, actual: expected.houses!.system, cusps: expected.houses!.cusps
    });
    expect(result.bodies).toEqual(expected.bodies);
    expect(result.aspects).toEqual(expected.aspects);
    expect(result.flags).toEqual(expected.flags);
    expect(result.deltaT).toEqual(expected.deltaT);
    expect(result.timeScale).toEqual(expected.timeScale);
    expect(result.flags).not.toContain("no-time");
  });

  it("defaults to whole signs and uses the engine receipt conventions and coverage", () => {
    const expected = natalChart({ utc: at, ...place });
    const { receipt } = createNatalEnvelope(expected, { sourceInstant: at });
    const result = castEventChart({ at, place });
    expect(result.houses.requested).toBe("whole");
    expect(result.provenance).toEqual({
      source: "relative-checkout",
      sourceInstant: receipt.sourceInstant,
      engine: receipt.engine,
      conventions: receipt.conventions,
      coverage: receipt.coverage
    });
    expect(result.provenance.engine.version).toBe(ENGINE_VERSION);
    expect(result.provenance.engine.ephemeris).toEqual(EPHEMERIS);
    expect(result.provenance.conventions.zodiac).toBe("tropical");
  });

  it("keeps the local dependency at the engine's exact ephemeris version", () => {
    const own = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const installed = JSON.parse(readFileSync(
      new URL("../node_modules/astronomy-engine/package.json", import.meta.url), "utf8"
    ));
    expect(own.dependencies[EPHEMERIS.name]).toBe(EPHEMERIS.version);
    expect(installed.version).toBe(EPHEMERIS.version);
  });

  it("normalizes ISO offsets while recording the supplied spelling", () => {
    const supplied = "2000-02-29T13:34:56.789+01:00";
    const result = castEventChart({ at: supplied, place });
    const utcResult = castEventChart({ at, place });
    expect(result.at).toBe(at);
    expect(result.provenance.sourceInstant).toBe(supplied);
    expect(result.bodies).toEqual(utcResult.bodies);
    expect(result.angles).toEqual(utcResult.angles);
  });

  it("accepts date-only UTC midnight, Date, and epoch milliseconds", () => {
    const midnight = new Date("2000-02-29T00:00:00.000Z");
    const dateOnly = castEventChart({ at: "2000-02-29", place });
    expect(dateOnly.at).toBe(midnight.toISOString());
    for (const input of [midnight, midnight.getTime()]) {
      const result = castEventChart({ at: input, place });
      expect(result.at).toBe(midnight.toISOString());
      expect(result.bodies).toEqual(dateOnly.bodies);
      expect(result.provenance.sourceInstant).toBeNull();
    }
  });
});

describe("house fallback and time basis", () => {
  it.each([
    { latitude: 78.5, houseSystem: "placidus" as const },
    { latitude: -78.5, houseSystem: "placidus" as const },
    { latitude: 78.5, houseSystem: "koch" as const },
    { latitude: -78.5, houseSystem: "koch" as const }
  ])("preserves requested and actual systems at a synthetic polar place: %j", ({ latitude, houseSystem }) => {
    const polar = { name: "Synthetic Polar", latitude, longitude: 31.25 };
    const result = castEventChart({ at, place: polar, houseSystem });
    const whole = castEventChart({ at, place: polar, houseSystem: "whole" });
    expect(result.houses.requested).toBe(houseSystem);
    expect(result.houses.actual).toBe("whole");
    expect(result.houses.cusps).toEqual(whole.houses.cusps);
    expect(result.angles).toEqual(whole.angles);
    expect(result.flags).toEqual(["polar-fallback"]);
    expect(whole.flags).toEqual([]);
  });

  it.each([
    { at: "1850-06-15T12:00:00Z", basis: "delta-t", source: null },
    { at: "2000-06-15T12:00:00Z", basis: "iers", source: "observed" },
    { at: "2026-12-15T12:00:00Z", basis: "iers", source: "predicted" },
    { at: "2030-06-15T12:00:00Z", basis: "delta-t", source: "fallback" }
  ])("retains time-basis metadata for a synthetic instant: %j", ({ at: time, basis, source }) => {
    const expected = natalChart({ utc: time, ...place });
    const result = castEventChart({ at: time, place });
    expect(result.timeScale).toEqual(expected.timeScale);
    expect(result.deltaT).toEqual(expected.deltaT);
    expect(result.timeScale.input).toBe("utc");
    expect(result.timeScale.basis).toBe(basis);
    expect(result.timeScale.ut1MinusUtc?.source ?? null).toBe(source);
  });

  it("does not suppress either fallback or outside-reference-span flags", () => {
    const result = castEventChart({
      at: "1750-06-15T12:00:00Z",
      place: { latitude: -78.5, longitude: -31.25 },
      houseSystem: "koch"
    });
    expect(result.flags).toEqual(["polar-fallback", "outside-reference-span"]);
  });

  it.each(["1750-06-15T12:00:00Z", "2250-06-15T12:00:00Z"])(
    "retains reference-coverage flags outside the reference span: %s", time => {
      expect(castEventChart({ at: time, place }).flags).toEqual(["outside-reference-span"]);
    }
  );

  it.each(["0000-06-15", "4001-06-15"])("preserves engine ephemeris refusals: %s", time => {
    expect(() => castEventChart({ at: time, place })).toThrow(RangeError);
    expect(() => castEventChart({ at: time, place })).toThrow(/EPHEMERIS_SPAN/);
  });
});

function expectFrozenTree(value: unknown): void {
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    expect(value).not.toBeInstanceOf(Date);
    for (const child of Object.values(value)) expectFrozenTree(child);
  }
}

describe("detached chart snapshots", () => {
  it("deeply freezes only its own output and serializes without losing fields", () => {
    const date = new Date(at);
    const input = { at: date, place: { ...place } };
    const result = castEventChart(input);
    expectFrozenTree(result);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.place)).toBe(false);
    expect(Object.isFrozen(date)).toBe(false);
    date.setUTCFullYear(2010);
    input.place.latitude = -12.5;
    expect(result.at).toBe(at);
    expect(result.place).toEqual(place);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(Reflect.set(result.bodies[0]!, "lon", 0)).toBe(false);
    expect(Reflect.set(result.houses.cusps, "0", 0)).toBe(false);
  });

  it("allocates independent snapshots on every call", () => {
    const first = castEventChart({ at, place });
    const second = castEventChart({ at, place });
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.bodies).not.toBe(first.bodies);
    expect(second.bodies[0]).not.toBe(first.bodies[0]);
    expect(second.timeScale.ut1MinusUtc).not.toBe(first.timeScale.ut1MinusUtc);
    expect(second.provenance.engine).not.toBe(first.provenance.engine);
  });
});

describe("event chart input validation", () => {
  it.each([
    null, [], {}, { at }, { place }, { at, place: null },
    { at, place: { latitude: 90, longitude: 0 } },
    { at, place: { latitude: -90, longitude: 0 } },
    { at, place: { latitude: 0, longitude: 181 } },
    { at, place: { latitude: NaN, longitude: 0 } },
    { at, place, houseSystem: null }, { at, place, houseSystem: "Whole" },
    { at, place, houseSystem: "unsupported" },
    { at, place, timeScale: "tt" }, { at, place, deltaT: 60 },
    { at, place, timeKnown: false }, { at, place, flags: ["no-time"] },
    { at, place, housesystem: "placidus" }
  ])("rejects malformed input and unsupported options: %j", input => {
    expect(() => castEventChart(input as EventChartInput)).toThrow(RangeError);
  });

  it.each([
    null, undefined, NaN, Infinity, new Date(NaN), "2000-02-30", "2000-02-29T12:00",
    "2000-02-29T24:00:00Z", "2000-02-29T12:00:60Z"
  ])("rejects invalid or unresolved instants: %j", time => {
    expect(() => castEventChart({ at: time, place } as EventChartInput)).toThrow(RangeError);
  });
});
