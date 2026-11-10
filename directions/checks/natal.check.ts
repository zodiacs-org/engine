import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EPHEMERIS, HOUSE_SYSTEMS, chartDeclinations, natalChart } from "../../src/index.js";
import { houses } from "../../src/calc.js";
import {
  NatalPreparationError, prepareNatal,
  type DirectionNatalInput, type NatalPreparationErrorCode
} from "../src/natal.js";

// Invented instants and coordinates only. These are engine integration checks,
// not independent astronomical accuracy evidence or expected directional arcs.
const base = {
  utc: "2000-01-01T12:00:00Z", timeScale: "utc", timeKnown: true,
  latitude: 35, longitude: 20, houseSystem: "placidus"
} as const satisfies DirectionNatalInput;

function rejected(value: unknown, code: NatalPreparationErrorCode): void {
  expect(() => prepareNatal(value as DirectionNatalInput)).toThrow(NatalPreparationError);
  try {
    prepareNatal(value as DirectionNatalInput);
    throw new Error("Expected refusal");
  } catch (error) {
    expect(error).toBeInstanceOf(RangeError);
    expect(error).toMatchObject({ name: "NatalPreparationError", code });
  }
}

function frozenData(value: unknown): void {
  expect(value).not.toBeInstanceOf(Date);
  if (value !== null && typeof value === "object") {
    expect(Object.isFrozen(value)).toBe(true);
    for (const entry of Object.values(value)) frozenData(entry);
  }
}

