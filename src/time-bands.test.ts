// The bands of the time basis (src/time-bands.ts), as
// docs/evidence/1.1.0-rc.2-20261102/time-bands/PREREGISTRATION.md fixes them
// (R1 and R3): the named tests of its section 6 that concern timeBands. Every
// row of R1; each seam of corpus T3, a millisecond either side; the same bands
// from a TimeBasis, a Chart, a calc instant and a natal result; the exact
// zeros; and a RangeError for a record without a time scale. The bands in
// ./calc's results are tested in src/calc.test.ts.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { natalChart } from "./api.js";
import { calc } from "./calc.js";
import type { CalcPosition } from "./calc.js";
import { createNatalEnvelope, parseNatalEnvelope } from "./receipt.js";
import { timeBands } from "./time-bands.js";
import type { TimeBands } from "./time-bands.js";
import { timeBasis } from "./time-scale.js";
import type { TimeBasis, TimeScaleName } from "./time-scale.js";
import * as time from "./time.js";

const DAY = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const at = (iso: string) => Date.parse(iso);
/** d and u, the ΔT band and the UT1 − UTC band a record holds, 0 where it holds none. */
const dOf = (basis: TimeBasis) => basis.deltaT.sigma ?? 0;
const uOf = (basis: TimeBasis) => basis.timeScale.ut1MinusUtc?.sigma ?? 0;
/** A band that R3 makes zero is exactly +0. */
const zero = (value: number) => Object.is(value, 0);

