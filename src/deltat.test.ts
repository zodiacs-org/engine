import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DELTA_T_MODEL, DELTA_T_TABLE, deltaT, deltaTAt } from "./deltat.js";

interface GateValue {
  date: string;
  mjd: number;
  ttMinusUt1: number;
  ut1MinusUtcError: number;
}

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as T;
/** Julian years to astronomy-engine's UT days. */
const ut = (year: number) => (year - 2000) * 365.25;
const utOfMjd = (mjd: number) => mjd - 51544.5;
const yearOfMjd = (mjd: number) => 2000 + (mjd - 51544.5) / 365.25;
const OBSERVED = yearOfMjd(DELTA_T_TABLE.observedTo);
const PREDICTED = yearOfMjd(DELTA_T_TABLE.predictedTo);
const sigmaAt = (year: number) => deltaTAt(ut(year)).sigma!;

describe("zodiacs-deltat/1", () => {
  it("is within 0.2 s of IERS at gate 1's twelve dated values, with σ at least the IERS formal error", () => {
    const { values } = fixture<{ values: GateValue[] }>("iers-12.json");
    expect(values.map((v) => v.date)).toEqual([
      "1962-03-15", "1969-09-15", "1977-03-15", "1984-09-15", "1992-03-15", "1999-09-15",
      "2007-03-15", "2014-09-15", "2017-08-21", "2020-01-01", "2024-04-08", "2026-09-22"
    ]);
    for (const v of values) {
      const result = deltaTAt(utOfMjd(v.mjd));
      expect(Math.abs(result.seconds - v.ttMinusUt1), v.date).toBeLessThanOrEqual(0.2);
      expect(result.sigma!, v.date).toBeGreaterThanOrEqual(v.ut1MinusUtcError);
      expect(result.segment, v.date).toBe("observed");
    }
  });

  it("represents Table S15 of Stephenson, Morrison & Hohenkerk (2016) within 0.02 s from −720 to 1941", () => {
    const { rows } = fixture<{ rows: number[][] }>("table-s15-2016.json");
    const s15 = (year: number) => {
      const [k0, k1, a0, a1, a2, a3] = rows.find(([from, to]) => from! <= year && year < to!)!;
      const t = (year - k0!) / (k1! - k0!);
      return a0! + a1! * t + a2! * t * t + a3! * t ** 3;
    };
    let worst = 0;
    for (let year = -720; year < 1941; year += 0.05) {
      worst = Math.max(worst, Math.abs(deltaT(ut(year)) - s15(year)));
    }
    expect(worst).toBeLessThanOrEqual(0.02);
  });

  it("joins its parts: continuous in value except a step of at most 0.02 s at 1941", () => {
    const step = (year: number) => deltaT(ut(year)) - deltaT(ut(year - 1e-7));
    expect(Math.abs(step(-720))).toBeLessThan(1e-4);
    expect(Math.abs(step(1941))).toBeLessThanOrEqual(0.02);
    expect(Math.abs(step(1956))).toBeLessThan(1e-4);
    expect(Math.abs(step(OBSERVED))).toBeLessThan(1e-4);
    expect(Math.abs(step(PREDICTED + 1e-7))).toBeLessThan(1e-4);
  });

  it("gives σ after the last observed day by the years since it, continuous and never decreasing", () => {
    expect(deltaTAt(utOfMjd(DELTA_T_TABLE.observedTo)).sigma).toBe(0.03);
    expect(sigmaAt(OBSERVED + 1e-9)).toBeCloseTo(0.03, 5);
    expect(sigmaAt(OBSERVED + 0.5)).toBeCloseTo(0.03 + 0.09 * 0.5 ** 0.75, 12);
    expect(sigmaAt(OBSERVED + 5)).toBeCloseTo(0.12 * 5 ** 1.5, 12);
    expect(sigmaAt(OBSERVED + 50)).toBeCloseTo(0.61 * 40 + 0.12 * 10 ** 1.5, 5);
    for (const h of [1, 10]) {
      expect(Math.abs(sigmaAt(OBSERVED + h + 1e-9) - sigmaAt(OBSERVED + h))).toBeLessThan(1e-6);
    }
    let previous = sigmaAt(OBSERVED);
    for (let h = 0.001; h < 400; h += h < 2 ? 0.001 : 0.25) {
      const sigma = sigmaAt(OBSERVED + h);
      expect(sigma).toBeGreaterThanOrEqual(previous);
      previous = sigma;
    }
  });

  it("gives σ before 1956 from its band, at least 0.6·t² before 1620, and 0.03 s when observed", () => {
    for (const year of [-5000, -720, 0, 1000, 1500]) {
      const t = (year - 1825) / 100;
      expect(sigmaAt(year)).toBeGreaterThanOrEqual(0.6 * t * t);
    }
    expect(sigmaAt(1800)).toBe(1.5);
    expect(sigmaAt(1900)).toBe(0.46);
    expect(sigmaAt(1955.99)).toBe(0.46);
    expect(sigmaAt(1956)).toBe(0.03);
    expect(sigmaAt(2000)).toBe(0.03);
  });

  it("names the part of the model that answered", () => {
    expect(deltaTAt(ut(-800)).segment).toBe("long-term");
    expect(deltaTAt(ut(-720)).segment).toBe("reconstructed");
    expect(deltaTAt(ut(1955.99)).segment).toBe("reconstructed");
    expect(deltaTAt(ut(1956)).segment).toBe("observed");
    expect(deltaTAt(utOfMjd(DELTA_T_TABLE.observedTo)).segment).toBe("observed");
    expect(deltaTAt(ut(OBSERVED + 0.01)).segment).toBe("predicted");
    expect(deltaTAt(utOfMjd(DELTA_T_TABLE.predictedTo)).segment).toBe("predicted");
    expect(deltaTAt(ut(PREDICTED + 0.01)).segment).toBe("extrapolated");
  });

  it("returns the result a receipt records, and deltaT agrees with it", () => {
    for (const year of [-3000, 1000, 1850, 1990, OBSERVED + 0.3, 2100]) {
      const result = deltaTAt(ut(year));
      expect(Object.keys(result).sort()).toEqual(["model", "seconds", "segment", "sigma", "table", "tableDigest"]);
      expect(result.model).toBe(DELTA_T_MODEL);
      expect(result.table).toBe(DELTA_T_TABLE.version);
      expect(result.tableDigest).toBe(DELTA_T_TABLE.digest);
      expect(deltaT(ut(year))).toBe(result.seconds);
    }
    expect(DELTA_T_MODEL).toBe("zodiacs-deltat/1");
    expect(DELTA_T_TABLE.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps its table frozen, all the way down", () => {
    expect(Object.isFrozen(DELTA_T_TABLE)).toBe(true);
    expect(Object.isFrozen(DELTA_T_TABLE.knots)).toBe(true);
    const before = deltaT(ut(2026.5));
    expect(() => {
      (DELTA_T_TABLE.knots as unknown as number[])[85] = 500;
    }).toThrow(TypeError);
    expect(() => {
      (DELTA_T_TABLE as { version: string }).version = "2099-01-01";
    }).toThrow(TypeError);
    expect(deltaT(ut(2026.5))).toBe(before);
  });

  it("carries a digest of its knots", () => {
    const { from, observedTo, predictedTo, knots } = DELTA_T_TABLE;
    const text = JSON.stringify([from, observedTo, predictedTo, ...knots]);
    expect(DELTA_T_TABLE.digest).toBe(createHash("sha256").update(text).digest("hex").slice(0, 16));
    expect(from).toBe(1941);
    expect(knots.length).toBe(Math.ceil(OBSERVED - from) + 5);
  });

  it("stays finite and within ±1e10 s over every date a Date can hold", () => {
    for (const ms of [-8.64e15, -1e15, 0, 1e15, 8.64e15]) {
      const result = deltaTAt((ms - 946_728_000_000) / 86_400_000);
      expect(Number.isFinite(result.seconds)).toBe(true);
      expect(Math.abs(result.seconds)).toBeLessThanOrEqual(1e10);
      expect(result.sigma!).toBeGreaterThanOrEqual(0);
      expect(result.sigma!).toBeLessThanOrEqual(1e10);
    }
  });

  it("keeps its values before 1941, which no table refresh changes", () => {
    expect(deltaT(ut(-1000))).toBeCloseTo(25812.285, 2);
    expect(deltaT(ut(1620))).toBeCloseTo(67.065, 2);
    expect(deltaT((Date.UTC(1800, 0, 1, 12) - 946_728_000_000) / 86_400_000)).toBeCloseTo(18.708, 2);
    expect(deltaT((Date.UTC(1900, 0, 1, 12) - 946_728_000_000) / 86_400_000)).toBeCloseTo(-1.977, 2);
  });

  it("is quick enough to run inside every ephemeris call", () => {
    let sum = 0;
    deltaT(0);
    const start = performance.now();
    for (let i = 0; i < 200_000; i++) sum += deltaT(-73_000 + (i % 1_000) * 146.1);
    const perCall = ((performance.now() - start) * 1e6) / 200_000;
    expect(Number.isFinite(sum)).toBe(true);
    expect(perCall).toBeLessThan(5_000); // nanoseconds: a ceiling, not a benchmark
  });
});
