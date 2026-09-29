import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { natalChart, positions, saturnReturn } from "./api.js";
import { deltaTAt } from "./deltat.js";
import {
  DELTA_T_IERS_MODEL,
  LEAP_SECOND_LIST,
  UT1_DATA,
  taiMinusUtcAt,
  timeBasis,
  ut1MinusUtcAt
} from "./time-scale.js";

const DAY = 86_400_000;
const J2000 = Date.UTC(2000, 0, 1, 12);
/** The generator's committed inputs (scripts/build-time-scales.mjs). */
const source = (name: string) => readFileSync(new URL(`../scripts/time-scale-sources/${name}`, import.meta.url));
/** TT and UT1 of a basis as ms on each scale. */
const ttMs = (ms: number, scale: "utc" | "ut1" | "tt" = "utc") => J2000 + timeBasis(ms, scale).ttDays * DAY;
const ut1Ms = (ms: number, scale: "utc" | "ut1" | "tt" = "utc") => J2000 + timeBasis(ms, scale).ut1Days * DAY;
const msOfMjd = (mjd: number) => (mjd - 40_587) * DAY;

describe("the leap-second list (IERS, retrieved 2026-09-29)", () => {
  const text = source("leap-seconds.list").toString("utf8");
  const rows = text
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => line.trim().split(/\s+/).slice(0, 2).map(Number) as [number, number]);

  it("is the list IERS serves, intact by its own hash, with its update and expiry", () => {
    expect(createHash("sha256").update(text).digest("hex")).toBe(LEAP_SECOND_LIST.sha256);
    expect(LEAP_SECOND_LIST.sha256).toBe("db5a895f16853b03bfc865e8d68f9fc8710ef1740e3400c701cd46a5bbbc3433");
    const field = (tag: string) => text.split("\n").find((line) => line.startsWith(tag))!.slice(2).trim();
    const hashed = [field("#$"), field("#@"), ...rows.flat()].join("");
    const words = field("#h").split(/\s+/).map((word) => word.padStart(8, "0")).join("");
    expect(createHash("sha1").update(hashed).digest("hex")).toBe(words);
    const iso = (ntp: string) => new Date((Number(ntp) - 2_208_988_800) * 1000).toISOString().slice(0, 10);
    expect(LEAP_SECOND_LIST.updated).toBe(iso(field("#$")));
    expect(LEAP_SECOND_LIST.expires).toBe(iso(field("#@")));
    // Bulletin C 72 (July 2026) announced no leap second at the end of 2026.
    expect(LEAP_SECOND_LIST.updated).toBe("2026-07-06");
    expect(LEAP_SECOND_LIST.expires).toBe("2027-06-28");
    expect(text).toContain("File expires on 28 June 2027");
  });

  it("holds the same leap seconds as tzdata 2025c's copy, which rc.15's first cut shipped", () => {
    // The conformance suite's copy of tzdata 2025c's leap-seconds.list, updated 2025-07-07, expired 2026-06-28.
    const old = readFileSync(new URL("../conformance/sources/l3/leap-seconds.list", import.meta.url), "utf8");
    expect(createHash("sha256").update(old).digest("hex")).toBe("f060924e3a76ee4e464f6664035b7beae834155dd93a81c50e922f94dfdb1d20");
    const data = (list: string) => list.split("\n").filter((line) => line.trim() && !line.startsWith("#"));
    expect(data(text)).toEqual(data(old));
  });

  it("holds every change of the list, from 10 s in 1972 to 37 s since 2017", () => {
    expect(LEAP_SECOND_LIST.changes.map(([mjd, dtai]) => [(mjd - 15_020) * 86_400, dtai])).toEqual(rows);
    expect(LEAP_SECOND_LIST.changes[0]).toEqual([41_317, 10]);
    expect(LEAP_SECOND_LIST.changes.at(-1)).toEqual([57_754, 37]);
  });

  it.each([
    ["1972-01-01T00:00:00.000Z", 10],
    ["1972-06-30T23:59:59.999Z", 10],
    ["1972-07-01T00:00:00.000Z", 11],
    ["1998-12-31T23:59:59.999Z", 31],
    ["1999-01-01T00:00:00.000Z", 32],
    ["2016-12-31T23:59:59.999Z", 36],
    ["2017-01-01T00:00:00.000Z", 37],
    ["2026-06-27T23:59:59.999Z", 37],
    ["2026-09-28T12:00:00.000Z", 37],
    ["2027-06-27T23:59:59.999Z", 37]
  ])("gives TAI − UTC at %s as %i s, and TT = UTC + (TAI − UTC) + 32.184 s exactly", (iso, dtai) => {
    const ms = Date.parse(iso);
    expect(taiMinusUtcAt(ms)).toBe(dtai);
    const basis = timeBasis(ms);
    expect(basis.timeScale.basis).toBe("iers");
    expect(basis.timeScale.leapSeconds).toEqual({ taiMinusUtc: dtai, listed: true });
    expect(ttMs(ms) - ms).toBeCloseTo(dtai * 1000 + 32_184, 3);
  });

  it("counts the leap second itself: TT runs 2 s from 23:59:59 to 00:00:00 across it", () => {
    for (const [before, after] of [
      ["2016-12-31T23:59:59.000Z", "2017-01-01T00:00:00.000Z"],
      ["1972-06-30T23:59:59.000Z", "1972-07-01T00:00:00.000Z"]
    ]) {
      expect(ttMs(Date.parse(after!)) - ttMs(Date.parse(before!))).toBeCloseTo(2000, 3);
    }
  });

  it("keeps UT1 and ΔT continuous across a leap second, where UT1 − UTC steps by a second", () => {
    const before = Date.parse("2016-12-31T23:59:59.999Z");
    const after = Date.parse("2017-01-01T00:00:00.000Z");
    expect(ut1MinusUtcAt(after).seconds - ut1MinusUtcAt(before).seconds).toBeCloseTo(1, 2);
    // One label millisecond, one real second and one millisecond: the leap second.
    expect(ut1Ms(after) - ut1Ms(before)).toBeCloseTo(1001, 1);
    expect(Math.abs(timeBasis(after).deltaT.seconds - timeBasis(before).deltaT.seconds)).toBeLessThan(1e-3);
  });

  it("carries 37 s past the list's expiry, and says so", () => {
    const basis = timeBasis(Date.parse("2027-08-01T12:00:00Z"));
    expect(basis.timeScale.leapSeconds).toEqual({ taiMinusUtc: 37, listed: false });
    expect(timeBasis(Date.parse("2027-06-28T00:00:00Z")).timeScale.leapSeconds?.listed).toBe(false);
    expect(timeBasis(Date.parse("2027-06-27T23:59:59.999Z")).timeScale.leapSeconds?.listed).toBe(true);
    // The list of 2025-07-07, which rc.15 first shipped, expired on 2026-06-28.
    expect(timeBasis(Date.parse("2026-06-28T00:00:00Z")).timeScale.leapSeconds?.listed).toBe(true);
    expect(timeBasis(Date.parse("2026-09-28T12:00:00Z")).timeScale.leapSeconds?.listed).toBe(true);
  });
});

