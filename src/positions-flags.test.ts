import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { useDe440 } from "./de440-pack.js";
import { setDefaultEphemeris } from "./ephemeris.js";
import { natalChart, positions, progressedBodies, REFERENCE_SPAN, transits } from "./index.js";

// ZOD-97, T5: positions() at the edge of the reference span flags what natalChart() flags at the same instant.
// Run on the shipped DE440 pack, which useDe440() makes the default source; the suite's setup starts this file on
// astronomy-engine, the package's default from 3.0.0, where no fallback is ever flagged.
beforeAll(() => {
  useDe440();
});
afterAll(() => setDefaultEphemeris("astronomy-engine"));

const INSTANTS = [
  // REFERENCE_SPAN's end, which it excludes, and a minute before its start (by UTC).
  "2200-01-01T00:00:00Z",
  "1799-12-31T23:59:00Z",
  // Past the pack's end: astronomy-engine, flagged as the fallback.
  "2250-01-01T00:00:00Z",
  // Inside both, on a ΔT the IERS table gives: no flag.
  "2000-01-01T12:00:00Z",
  // Inside both, on an extrapolated ΔT.
  "2100-01-01T00:00:00Z"
] as const;

describe("positions() flags", () => {
  it("are natalChart()'s at the same instant, on every row, and absent where it has none", () => {
    for (const utc of INSTANTS) {
      const chart = natalChart({ utc });
      const rows = positions(utc);
      for (const row of rows) {
        if (chart.flags.length === 0) expect(row, utc).not.toHaveProperty("flags");
        else expect(row.flags, utc).toEqual(chart.flags);
        expect(row.ephemeris, utc).toBe(chart.ephemeris?.name);
        expect(row.fallback, utc).toBe(chart.bodies[0]!.fallback);
      }
      // The flags are labels: the positions are the chart's.
      expect(rows.map(({ flags: _flags, ...row }) => row), utc).toEqual(chart.bodies);
    }
  });

  it("say outside-reference-span exactly outside REFERENCE_SPAN", () => {
    const from = Date.parse(REFERENCE_SPAN.from);
    const to = Date.parse(REFERENCE_SPAN.to);
    for (const [ms, outside] of [
      [from - 60_000, true],
      [from, false],
      [to - 60_000, false],
      [to, true]
    ] as const)
      expect(positions(ms)[0]!.flags?.includes("outside-reference-span") ?? false, new Date(ms).toISOString()).toBe(outside);
  });

  it("are carried by transits() and progressedBodies(), which read positions the same way", () => {
    const natal = natalChart({ utc: "1990-05-03T08:30:00+02:00" });
    expect(transits(natal, "2200-01-01T00:00:00Z").positions[0]!.flags).toEqual(natalChart({ utc: "2200-01-01T00:00:00Z" }).flags);
    // A row's flags are its own array.
    const rows = positions("2200-01-01T00:00:00Z");
    rows[0]!.flags!.push("de440-unavailable");
    expect(rows[1]!.flags).not.toContain("de440-unavailable");
    const progressed = progressedBodies("1799-12-01T00:00:00Z", "1800-01-01T00:00:00Z");
    expect(progressed[0]!.flags).toEqual(["outside-reference-span"]);
  });
});
