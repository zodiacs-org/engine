import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { MakeTime, SetDeltaTFunction, e_tilt } from "astronomy-engine";
import type { AstroTime } from "astronomy-engine";
import { describe, expect, it } from "vitest";

import { deltaT } from "./deltat.js";
import { gastHours } from "./ephemeris.js";
import { eclipticFrame, eclipticOfDate } from "./frame.js";
import { ARGUMENTS, MULTIPLIERS, NUTATION_TERMS, OFFSETS, coefficients, nutation, tilt } from "./nutation.js";

interface Epoch {
  tt: number;
  ut1: number;
  dpsi: number;
  deps: number;
  epsA: number;
  ee2000B: number;
  gast2000B: number;
  gst06a: number;
  gst00b: number;
  eclipticOfDate: number[];
}

interface Fixture {
  tolerance: {
    nutationArcsec: number;
    meanObliquityArcsec: number;
    equationOfEquinoxesArcsec: number;
    gast2000BArcsec: number;
    gastGst06aArcsec: number;
    rotationArcsec: number;
  };
  epochs: Epoch[];
}

const read = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

// pyerfa 2.0.1.5 (ERFA 2.0.1) at 101 TT instants from 1800 to 2200, with the
// tolerances fixed when the file was generated, before the engine was run
// against it: docs/evidence/nutation-2026-09-29/tools/erfa_fixtures.py.
const ERFA = JSON.parse(read("nutation-erfa.json")) as Fixture;
const { tolerance } = ERFA;

