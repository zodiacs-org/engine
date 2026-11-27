/**
 * The bounds calc() quotes for a position from the shipped DE440 pack
 * (src/calc-bounds-de440.ts), held to their two arbiters: the conformance
 * suite's 240 L1 vectors, JPL Horizons's apparent geocentric places from
 * DE441 at 24 TT instants from 1851 to 2148 for ten bodies, in the IAU
 * 2006/2000A true ecliptic of date (conformance/arbiters/l1/), recomputed
 * here; and from 1.1.0-rc.12 the dense sweep of the pack against NAIF's
 * de440.bsp at noon TT of every day from 1800 to 2199 in all eight frames,
 * read from its committed summary (docs/evidence/1.1.0-rc.12-20261115/sweep-pack/,
 * which the DE440 sweep workflow's check_pack.py holds each run to). The
 * instants are TT on both sides, so no ΔT model enters. Each row of the
 * table must be the larger of the two largest angles for its body, rounded
 * up to two significant figures: a stale or hand-edited row fails here.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { calc } from "./calc.js";
import type { CalcBody } from "./calc.js";
import { DE440_AT_LIMB, DE440_AT_LIMB_BASIS, DE440_MEASURED, DE440_MEASURED_BASIS, DE440_TURNED_BASIS } from "./calc-bounds-de440.js";
import { DE440_PACK, useDe440 } from "./de440-pack.js";
import { setDefaultEphemeris } from "./ephemeris.js";

interface Vector {
  input: { body: string; jd_tt: number };
  expected: { lon: number; lat: number };
}
const vectors: Vector[] = JSON.parse(readFileSync(new URL("../conformance/vectors/L1-positions.json", import.meta.url), "utf8")).vectors;
interface SweepRow {
  correction: string;
  body: string;
  arbiter: string;
  frames: { frame: string; position: { max: number } }[];
}
const sweep: { ephemeris: string; corpus: { n: number }; de440: SweepRow[] } = JSON.parse(
  readFileSync(new URL("../docs/evidence/1.1.0-rc.12-20261115/sweep-pack/summary.json", import.meta.url), "utf8")
);
const DEG = Math.PI / 180;

/** The angle between two directions given by longitude and latitude, arcseconds (Vincenty's form, exact for small angles). */
function angle(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const dLon = (a.lon - b.lon) * DEG;
  const [la, lb] = [a.lat * DEG, b.lat * DEG];
  const y = Math.hypot(Math.cos(lb) * Math.sin(dLon), Math.cos(la) * Math.sin(lb) - Math.sin(la) * Math.cos(lb) * Math.cos(dLon));
  const x = Math.sin(la) * Math.sin(lb) + Math.cos(la) * Math.cos(lb) * Math.cos(dLon);
  return (Math.atan2(y, x) / DEG) * 3600;
}

/** Rounded up to two significant figures, as src/calc-bounds.ts's rows are. */
function up2(x: number): number {
  const unit = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Number((Math.ceil(x / unit) * unit).toPrecision(2));
}

// The suite's setup puts every file on astronomy-engine; this one measures the package's default.
beforeAll(() => {
  useDe440();
});
afterAll(() => setDefaultEphemeris("astronomy-engine"));

