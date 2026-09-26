import { describe, expect, it } from "vitest";

import { natalChart, transits } from "./api.js";
import { PLACIDUS_POLAR_FALLBACK } from "./houses.js";
import {
  NATAL_RECEIPT_CONVENTION_SETS,
  createNatalEnvelope,
  natalReplayInput,
  parseNatalEnvelope,
  serializeNatalEnvelope
} from "./receipt.js";
import { normalizeLongitude } from "./signs.js";

/** Signed a − b in arcseconds, across the 0/360 seam. */
const arcsec = (a: number, b: number) => (((((a - b) % 360) + 540) % 360) - 180) * 3600;

/** Porphyry by definition: each quadrant between the angles in three equal parts. */
function trisect(asc: number, mc: number): number[] {
  const upper = normalizeLongitude(asc - mc);
  const lower = 180 - upper;
  const cusp11 = mc + upper / 3;
  const cusp12 = mc + (2 * upper) / 3;
  const cusp2 = asc + lower / 3;
  const cusp3 = asc + (2 * lower) / 3;
  return [asc, cusp2, cusp3, mc + 180, cusp11 + 180, cusp12 + 180, asc + 180, cusp2 + 180, cusp3 + 180, mc, cusp11, cusp12].map(
    normalizeLongitude
  );
}

// Four of the ERFA anchors in angles-erfa.test.ts (the preregistered angle grid,
// pyerfa 2.0.1.5, true obliquity, this engine's clock). Each cusp is a weighted
// mean of the ascendant and the midheaven, so it is held to the ascendant's gate.
const ERFA: ReadonlyArray<readonly [utc: string, latitude: number, asc: number, mc: number]> = [
  ["1950-03-21T18:00:00Z", -66, 135.48915566, 88.789425669],
  ["2100-03-21T06:00:00Z", 66, 320.516526998, 268.946408931],
  ["2025-03-21T18:00:00Z", -45, 179.047837705, 89.545955783],
  ["1800-03-21T06:00:00Z", 0, 358.377100684, 268.634366381]
];

// Inside the polar circle, where Placidus is undefined: Tromsø and Longyearbyen
// (the audit's and the README's cases), McMurdo, and 80° south.
const POLAR: ReadonlyArray<readonly [utc: string, latitude: number, longitude: number]> = [
  ["2001-12-21T09:30:00Z", 69.6492, 18.9553],
  ["2001-12-21T09:00:00Z", 78.2232, 15.6267],
  ["2025-06-21T03:00:00Z", -77.8463, 166.6682],
  ["2025-03-21T18:00:00Z", -80, 0]
];

