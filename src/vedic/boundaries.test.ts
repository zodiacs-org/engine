import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { declareSiderealLongitude, kpLordsOf, nakshatraOf, vargaOf } from "../vedic.js";
import type { VargaName, VargaScheme } from "../vedic.js";

// Expected values were written by docs/evidence/vedic-2026-09-28/tools/boundary_fixtures.py
// from the texts' rules (as tables) with exact rational arithmetic; it never runs the engine.
interface Fixture {
  ticksPerDegree: number;
  lordOrder: string[];
  nakshatra: number[][];
  kp: number[][];
  varga: Record<string, number[][]>;
}
const fixture = JSON.parse(readFileSync(new URL("./fixtures/boundaries.json", import.meta.url), "utf8")) as Fixture;

/** The generator's three points: the double nearest T/7560 and that double ∓/± 1e-9. */
const pointsOf = (ticks: number): number[] => {
  const x0 = ticks / fixture.ticksPerDegree;
  return [x0 - 1e-9, x0, x0 + 1e-9];
};
const declared = (lon: number) => declareSiderealLongitude(lon, { ayanamsa: "fixture" });

function mismatches(rows: number[][], width: number, actual: (lon: number) => number[]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    pointsOf(row[0]!).forEach((lon, i) => {
      const expected = row.slice(1 + i * width, 1 + (i + 1) * width);
      const got = actual(lon);
      if (got.some((value, k) => value !== expected[k])) out.push(`${lon}: expected ${expected}, got ${got}`);
    });
  }
  return out;
}

describe("boundary fixtures from the texts", () => {
  it("covers every boundary kind", () => {
    const points = 3 * (fixture.nakshatra.length + fixture.kp.length +
      Object.values(fixture.varga).reduce((sum, rows) => sum + rows.length, 0));
    expect(fixture.nakshatra).toHaveLength(108);
    expect(fixture.kp).toHaveLength(2193);
    expect(Object.keys(fixture.varga)).toHaveLength(18);
    expect(points).toBe(17_343);
  });

  it("places nakshatras and padas exactly at and around every pada boundary", () => {
    expect(mismatches(fixture.nakshatra, 2, (lon) => {
      const n = nakshatraOf(declared(lon));
      return [n.index, n.pada];
    })).toEqual([]);
  });

  it("places KP subs (1–249) and sub-sub lords exactly at and around every sub-sub and sign boundary", () => {
    expect(mismatches(fixture.kp, 2, (lon) => {
      const kp = kpLordsOf(declared(lon));
      return [kp.sub.number, fixture.lordOrder.indexOf(kp.subSubLord)];
    })).toEqual([]);
  });

  it.each(Object.keys(fixture.varga))("places %s exactly at and around every part boundary", (key) => {
    const cyclic = key.endsWith("cyclic");
    const name = key.replace("cyclic", "") as VargaName;
    const scheme: VargaScheme = cyclic ? "cyclic" : "parashari";
    expect(mismatches(fixture.varga[key]!, 1, (lon) => [vargaOf(declared(lon), name, scheme).signIndex])).toEqual([]);
  });
});