describe("the IAU 2000B series as NOVAS C 3.1 gives it", () => {
  // Lines 3019-3375 of nutation.c in the novas 3.1.1.5 package (PyPI,
  // novas-3.1.1.5.tar.gz, sha256 6784780f…761935; the file's sha256 is
  // 49d193c9…e471bb), unchanged: the whole of iau2000b.
  const source = read("novas-c3.1-iau2000b.txt");

  it("is the excerpt LICENSING.md records", () => {
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "95ba8b40a582a23b5916a5dbb7839650deb9a7f7d9743554cc222f813f56bde5"
    );
  });

  it("has every multiplier, coefficient and offset of iau2000b, in its order", () => {
    const table = (name: string, columns: number) => {
      const start = source.indexOf(name);
      const body = source.slice(source.indexOf("{", start), source.indexOf("}};", start) + 2);
      const rows = [...body.matchAll(/\{([^{}]*)\}/g)].map((match) => match[1]!.split(",").map(Number));
      expect(rows.every((row) => row.length === columns && row.every(Number.isFinite)), name).toBe(true);
      return rows;
    };
    const multipliers = table("nals_t[77][5] =", 5);
    const coefficientRows = table("cls_t[77][6] =", 6);
    expect(multipliers).toHaveLength(NUTATION_TERMS);
    expect(coefficientRows).toHaveLength(NUTATION_TERMS);
    expect(MULTIPLIERS).toHaveLength(5 * NUTATION_TERMS);
    expect([...MULTIPLIERS].map((digit) => Number(digit) - 2)).toEqual(multipliers.flat());
    expect(coefficients()).toEqual(coefficientRows.flat());
    // The arguments l, l′, F, D and Ω, arcseconds at J2000.0 and per century.
    const argumentsInSource = [...source.matchAll(/fmod \((\d+\.\d+) ([+-])\s+t \* (\d+\.\d+), ASEC360\)/g)].flatMap(
      (match) => [Number(match[1]), Number(`${match[2]}${match[3]}`)]
    );
    expect(argumentsInSource).toHaveLength(10);
    expect(ARGUMENTS).toEqual(argumentsInSource);
    // The fixed offsets for the planetary terms, added to Δψ and Δε.
    const offset = (name: string) => Number(source.match(new RegExp(`double ${name} = +(-?[0-9.]+);`))![1]);
    expect(OFFSETS).toEqual([offset("dpplan"), offset("deplan")]);
  });

  it("sums to what iau2000b's own loop gives with its own numbers, within 1e-14″ from 1800 to 2200", () => {
    // NOVAS's evaluation, written out from the excerpt: sin and cos of each
    // term's argument, reduced modulo 2π, summed from the last term.
    const table = (name: string, columns: number) => {
      const start = source.indexOf(name);
      const body = source.slice(source.indexOf("{", start), source.indexOf("}};", start) + 2);
      return [...body.matchAll(/\{([^{}]*)\}/g)].map((match) => match[1]!.split(",").map(Number)).filter((row) => row.length === columns);
    };
    const multipliers = table("nals_t[77][5] =", 5);
    const coefficientRows = table("cls_t[77][6] =", 6);
    const ASEC2RAD = Math.PI / 648_000;
    const novas = (t: number) => {
      const f = [
        (485868.249036 + t * 1717915923.2178) % 1_296_000,
        (1287104.79305 + t * 129596581.0481) % 1_296_000,
        (335779.526232 + t * 1739527262.8478) % 1_296_000,
        (1072260.70369 + t * 1602961601.209) % 1_296_000,
        (450160.398036 - t * 6962890.5431) % 1_296_000
      ].map((arcseconds) => arcseconds * ASEC2RAD);
      let dp = 0;
      let de = 0;
      for (let i = 76; i >= 0; i -= 1) {
        const n = multipliers[i]!;
        const arg = (n[0]! * f[0]! + n[1]! * f[1]! + n[2]! * f[2]! + n[3]! * f[3]! + n[4]! * f[4]!) % (2 * Math.PI);
        const [a, a1, a2, b, b1, b2] = coefficientRows[i]!;
        dp += (a! + a1! * t) * Math.sin(arg) + a2! * Math.cos(arg);
        de += (b! + b1! * t) * Math.cos(arg) + b2! * Math.sin(arg);
      }
      return { dpsi: dp * 1e-7 - 0.000135, deps: de * 1e-7 + 0.000388 };
    };
    let worst = 0;
    for (let i = 0; i <= 4000; i += 1) {
      const t = -2 + i / 1000;
      const direct = novas(t);
      const engine = nutation(t);
      worst = Math.max(worst, Math.abs(engine.dpsi - direct.dpsi), Math.abs(engine.deps - direct.deps));
    }
    expect(worst).toBeLessThanOrEqual(1e-14);
  });

  it("begins with the five terms astronomy-engine 2.1.19 keeps", () => {
    try {
      SetDeltaTFunction(() => 0);
      for (const tt of [-73_000, -20_000.25, 0, 9_000.5, 73_000]) {
        const five = nutation(tt / 36_525, 5);
        const engine = e_tilt(MakeTime(tt));
        expect(Math.abs(five.dpsi - engine.dpsi)).toBeLessThan(1e-12);
        expect(Math.abs(five.deps - engine.deps)).toBeLessThan(1e-12);
      }
    } finally {
      SetDeltaTFunction(deltaT);
    }
  });
});