/*
 * A positive leap second, 23:59:60 on UTC, is the TAI second before the new
 * TAI − UTC takes effect at 00:00:00. JavaScript has no timestamp for it, so a
 * chart can only reach it on TT or UT1. There, UT1 = TAI + (UT1 − TAI), which
 * runs on through the leap second; TAI − UTC and UT1 − UTC are the old ones.
 */
describe("an instant inside a leap second, given on TT or UT1", () => {
  const leaps = LEAP_SECOND_LIST.changes.slice(1).map(([mjd, dtai], index) => ({
    at: msOfMjd(mjd),
    before: LEAP_SECOND_LIST.changes[index]![1],
    after: dtai
  }));

  it("covers every leap second from 1972-07-01 to 2017-01-01, all inside the UT1 table", () => {
    expect(leaps).toHaveLength(27);
    expect(leaps.every(({ before, after }) => after === before + 1)).toBe(true);
    expect(new Date(leaps[0]!.at).toISOString()).toBe("1972-07-01T00:00:00.000Z");
    expect(new Date(leaps.at(-1)!.at).toISOString()).toBe("2017-01-01T00:00:00.000Z");
    expect(leaps.every(({ at }) => at > msOfMjd(UT1_DATA.from) && at < msOfMjd(UT1_DATA.to))).toBe(true);
  });

  it.each(leaps.map((leap) => [new Date(leap.at - 1000).toISOString().slice(0, 10), leap] as const))(
    "reads UT1 as TAI + (UT1 − TAI) through the leap second at the end of %s",
    (_, { at, before }) => {
      // UTC just before and just after: ΔT = TT − UT1 runs on smoothly, UT1 − UTC steps by a second.
      const last = timeBasis(at - 1);
      const next = timeBasis(at);
      expect(Math.abs(next.deltaT.seconds - last.deltaT.seconds)).toBeLessThan(1e-6);
      for (const milliseconds of [0, 250, 500, 999]) {
        // TAI of 23:59:60 on UTC and a fraction: 23:59:59 + the old TAI − UTC, and a second.
        const taiMs = at + before * 1000 + milliseconds;
        const tt = timeBasis(taiMs + 32_184, "tt");
        // ΔT lies between its values on either side, to the drift of UT1 − TAI over a second.
        expect(Math.abs(tt.deltaT.seconds - last.deltaT.seconds)).toBeLessThan(1e-6);
        expect(tt.timeScale.leapSeconds?.taiMinusUtc).toBe(before);
        expect(tt.timeScale.ut1MinusUtc!.seconds).toBeCloseTo(last.timeScale.ut1MinusUtc!.seconds, 6);
        // The same instant on UT1 gives the same TT and the same record.
        const ut1 = timeBasis(J2000 + tt.ut1Days * DAY, "ut1");
        expect(Math.abs(ut1.ttDays - tt.ttDays) * DAY).toBeLessThan(1e-3);
        expect(ut1.timeScale.leapSeconds).toEqual(tt.timeScale.leapSeconds);
        expect(ut1.timeScale.ut1MinusUtc!.seconds).toBeCloseTo(tt.timeScale.ut1MinusUtc!.seconds, 6);
        // Each record adds up: ΔT = 32.184 s + (TAI − UTC) − (UT1 − UTC), to the microsecond.
        for (const basis of [tt, ut1]) {
          const { ut1MinusUtc, leapSeconds } = basis.timeScale;
          expect(basis.deltaT.seconds).toBeCloseTo(32.184 + leapSeconds!.taiMinusUtc - ut1MinusUtc!.seconds, 6);
        }
      }
    }
  );

  it.each(leaps.map((leap) => [new Date(leap.at).toISOString().slice(0, 10), leap] as const))(
    "gives TT and UT1 inputs the UTC input's basis on either side of the leap second of %s",
    (_, { at }) => {
      // Not 00:00:00.000 itself on UT1: a UT1 input computed from it lands within a
      // microsecond of the leap second's end, on either side of it.
      for (const utc of [at - 1500, at - 500, at - 1, at + 1, at + 500, at + 1500]) {
        const fromUtc = timeBasis(utc);
        for (const scale of ["tt", "ut1"] as const) {
          const input = scale === "tt" ? J2000 + fromUtc.ttDays * DAY : J2000 + fromUtc.ut1Days * DAY;
          const other = timeBasis(input, scale);
          expect(Math.abs(other.ut1Days - fromUtc.ut1Days) * DAY).toBeLessThan(1e-3);
          expect(Math.abs(other.ttDays - fromUtc.ttDays) * DAY).toBeLessThan(1e-3);
          expect(Math.abs(other.utcMs - utc)).toBeLessThan(1e-3);
          expect(other.timeScale.leapSeconds).toEqual(fromUtc.timeScale.leapSeconds);
          expect(other.timeScale.ut1MinusUtc!.seconds).toBeCloseTo(fromUtc.timeScale.ut1MinusUtc!.seconds, 6);
        }
      }
    }
  );

  it("gives the reviewers' TT and UT1 readings of one instant in the 2016 leap second the same sky", () => {
    // TAI 2017-01-01T00:00:36.500, which is 2016-12-31T23:59:60.500 on UTC.
    const place = { latitude: 59.91, longitude: 10.75, houseSystem: "placidus" as const };
    const tt = natalChart({ utc: "2017-01-01T00:01:08.684Z", timeScale: "tt", ...place });
    const ut1 = natalChart({ utc: "2017-01-01T00:00:00.091Z", timeScale: "ut1", ...place });
    expect(tt.deltaT.seconds).toBeCloseTo(68.593, 3);
    expect(ut1.deltaT.seconds).toBeCloseTo(68.593, 3);
    for (const chart of [tt, ut1]) {
      expect(chart.timeScale.leapSeconds).toEqual({ taiMinusUtc: 36, listed: true });
      expect(chart.timeScale.ut1MinusUtc!.seconds).toBeCloseTo(-0.409, 3);
    }
    // The UT1 input is rounded to the millisecond: 0.015″ of sidereal time.
    expect(Math.abs(tt.angles!.mc - ut1.angles!.mc) * 3600).toBeLessThan(0.02);
    expect(Math.abs(tt.angles!.asc - ut1.angles!.asc) * 3600).toBeLessThan(0.02);
  });
});