describe("natal engine integration (not independent arc accuracy)", () => {
  it("uses the engine's exact pinned ephemeris dependency", () => {
    const installed = JSON.parse(readFileSync(new URL("../node_modules/astronomy-engine/package.json", import.meta.url), "utf8"));
    const engine = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(installed.version).toBe(EPHEMERIS.version);
    expect(engine.dependencies[EPHEMERIS.name]).toBe(EPHEMERIS.version);
  });

  it("runs the documented synthetic adapter example on its explicit UT1 clock", () => {
    const input = { ...base, timeScale: "ut1", longitude: 15, deltaT: 64 } as const;
    const reference = natalChart(input);
    const result = prepareNatal(input);
    expect(result.chart).toEqual({ ...reference, input: { ...reference.input, utc: reference.input.utc.toISOString() } });
    expect(result.equatorial).toEqual(chartDeclinations(reference));
  });

  for (const timeScale of ["utc", "ut1", "tt"] as const) {
    for (const pin of [undefined, 123.5]) {
      it(`preserves the engine chart and equator for ${timeScale}, deltaT ${pin ?? "model"}`, () => {
        const input: DirectionNatalInput = {
          ...base, timeScale, ...(pin === undefined ? {} : { deltaT: pin })
        };
        const direct = natalChart(input);
        const result = prepareNatal(input);
        expect(result.chart).toEqual({
          ...direct, input: { ...direct.input, utc: direct.input.utc.toISOString() }
        });
        expect(result.equatorial).toEqual(chartDeclinations(direct));
        expect(result.chart.timeScale.input).toBe(timeScale);
        expect(result.equatorial.utc).toBe(result.chart.input.utc);
        expect(result.equatorial.deltaT).toEqual(result.chart.deltaT);
        expect(result.geometry.trueObliquityDegrees).toBe(result.equatorial.trueObliquity);
        expect(result.geometry.latitudeDegrees).toBe(input.latitude);
        expect(result.geometry.longitudeDegrees).toBe(input.longitude);
        expect(result.provenance).toEqual({
          engineVersion: direct.engineVersion, ephemeris: EPHEMERIS,
          chart: "@zodiacs/engine:natalChart",
          equatorial: "@zodiacs/engine:chartDeclinations",
          ramc: "@zodiacs/engine:eclipticToEquatorial(mc,0,trueObliquity)",
          inputInstant: "chart.input.utc is an ISO label on chart.timeScale.input"
        });
        if (pin !== undefined) {
          expect(result.chart.deltaT.model).toBe("pinned");
          expect(result.chart.deltaT.seconds).toBe(pin);
        }
        expect(result.chart.bodies.some(body => body.lat !== 0)).toBe(true);
        expect(result.equatorial.rows.map(row => row.lat)).toEqual(direct.bodies.map(body => body.lat));
      });
    }
  }

  it("preserves every requested engine house system without substituting cusps", () => {
    for (const houseSystem of HOUSE_SYSTEMS) {
      const input = { ...base, houseSystem };
      expect(prepareNatal(input).chart.houses).toEqual(natalChart(input).houses);
      expect(prepareNatal(input).chart.houses.system).toBe(houseSystem);
    }
  });

  // Fixed before running: round-trip RA <-> MC allowance only, in degrees.
  // UTC ISO avoids JD conversion loss. Pinned UT1 uses an exact noon JD.
  const ramcToleranceDegrees = 1e-10;
  for (const latitude of [-60, 60]) {
    for (const longitude of [-179.999, -120, -30, 60, 150, 179.999]) {
      it(`recovers public houses ARMC at latitude ${latitude}, longitude ${longitude}`, () => {
        for (const utc of ["1800-06-01T12:00:00Z", "2000-01-01T12:00:00Z", "2199-06-01T12:00:00Z"]) {
          const input = { ...base, utc, latitude, longitude };
          const reference = houses({ time: utc, place: { latitude, longitude }, houseSystem: "placidus" });
          expect(reference.status).toBe("ok");
          if (reference.status !== "ok") throw new Error("Unexpected calc refusal");
          const result = prepareNatal(input);
          expect(result.geometry.ramcDegrees).toBeGreaterThanOrEqual(0);
          expect(result.geometry.ramcDegrees).toBeLessThan(360);
          const difference = Math.abs(result.geometry.ramcDegrees - reference.armc);
          expect(Math.min(difference, 360 - difference)).toBeLessThanOrEqual(ramcToleranceDegrees);
          expect(result.geometry.trueObliquityDegrees).toBe(reference.obliquity);
          expect(result.chart.angles).toEqual(reference.angles);
          expect(result.chart.houses.cusps).toEqual(reference.cusps);
        }
      });
    }
  }

  it("keeps pinned UT1 RAMC on the same engine clock", () => {
    const input = { ...base, timeScale: "ut1", deltaT: 123.5 } as const;
    const reference = houses({
      time: { jd: 2451545, scale: "ut1", deltaT: input.deltaT },
      place: { latitude: input.latitude, longitude: input.longitude }, houseSystem: input.houseSystem
    });
    if (reference.status !== "ok") throw new Error("Unexpected calc refusal");
    const result = prepareNatal(input);
    expect(Math.abs(result.geometry.ramcDegrees - reference.armc)).toBeLessThanOrEqual(ramcToleranceDegrees);
    expect(result.geometry.trueObliquityDegrees).toBe(reference.obliquity);
  });

  it("retains RA quadrants and both sides of the zero-degree wrap", () => {
    const greenwich = houses({ time: base.utc, place: { latitude: 0, longitude: 0 } });
    if (greenwich.status !== "ok") throw new Error("Unexpected calc refusal");
    // Select invented geographic longitudes to put RAMC near each branch.
    // The independent target here is only branch placement, not an arc fixture.
    for (const target of [1e-7, 90, 180, 270, 360 - 1e-7]) {
      const longitude = ((target - greenwich.armc + 540) % 360) - 180;
      for (const latitude of [-35, 35]) {
        const result = prepareNatal({ ...base, latitude, longitude });
        expect(Math.abs(result.geometry.ramcDegrees - target)).toBeLessThanOrEqual(ramcToleranceDegrees);
        const reference = houses({ time: base.utc, place: { latitude, longitude } });
        if (reference.status !== "ok") throw new Error("Unexpected calc refusal");
        expect(Math.abs(result.geometry.ramcDegrees - reference.armc)).toBeLessThanOrEqual(ramcToleranceDegrees);
      }
    }
  });

  it("preserves canonical engine flags including coverage and time-resolution assertions", () => {
    const input: DirectionNatalInput = {
      ...base, utc: "1700-06-01T12:00:00Z", flags: ["lmt", "dst-fold", "lmt", "outside-reference-span"]
    };
    const result = prepareNatal(input);
    expect(result.chart.flags).toEqual(natalChart(input).flags);
    expect(result.chart.flags).toEqual(["lmt", "dst-fold", "outside-reference-span"]);
    expect(result.chart.input.flags).toEqual(["lmt", "dst-fold"]);
  });

  it("copies and deeply freezes Date-free data without freezing caller-owned data", () => {
    const utc = new Date(base.utc);
    const flags: NonNullable<DirectionNatalInput["flags"]>[number][] = ["lmt"];
    const input: DirectionNatalInput = { ...base, utc, flags };
    const result = prepareNatal(input);
    const encoded = JSON.stringify(result);
    frozenData(result);
    expect(JSON.parse(encoded)).toEqual(result);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(utc)).toBe(false);
    expect(Object.isFrozen(flags)).toBe(false);
    utc.setUTCFullYear(2001);
    flags.push("dst-gap");
    input.latitude = -35;
    expect(JSON.stringify(result)).toBe(encoded);
    expect(() => Object.assign(result.chart.angles, { mc: 0 })).toThrow(TypeError);
    expect(() => Object.assign(result.equatorial.rows[0]!, { lat: 0 })).toThrow(TypeError);
    expect(() => Array.prototype.push.call(result.chart.houses.cusps, 0)).toThrow(TypeError);
  });

  it("does not leak a prior call's deltaT pin or mutate its snapshot", () => {
    const unpinned = prepareNatal(base);
    const smallPin = prepareNatal({ ...base, deltaT: 0 });
    const original = JSON.stringify(smallPin);
    const largePin = prepareNatal({ ...base, deltaT: 86_400 });
    expect(largePin.chart.bodies).not.toEqual(smallPin.chart.bodies);
    expect(prepareNatal(base)).toEqual(unpinned);
    expect(prepareNatal({ ...base, deltaT: 0 })).toEqual(smallPin);
    expect(JSON.stringify(smallPin)).toBe(original);
  });
});