describe("the engine's nutation and obliquity against ERFA", () => {
  it("Δψ and Δε equal nut00b's at 101 instants from 1800 to 2200", () => {
    let worst = 0;
    for (const epoch of ERFA.epochs) {
      const { dpsi, deps } = tilt(epoch.tt);
      worst = Math.max(worst, Math.abs(dpsi - epoch.dpsi), Math.abs(deps - epoch.deps));
    }
    expect(worst).toBeLessThanOrEqual(tolerance.nutationArcsec);
  });

  it("the mean obliquity is obl06's, and the true one adds Δε", () => {
    for (const epoch of ERFA.epochs) {
      const { mobl, tobl, deps } = tilt(epoch.tt);
      expect(Math.abs(mobl * 3600 - epoch.epsA)).toBeLessThanOrEqual(tolerance.meanObliquityArcsec);
      expect(tobl).toBe(mobl + deps / 3600);
    }
  });

  it("the equation of the equinoxes is ee00's on obl06 and nut00b, within the complementary terms left out", () => {
    let worst = 0;
    for (const epoch of ERFA.epochs) worst = Math.max(worst, Math.abs(tilt(epoch.tt).ee - epoch.ee2000B));
    expect(worst).toBeLessThanOrEqual(tolerance.equationOfEquinoxesArcsec);
  });

  it("gives the chart's sidereal time as gmst06 plus ee00 on obl06 and nut00b, and within the 2000B model of gst06a", () => {
    const seconds = (hours: number) => ((((hours % 24) + 36) % 24) - 12) * 15 * 3600;
    let fromB = 0;
    let fromA = 0;
    for (const epoch of ERFA.epochs) {
      // gastHours reads UT1 and TT from the time, as the chart gives them.
      const gast = gastHours({ ut: epoch.ut1, tt: epoch.tt } as AstroTime);
      fromB = Math.max(fromB, Math.abs(seconds(gast - epoch.gast2000B)));
      fromA = Math.max(fromA, Math.abs(seconds(gast - epoch.gst06a)));
    }
    expect(fromB).toBeLessThanOrEqual(tolerance.gast2000BArcsec);
    expect(fromA).toBeLessThanOrEqual(tolerance.gastGst06aArcsec);
  });

  it("turns EQJ to the true ecliptic and equinox of date as Rz(−Δψ) Rx(εA) P does with bp06, obl06 and nut00b", () => {
    const directions = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.36, -0.48, 0.8],
      [-0.6, 0.64, -0.48]
    ];
    const unit = (lon: number, lat: number) => {
      const [l, b] = [(lon * Math.PI) / 180, (lat * Math.PI) / 180];
      return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
    };
    let worst = 0;
    for (const epoch of ERFA.epochs) {
      const m = epoch.eclipticOfDate;
      for (const [x, y, z] of directions) {
        const expected = [0, 1, 2].map((row) => m[3 * row]! * x! + m[3 * row + 1]! * y! + m[3 * row + 2]! * z!);
        const { lon, lat } = eclipticOfDate(x!, y!, z!, epoch.tt);
        const actual = unit(lon, lat);
        const cross = Math.hypot(
          actual[1]! * expected[2]! - actual[2]! * expected[1]!,
          actual[2]! * expected[0]! - actual[0]! * expected[2]!,
          actual[0]! * expected[1]! - actual[1]! * expected[0]!
        );
        const dot = actual[0]! * expected[0]! + actual[1]! * expected[1]! + actual[2]! * expected[2]!;
        worst = Math.max(worst, (Math.atan2(cross, dot) * 648_000) / Math.PI);
      }
    }
    expect(worst).toBeLessThanOrEqual(tolerance.rotationArcsec);
  });

  it("holds the mean equinox of date on its frame's first row and the ecliptic pole on its third", () => {
    for (const epoch of ERFA.epochs) {
      const { rows } = eclipticFrame(epoch.tt);
      for (const row of [0, 1, 2]) {
        const length = Math.hypot(rows[3 * row]!, rows[3 * row + 1]!, rows[3 * row + 2]!);
        expect(Math.abs(length - 1)).toBeLessThan(1e-15);
      }
      const { lon, lat } = eclipticOfDate(rows[0]!, rows[1]!, rows[2]!, epoch.tt);
      const dpsi = tilt(epoch.tt).dpsi / 3600;
      expect(Math.abs(((lon - dpsi + 540) % 360) - 180)).toBeLessThan(1e-12);
      expect(Math.abs(lat)).toBeLessThan(1e-12);
      expect(eclipticOfDate(rows[6]!, rows[7]!, rows[8]!, epoch.tt).lat).toBeCloseTo(90, 9);
    }
  });
});
