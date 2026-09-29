import { describe, expect, it } from "vitest";

import {
  EPHEMERIS_SPAN,
  chartDeclinations,
  chartPoints,
  findLongitudeCrossings,
  moonPhase,
  natalChart,
  positions,
  progressedBodies,
  saturnReturn,
  transits
} from "./index.js";

const OUTSIDE = /^The instant is outside the ephemeris span/;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

describe("the ephemeris span", () => {
  it("is astronomy-engine's own tabulated range, J2000 ± 730,000 days of TT", () => {
    expect(EPHEMERIS_SPAN.timeScale).toBe("TT");
    expect(EPHEMERIS_SPAN.daysFromJ2000).toEqual({ from: -730000, to: 730000 });
    expect(Date.parse(`${EPHEMERIS_SPAN.fromTT}Z`)).toBe(J2000_MS - 730000 * 86_400_000);
    expect(Date.parse(`${EPHEMERIS_SPAN.toTT}Z`)).toBe(J2000_MS + 730000 * 86_400_000);
    expect(Object.isFrozen(EPHEMERIS_SPAN) && Object.isFrozen(EPHEMERIS_SPAN.daysFromJ2000)).toBe(true);
  });

  it("evaluates instants just inside either end on the model ΔT clock", () => {
    for (const utc of ["0001-05-01T00:00:00Z", "3998-09-02T00:00:00Z"]) {
      const rows = positions(utc);
      expect(rows).toHaveLength(12);
      expect(rows.every((row) => Number.isFinite(row.lon) && Number.isFinite(row.speed))).toBe(true);
    }
  });

  it("refuses an instant, or any of its speed samples, outside the span", () => {
    // TT = UT + ΔT (about 2.9 hours in year 1, 4.0 hours in 3998).
    expect(() => positions("0001-04-30T00:00:00Z")).toThrow(OUTSIDE);
    expect(() => positions("3998-09-03T12:00:00Z")).toThrow(OUTSIDE);
    // Inside by itself, but the nodes' samples six hours earlier are not.
    expect(() => positions("0001-04-30T09:30:00Z")).toThrow(OUTSIDE);
  });

  it("refuses far dates at once instead of integrating for minutes", () => {
    const started = performance.now();
    for (const utc of ["+030000-06-01T00:00:00Z", "-030000-06-01T00:00:00Z", "+270000-06-01T00:00:00Z", "-000500-06-01T00:00:00Z"]) {
      expect(() => positions(utc)).toThrow(RangeError);
      expect(() => positions(utc)).toThrow(OUTSIDE);
    }
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it("applies to every calculation that evaluates the ephemeris", () => {
    const far = "4000-01-01T00:00:00Z";
    const calls: [string, () => unknown][] = [
      ["natalChart", () => natalChart({ utc: far, latitude: 10, longitude: 20 })],
      ["chartDeclinations", () => chartDeclinations({ utc: far })],
      ["chartPoints", () => chartPoints({ utc: far, latitude: 10, longitude: 20 })],
      ["moonPhase", () => moonPhase(far)],
      ["transits", () => transits({ utc: "2000-01-01" }, far)],
      // 1,001 years of life after 3998-08-30 map to about 1,001 days later, past the end.
      ["progressedBodies", () => progressedBodies("3998-08-30", "+005000-01-01")],
      ["findLongitudeCrossings", () => findLongitudeCrossings("Sun", 0, new Date("3998-01-01"), new Date("3999-06-01"))],
      ["saturnReturn", () => saturnReturn("3950-01-01")]
    ];
    for (const [name, call] of calls) expect(call, name).toThrow(OUTSIDE);
  });

  it("checks Terrestrial Time on a pinned clock and restores the model afterwards", () => {
    const expected = positions("2000-01-01T00:00:00Z");
    // −1e10 s is about 317 years: year 100 on this clock is TT year −217.
    expect(() => natalChart({ utc: "0100-01-01T00:00:00Z", deltaT: -1e10 })).toThrow(OUTSIDE);
    expect(natalChart({ utc: "2000-01-01T00:00:00Z", deltaT: 1e10 }).bodies).toHaveLength(12);
    expect(positions("2000-01-01T00:00:00Z")).toEqual(expected);
  });
});
