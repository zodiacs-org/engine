import { describe, expect, it } from "vitest";
import { natalChart } from "@zodiacs/engine";
import type { BirthInput } from "@zodiacs/engine";
import {
  createNatalEnvelope,
  natalReplayInput,
  parseNatalEnvelope,
  serializeNatalEnvelope
} from "@zodiacs/engine/receipt";
import { relocateChart, RELOCATION_CHART_SCHEMA } from "../src/index.js";
import type { GeographicPoint } from "../src/index.js";

// Invented instant and coordinates. These checks establish engine parity,
// input semantics and replay behavior, not independent astronomical accuracy.
const syntheticBirth: BirthInput = {
  utc: "2003-04-05T06:07:08.009+02:00",
  latitude: 12.5,
  longitude: 34.25,
  houseSystem: "placidus"
};
const destination: GeographicPoint = { latitude: -23.5, longitude: -45.25 };

describe("relocateChart", () => {
  it("calls the engine at the same instant with the destination coordinates", () => {
    const result = relocateChart(syntheticBirth, destination);
    expect(result.schema).toBe(RELOCATION_CHART_SCHEMA);
    expect(result.natal).toEqual(createNatalEnvelope(natalChart(syntheticBirth), {
      sourceInstant: syntheticBirth.utc as string
    }));
    expect(result.relocated).toEqual(createNatalEnvelope(natalChart({ ...syntheticBirth, ...destination }), {
      sourceInstant: syntheticBirth.utc as string
    }));
    expect(result.relocated.result.bodies).toEqual(result.natal.result.bodies);
    expect(result.relocated.result.angles).not.toEqual(result.natal.result.angles);
    expect(result.relocated.receipt.instant).toBe("2003-04-05T04:07:08.009Z");
    expect(result.relocated.receipt.coordinates).toEqual(destination);
  });

  it("preserves the clock and pinned delta-T rather than shifting local time", () => {
    for (const timeScale of ["utc", "ut1", "tt"] as const) {
      const result = relocateChart({ ...syntheticBirth, timeScale, deltaT: 70 }, destination);
      expect(result.relocated.receipt.timeScale).toBe(timeScale);
      expect(result.relocated.result.timeScale).toEqual(result.natal.result.timeScale);
      expect(result.relocated.result.deltaT).toEqual(result.natal.result.deltaT);
      expect(result.relocated.result.deltaT?.model).toBe("pinned");
      expect(natalReplayInput(result.relocated).deltaT).toBe(70);
      expect(result.relocated.result.bodies).toEqual(result.natal.result.bodies);
    }
  });

  it("uses engine polar fallback in either hemisphere and retains the request", () => {
    for (const latitude of [-89.5, 89.5]) {
      const result = relocateChart(syntheticBirth, { latitude, longitude: 15 });
      expect(result.relocated.receipt.houses).toEqual({
        requested: "placidus", actual: "whole", absenceReason: null
      });
      expect(result.relocated.receipt.resultFlags).toContain("polar-fallback");
      expect(result.relocated.result.angles).toEqual(natalChart({
        ...syntheticBirth, latitude, longitude: 15
      }).angles);
    }
  });

  it("does not carry a source polar fallback assertion to a nonpolar destination", () => {
    const result = relocateChart({
      ...syntheticBirth, latitude: 80, flags: ["polar-fallback"]
    }, destination);
    expect(result.natal.receipt.resultFlags).toContain("polar-fallback");
    expect(result.relocated.receipt.resultFlags).not.toContain("polar-fallback");
    expect(result.relocated.receipt.houses.actual).toBe("placidus");
  });

  it("keeps unknown-time charts without inventing angles or a noon instant", () => {
    const result = relocateChart({ ...syntheticBirth, timeKnown: false }, destination);
    expect(result.relocated.result.angles).toBeNull();
    expect(result.relocated.result.houses).toBeNull();
    expect(result.relocated.receipt.houses.absenceReason).toBe("unknown-time");
    expect(result.relocated.receipt.resultFlags).toContain("no-time");
    expect(result.relocated.receipt.instant).toBe(result.natal.receipt.instant);
    expect(result.relocated.receipt.reference).toBe("supplied-instant");
  });

  it("supports a natal input without an original location", () => {
    const result = relocateChart({ utc: syntheticBirth.utc }, destination);
    expect(result.natal.receipt.coordinates).toBeNull();
    expect(result.natal.result.angles).toBeNull();
    expect(result.relocated.result.angles).not.toBeNull();
    expect(result.relocated.receipt.houses.requested).toBe("whole");
  });

  it("keeps both antimeridian endpoint spellings accepted by the engine", () => {
    for (const longitude of [-180, 180]) {
      const result = relocateChart(syntheticBirth, { latitude: 0, longitude });
      expect(result.relocated.receipt.coordinates?.longitude).toBe(longitude);
      expect(result.relocated.result.angles).toEqual(natalChart({
        ...syntheticBirth, latitude: 0, longitude
      }).angles);
    }
  });

  it("returns engine envelopes that survive JSON parsing and replay", () => {
    const result = relocateChart(syntheticBirth, destination);
    for (const envelope of [result.natal, result.relocated]) {
      const decoded = parseNatalEnvelope(serializeNatalEnvelope(envelope));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error(decoded.code);
      expect(createNatalEnvelope(natalChart(natalReplayInput(decoded.envelope))).result).toEqual(envelope.result);
      expect(envelope.receipt.engine.name).toBe("@zodiacs/engine");
      expect(envelope.receipt.engine.ephemeris?.name).toBe("astronomy-engine");
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("owns returned snapshots and does not mutate caller input", () => {
    const instant = new Date("2003-04-05T04:07:08.009Z");
    const flags = Object.freeze(["dst-fold"] as const);
    const birth = Object.freeze({ ...syntheticBirth, utc: instant, flags });
    const point = Object.freeze({ ...destination });
    const result = relocateChart(birth, point);
    expect(instant.toISOString()).toBe("2003-04-05T04:07:08.009Z");
    expect(birth.flags).toEqual(["dst-fold"]);
    expect(result.relocated.receipt.inputFlags).toEqual(["dst-fold"]);
    result.relocated.result.bodies[0]!.lon = -1;
    expect(result.natal.result.bodies[0]!.lon).toBeGreaterThanOrEqual(0);
    expect(relocateChart(birth, point).relocated.result.bodies[0]!.lon).toBeGreaterThanOrEqual(0);
  });

  it.each([
    null, {}, { latitude: 0 }, { longitude: 0 },
    { latitude: 90, longitude: 0 }, { latitude: -90, longitude: 0 },
    { latitude: 91, longitude: 0 }, { latitude: NaN, longitude: 0 },
    { latitude: Infinity, longitude: 0 }, { latitude: "0", longitude: 0 },
    { latitude: 0, longitude: 180.1 }, { latitude: 0, longitude: -181 },
    { latitude: 0, longitude: NaN }, { latitude: 0, longitude: Infinity },
    { latitude: 0, longitude: "0" }
  ])("rejects an invalid or degenerate destination: %j", (point) => {
    expect(() => relocateChart(syntheticBirth, point as GeographicPoint)).toThrow(RangeError);
  });

  it.each([
    { utc: "2003-02-30T04:00:00Z" },
    { utc: "2003-04-05T04:00:00" },
    { utc: "2003-04-05", houseSystem: "invented" },
    { utc: "2003-04-05", timeKnown: null },
    { utc: "2003-04-05", latitude: 10 },
    { utc: "2003-04-05", deltaT: Infinity }
  ])("delegates natal input validation to the engine: %j", (birth) => {
    expect(() => relocateChart(birth as BirthInput, destination)).toThrow(RangeError);
  });
});
