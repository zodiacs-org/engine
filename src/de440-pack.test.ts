/**
 * `@zodiacs/engine/de440/pack`: the pack the package ships.
 *
 * Its bytes are held to the digest and size that `docs/de440.md` names,
 * hashed here with node:crypto, which the entry does not use
 * (`scripts/build-de440-pack.test.mjs` holds the committed file to its
 * generator). Its accuracy is held to an arbiter that is not this
 * engine: the conformance suite's 240 L1 vectors, JPL Horizons's apparent
 * geocentric places from DE441 at 24 TT instants from 1851 to 2148 for ten
 * bodies, carried into the IAU 2006/2000A true ecliptic of date
 * (`conformance/arbiters/l1/`). The instants are TT on both sides, so no ΔT
 * model enters.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DE440_PACK, de440PackBytes, openShippedDe440Pack, shippedDe440Source } from "./de440-pack.js";
import { EPHEMERIS, natalChart, positions, setDefaultEphemeris, withEphemeris } from "./index.js";
import { createNatalEnvelope } from "./receipt.js";

interface Vector {
  id: string;
  input: { body: string; jd_tt: number };
  expected: { lon: number; lat: number };
  tolerance: { lon: { abs: number; unit: string }; lat: { abs: number; unit: string } };
}
const vectors: Vector[] = JSON.parse(readFileSync(new URL("../conformance/vectors/L1-positions.json", import.meta.url), "utf8")).vectors;
const dateOfJd = (jd: number): Date => new Date(Math.round((jd - 2440587.5) * 86_400_000));
/** a − b on the circle, arcseconds. */
const wrapArcsec = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360 - 180) * 3600;

describe("the shipped DE440 pack", () => {
  it("is the sealed pack docs/de440.md names, byte for byte", () => {
    const bytes = de440PackBytes();
    expect(bytes.byteLength).toBe(2_489_664);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("51428874d9a47213abc0ff42cbcec65f338624eaa2d8831f0e6ddc3654bf1fa7");
    expect(DE440_PACK.bytes).toBe(bytes.byteLength);
    expect(DE440_PACK.sha256).toBe("51428874d9a47213abc0ff42cbcec65f338624eaa2d8831f0e6ddc3654bf1fa7");
    expect(DE440_PACK.kernel.sha256).toBe("a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5");
    expect(Object.isFrozen(DE440_PACK) && Object.isFrozen(DE440_PACK.kernel)).toBe(true);
  });

  it("gives a new array at each call", () => {
    const first = de440PackBytes();
    first[0] = first[0]! ^ 0xff;
    expect(de440PackBytes()[0]).not.toBe(first[0]);
  });

  it("opens as a DE440 source that names the pack, the same source at each call", async () => {
    const source = await openShippedDe440Pack();
    expect(source.ephemeris).toEqual({ name: "jpl-de440", version: DE440_PACK.sha256 });
    expect(source.pack.sha256).toBe(DE440_PACK.sha256);
    expect(source.pack.bytes).toBe(DE440_PACK.bytes);
    expect(source.pack.compiler).toEqual({ name: "zodiacs precision compiler", version: "2.0.0" });
    expect(await openShippedDe440Pack()).toBe(source);
    // The coverage is the years the description gives: TDB seconds past J2000.
    const yearStart = (year: number): number => (Date.UTC(year, 0, 1) - Date.UTC(2000, 0, 1, 12)) / 1000;
    expect(source.pack.startEtSecTdb).toBeLessThanOrEqual(yearStart(DE440_PACK.fromYear));
    expect(source.pack.stopEtSecTdb).toBeGreaterThanOrEqual(yearStart(DE440_PACK.toYear));
  });

  it("is within 1″ of Horizons (DE441) at all 240 L1 vectors, through withEphemeris", async () => {
    const source = await openShippedDe440Pack();
    expect(vectors).toHaveLength(240);
    let largestLon = 0;
    let largestLat = 0;
    let within = 0;
    for (const vector of vectors) {
      expect(vector.tolerance.lon).toMatchObject({ abs: 1, unit: "arcsec" });
      expect(vector.tolerance.lat).toMatchObject({ abs: 1, unit: "arcsec" });
      const chart = withEphemeris(source, () => natalChart({ utc: dateOfJd(vector.input.jd_tt), timeScale: "tt", timeKnown: false }));
      expect(chart.ephemeris).toEqual(source.ephemeris);
      const body = chart.bodies.find((candidate) => candidate.body === vector.input.body)!;
      const dLon = Math.abs(wrapArcsec(body.lon, vector.expected.lon));
      const dLat = Math.abs((body.lat - vector.expected.lat) * 3600);
      if (dLon <= 1 && dLat <= 1) within += 1;
      largestLon = Math.max(largestLon, dLon);
      largestLat = Math.max(largestLat, dLat);
    }
    expect(within).toBe(240);
    // The largest differences, rounded up: 0.0127″ in longitude and 0.0011″ in latitude, both the Moon's.
    expect(largestLon).toBeLessThanOrEqual(0.0127);
    expect(largestLat).toBeLessThanOrEqual(0.0011);
  });

  it("is the source a plain call uses by default, and not after setDefaultEphemeris(\"astronomy-engine\")", async () => {
    const source = await openShippedDe440Pack();
    expect(shippedDe440Source()).toBe(source);
    const at = "1990-04-15T08:30:00Z";
    setDefaultEphemeris("de440");
    try {
      const inside = withEphemeris(source, () => positions(at));
      expect(positions(at)).toEqual(inside);
      expect(natalChart({ utc: at, latitude: 51.5, longitude: -0.12 }).ephemeris).toEqual(source.ephemeris);
      setDefaultEphemeris("astronomy-engine");
      const fallback = positions(at);
      expect(fallback.find((row) => row.body === "Neptune")!.lon).not.toBe(inside.find((row) => row.body === "Neptune")!.lon);
      const chart = natalChart({ utc: at, latitude: 51.5, longitude: -0.12 });
      expect(chart.ephemeris).toBeUndefined();
      expect(createNatalEnvelope(chart).receipt.engine.ephemeris).toEqual({ name: EPHEMERIS.name, version: EPHEMERIS.version });
    } finally {
      setDefaultEphemeris("astronomy-engine");
    }
  });

  it("writes a DE440 receipt that names the shipped pack", async () => {
    const source = await openShippedDe440Pack();
    const chart = withEphemeris(source, () => natalChart({ utc: "1990-04-15T08:30:00Z", latitude: 51.5, longitude: -0.12 }));
    const envelope = createNatalEnvelope(chart);
    expect(envelope.receipt.engine.ephemeris).toEqual({ name: "jpl-de440", version: DE440_PACK.sha256 });
    expect(envelope.requiredFeatures).toContain("ephemeris-jpl-de440");
  });
});
