import { describe, expect, it } from "vitest";
import { calc } from "../../src/calc.js";
import { HORIZONS_2020 } from "../../src/fixtures/horizons-2020.js";
import { ayanamsa } from "../../src/vedic/ayanamsa.js";
import { nakshatraOf } from "../../src/vedic/nakshatra.js";
import { siderealLongitude } from "../../src/vedic/sidereal.js";
import { PANCHANG_AYANAMSAS, luminarySnapshot } from "../src/index.js";
import type { LuminarySnapshot, SnapshotOptions } from "../src/index.js";

const REFERENCE_INSTANT = "2020-01-01T00:00:00Z";
// Fixed before running this adapter. Same coarse smoke threshold as engine.test.ts.
const HORIZONS_SMOKE_TOLERANCE_DEGREES = 0.01;

function snapshot(at = REFERENCE_INSTANT, options: SnapshotOptions = {}): LuminarySnapshot {
  const result = luminarySnapshot(at, options);
  if (result.status !== "ok") throw new Error(`Unexpected refusal: ${result.engine.reason}`);
  return result;
}

describe("independent JPL reference smoke check (SOURCES.md)", () => {
  it("matches the existing published Sun and Moon longitudes at the fixture instant", () => {
    const result = snapshot();
    for (const [body, row] of [["Sun", result.sun], ["Moon", result.moon]] as const) {
      const arc = Math.abs(row.tropical.lon - HORIZONS_2020[body]!);
      expect(Math.min(arc, 360 - arc)).toBeLessThan(HORIZONS_SMOKE_TOLERANCE_DEGREES);
    }
  });
});

describe("engine integration, not independent accuracy evidence", () => {
  it("defaults to Lahiri and retains full receipts, bounds and clock metadata", () => {
    const result = snapshot();
    expect(result.utc).toBe("2020-01-01T00:00:00.000Z");
    expect(result.ayanamsa.name).toBe("lahiri");
    expect(result.ayanamsa.subtracted).toBe("true");
    for (const [body, row] of [["Sun", result.sun], ["Moon", result.moon]] as const) {
      for (const zodiac of ["tropical", "sidereal"] as const) {
        const original = calc({
          body, time: REFERENCE_INSTANT,
          frame: "ecliptic-true-of-date", center: "geocentric",
          zodiac: zodiac === "tropical" ? "tropical" : { sidereal: "lahiri" },
          flags: { correction: "apparent", units: "degrees", speeds: false }
        });
        expect(row[zodiac]).toEqual(original);
        expect(row[zodiac].receipt.engine.name).toBe("@zodiacs/engine");
        expect(row[zodiac].receipt.engine.ephemeris).toEqual({ name: "astronomy-engine", version: "2.1.19" });
        expect(row[zodiac].receipt.instants[0]!.utc).toBe(result.utc);
        expect(row[zodiac].receipt.instants[0]!.timeScale.input).toBe("utc");
      }
    }
  });

  it.each(PANCHANG_AYANAMSAS)("delegates sidereal conversion and nakshatra/pada for %s", (name) => {
    const result = snapshot(REFERENCE_INSTANT, { ayanamsa: name });
    const value = ayanamsa(name, REFERENCE_INSTANT);
    const moon = siderealLongitude(result.moon.tropical.lon, value);
    expect(result.moon.sidereal.lon).toBe(moon.lon);
    expect(result.sun.sidereal.lon).toBe(siderealLongitude(result.sun.tropical.lon, value).lon);
    expect(result.nakshatra).toEqual(nakshatraOf(moon));
    expect(result.ayanamsa.name).toBe(name);
    expect(result.moon.sidereal.receipt.conventions).toContain(`ayanamsa:${name}`);
  });

  it("normalizes a resolved offset instant without mutating the supplied Date", () => {
    const at = new Date(REFERENCE_INSTANT);
    expect(luminarySnapshot(at)).toEqual(snapshot(at.toISOString()));
    expect(at.toISOString()).toBe("2020-01-01T00:00:00.000Z");
    expect(snapshot("2020-01-01T05:30:00+05:30").utc).toBe(snapshot().utc);
    expect(snapshot("2020-01-01T05:30:00+05:30").sun.tropical.receipt.request.time)
      .toEqual({ iso: "2020-01-01T05:30:00+05:30" });
  });

  it("preserves the engine's out-of-range refusal without returning partial positions", () => {
    const result = luminarySnapshot("1700-01-01T00:00:00Z", { ayanamsa: "raman" });
    expect(result.status).toBe("refused");
    if (result.status !== "refused") throw new Error("Expected refusal");
    expect(result.body).toBe("Sun");
    expect(result.ayanamsa).toBe("raman");
    expect(result.engine).toEqual(calc({ body: "Sun", time: "1700-01-01T00:00:00Z" }));
    expect(result).not.toHaveProperty("sun");
    expect(result).not.toHaveProperty("moon");
  });

  it.each(["2020-02-30T00:00:00Z", "2020-01-01T00:00:00", "garbage"])("rejects malformed or unresolved instant %s", (at) => {
    expect(() => luminarySnapshot(at)).toThrow(RangeError);
  });

  it.each([null, [], { ayanamsa: null }, { ayanamsa: "unknown" }, { ayanamsa: "Lahiri" }, { ayanamsa: "lahiri", extra: true }])(
    "rejects invalid options %j", (options) => {
      expect(() => luminarySnapshot(REFERENCE_INSTANT, options as unknown as SnapshotOptions)).toThrow(RangeError);
    }
  );
});