describe("UT1 − UTC from IERS: EOP 20 C04 in 1972, finals2000A.all of 2026-09-24 from 1973-01-02", () => {
  const rows = gunzipSync(source("finals2000A-20260924-ut1.csv.gz"))
    .toString("utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const [mjd, date, flag, value, error] = line.split(",");
      return { mjd: Number(mjd), date: date!, flag: flag!, value: Number(value), error: Number(error) };
    });
  // YR MM DD HH MJD x y UT1-UTC dX dY xrt yrt LOD, then the errors: x y UT1-UTC ...
  const c04 = source("eopc04-1972.txt")
    .toString("latin1")
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => line.trim().split(/\s+/))
    .map((fields) => ({ mjd: Number(fields[4]), value: Number(fields[7]), error: Number(fields[15]) }));

  it("is the finals2000A.all the ΔT table came from, and C04 for the year before it", () => {
    expect(UT1_DATA.sha256).toBe("cc80680ec05c91b65e7d02c6068fe0d44dd0998dc880551975092d2d14aa8e18");
    expect(UT1_DATA.version).toBe("2026-09-24");
    expect(rows).toHaveLength(19_997);
    expect(rows[0]).toMatchObject({ mjd: UT1_DATA.finalsFrom, date: "1973-01-02", flag: "I", value: 0.8084178 });
    expect(rows.at(-1)).toMatchObject({ mjd: UT1_DATA.to, date: "2027-10-02", flag: "P" });
    expect(rows.filter((row) => row.flag === "I").at(-1)!.mjd).toBe(UT1_DATA.observedTo);
    expect(UT1_DATA.earlySha256).toBe("e16cfbba34574b8bad3cf81e2e56a84c2b4bbfd3c822cf9ebdd860bf97d711dc");
    // Every day of 1972 and 1973-01-01, the day before finals2000A.all begins; the table starts with the leap seconds.
    expect(c04).toHaveLength(367);
    expect(c04.map((row) => row.mjd)).toEqual(Array.from({ length: 367 }, (_, index) => UT1_DATA.from + index));
    expect(UT1_DATA.from).toBe(LEAP_SECOND_LIST.changes[0]![0]);
    expect(c04.at(-1)!.mjd + 1).toBe(UT1_DATA.finalsFrom);
    expect(c04[0]).toMatchObject({ mjd: 41_317, value: -0.0454859 });
    expect(Math.max(...c04.map((row) => row.value))).toBe(0.8105944);
  });

  it("reproduces every daily IERS value, observed and predicted, within the table's stated bound", () => {
    let worst = 0;
    for (const row of rows) {
      const ms = Date.UTC(1970, 0, 1) + (row.mjd - 40_587) * DAY;
      const ut1 = ut1MinusUtcAt(ms);
      worst = Math.max(worst, Math.abs(ut1.seconds - row.value));
      expect(ut1.source, row.date).toBe(row.flag === "I" ? "observed" : "predicted");
      // The band holds the IERS formal error and the table's own rounding.
      expect(ut1.sigma, row.date).toBeGreaterThanOrEqual(row.error);
      expect(ut1.sigma, row.date).toBeLessThanOrEqual(row.error * 1.2 + UT1_DATA.bound + 2e-3);
    }
    expect(worst).toBeLessThanOrEqual(UT1_DATA.bound);
    expect(UT1_DATA.bound).toBeLessThan(0.001);
  });

  it("reproduces every daily C04 value of 1972, observed, within the same bound", () => {
    let worst = 0;
    for (const row of c04) {
      const ut1 = ut1MinusUtcAt(msOfMjd(row.mjd));
      worst = Math.max(worst, Math.abs(ut1.seconds - row.value));
      expect(ut1.source).toBe("observed");
      // C04's largest formal error of the year, 1.9 ms, and the table's own bound.
      expect(ut1.sigma).toBeGreaterThanOrEqual(row.error + UT1_DATA.bound);
      expect(ut1.sigma).toBeLessThanOrEqual(0.0019 + UT1_DATA.bound + 1e-12);
      const basis = timeBasis(msOfMjd(row.mjd) + 43_200_000);
      expect(basis.timeScale.basis).toBe("iers");
      expect(basis.deltaT.segment).toBe("observed");
    }
    expect(worst).toBeLessThanOrEqual(UT1_DATA.bound);
    expect(worst).toBeLessThanOrEqual(0.00066);
    expect(worst).toBeGreaterThan(0.0005);
    // From −0.635 s to +0.811 s, where rc.15's first cut took 0 within ±0.9 s.
    expect(Math.min(...c04.map((row) => row.value))).toBe(-0.6349935);
    expect(ut1MinusUtcAt(Date.parse("1973-01-01T00:00:00Z")).seconds).toBeCloseTo(0.8106, 3);
    // The largest |UT1 − UTC| of the whole table, 0.8105944 s on 1973-01-01: at most 12.2″ of sidereal time.
    const largest = Math.max(...[...c04, ...rows].map((row) => Math.abs(row.value)));
    expect(largest).toBe(0.8105944);
    expect(largest * 1.00273781191135448 * 15).toBeLessThan(12.2);
  });

  it("is continuous across the join of C04 and finals2000A.all on 1973-01-02", () => {
    const join = Date.parse("1973-01-02T00:00:00Z");
    const before = ut1MinusUtcAt(join - 1);
    const after = ut1MinusUtcAt(join);
    // UT1 − UTC falls about 2.7 ms a day there: 3e-8 s in a millisecond.
    expect(Math.abs(after.seconds - before.seconds)).toBeLessThan(1e-7);
    const place = { latitude: 60.17, longitude: 24.94, houseSystem: "placidus" as const };
    for (const timeScale of ["utc", "ut1", "tt"] as const) {
      const at = timeScale === "tt" ? join + 44_184 : join;
      const a = natalChart({ utc: at - 1, timeScale, ...place });
      const b = natalChart({ utc: at, timeScale, ...place });
      // One millisecond of sidereal time is 0.015″; rc.15's first cut jumped 11.8″ here.
      expect(Math.abs(b.angles!.mc - a.angles!.mc) * 3600).toBeLessThan(0.02);
      expect(Math.abs(b.deltaT.seconds - a.deltaT.seconds)).toBeLessThan(1e-6);
      expect(b.deltaT.segment).toBe("observed");
      expect(a.deltaT.segment).toBe("observed");
    }
  });

  it("falls back to 0 within ±0.9 s outside the table", () => {
    for (const iso of ["1971-12-31T23:59:59.999Z", "2027-10-02T00:00:01Z", "2040-01-01T00:00:00Z"]) {
      expect(ut1MinusUtcAt(Date.parse(iso))).toEqual({ seconds: 0, sigma: 0.9, source: "fallback" });
    }
    for (const iso of ["1972-01-01T00:00:00Z", "1972-06-01T00:00:00Z", "1973-01-01T12:00:00Z"]) {
      expect(ut1MinusUtcAt(Date.parse(iso)).source).toBe("observed");
    }
  });

  it("labels UT1 and TT inputs at the table's edges by the table they were read from", () => {
    // UT1 input from 1972-01-01 to 2027-10-02 (inclusive, on UT1) is on the IERS basis, and so is
    // TT input whose model UTC is in that span; their UTC can fall up to 0.148 s past the table's last day.
    const cases: [number, "ut1" | "tt"][] = [
      [Date.parse("1972-01-01T00:00:00.000Z"), "ut1"],
      [Date.parse("1973-01-02T00:00:00.000Z"), "ut1"],
      [Date.parse("1973-01-02T00:00:00.500Z"), "ut1"],
      [Date.parse("2027-10-01T23:59:59.900Z"), "ut1"],
      [Date.parse("2027-10-02T00:00:00.000Z"), "ut1"],
      [Date.parse("2027-10-02T00:01:09.250Z"), "tt"]
    ];
    for (const [ms, scale] of cases) {
      const basis = timeBasis(ms, scale);
      expect(basis.timeScale.basis).toBe("iers");
      expect(basis.timeScale.ut1MinusUtc!.source).not.toBe("fallback");
      expect(basis.deltaT.segment).toBe(basis.timeScale.ut1MinusUtc!.source);
      expect(basis.deltaT.sigma).toBeLessThan(0.03);
      // The UT1 − UTC reported is the one used: UT1 = UTC + (UT1 − UTC).
      expect(Math.abs(J2000 + basis.ut1Days * DAY - basis.utcMs - basis.timeScale.ut1MinusUtc!.seconds * 1000)).toBeLessThan(1e-3);
    }
    // Past the table's end on UT1, the model: no UT1 − UTC is used.
    expect(timeBasis(Date.parse("2027-10-02T00:00:00.001Z"), "ut1").timeScale).toMatchObject({ basis: "delta-t", ut1MinusUtc: null });
  });

  it("puts the UTC of UT1 and TT input on the IERS basis at most 0.148 s past the table's last day", () => {
    const first = Date.parse("1972-01-01T00:00:00Z");
    const last = Date.parse("2027-10-02T00:00:00Z");
    // Where the IERS basis begins and ends for each scale (TT is UTC + 42.2 s in 1972, + 69.3 s in 2027), 1 ms apart.
    const windows: [number, "ut1" | "tt"][] = [
      [first, "ut1"],
      [last, "ut1"],
      [first + 42_000, "tt"],
      [last + 69_000, "tt"]
    ];
    const past = { ut1: -Infinity, tt: -Infinity };
    for (const [from, scale] of windows) {
      for (let ms = from - 500; ms <= from + 500; ms += 1) {
        const basis = timeBasis(ms, scale);
        if (basis.timeScale.basis !== "iers") continue;
        expect(basis.utcMs).toBeGreaterThanOrEqual(first);
        past[scale] = Math.max(past[scale], basis.utcMs - last);
      }
    }
    expect(past.ut1).toBeCloseTo(148, 0);
    expect(past.tt).toBeGreaterThan(0);
    expect(past.tt).toBeLessThanOrEqual(148);
  });

  it("widens the band to 26.2 ms on the table's last day (docs/time.md, Limits)", () => {
    const basis = timeBasis(Date.parse("2027-10-02T00:00:00Z"));
    expect(basis.timeScale.ut1MinusUtc!.source).toBe("predicted");
    expect(basis.deltaT.sigma).toBeCloseTo(0.0262, 9);
  });

  it("gives ΔT = 32.184 s + (TAI − UTC) − (UT1 − UTC) inside it, with the band of UT1 − UTC", () => {
    const row = rows.find((candidate) => candidate.date === "2024-04-08")!;
    const basis = timeBasis(Date.parse("2024-04-08T00:00:00Z"));
    expect(basis.deltaT.model).toBe(DELTA_T_IERS_MODEL);
    expect(basis.deltaT.seconds).toBeCloseTo(32.184 + 37 - row.value, 3);
    expect(basis.deltaT.sigma).toBe(basis.timeScale.ut1MinusUtc!.sigma);
    expect(basis.deltaT.tableDigest).toBe(UT1_DATA.digest);
    // The model, built from the same file at whole-year knots, agrees within its 0.084 s gate.
    expect(Math.abs(basis.deltaT.seconds - deltaTAt(basis.ut1Days).seconds)).toBeLessThan(0.084);
  });
});

