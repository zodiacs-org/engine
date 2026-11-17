/*
 * The continuous-UTC rule (docs/time.md, "From an instant to UT1 and TT"):
 * after the IERS table (2027-10-02) UTC keeps TAI − UTC at its last value, so
 * TT = UTC + 69.184 s exactly, and UT1 comes from that TT through the ΔT model.
 *
 * Outside oracles, saved with their SHA-256, URL and retrieval time in
 * docs/evidence/continuous-utc-20261117/sources/:
 * - IERS Bulletin C 72 (Paris, 06 July 2026) and IERS Leap_Second.dat: UTC − TAI
 *   = −37 s from 2017-01-01 "until further notice", and no later change;
 * - JPL Horizons, the Moon (301) and the Sun (10), geocentric, on UT, with
 *   TDB − UT (quantity 30) and the ecliptic longitude of date (quantity 31) at
 *   2028, 2030, 2050, 2100 and 2199.
 * What must not change is held against the carried 1.1.0 and 2.0.0-rc.2
 * archives (docs/evidence/continuous-utc-20261117/results/time-basis-*.json).
 * Synthetic instants and places only.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GROUPS, TABLE_END, instantsBetween } from "../scripts/continuous-utc-instants.mjs";
import { natalChart } from "./api.js";
import { setDefaultEphemeris } from "./ephemeris.js";
import { timeBands } from "./time-bands.js";
import { UT1_TO_MS } from "./time-scale-data.js";
import { UT1_FALLBACK_BAND, elapsedDays, timeBasis, timeBasisBeforeContinuousUtc } from "./time-scale.js";

const J2000 = Date.UTC(2000, 0, 1, 12);
const DAY = 86_400_000;
const EVIDENCE = new URL("../docs/evidence/continuous-utc-20261117/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, EVIDENCE), "utf8");

/** TT − UTC from IERS Bulletin C 72's own words, "UTC-TAI = -37 s", and TT − TAI = 32.184 s by definition. */
function ttMinusUtcFromBulletinC(): number {
  const text = read("sources/bulletinc.dat");
  expect(text).toContain("Bulletin C 72");
  const match = /from 2017 January 1, 0h UTC, until further notice : UTC-TAI = (-?\d+) s/.exec(text);
  expect(match).not.toBeNull();
  return -Number(match![1]) + 32.184;
}

/** The rows of a saved Horizons answer: [UTC ms, TDB − UT s, ecliptic longitude °]. */
function horizons(file: string): [number, number, number][] {
  const text = read(`sources/${file}`);
  const body = text.slice(text.indexOf("$$SOE") + 5, text.indexOf("$$EOE"));
  const months: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  return body
    .trim()
    .split("\n")
    .map((line) => {
      const [date, time, tdbMinusUt, lon] = line.trim().split(/\s+/);
      const [year, month, day] = date!.split("-");
      const [h, m, s] = time!.split(":").map(Number);
      return [Date.UTC(Number(year), months[month!]!, Number(day), h!, m!, s!), Number(tdbMinusUt), Number(lon)];
    });
}

const ttMinusUtc = (ms: number) => {
  const basis = timeBasis(ms);
  return (basis.ttDays - (basis.utcMs - J2000) / DAY) * 86_400;
};
const arcsec = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180) * 3600;