describe("explicit natal input and geometry refusals", () => {
  it("requires a resolved known time and both coordinates", () => {
    for (const field of ["utc", "timeKnown", "latitude", "longitude"] as const) {
      const input: Record<string, unknown> = { ...base };
      delete input[field];
      rejected(input, field === "utc" || field === "timeKnown" ? "missing-time" : "missing-place");
    }
    for (const timeKnown of [false, undefined, null, "true"]) rejected({ ...base, timeKnown }, "missing-time");
    for (const utc of [undefined, null]) rejected({ ...base, utc }, "missing-time");
    for (const utc of ["2000-01-01", "+002000-01-01", "-000001-01-01"]) {
      rejected({ ...base, utc }, "missing-time");
    }
    expect(prepareNatal({ ...base, utc: "2000-01-01T00:00:00Z", latitude: 0, longitude: 0 }).chart.angles).not.toBeNull();
  });

  it("never infers a time scale or house system", () => {
    for (const field of ["timeScale", "houseSystem"]) {
      const input: Record<string, unknown> = { ...base };
      delete input[field];
      rejected(input, "invalid-input");
      for (const value of [undefined, null, "", false, "unsupported"]) {
        rejected({ ...base, [field]: value }, "invalid-input");
      }
    }
  });

  it("wraps engine validation failures without weakening them", () => {
    for (const change of [
      { utc: "2000-02-30T12:00:00Z" }, { utc: "2000-01-01T12:00:00" },
      { utc: new Date(NaN) }, { utc: Infinity }, { utc: "5000-01-01T00:00:00Z" },
      { latitude: null }, { latitude: NaN }, { latitude: 91 },
      { longitude: "20" }, { longitude: Infinity }, { longitude: -181 },
      { deltaT: null }, { deltaT: NaN }, { deltaT: 1e10 + 1 },
      { flags: ["unknown"] }, { flags: ["dst-gap", "dst-fold"] },
      { flags: ["no-time"] }, { flags: ["polar-fallback"] }, { flags: ["outside-reference-span"] }
    ]) {
      rejected({ ...base, ...change }, "invalid-input");
      try { prepareNatal({ ...base, ...change } as DirectionNatalInput); }
      catch (error) { expect((error as NatalPreparationError).cause).toBeInstanceOf(RangeError); }
    }
  });

  it("accepts plain data and rejects inherited, hidden, accessor and unknown fields", () => {
    expect(prepareNatal(Object.assign(Object.create(null), base))).toEqual(prepareNatal(base));
    for (const value of [null, undefined, [], true, "chart", new Date(0), Object.create(base)]) {
      rejected(value, "invalid-input");
    }
    rejected({ ...base, zodiac: "sidereal" }, "invalid-input");
    rejected({ ...base, [Symbol("latitude")]: 10 }, "invalid-input");
    let reads = 0;
    const accessor = { ...base };
    Object.defineProperty(accessor, "latitude", { get() { reads++; return 35; } });
    rejected(accessor, "invalid-input");
    expect(reads).toBe(0);
    const hidden = { ...base };
    Object.defineProperty(hidden, "latitude", { enumerable: false });
    rejected(hidden, "invalid-input");
  });

  for (const hemisphere of [-1, 1]) {
    it(`refuses the complete-ecliptic polar boundary in hemisphere ${hemisphere}`, () => {
      const limit = 90 - chartDeclinations(natalChart(base)).trueObliquity;
      for (const houseSystem of ["placidus", "koch", "whole", "regiomontanus"] as const) {
        for (const absoluteLatitude of [limit, limit + 1e-7, 80, 90]) {
          rejected({ ...base, houseSystem, latitude: hemisphere * absoluteLatitude }, "polar-geometry");
        }
        const justInside = { ...base, houseSystem, latitude: hemisphere * (limit - 1e-7) };
        expect(prepareNatal(justInside).chart.houses).toEqual(natalChart(justInside).houses);
        expect(prepareNatal(justInside).chart.flags).not.toContain("polar-fallback");
      }
    });
  }
});