describe("the time basis of a chart", () => {
  const place = { latitude: 51.5, longitude: -0.12, houseSystem: "placidus" as const };

  it("reads civil time as UT1 and takes ΔT from the model before 1972 and after the table", () => {
    for (const iso of ["1880-06-15T12:00:00Z", "1971-12-31T23:59:59Z"]) {
      const basis = timeBasis(Date.parse(iso));
      expect(basis.timeScale).toEqual({ input: "utc", basis: "delta-t", ut1MinusUtc: null, leapSeconds: null });
      expect(basis.deltaT).toEqual(deltaTAt((Date.parse(iso) - J2000) / DAY));
    }
    const later = timeBasis(Date.parse("2040-01-01T00:00:00Z"));
    expect(later.timeScale).toEqual({
      input: "utc",
      basis: "delta-t",
      ut1MinusUtc: { seconds: 0, sigma: 0.9, source: "fallback" },
      leapSeconds: null
    });
    expect(later.deltaT.segment).toBe("extrapolated");
  });

  it("uses UT1 for the angles: a UTC chart turns the sky as a UT1 chart at UTC + (UT1 − UTC)", () => {
    const utc = Date.parse("2016-06-01T12:00:00Z");
    const dut1 = ut1MinusUtcAt(utc).seconds;
    expect(dut1).toBeGreaterThan(-0.2);
    expect(dut1).toBeLessThan(-0.1);
    const asUtc = natalChart({ utc, ...place });
    const asUt1 = natalChart({ utc: utc + Math.round(dut1 * 1000), timeScale: "ut1", ...place });
    const unshifted = natalChart({ utc, timeScale: "ut1", ...place });
    // The same sky to the millisecond of rounding (0.015″), and 2″ from reading UTC as UT1.
    expect(Math.abs(asUtc.angles!.mc - asUt1.angles!.mc) * 3600).toBeLessThan(0.02);
    expect(Math.abs(asUtc.angles!.mc - unshifted.angles!.mc) * 3600).toBeGreaterThan(1.5);
    expect(asUtc.timeScale.input).toBe("utc");
    expect(asUt1.timeScale.input).toBe("ut1");
    expect(asUt1.input.timeScale).toBe("ut1");
    expect(Object.hasOwn(asUtc.input, "timeScale")).toBe(false);
  });

  it("uses TT from the leap seconds for the positions: a UTC instant is TT − 69.184 s since 2017", () => {
    const utc = Date.parse("2020-01-01T00:00:00Z");
    const fromUtc = natalChart({ utc, ...place });
    const fromTt = natalChart({ utc: utc + 69_184, timeScale: "tt", ...place });
    fromUtc.bodies.forEach((body, index) => {
      expect(Math.abs(body.lon - fromTt.bodies[index]!.lon) * 3600).toBeLessThan(1e-6);
    });
    expect(fromTt.timeScale.leapSeconds).toEqual({ taiMinusUtc: 37, listed: true });
    expect(Math.abs(fromUtc.angles!.asc - fromTt.angles!.asc) * 3600).toBeLessThan(1e-4);
    // positions() takes UTC on the same basis.
    expect(positions(utc).map((body) => body.lon)).toEqual(fromUtc.bodies.map((body) => body.lon));
  });

  it("reads UT1 and TT input before 1972 through the model, both ways", () => {
    const ut1 = Date.parse("1900-01-01T00:00:00Z");
    const basis = timeBasis(ut1, "ut1");
    const tt = J2000 + basis.ttDays * DAY;
    const back = timeBasis(tt, "tt");
    expect(Math.abs(back.ut1Days - basis.ut1Days) * DAY).toBeLessThan(1e-3);
    expect(back.timeScale).toEqual({ input: "tt", basis: "delta-t", ut1MinusUtc: null, leapSeconds: null });
  });

  it("round-trips UTC, UT1 and TT inside the leap-second era", () => {
    for (const iso of ["1972-03-01T00:00:00Z", "1990-06-15T12:34:56Z", "2016-12-31T23:59:59Z", "2027-06-01T00:00:00Z"]) {
      const utc = Date.parse(iso);
      const tt = ttMs(utc);
      const ut1 = ut1Ms(utc);
      expect(Math.abs(ut1Ms(tt, "tt") - ut1)).toBeLessThan(1e-3);
      expect(Math.abs(ttMs(ut1, "ut1") - tt)).toBeLessThan(1e-3);
      expect(timeBasis(tt, "tt").utcMs).toBeCloseTo(utc, 3);
    }
  });

  it("keeps a pin as TT − UT1 with UT1 from the instant", () => {
    const utc = Date.parse("2016-06-01T12:00:00Z");
    const pinned = timeBasis(utc, "utc", 70);
    expect(pinned.deltaT).toEqual({ seconds: 70, sigma: null, model: "pinned", table: null, tableDigest: null, segment: "pinned" });
    expect(pinned.timeScale.basis).toBe("pinned");
    // Days since 2000 carry about 0.1 µs.
    expect((pinned.ut1Days - (utc - J2000) / DAY) * 86_400).toBeCloseTo(ut1MinusUtcAt(utc).seconds, 6);
    expect((pinned.ttDays - pinned.ut1Days) * 86_400).toBeCloseTo(70, 6);
    const asUt1 = timeBasis(utc, "ut1", 70);
    expect(asUt1.ut1Days).toBe((utc - J2000) / DAY);
    const asTt = timeBasis(utc, "tt", 70);
    expect((asTt.ttDays - (utc - J2000) / DAY) * 86_400).toBeCloseTo(0, 6);
  });

  it.each(["UTC", "TT", "tai", "", null, 0, {}])("refuses the time scale %j", (timeScale) => {
    expect(() => natalChart({ utc: "2020-01-01T00:00:00Z", timeScale } as never)).toThrow(RangeError);
  });

  it.each([
    ["timescale", "tt", "timeScale"],
    ["TimeScale", "ut1", "timeScale"],
    ["TIMESCALE", "tt", "timeScale"],
    ["deltat", 60, "deltaT"],
    ["Latitude", 51.5, "latitude"],
    ["housesystem", "placidus", "houseSystem"],
    ["UTC", "2020-01-01T00:01:09.184Z", "utc"]
  ])("refuses the key %j, a birth field's name in other letter case", (key, value, field) => {
    // rc.15's first cut ignored `timescale: "tt"` and read the TT instant as UTC: 35′ of ascendant.
    const birth = { utc: "2020-01-01T00:01:09.184Z", [key]: value } as never;
    expect(() => natalChart(birth)).toThrow(RangeError);
    expect(() => natalChart(birth)).toThrow(`"${field}"`);
    expect(() => saturnReturn(birth)).toThrow(RangeError);
  });

  it("still ignores other keys, as before", () => {
    const birth = { utc: "2020-01-01T00:00:00Z", latitude: 51.5, longitude: -0.12 };
    const chart = natalChart(birth);
    for (const extra of [{ name: "A" }, { time_scale: "tt" }, { place: { city: "B" } }]) {
      expect(natalChart({ ...birth, ...extra } as never).angles).toEqual(chart.angles);
    }
  });

  it("scans Saturn returns from a TT birth on UTC", () => {
    const utc = Date.parse("1990-02-01T12:00:00Z");
    const fromTt = saturnReturn({ utc: utc + 57_184, timeScale: "tt" });
    const fromUtc = saturnReturn({ utc });
    expect(fromTt.seasons.map((season) => season.index)).toEqual(fromUtc.seasons.map((season) => season.index));
    expect(Math.abs(fromTt.natalLon - fromUtc.natalLon) * 3600).toBeLessThan(1e-3);
  }, 120_000);
});