describe("the continuous-UTC rule after the IERS table", () => {
  const instants = [
    "2027-10-02T00:00:00.001Z",
    "2028-06-15T12:00:00Z",
    "2030-06-15T12:00:00Z",
    "2050-06-15T12:00:00Z",
    "2100-06-15T12:00:00Z",
    "2199-06-19T12:00:00Z"
  ];

  it("starts the millisecond after the table's last day, which the ticket's UT1_TO_MS names", () => {
    expect(UT1_TO_MS).toBe(TABLE_END);
    expect(new Date(UT1_TO_MS).toISOString()).toBe("2027-10-02T00:00:00.000Z");
    expect(timeBasis(UT1_TO_MS).timeScale.basis).toBe("iers");
    expect(timeBasis(UT1_TO_MS + 1).timeScale.basis).toBe("continuous-utc");
  });

  it("gives TT − UTC = 69.184 s, the (TAI − UTC) + 32.184 s of IERS Bulletin C 72, within 0.0005 s", () => {
    const expected = ttMinusUtcFromBulletinC();
    expect(expected).toBeCloseTo(69.184, 12);
    // Leap_Second.dat's last change is 2017-01-01, to 37 s.
    const rows = read("sources/Leap_Second.dat").split("\n").filter((line) => /^\s+\d/.test(line));
    expect(rows.at(-1)!.trim().split(/\s+/)).toEqual(["57754.0", "1", "1", "2017", "37"]);
    for (const iso of instants) {
      expect(Math.abs(ttMinusUtc(Date.parse(iso)) - expected), iso).toBeLessThan(0.0005);
    }
  });

  it("puts TT − UTC where Horizons puts TDB − UT at the five instants, within the 2 ms TDB − TT can reach", () => {
    for (const file of ["horizons-moon-301.txt", "horizons-sun-10.txt"]) {
      const rows = horizons(file);
      expect(rows.map(([ms]) => new Date(ms).toISOString())).toEqual(instants.slice(1).map((iso) => new Date(iso).toISOString()));
      for (const [ms, tdbMinusUt] of rows) {
        expect(tdbMinusUt, file).toBeGreaterThanOrEqual(69.184);
        expect(tdbMinusUt, file).toBeLessThanOrEqual(69.186);
        expect(Math.abs(ttMinusUtc(ms) - tdbMinusUt), file).toBeLessThan(0.002);
      }
    }
  });

  it("records UT1 − UTC as 69.184 s less the model's ΔT, with the model's band, and TAI − UTC 37 s carried", () => {
    for (const iso of instants) {
      const basis = timeBasis(Date.parse(iso));
      const { ut1MinusUtc, leapSeconds, input } = basis.timeScale;
      expect(input).toBe("utc");
      expect(basis.deltaT.model).toBe("zodiacs-deltat/1");
      expect(Math.abs(ut1MinusUtc!.seconds - (69.184 - basis.deltaT.seconds)), iso).toBeLessThan(0.001);
      expect(ut1MinusUtc!.sigma).toBe(basis.deltaT.sigma);
      expect(ut1MinusUtc!.source).toBe("model");
      expect(leapSeconds).toEqual({ taiMinusUtc: 37, listed: false });
      // UT1 = UTC + (UT1 − UTC), and the ΔT recorded is TT − UT1.
      expect(Math.abs(J2000 + basis.ut1Days * DAY - basis.utcMs - ut1MinusUtc!.seconds * 1000)).toBeLessThan(1e-3);
      expect(Math.abs((basis.ttDays - basis.ut1Days) * 86_400 - basis.deltaT.seconds)).toBeLessThan(1e-6);
    }
  });

  it("holds 32.184 s + TAI − UTC − (UT1 − UTC) = ΔT within 1e-12 s on all three scales, from the table to the span's far end", () => {
    // EPHEMERIS_SPAN ends at 3998-09-03T12:00 TT; on UTC input that is 69.184 s earlier, and on UT1 input
    // about 1,200 s earlier still. Milliseconds since 1970 round to about 8 µs there, so UT1 − UTC is taken
    // from ΔT, not from the two instants' difference.
    const lastTt = Date.UTC(3998, 8, 3, 12);
    const last = { tt: lastTt, utc: lastTt - 69_184, ut1: lastTt - timeBasis(lastTt, "tt").deltaT.seconds * 1000 };
    for (const scale of ["utc", "ut1", "tt"] as const) {
      const at = [...instantsBetween(3, 3000, TABLE_END + 1, Math.floor(last[scale])), Math.floor(last[scale]), Date.UTC(2528, 0, 1), Date.UTC(3500, 0, 1)];
      let worst = 0;
      let continuous = 0;
      for (const ms of at) {
        const basis = timeBasis(ms, scale);
        const { ut1MinusUtc, leapSeconds } = basis.timeScale;
        if (basis.timeScale.basis !== "continuous-utc") continue;
        continuous += 1;
        worst = Math.max(worst, Math.abs(32.184 + leapSeconds!.taiMinusUtc - ut1MinusUtc!.seconds - basis.deltaT.seconds));
      }
      expect(continuous, scale).toBeGreaterThan(2990);
      expect(worst, scale).toBeLessThan(1e-12);
      expect((timeBasis(Math.floor(last[scale]), scale).ttDays - (lastTt - J2000) / DAY) * DAY, scale).toBeLessThanOrEqual(0);
    }
  });

  it("reads the model's predicted segment, unflagged, for the 146 ms after the table on UTC input, whose UT1 is still on its last day", () => {
    // UT1 − UTC is −0.146 s there, so UT1 passes the table's end, where the model's extrapolation begins,
    // only at 00:00:00.147Z on UTC. TT and UT1 input are past it from the first millisecond.
    for (const [offset, segment] of [[1, "predicted"], [146, "predicted"], [147, "extrapolated"]] as const) {
      const basis = timeBasis(UT1_TO_MS + offset);
      expect(basis.timeScale.basis).toBe("continuous-utc");
      expect(basis.deltaT.segment, String(offset)).toBe(segment);
      expect(J2000 + basis.ut1Days * DAY > UT1_TO_MS, String(offset)).toBe(segment === "extrapolated");
      const chart = natalChart({ utc: new Date(UT1_TO_MS + offset), latitude: 10, longitude: 10 });
      expect(chart.flags.includes("delta-t-extrapolated"), String(offset)).toBe(segment === "extrapolated");
    }
    expect(timeBasis(UT1_TO_MS + 1, "ut1").deltaT.segment).toBe("extrapolated");
  });

  it("hands over from the table to the model with UT1 − UTC moving by under 0.01 s, and TT − UTC not at all", () => {
    const [last, first] = [timeBasis(UT1_TO_MS), timeBasis(UT1_TO_MS + 1)];
    expect(last.timeScale.basis).toBe("iers");
    expect(first.timeScale.basis).toBe("continuous-utc");
    expect(Math.abs(first.timeScale.ut1MinusUtc!.seconds - last.timeScale.ut1MinusUtc!.seconds)).toBeLessThan(0.01);
    // The table's side carries the rounding of days since 2000 (about 0.1 µs); the rule's side none.
    expect(Math.abs(ttMinusUtc(UT1_TO_MS) - 69.184)).toBeLessThan(1e-6);
    expect(Math.abs(ttMinusUtc(UT1_TO_MS + 1) - 69.184)).toBeLessThan(1e-6);
  });

  it("is one piece of the time basis across the hand-over on UTC input: elapsedDays gives back the step", () => {
    const days = 2 / DAY;
    const [before, after] = [timeBasis(UT1_TO_MS - 1), timeBasis(UT1_TO_MS + 1)];
    expect(elapsedDays(before, after, days)).toBe(days);
    // On UT1 input TT − UT1 steps from the table's ΔT to the model's there, so it stays a step.
    const [ut1Before, ut1After] = [timeBasis(UT1_TO_MS - 1, "ut1"), timeBasis(UT1_TO_MS + 1, "ut1")];
    expect(elapsedDays(ut1Before, ut1After, days)).toBe(ut1After.ttDays - ut1Before.ttDays);
  });

  it("holds TT − UTC to 69,184 ms within 0.001 ms, UT1 monotonic and |UT1 − UTC| under 3,600 s, on 2,000 instants to 2209", () => {
    const instants = instantsBetween(281, 2000, UT1_TO_MS + 1, Date.UTC(2209, 11, 31)).sort((a, b) => a - b);
    let previous = -Infinity;
    for (const ms of instants) {
      const basis = timeBasis(ms);
      expect(basis.timeScale.basis).toBe("continuous-utc");
      expect(Math.abs(basis.ttDays * DAY - (basis.utcMs - J2000) - 69_184), String(ms)).toBeLessThan(0.001);
      expect(basis.ut1Days).toBeGreaterThanOrEqual(previous);
      previous = basis.ut1Days;
      expect(Math.abs(basis.timeScale.ut1MinusUtc!.seconds)).toBeLessThan(3600);
    }
  });

  it("gives the bands { tt: 0, ut1: the ΔT band } on UTC input", () => {
    const basis = timeBasis(Date.parse("2050-06-15T12:00:00Z"));
    expect(timeBands(basis)).toEqual({ tt: 0, ut1: basis.deltaT.sigma });
    // TT and UT1 input keep the model's two lines.
    const onTt = timeBasis(Date.parse("2050-06-15T12:00:00Z"), "tt");
    const onUt1 = timeBasis(Date.parse("2050-06-15T12:00:00Z"), "ut1");
    expect(onTt.timeScale.basis).toBe("continuous-utc");
    expect(timeBands(onTt)).toEqual({ tt: 0, ut1: onTt.deltaT.sigma });
    expect(timeBands(onUt1)).toEqual({ tt: onUt1.deltaT.sigma, ut1: 0 });
  });

  it("gives TT and UT1 input the same TT and UT1, and a UTC of TT − 69.184 s beside them", () => {
    for (const iso of ["2030-06-15T12:00:00Z", "2199-06-19T12:00:00Z"]) {
      for (const scale of ["tt", "ut1"] as const) {
        const ms = Date.parse(iso);
        const basis = timeBasis(ms, scale);
        const before = timeBasisBeforeContinuousUtc(ms, scale);
        expect([basis.ut1Days, basis.ttDays]).toEqual([before.ut1Days, before.ttDays]);
        expect(basis.deltaT).toEqual(before.deltaT);
        expect(basis.timeScale.basis).toBe("continuous-utc");
        expect(Math.abs(J2000 + basis.ttDays * DAY - basis.utcMs - 69_184)).toBeLessThan(1e-3);
        expect(Math.abs(basis.timeScale.ut1MinusUtc!.seconds - (69.184 - basis.deltaT.seconds))).toBeLessThan(0.001);
        expect(basis.timeScale.leapSeconds).toEqual({ taiMinusUtc: 37, listed: false });
      }
    }
  });

  it("keeps UT1_FALLBACK_BAND at 0.9 s, which the rule before it and a pin after the table use", () => {
    expect(UT1_FALLBACK_BAND).toBe(0.9);
    expect(timeBasisBeforeContinuousUtc(Date.parse("2030-06-15T12:00:00Z")).timeScale.ut1MinusUtc).toEqual({ seconds: 0, sigma: 0.9, source: "fallback" });
    expect(timeBasis(Date.parse("2030-06-15T12:00:00Z"), "utc", 70).timeScale.ut1MinusUtc).toEqual({ seconds: 0, sigma: 0.9, source: "fallback" });
  });
});

