/*
 * From 0.1.1-rc.16 receipts name the nutation. The current conventions set,
 * NATAL_RECEIPT_CONVENTION_SETS[0], is rc.15's time-basis set with `nutation`
 * (the engine's IAU 2000B series, src/nutation.ts) and the Moon's source,
 * astronomy-engine's GeoMoon turned by the engine's frame in place of its
 * EclipticGeoMoon. rc.15's set, [1], stays readable, from rc.15 alone.
 * src/fixtures/receipt-rc15.json was serialized by the carried 0.1.1-rc.15
 * archive (artifacts/zodiacs-engine-0.1.1-rc.15.tgz, sha256
 * 24eeb597b0157598c0faa26bb615c0cb5dfaaeac0393d62c73fbd37c5da4d348) for the
 * synthetic chart of the rc.13 and rc.14 fixtures, 1990-06-15 08:30 in New
 * York, resolved as rc.15 resolves a local birth
 * (docs/evidence/rc16-20260930/make-receipt-rc15.mjs).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { natalChart } from "./api.js";
import { resolveLocalBirth } from "./geo/timezone.js";
import {
  NATAL_RECEIPT_CONVENTION_SETS,
  createNatalEnvelope,
  natalReplayInput,
  parseNatalEnvelope,
  serializeNatalEnvelope
} from "./receipt.js";
import type { NatalEnvelope, NatalEnvelopeErrorCode } from "./receipt.js";

const RC15 = readFileSync(new URL("./fixtures/receipt-rc15.json", import.meta.url), "utf8");
const NUTATION = "iau2000b;equation-of-equinoxes-with-two-complementary-terms";

/** Parse after `change` edits a JSON copy; the codec's verdict. */
function verdict(envelope: NatalEnvelope | string, change: (copy: any) => void = () => {}): "ok" | NatalEnvelopeErrorCode {
  const copy = JSON.parse(typeof envelope === "string" ? envelope : serializeNatalEnvelope(envelope));
  change(copy);
  const parsed = parseNatalEnvelope(JSON.stringify(copy));
  return parsed.ok ? "ok" : parsed.code;
}

/** The same chart as the fixture, resolved and computed by this engine. */
function current(): NatalEnvelope {
  const { birth, resolution, reference } = resolveLocalBirth({
    date: "1990-06-15",
    time: "08:30",
    timeZone: "America/New_York",
    latitude: 40.7128,
    longitude: -74.006,
    houseSystem: "placidus"
  });
  return createNatalEnvelope(natalChart(birth), { reference, localResolution: resolution.localResolution });
}

describe("the conventions set of this engine", () => {
  it("is rc.15's with the nutation named and the Moon's source", () => {
    const set = NATAL_RECEIPT_CONVENTION_SETS[0]!;
    const rc15 = NATAL_RECEIPT_CONVENTION_SETS[1]!;
    expect(set).toEqual({
      ...rc15,
      moonPosition: "astronomy-engine-geo-moon;no-light-time;no-aberration",
      nutation: NUTATION
    });
    expect(rc15).not.toHaveProperty("nutation");
    expect(rc15.moonPosition).toBe("astronomy-engine-ecliptic-geo-moon;no-light-time;no-aberration");
    const envelope = current();
    expect(envelope.receipt.conventions).toEqual(set);
    expect(envelope.receipt.engine.version).toBe("1.0.0-rc.1");
    expect(verdict(envelope)).toBe("ok");
  });

  it("is refused without the nutation, with another nutation, or with rc.15's Moon", () => {
    const envelope = current();
    expect(verdict(envelope, (copy) => delete copy.receipt.conventions.nutation)).toBe("unsupported_feature");
    expect(verdict(envelope, (copy) => (copy.receipt.conventions.nutation = "iau2000b-five-terms"))).toBe("unsupported_feature");
    expect(verdict(envelope, (copy) => (copy.receipt.conventions.moonPosition = NATAL_RECEIPT_CONVENTION_SETS[1]!.moonPosition))).toBe(
      "unsupported_feature"
    );
  });

  it("is accepted from 0.1.1-rc.16 on, in SemVer order, and refused before", () => {
    const envelope = current();
    for (const version of ["0.1.1-rc.16", "0.1.1-rc.16+build.7", "0.1.1-rc.16.1", "0.1.1-rc.17", "0.1.1", "1.0.0"]) {
      expect(verdict(envelope, (copy) => (copy.receipt.engine.version = version)), version).toBe("ok");
    }
    for (const version of ["0.1.1-rc.15", "0.1.1-rc.15.1", "0.1.1-rc.15+build.1", "0.1.1-rc.14", "0.1.1-beta", "0.1.1-rc"]) {
      expect(verdict(envelope, (copy) => (copy.receipt.engine.version = version)), version).toBe("inconsistent_result");
    }
  });
});

