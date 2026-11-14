/**
 * The bounds calc() quotes for a position from the shipped DE440 pack
 * (src/calc-bounds-de440.ts), held to their arbiter: the conformance suite's
 * 240 L1 vectors, JPL Horizons's apparent geocentric places from DE441 at 24
 * TT instants from 1851 to 2148 for ten bodies, in the IAU 2006/2000A true
 * ecliptic of date (conformance/arbiters/l1/). The instants are TT on both
 * sides, so no ΔT model enters. Each row of the table must be the largest
 * angle found for its body, rounded up to two significant figures: a stale
 * or hand-edited row fails here.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { calc } from "./calc.js";
import type { CalcBody } from "./calc.js";
import { DE440_MEASURED, DE440_MEASURED_BASIS, DE440_TURNED_BASIS } from "./calc-bounds-de440.js";
import { DE440_PACK } from "./de440-pack.js";
import { setDefaultEphemeris } from "./ephemeris.js";

interface Vector {
  input: { body: string; jd_tt: number };
  expected: { lon: number; lat: number };
}
const vectors: Vector[] = JSON.parse(readFileSync(new URL("../conformance/vectors/L1-positions.json", import.meta.url), "utf8")).vectors;
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
beforeAll(() => setDefaultEphemeris("de440"));
afterAll(() => setDefaultEphemeris("astronomy-engine"));

describe("calc()'s bounds on the shipped DE440 pack", () => {
  it("are the largest angle from Horizons at the L1 vectors, body by body, rounded up", () => {
    expect(vectors).toHaveLength(240);
    const largest = new Map<string, number>();
    for (const vector of vectors) {
      const position = calc({ body: vector.input.body as CalcBody, time: { jd: vector.input.jd_tt, scale: "tt" }, flags: { speeds: false } });
      if (position.status !== "ok") throw new Error(position.reason);
      expect(position.receipt.engine.ephemeris).toEqual({ name: "jpl-de440", version: DE440_PACK.sha256 });
      largest.set(vector.input.body, Math.max(largest.get(vector.input.body) ?? 0, angle(position, vector.expected)));
    }
    const measured = Object.fromEntries([...largest].sort(([a], [b]) => (a < b ? -1 : 1)).map(([body, value]) => [body, up2(value)]));
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