describe("calc()'s bounds on the shipped DE440 pack", () => {
  it("are the larger of the largest angles from Horizons at the L1 vectors and from de440.bsp every day, body by body, rounded up", () => {
    expect(vectors).toHaveLength(240);
    const largest = new Map<string, number>();
    for (const vector of vectors) {
      const position = calc({ body: vector.input.body as CalcBody, time: { jd: vector.input.jd_tt, scale: "tt" }, flags: { speeds: false } });
      if (position.status !== "ok") throw new Error(position.reason);
      expect(position.receipt.engine.ephemeris).toEqual({ name: "jpl-de440", version: DE440_PACK.sha256 });
      largest.set(vector.input.body, Math.max(largest.get(vector.input.body) ?? 0, angle(position, vector.expected)));
    }
    // The pack sweep: the largest angle over 146,097 instants and eight frames, from the kernel's apparent place.
    expect(sweep.ephemeris).toBe("de440");
    expect(sweep.corpus.n).toBe(146097);
    const swept = new Map<string, number>();
    for (const row of sweep.de440) {
      if (row.correction !== "apparent" || row.arbiter !== "APPARENT") continue;
      expect(row.frames).toHaveLength(8);
      swept.set(row.body, Math.max(...row.frames.map((frame) => frame.position.max)));
    }
    expect([...swept.keys()].sort()).toEqual([...largest.keys()].sort());
    const measured = Object.fromEntries(
      [...largest].sort(([a], [b]) => (a < b ? -1 : 1)).map(([body, value]) => [body, up2(Math.max(value, swept.get(body)!))])
    );
    expect(DE440_MEASURED).toEqual(measured);
    // Ten bodies, 24 instants each, every one within the suite's own tolerance of 1″.
    expect(Object.keys(measured)).toHaveLength(10);
    expect(Math.max(...Object.values(measured))).toBeLessThanOrEqual(1);
  });

  it("are quoted as measured in the true ecliptic of date and as an estimate in any other frame", () => {
    const at = { jd: 2451545, scale: "tt" } as const;
    const ofDate = calc({ body: "Moon", time: at });
    const j2000 = calc({ body: "Moon", time: at, frame: "equatorial-j2000" });
    if (ofDate.status !== "ok" || j2000.status !== "ok") throw new Error("refused");
    expect(ofDate.bounds.position).toEqual({ value: DE440_MEASURED.Moon, unit: "arcsec", label: "measured", basis: DE440_MEASURED_BASIS });
    expect(j2000.bounds.position).toEqual({ value: DE440_MEASURED.Moon, unit: "arcsec", label: "estimated", basis: DE440_TURNED_BASIS });
  });

  it("take DE440_AT_LIMB, as an estimate, for a planet within 3″ of the Sun's limb, and the body's own bound inside the disc", () => {
    // Jupiter passes behind the Sun on 2032-01-01: past the limb near 23:26 TT on 2031-12-31, and 0.0071° from the
    // centre at 07:42 TT; Horizons's change at the limb falls between JD 2463232.476753 and 2463232.476823 TT.
    const atLimb = calc({ body: "Jupiter", time: { jd: 2463232.4768, scale: "tt" }, flags: { speeds: false } });
    const inside = calc({ body: "Jupiter", time: { jd: 2463232.8208694, scale: "tt" }, flags: { speeds: false } });
    const before = calc({ body: "Jupiter", time: { jd: 2463232.45, scale: "tt" }, flags: { speeds: false } });
    if (atLimb.status !== "ok" || inside.status !== "ok" || before.status !== "ok") throw new Error("refused");
    expect(atLimb.bounds.position).toEqual({ value: DE440_AT_LIMB, unit: "arcsec", label: "estimated", basis: DE440_AT_LIMB_BASIS });
    expect(inside.bounds.position).toEqual({ value: DE440_MEASURED.Jupiter, unit: "arcsec", label: "measured", basis: DE440_MEASURED_BASIS });
    expect(before.bounds.position).toMatchObject({ value: DE440_MEASURED.Jupiter, label: "measured" });
    // The step at the limb is under that bound: second by second for four minutes across it, the place moves by
    // Jupiter's own motion and, once, by the deflection there.
    const lon = (jd: number) => {
      const r = calc({ body: "Jupiter", time: { jd, scale: "tt" }, flags: { speeds: false } });
      if (r.status !== "ok") throw new Error("refused");
      return r.lon;
    };
    const moves: number[] = [];
    for (let k = -120; k < 120; k += 1) moves.push(lon(2463232.4768 + (k + 1) / 86400) - lon(2463232.4768 + k / 86400));
    const usual = [...moves].sort((x, y) => x - y)[moves.length >> 1]!;
    const steps = moves.map((move) => Math.abs(move - usual) * 3600).filter((step) => step > 0.01);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toBeGreaterThan(1);
    expect(steps[0]).toBeLessThan(DE440_AT_LIMB);
  });

  it("are null, not borrowed from astronomy-engine, for what the vectors do not cover", () => {
    const at = { jd: 2451545, scale: "tt" } as const;
    const moon = calc({ body: "Moon", time: at });
    const node = calc({ body: "North Node", time: at });
    if (moon.status !== "ok" || node.status !== "ok") throw new Error("refused");
    for (const bound of [moon.bounds.distance!, moon.bounds.speed!, node.bounds.position, node.bounds.speed!]) {
      expect(bound).toMatchObject({ value: null, label: "estimated", basis: "not compared with an independent ephemeris" });
    }
    expect(node.receipt.engine.ephemeris.name).toBe("jpl-de440");
  });
});