describe("Porphyry houses (brief v1 rule 1h)", () => {
  it.each(ERFA)("trisects ERFA's angles, %s at %s°", (utc, latitude, asc, mc) => {
    const chart = natalChart({ utc, latitude, longitude: 0, houseSystem: "porphyry" });
    expect(chart.houses?.system).toBe("porphyry");
    const gate = Math.abs(latitude) <= 45 ? 0.5 : 8;
    trisect(asc, mc).forEach((expected, index) => {
      expect(Math.abs(arcsec(chart.houses!.cusps[index]!, expected))).toBeLessThan(gate);
    });
  });

  it.each(POLAR)("computes inside the polar circle, %s at %s°", (utc, latitude, longitude) => {
    const chart = natalChart({ utc, latitude, longitude, houseSystem: "porphyry" });
    expect(chart.houses?.system).toBe("porphyry");
    expect(chart.flags).not.toContain("polar-fallback");
    const { asc, mc } = chart.angles!;
    const cusps = chart.houses!.cusps;
    trisect(asc, mc).forEach((expected, index) => {
      expect(Math.abs(arcsec(cusps[index]!, expected))).toBeLessThan(1e-6);
    });
    // Twelve distinct cusps in zodiacal order: the forward gaps go once round.
    const gaps = cusps.map((cusp, index) => normalizeLongitude(cusps[(index + 1) % 12]! - cusp));
    expect(gaps.every((gap) => gap > 0)).toBe(true);
    expect(gaps.reduce((sum, gap) => sum + gap, 0)).toBeCloseTo(360, 9);

    // Placidus at the same place falls back to the named system, flagged.
    const placidus = natalChart({ utc, latitude, longitude, houseSystem: "placidus" });
    expect(PLACIDUS_POLAR_FALLBACK).toBe("whole");
    expect(placidus.houses?.system).toBe(PLACIDUS_POLAR_FALLBACK);
    expect(placidus.flags).toContain("polar-fallback");
  });

  it("names every system in the input error", () => {
    expect(() =>
      natalChart({ utc: "2000-01-01T12:00:00Z", latitude: 51.5, longitude: 0, houseSystem: "gauquelin" as never })
    ).toThrow(
      'houseSystem must be one of "whole", "placidus", "porphyry", "equal", "vehlow", "koch", ' +
        '"regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian".'
    );
  });

  it("holds a supplied chart's houses to the system its input asked for", () => {
    const chart = natalChart({
      utc: "2001-12-21T09:30:00Z",
      latitude: 69.6492,
      longitude: 18.9553,
      houseSystem: "porphyry"
    });
    expect(() => transits(chart, "2026-01-01T00:00:00Z")).not.toThrow();
    const whole = natalChart({ ...chart.input, houseSystem: "whole" });
    expect(() => transits({ ...chart, houses: whole.houses }, "2026-01-01T00:00:00Z")).toThrow(RangeError);
    expect(() => transits({ ...whole, houses: chart.houses }, "2026-01-01T00:00:00Z")).toThrow(RangeError);
    const placidus = natalChart({ ...chart.input, houseSystem: "placidus" });
    expect(() => transits({ ...placidus, houses: chart.houses }, "2026-01-01T00:00:00Z")).toThrow(RangeError);
  });
});

describe("Porphyry receipts", () => {
  const chart = natalChart({
    utc: new Date("2001-12-21T09:30:00Z"),
    latitude: 69.6492,
    longitude: 18.9553,
    houseSystem: "porphyry",
    timeKnown: true
  });
  const json = serializeNatalEnvelope(createNatalEnvelope(chart));
  const edit = (change: (envelope: any) => void) => {
    const envelope = JSON.parse(json);
    change(envelope);
    return JSON.stringify(envelope);
  };

  it("records, reads and replays a Porphyry chart", () => {
    const parsed = parseNatalEnvelope(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.receipt.houses).toEqual({
      requested: "porphyry",
      actual: "porphyry",
      absenceReason: null
    });
    expect(parsed.envelope.receipt.resultFlags).not.toContain("polar-fallback");
    const replay = natalChart(natalReplayInput(parsed.envelope));
    expect(replay.houses).toEqual(chart.houses);
  });

  it("refuses cusps that do not trisect the quadrants", () => {
    const moved = edit((e) => {
      const cusps = e.result.houses.cusps;
      cusps[10] = normalizeLongitude(cusps[10] + 0.001);
      cusps[4] = normalizeLongitude(cusps[4] + 0.001);
    });
    expect(parseNatalEnvelope(moved)).toMatchObject({ ok: false, code: "inconsistent_result" });
  });

  it("refuses Porphyry where another system was asked for", () => {
    const asked = edit((e) => {
      e.receipt.houses.requested = "placidus";
    });
    expect(parseNatalEnvelope(asked)).toMatchObject({ ok: false, code: "inconsistent_result" });
  });

  it("refuses Porphyry in a receipt from rc.3 to rc.6, which never offered it", () => {
    const old = edit((e) => {
      e.receipt.conventions = { ...NATAL_RECEIPT_CONVENTION_SETS[2] };
      e.receipt.engine = { name: "@zodiacs/engine", version: "0.1.1-rc.6" };
      delete e.result.deltaT;
    });
    expect(parseNatalEnvelope(old)).toMatchObject({ ok: false, code: "inconsistent_result" });
  });
});
