import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { natalChart, saturnReturn, transits } from "./api.js";
import { chart as calcChart, houses as calcHouses } from "./calc.js";
import { natalConventionIds } from "./convention-ids.js";
import { HOUSE_SYSTEMS, meanObliquity } from "./houses.js";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "./receipt.js";
import { tilt } from "./nutation.js";
import { EPHEMERIS_SPAN } from "./reference-span.js";
import { timeBasis } from "./time-scale.js";
import type { BirthInput, Chart } from "./types.js";

// Synthetic instants and places only; no person's birth data.
const SOLSTICE = "2021-06-21T00:00:00Z";
const at = (latitude: number, changes: Partial<BirthInput> = {}): Chart =>
  natalChart({ utc: SOLSTICE, latitude, longitude: 0, houseSystem: "whole", ...changes });
/** The shorter arc between two longitudes, 0 to 180 degrees. */
const arc = (from: number, to: number) => {
  const d = (((to - from) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
};

describe('"polar-angles": the angles inside the polar circle', () => {
  it.each([67, 70, 78.22, 89.99, 90, -67, -70, -90])("flags every chart with angles at %s°", (latitude) => {
    for (const houseSystem of HOUSE_SYSTEMS) {
      expect(at(latitude, { houseSystem }).flags).toContain("polar-angles");
    }
  });

  it.each([0, 40, 60, 66, -66])("leaves a chart at %s° unflagged", (latitude) => {
    expect(at(latitude).flags).not.toContain("polar-angles");
  });

  it("sets the ascendant to 0° or 180° at either pole, through the day", () => {
    const start = Date.parse(SOLSTICE);
    for (const latitude of [90, -90]) {
      for (let hour = 0; hour < 24; hour += 0.5) {
        const chart = natalChart({ utc: new Date(start + hour * 3_600_000).toISOString(), latitude, longitude: 0, houseSystem: "whole" });
        expect([0, 180]).toContain(chart.angles!.asc);
      }
    }
  });

  it("leaves a chart without a birth time unflagged, which has no angles", () => {
    expect(at(78, { timeKnown: false }).flags).not.toContain("polar-angles");
  });

  it("is on each minute of a day at 70° N, through both half-circle turns of the ascendant", () => {
    const start = Date.parse(SOLSTICE);
    let turns = 0;
    let previous: number | undefined;
    for (let minute = 0; minute <= 1440; minute += 1) {
      const chart = natalChart({ utc: new Date(start + minute * 60_000).toISOString(), latitude: 70, longitude: 0, houseSystem: "whole" });
      expect(chart.flags).toContain("polar-angles");
      const asc = chart.angles!.asc;
      if (previous !== undefined && arc(previous, asc) > 90) turns += 1;
      previous = asc;
    }
    expect(turns).toBe(2);
  });

  it("is echoed where it holds and refused where it does not", () => {
    expect(at(78, { flags: ["polar-angles"] }).flags).toContain("polar-angles");
    expect(() => at(40, { flags: ["polar-angles"] })).toThrow(RangeError);
    expect(() => at(78, { flags: ["polar-angles"], timeKnown: false })).toThrow(RangeError);
    expect(() =>
      saturnReturn({ utc: SOLSTICE, latitude: 40, longitude: 0, houseSystem: "whole", flags: ["polar-angles"] })
    ).toThrow(RangeError);
    expect(() =>
      saturnReturn({ utc: SOLSTICE, latitude: 78, longitude: 0, houseSystem: "whole", flags: ["polar-angles"] })
    ).not.toThrow();
  });

  it("is set by calc's houses() and chart() as by natalChart", () => {
    const place = { latitude: 70, longitude: 0 };
    const houses = calcHouses({ time: SOLSTICE, place, houseSystem: "whole" });
    if (houses.status !== "ok") throw new Error(houses.reason);
    expect(houses.flags).toContain("polar-angles");
    const given = calcChart({ time: SOLSTICE, place, houseSystem: "whole" });
    if (given.status !== "ok") throw new Error(given.reason);
    expect(given.chart.flags).toContain("polar-angles");
    const south = calcHouses({ time: SOLSTICE, place: { latitude: 40, longitude: 0 }, houseSystem: "whole" });
    if (south.status !== "ok") throw new Error(south.reason);
    expect(south.flags).not.toContain("polar-angles");
  });

  it("is checked on a supplied chart: allowed inside the circle, refused outside, optional for a chart before the flag", () => {
    const polar = at(78);
    expect(() => transits(polar, "2026-01-01T00:00:00Z")).not.toThrow();
    const older = { ...polar, flags: polar.flags.filter((flag) => flag !== "polar-angles") };
    expect(() => transits(older, "2026-01-01T00:00:00Z")).not.toThrow();
    for (const latitude of [40, 65.5, 66, -66, 66.55]) {
      const outside = at(latitude);
      expect(outside.flags).not.toContain("polar-angles");
      expect(() => transits({ ...outside, flags: [...outside.flags, "polar-angles"] }, "2026-01-01T00:00:00Z")).toThrow(
        RangeError
      );
    }
  });

  it("round-trips in a natal receipt, and a receipt claiming it away from the pole is refused", () => {
    const envelope = createNatalEnvelope(at(78));
    expect(envelope.receipt.resultFlags).toContain("polar-angles");
    expect(parseNatalEnvelope(serializeNatalEnvelope(envelope))).toEqual({ ok: true, envelope });
    for (const latitude of [40, 65.2, 66, -66, 66.55]) {
      const outside = JSON.parse(serializeNatalEnvelope(createNatalEnvelope(at(latitude))));
      outside.receipt.resultFlags.push("polar-angles");
      // With the convention ids made consistent again, so that only the flag check can refuse it.
      outside.receipt.conventionIds = natalConventionIds(outside);
      expect(parseNatalEnvelope(JSON.stringify(outside))).toMatchObject({ ok: false, code: "inconsistent_result" });
    }
    // The control: the same edit inside the circle, where the flag holds, parses.
    const inside = JSON.parse(serializeNatalEnvelope(createNatalEnvelope(at(70))));
    inside.receipt.resultFlags = inside.receipt.resultFlags.filter((flag: string) => flag !== "polar-angles");
    inside.receipt.resultFlags.push("polar-angles");
    inside.receipt.conventionIds = natalConventionIds(inside);
    expect(parseNatalEnvelope(JSON.stringify(inside))).toMatchObject({ ok: true });
  });

  // Synthetic instants from 2937 to 3995, each one where the nutation in
  // obliquity puts the engine's own threshold, 90 - (e0 + de), below the
  // straight-line bound that 2.0.0-rc.1 checked a claim against
  // (66.55772 + 4.1227e-15 a millisecond from J2000), because that bound left
  // out the t^2 to t^5 terms of e0 (16" by 3999). There a chart the engine
  // flagged was refused when passed back in.
  const LINEAR_BOUND = (ms: number) => 66.55772 + (ms - 946_728_000_000) * 4.1227e-15;
  const LATE = ["2937-03-18T00:00:00Z", "2955-09-23T00:00:00Z", "3197-09-19T00:00:00Z", "3991-10-06T00:00:00Z", "3995-10-07T00:00:00Z"];
  /** The least |latitude| on [66, 67] at which natalChart flags the chart, to 1e-10 degrees. */
  const flagFrom = (changes: Partial<BirthInput>, sign: 1 | -1): number => {
    let [lo, hi] = [66, 67];
    for (let step = 0; step < 34; step += 1) {
      const mid = (lo + hi) / 2;
      const flags = natalChart({ utc: SOLSTICE, latitude: sign * mid, longitude: 0, houseSystem: "whole", ...changes }).flags;
      if (flags.includes("polar-angles")) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  const roundTrips = (chart: Chart) => {
    expect(() => transits(chart, "2026-01-01T00:00:00Z")).not.toThrow();
    const envelope = createNatalEnvelope(chart);
    expect(envelope.receipt.resultFlags).toContain("polar-angles");
    expect(parseNatalEnvelope(serializeNatalEnvelope(envelope))).toEqual({ ok: true, envelope });
  };
  const claimed = (chart: Chart): Chart => ({ ...chart, flags: [...chart.flags, "polar-angles"] });
  const refused = (chart: Chart) => {
    expect(chart.flags).not.toContain("polar-angles");
    expect(() => transits(claimed(chart), "2026-01-01T00:00:00Z")).toThrow(RangeError);
    const edited = JSON.parse(serializeNatalEnvelope(createNatalEnvelope(chart)));
    edited.receipt.resultFlags.push("polar-angles");
    edited.receipt.conventionIds = natalConventionIds(edited);
    expect(parseNatalEnvelope(JSON.stringify(edited))).toMatchObject({ ok: false, code: "inconsistent_result" });
  };

  describe.each(LATE)("at %s, past the straight-line bound", (utc) => {
    const allowedFrom = 90 - meanObliquity(timeBasis(Date.parse(utc)).ttDays / 36_525) - 0.003;

    it.each([1, -1] as const)("round-trips the chart the engine flags at the edge of the circle (hemisphere %s)", (sign) => {
      const edge = flagFrom({ utc }, sign);
      // The case 2.0.0-rc.1 refused: the engine flags the chart below the old bound.
      expect(edge).toBeLessThan(LINEAR_BOUND(Date.parse(utc)));
      expect(edge).toBeGreaterThanOrEqual(allowedFrom);
      const chart = natalChart({ utc, latitude: sign * edge, longitude: 0, houseSystem: "whole" });
      expect(chart.flags).toContain("polar-angles");
      roundTrips(chart);
    });

    it.each([1, -1] as const)("still refuses a claim 0.0005 degrees outside the allowed band (hemisphere %s)", (sign) => {
      refused(natalChart({ utc, latitude: sign * (allowedFrom - 0.0005), longitude: 0, houseSystem: "whole" }));
      // Inside the 0.003-degree band below the circle, a claim on an unflagged chart is allowed, as from 1.1.0.
      const band = natalChart({ utc, latitude: sign * (allowedFrom + 0.0002), longitude: 0, houseSystem: "whole" });
      expect(band.flags).not.toContain("polar-angles");
      expect(() => transits(claimed(band), "2026-01-01T00:00:00Z")).not.toThrow();
    });
  });

  it("reads the mean obliquity at the chart's TT, here 95 years before its instant on a pinned delta T", () => {
    const changes = { utc: "3197-09-19T00:00:00Z", deltaT: -3e9 };
    const tt = timeBasis(Date.parse(changes.utc), "utc", changes.deltaT).ttDays;
    const allowedFrom = 90 - meanObliquity(tt / 36_525) - 0.003;
    for (const sign of [1, -1] as const) {
      const edge = flagFrom(changes, sign);
      // Read at the instant instead, the bound would refuse the engine's own flag by about 44".
      expect(90 - meanObliquity((Date.parse(changes.utc) - 946_728_000_000) / 3_155_760_000_000) - 0.003).toBeGreaterThan(edge);
      roundTrips(natalChart({ ...changes, latitude: sign * edge, longitude: 0, houseSystem: "whole" }));
      refused(natalChart({ ...changes, latitude: sign * (allowedFrom - 0.0005), longitude: 0, houseSystem: "whole" }));
    }
  });

  it("keeps the nutation in obliquity under 10\" over the ephemeris span, inside the 0.003-degree (10.8\") margin", () => {
    const { from, to } = EPHEMERIS_SPAN.daysFromJ2000;
    let largest = 0;
    for (let tt = from; tt <= to; tt += 1) largest = Math.max(largest, Math.abs(tilt(tt).deps));
    // Every day from 0001 to 3998 (TT): 9.97" at most, 9.96" already in 1866.
    expect(largest).toBeLessThan(10);
    expect(largest).toBeGreaterThan(9.95);
  });

  it("checks a receipt on the same mean obliquity polynomial as src/houses.ts, term for term", () => {
    const terms = (file: string, from: string, to: string) => {
      const text = readFileSync(new URL(file, import.meta.url), "utf8");
      const start = text.indexOf(from);
      const body = text.slice(start, text.indexOf(to, start)).replace(/\s+/g, "");
      return [...body.matchAll(/([-+]?)(\d+\.\d+)(\*t(?:\*t|\*\*(\d))?)?/g)].map(([, sign, coefficient, power, exponent]) => [
        sign || "+",
        coefficient,
        power === undefined ? 0 : exponent ?? (power === "*t*t" ? "2" : "1")
      ]);
    };
    const houses = terms("./houses.ts", "export function meanObliquity", "return arcseconds");
    expect(houses).toHaveLength(6);
    expect(terms("./receipt.ts", "const meanObliquity =", "/ 3600")).toEqual(houses);
  });
});
