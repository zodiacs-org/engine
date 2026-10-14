import { describe, expect, it } from "vitest";

import {
  ENGINE_VERSION,
  EPHEMERIS,
  createNatalEnvelope,
  eclipticRows,
  eclipticToEquatorial,
  equatorRows,
  natalChart,
  onChartClock,
  parseNatalEnvelope,
  serializeNatalEnvelope,
  skyEvents,
  turn
} from "../src/engine.js";

describe("direct engine source integration", () => {
  it("retains the native receipt of an invented chart", () => {
    const birth = {
      utc: "2000-03-20T06:00:00Z",
      latitude: 12,
      longitude: 30,
      houseSystem: "whole" as const
    };
    const chart = natalChart(birth);
    const envelope = createNatalEnvelope(chart, { sourceInstant: birth.utc });
    expect(envelope.receipt.engine).toEqual({
      name: "@zodiacs/engine",
      version: ENGINE_VERSION,
      ephemeris: EPHEMERIS
    });
    expect(envelope.receipt.coordinates).toEqual({ latitude: 12, longitude: 30 });
    expect(envelope.receipt.sourceInstant).toBe(birth.utc);
    expect(envelope.receipt.houses).toEqual({
      requested: "whole", actual: "whole", absenceReason: null
    });
    const parsed = parseNatalEnvelope(serializeNatalEnvelope(envelope));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.envelope).toEqual(envelope);
  });

  it("suppresses unavailable angles without inventing a birth time", () => {
    const chart = natalChart({
      utc: "2000-03-20T06:00:00Z",
      latitude: 12,
      longitude: 30,
      timeKnown: false
    });
    expect(chart.angles).toBeNull();
    expect(createNatalEnvelope(chart).receipt.houses.absenceReason).toBe("unknown-time");
  });

  it("uses the engine's clock to place the TT J2000 epoch at day zero", () => {
    const ms = Date.parse("2000-01-01T12:00:00Z");
    onChartClock(ms, "tt", 0, (time, basis) => {
      expect(time.tt).toBe(0);
      expect(time.ut).toBe(0);
      expect(basis.ttDays).toBe(0);
      expect(basis.ut1Days).toBe(0);
      expect(basis.deltaT.model).toBe("pinned");
    });
  });

  it("propagates the existing sky solver's whole-result budget refusal", () => {
    const result = skyEvents(
      "Sun",
      { latitude: 12, longitude: 30 },
      "2000-03-20T00:00:00Z",
      "2000-03-21T00:00:00Z",
      { limb: "centre", refraction: "none", maxSamples: 1 }
    );
    expect(result.status).toBe("refused");
    if (result.status === "refused") expect(result.reason).toBe("sample-budget");
    expect(result.events).toEqual([]);
    expect(result.samples).toBeLessThanOrEqual(1);
    expect(result.conventions).toEqual({ limb: "centre", refraction: "none", refractionArcmin: 0 });
  });
});

describe("hand-derived geometry, not saved engine output", () => {
  it("has identity mean-equator precession at J2000", () => {
    const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const;
    for (const axis of axes) {
      const found = turn(equatorRows(0, "mean"), axis[0], axis[1], axis[2]);
      for (const [i, coordinate] of axis.entries()) expect(found[i]).toBeCloseTo(coordinate, 12);
    }
  });

  it("rotates J2000 basis vectors to the mean ecliptic by the epoch obliquity", () => {
    // Published IAU 2006 J2000 obliquity, arcseconds. See GEOMETRY.md.
    const eps = (84381.406 / 3600) * Math.PI / 180;
    const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const;
    const expected = [[1, 0, 0], [0, Math.cos(eps), -Math.sin(eps)], [0, Math.sin(eps), Math.cos(eps)]];
    for (const [i, axis] of axes.entries()) {
      const found = turn(eclipticRows(0, "mean"), axis[0], axis[1], axis[2]);
      for (const [j, coordinate] of expected[i]!.entries()) expect(found[j]).toBeCloseTo(coordinate, 12);
    }
  });

  it.each([
    [0, 0, 0],
    [90, 90, 30],
    [180, 180, 0],
    [270, 270, -30]
  ])("rotates longitude %s on the ecliptic to RA %s and declination %s", (lon, ra, dec) => {
    const found = eclipticToEquatorial(lon, 0, 30);
    expect(found.ra).toBeCloseTo(ra, 12);
    expect(found.dec).toBeCloseTo(dec, 12);
    expect(found.raDefined).toBe(true);
  });

  it("leaves RA undefined for a constructed celestial pole", () => {
    const found = eclipticToEquatorial(90, 60, 30);
    expect(found.dec).toBeCloseTo(90, 12);
    expect(found.ra).toBeNull();
    expect(found.raDefined).toBe(false);
  });
});