describe("what the continuous-UTC rule leaves as 1.1.0 and 2.0.0-rc.2 gave it", () => {
  const references = ["1.1.0", "2.0.0-rc.2"].map(
    (version) => JSON.parse(read(`results/time-basis-${version}.json`)) as { engine: string; groups: Record<string, { cases: number; sha256: string; first: unknown }> }
  );

  it.each(Object.keys(GROUPS))("%s: every record to the bit", (name) => {
    const cases = GROUPS[name]!;
    const records = cases.map(([ms, scale, pin, fields]) => {
      const basis = timeBasis(ms, scale, pin ?? undefined);
      return fields === "days" ? [basis.ut1Days, basis.ttDays] : basis;
    });
    const digest = createHash("sha256").update(JSON.stringify(records)).digest("hex");
    for (const reference of references) {
      const group = reference.groups[name]!;
      expect(group.cases, reference.engine).toBe(cases.length);
      expect(records[0], reference.engine).toEqual(group.first);
      expect(digest, reference.engine).toBe(group.sha256);
    }
  });

  it("gives the rule before it everywhere but on unpinned instants after the table", () => {
    for (const [ms, scale, pin] of Object.values(GROUPS).flat()) {
      if (pin === null && ms > UT1_TO_MS && scale === "utc") continue;
      const [now, before] = [timeBasis(ms, scale, pin ?? undefined), timeBasisBeforeContinuousUtc(ms, scale, pin ?? undefined)];
      expect([now.ut1Days, now.ttDays]).toEqual([before.ut1Days, before.ttDays]);
    }
  });
});