describe("a receipt written by 0.1.1-rc.15 (the time-basis set)", () => {
  it("still parses, under the set its engine recorded", () => {
    const parsed = parseNatalEnvelope(RC15);
    if (!parsed.ok) throw new Error(parsed.code);
    const { receipt, result } = parsed.envelope;
    expect(receipt.conventions).toEqual(NATAL_RECEIPT_CONVENTION_SETS[1]);
    expect(receipt.engine).toEqual({ name: "@zodiacs/engine", version: "0.1.1-rc.15", ephemeris: { name: "astronomy-engine", version: "2.1.19" } });
    expect(receipt.timeScale).toBe("utc");
    expect(result.timeScale?.basis).toBe("iers");
    expect(receipt.localResolution).toMatchObject({ timeZone: "America/New_York", offsetMinutes: -240, calendar: "gregorian", clock: "legal" });
    expect(serializeNatalEnvelope(parsed.envelope)).toBe(serializeNatalEnvelope(JSON.parse(RC15)));
  });

  it("is accepted from 0.1.1-rc.15 alone", () => {
    for (const version of ["0.1.1-rc.15", "0.1.1-rc.15+build.1"]) {
      expect(verdict(RC15, (copy) => (copy.receipt.engine.version = version)), version).toBe("ok");
    }
    for (const version of ["0.1.1-rc.16", "0.1.1-rc.15.1", "0.1.1-rc.14", "0.1.1", "0.2.0"]) {
      expect(verdict(RC15, (copy) => (copy.receipt.engine.version = version)), version).toBe("inconsistent_result");
    }
  });

  it("replays as the request it records; the nutation moves the result by well under an arcsecond", () => {
    const parsed = parseNatalEnvelope(RC15);
    if (!parsed.ok) throw new Error(parsed.code);
    const replay = natalReplayInput(parsed.envelope);
    expect(replay).toMatchObject({ utc: "1990-06-15T12:30:00.000Z", houseSystem: "placidus", latitude: 40.7128, longitude: -74.006 });
    const chart = natalChart(replay);
    const stored = parsed.envelope.result;
    // The same time basis: only the nutation differs, by at most 0.27″ in a
    // longitude, and so in the angles and the cusps.
    expect(chart.timeScale).toEqual(stored.timeScale);
    expect(chart.deltaT).toEqual(stored.deltaT);
    const arcsec = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180) * 3600;
    let moved = 0;
    for (const body of stored.bodies) {
      const now = chart.bodies.find((row) => row.body === body.body)!;
      moved = Math.max(moved, arcsec(now.lon, body.lon));
      expect(arcsec(now.lon, body.lon)).toBeLessThan(0.3);
      expect(Math.abs(now.lat - body.lat) * 3600).toBeLessThan(1e-6);
    }
    expect(moved).toBeGreaterThan(0.01);
    for (const key of ["asc", "mc"] as const) expect(arcsec(chart.angles![key], stored.angles![key])).toBeLessThan(1);
    chart.houses!.cusps.forEach((cusp, index) => expect(arcsec(cusp, stored.houses!.cusps[index]!)).toBeLessThan(1));
    // Replayed today, its receipt is of the current set, under this version.
    const today = createNatalEnvelope(chart);
    expect(today.receipt.conventions).toEqual(NATAL_RECEIPT_CONVENTION_SETS[0]);
    expect(verdict(today)).toBe("ok");
  });
});