describe("the time bands", () => {
  it("give every row of R1", () => {
    // [instant, scale, pin, the basis it must lie on, the row's bands from d and u, which of d and u the row needs non-zero]
    const rows: [string, TimeScaleName, number | undefined, string, (d: number, u: number) => TimeBands, "d" | "u" | "du" | ""][] = [
      ["2000-06-01T12:00:00Z", "tt", undefined, "iers", (d) => ({ tt: 0, ut1: d }), "d"],
      ["1900-06-01T12:00:00Z", "tt", undefined, "delta-t", (d) => ({ tt: 0, ut1: d }), "d"],
      ["2050-06-01T12:00:00Z", "tt", undefined, "delta-t", (d) => ({ tt: 0, ut1: d }), "du"],
      ["2000-06-01T12:00:00Z", "tt", 64.5, "pinned", (d) => ({ tt: 0, ut1: d }), ""],
      ["2000-06-01T12:00:00Z", "ut1", undefined, "iers", (d) => ({ tt: d, ut1: 0 }), "du"],
      ["1900-06-01T12:00:00Z", "ut1", undefined, "delta-t", (d) => ({ tt: d, ut1: 0 }), "d"],
      ["2050-06-01T12:00:00Z", "ut1", undefined, "delta-t", (d) => ({ tt: d, ut1: 0 }), "d"],
      ["2000-06-01T12:00:00Z", "ut1", 64.5, "pinned", (d) => ({ tt: d, ut1: 0 }), ""],
      ["2000-06-01T12:00:00Z", "utc", undefined, "iers", (_, u) => ({ tt: 0, ut1: u }), "du"],
      ["2027-08-01T00:00:00Z", "utc", undefined, "iers", (_, u) => ({ tt: 0, ut1: u }), "du"],
      ["2000-06-01T12:00:00Z", "utc", 64.5, "pinned", (_, u) => ({ tt: u, ut1: u }), "u"],
      ["1900-06-01T12:00:00Z", "utc", 64.5, "pinned", (_, u) => ({ tt: u, ut1: u }), ""],
      ["2050-06-01T12:00:00Z", "utc", 64.5, "pinned", (_, u) => ({ tt: u, ut1: u }), "u"],
      ["1900-06-01T12:00:00Z", "utc", undefined, "delta-t", (d, u) => ({ tt: Math.hypot(u, d), ut1: u }), "d"],
      ["2050-06-01T12:00:00Z", "utc", undefined, "delta-t", (d, u) => ({ tt: Math.hypot(u, d), ut1: u }), "du"]
    ];
    for (const [iso, scale, pin, basisName, row, needs] of rows) {
      const basis = timeBasis(at(iso), scale, pin);
      const label = `${iso} ${scale} ${pin ?? "time basis"}`;
      expect(basis.timeScale.basis, label).toBe(basisName);
      const [d, u] = [dOf(basis), uOf(basis)];
      if (needs.includes("d")) expect(d, label).toBeGreaterThan(0);
      if (needs.includes("u")) expect(u, label).toBeGreaterThan(0);
      expect(timeBands(basis), label).toEqual(row(d, u));
    }
    // On the IERS basis d is u, so the TT input's UT1 band is the IERS band; after the table, u is the 0.9 s fallback.
    const iers = timeBasis(at("2000-06-01T12:00:00Z"));
    expect(dOf(iers)).toBe(uOf(iers));
    expect(uOf(timeBasis(at("2050-06-01T12:00:00Z")))).toBe(0.9);
  });

  it("step where the time basis steps, at each seam of T3, a millisecond either side", () => {
    const bands = (iso: string) => [-1, 0, 1].map((offset) => timeBands(timeBasis(at(iso) + offset)));
    // 1941.0, where ΔT steps 13.95 ms and its σ does not; then 1956.0, where σ falls to the observed 0.03 s.
    for (const band of bands("1940-12-31T18:00:00Z")) expect(band).toEqual({ tt: 0.46, ut1: 0 });
    expect(bands("1956-01-01T12:00:00Z")).toEqual([{ tt: 0.46, ut1: 0 }, { tt: 0.03, ut1: 0 }, { tt: 0.03, ut1: 0 }]);
    // The IERS basis begins: TT exact, and UT1 − UTC's band C04's 1.9 ms plus the table's 0.79 ms.
    const start = bands("1972-01-01T00:00:00Z");
    expect(start[0]).toEqual({ tt: 0.03, ut1: 0 });
    for (const band of start.slice(1)) {
      expect(zero(band.tt)).toBe(true);
      expect(band.ut1).toBeCloseTo(0.00269, 12);
    }
    // A leap second, the last observed day, the leap-second list's expiry: TT stays exact.
    for (const iso of ["2017-01-01T00:00:00Z", "2026-09-24T00:00:00Z", "2027-06-28T00:00:00Z", "2027-10-02T00:00:00Z"]) {
      for (const band of bands(iso).slice(0, 2)) {
        expect(zero(band.tt), iso).toBe(true);
        expect(band.ut1, iso).toBeGreaterThan(0);
      }
    }
    const [observed, last, predicted] = bands("2026-09-24T00:00:00Z");
    expect(last).toEqual(observed);
    expect(predicted!.ut1).toBeGreaterThan(last!.ut1);
    // No band is added for a leap second not announced after the list expires.
    const expiry = bands("2027-06-28T00:00:00Z");
    expect(timeBasis(at("2027-06-28T00:00:00Z")).timeScale.leapSeconds!.listed).toBe(false);
    expect(Math.abs(expiry[2]!.ut1 - expiry[0]!.ut1)).toBeLessThan(1e-9);
    // The table's last instant, then UT1 − UTC within ±0.9 s and TT from the model: √(u² + d²).
    const [, tableEnd, after] = bands("2027-10-02T00:00:00Z");
    expect(tableEnd!.ut1).toBeCloseTo(0.0262, 12);
    const model = timeBasis(at("2027-10-02T00:00:00Z") + 1);
    expect(after).toEqual({ tt: Math.hypot(0.9, dOf(model)), ut1: 0.9 });
    expect(after!.tt).toBeCloseTo(0.90848, 5);
  });

  it("are the same from a TimeBasis, a Chart, a calc instant and a natal result", () => {
    expect(time.timeBands).toBe(timeBands);
    // Julian dates that are whole milliseconds, so that every record reads the same instant.
    for (const jd of [2415020.5, 2451545.25, 2469807.5]) {
      const ms = J2000_MS + (jd - 2_451_545) * DAY;
      for (const scale of ["utc", "ut1", "tt"] as const) {
        for (const pin of [undefined, 64.5]) {
          const label = `${jd} ${scale} ${pin ?? "time basis"}`;
          const expected = timeBands(timeBasis(ms, scale, pin));
          const chart = natalChart({ utc: new Date(ms), timeKnown: false, ...(scale === "utc" ? {} : { timeScale: scale }), ...(pin === undefined ? {} : { deltaT: pin }) });
          const position = calc({ body: "Sun", time: { jd, scale, ...(pin === undefined ? {} : { deltaT: pin }) } }) as CalcPosition;
          const { result } = createNatalEnvelope(chart);
          expect(timeBands(chart), label).toEqual(expected);
          expect(timeBands(position.receipt.instants[0]!), label).toEqual(expected);
          expect(timeBands(result as Parameters<typeof timeBands>[0]), label).toEqual(expected);
        }
      }
    }
  });

  it("are exactly 0 where R3 makes them 0", () => {
    const records: [string, TimeBasis, "tt" | "ut1" | "both"][] = [
      ["TT input on the IERS basis", timeBasis(at("2000-06-01T12:00:00Z"), "tt"), "tt"],
      ["TT input before 1972", timeBasis(at("1900-06-01T12:00:00Z"), "tt"), "tt"],
      ["TT input after the table", timeBasis(at("2050-06-01T12:00:00Z"), "tt"), "tt"],
      ["UTC input on the IERS basis", timeBasis(at("1972-01-01T00:00:00Z")), "tt"],
      ["UTC input after the leap-second list expires", timeBasis(at("2027-08-01T00:00:00Z")), "tt"],
      ["UT1 input on the IERS basis", timeBasis(at("2000-06-01T12:00:00Z"), "ut1"), "ut1"],
      ["UT1 input after the table", timeBasis(at("2050-06-01T12:00:00Z"), "ut1"), "ut1"],
      ["UTC input before 1972", timeBasis(at("1971-12-31T23:59:59.999Z")), "ut1"],
      ["a pin on UT1 input", timeBasis(at("2000-06-01T12:00:00Z"), "ut1", 64.5), "both"],
      ["a pin on TT input", timeBasis(at("1900-06-01T12:00:00Z"), "tt", 64.5), "both"],
      ["a pin on UTC input before 1972", timeBasis(at("1900-06-01T12:00:00Z"), "utc", 64.5), "both"]
    ];
    for (const [label, basis, which] of records) {
      const band = timeBands(basis);
      if (which !== "ut1") expect(zero(band.tt), label).toBe(true);
      if (which !== "tt") expect(zero(band.ut1), label).toBe(true);
      if (which === "tt") expect(band.ut1, label).toBeGreaterThan(0);
      if (which === "ut1") expect(band.tt, label).toBeGreaterThan(0);
      expect(JSON.stringify(band), label).toMatch(which === "both" ? /^\{"tt":0,"ut1":0\}$/u : which === "tt" ? /^\{"tt":0,/u : /,"ut1":0\}$/u);
    }
  });

  it("throw RangeError for a record without a time scale", () => {
    const basis = timeBasis(at("2000-06-01T12:00:00Z"));
    // A natal record of rc.14 has a ΔT and no time scale: the time-basis set came with rc.15.
    const rc14 = parseNatalEnvelope(readFileSync(new URL("./fixtures/receipt-rc14.json", import.meta.url), "utf8"));
    if (!rc14.ok) throw new Error(rc14.code);
    expect(rc14.envelope.result.deltaT).toBeDefined();
    const refused: [string, unknown][] = [
      ["a ΔT alone", { deltaT: basis.deltaT }],
      ["an rc.14 natal result", rc14.envelope.result],
      ["a time scale alone", { timeScale: basis.timeScale }],
      ["an empty object", {}],
      ["null", null],
      ["undefined", undefined],
      ["a scale in capitals", { ...basis, timeScale: { ...basis.timeScale, input: "UTC" } }],
      ["an unknown basis", { ...basis, timeScale: { ...basis.timeScale, basis: "gps" } }],
      ["a band that is not a number", { ...basis, deltaT: { ...basis.deltaT, sigma: "0.001" } }],
      ["a negative band", { ...basis, timeScale: { ...basis.timeScale, ut1MinusUtc: { ...basis.timeScale.ut1MinusUtc, sigma: -1e-3 } } }],
      ["a band of NaN", { ...basis, deltaT: { ...basis.deltaT, sigma: Number.NaN } }],
      ["a UT1 − UTC without its band", { ...basis, timeScale: { ...basis.timeScale, ut1MinusUtc: {} } }]
    ];
    for (const [label, record] of refused) expect(() => timeBands(record as never), label).toThrow(RangeError);
  });
});