describe("charts on the continuous-UTC rule, on the shipped DE440 pack", () => {
  beforeAll(() => setDefaultEphemeris("de440"));
  afterAll(() => setDefaultEphemeris("astronomy-engine"));

  it("put the Moon and the Sun within 1″ of Horizons on UTC input at 2028, 2030, 2050, 2100 and 2199", () => {
    // Horizons prints its IAU 1976/80 ecliptic of date; the engine's is IAU 2006/2000A. The raw values are
    // compared, unrotated, so part of the residual is that frame difference (not separated). 1″ fails any clock
    // error over about 1 s, the Moon moving about 0.55″ a second.
    for (const [file, body] of [["horizons-moon-301.txt", "Moon"], ["horizons-sun-10.txt", "Sun"]] as const) {
      for (const [ms, , lon] of horizons(file)) {
        const chart = natalChart({ utc: new Date(ms), latitude: 0, longitude: 0 });
        expect(chart.ephemeris?.name).toBe("jpl-de440");
        expect(chart.timeScale.basis).toBe("continuous-utc");
        const got = chart.bodies.find((row) => row.body === body)!.lon;
        expect(arcsec(got, lon), `${body} ${new Date(ms).toISOString()}`).toBeLessThan(1);
      }
    }
  });

  it("put the 2199 Moon on the TT the old rule only reached when given TT, and 28″ from where the old rule put it", () => {
    const [ms, , lon] = horizons("horizons-moon-301.txt").at(-1)!;
    const onUtc = natalChart({ utc: new Date(ms), latitude: 0, longitude: 0 }).bodies.find((row) => row.body === "Moon")!.lon;
    const onTt = natalChart({ utc: new Date(ms + 69_184), timeScale: "tt", latitude: 0, longitude: 0 }).bodies.find((row) => row.body === "Moon")!.lon;
    expect(onUtc).toBe(onTt);
    expect(arcsec(onUtc, lon)).toBeLessThan(0.52);
    // The old rule: UTC read as UT1 and TT = UT1 + ΔT, 125.84 s; as a UT1 instant on the new basis it is the same TT.
    const old = natalChart({ utc: new Date(ms), timeScale: "ut1", latitude: 0, longitude: 0 });
    expect(old.deltaT.seconds).toBeCloseTo(125.844, 3);
    expect(arcsec(old.bodies.find((row) => row.body === "Moon")!.lon, lon)).toBeGreaterThan(28);
  });

  it("still flag a chart at 2050-06-15T12:00Z with a place delta-t-extrapolated, its angles resting on the model's UT1", () => {
    const chart = natalChart({ utc: "2050-06-15T12:00:00Z", latitude: 51.5, longitude: -0.12 });
    expect(chart.timeScale.basis).toBe("continuous-utc");
    expect(chart.flags).toContain("delta-t-extrapolated");
  });

  it("leave a pinned chart, and the effective date inside the table, as the rule before it gave them", () => {
    for (const [iso, deltaT] of [["2030-06-15T12:00:00Z", 70], ["2027-05-20T00:00:00Z", undefined], ["1990-06-15T12:00:00Z", 70]] as const) {
      const chart = natalChart({ utc: iso, latitude: 0, longitude: 0, ...(deltaT === undefined ? {} : { deltaT }) });
      const before = timeBasisBeforeContinuousUtc(Date.parse(iso), "utc", deltaT);
      expect(chart.deltaT).toEqual(before.deltaT);
      expect(chart.timeScale).toEqual(before.timeScale);
    }
  });

  it("take the new basis at the pack's edge and past it, and still refuse an instant past the ephemeris span", () => {
    for (const iso of ["2209-12-31T12:00:00Z", "2250-01-01T00:00:00Z", "3998-09-02T00:00:00Z"]) {
      expect(natalChart({ utc: iso, latitude: 0, longitude: 0 }).timeScale.basis, iso).toBe("continuous-utc");
    }
    expect(() => natalChart({ utc: "3998-09-04T00:00:00Z" })).toThrow(RangeError);
  });
});
