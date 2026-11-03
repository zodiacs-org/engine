import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { VARGAS } from "../vedic.js";
import type { VargaName, VargaScheme } from "../vedic.js";
import { changeBoundaries, vargaAtTick } from "./varga.js";

// F1 of docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/PREREGISTRATION.md (section 6),
// written by tools/varga_changes.py there from the transcribed rules of
// docs/evidence/vedic-2026-09-28/tools/boundary_fixtures.py with exact rational
// arithmetic; it never runs the engine. Each row: [T, the sign index on the tick
// below T, the sign index at T, 1 for a change and 0 for a keep].
type Row = [t: number, below: number, at: number, change: number];
interface ChangeFixture {
  keys: string[];
  total: { boundaries: number; changes: number; keeps: number };
  varga: Record<string, Row[]>;
}
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/varga-changes.json", import.meta.url), "utf8")
) as ChangeFixture;
const CIRCLE = 360 * 7560;
const keyOf = (key: string): [VargaName, VargaScheme] => [
  key.replace("cyclic", "") as VargaName,
  key.endsWith("cyclic") ? "cyclic" : "parashari"
];

/**
 * G-V2 (a)'s comparison: each part boundary of the fixture that `boundaries`
 * classes otherwise (a change left out, or a keep listed), and each of
 * `boundaries` that is not a part boundary of the fixture.
 */
function mismatches(rows: readonly Row[], boundaries: readonly number[]): string[] {
  const listed = new Set(boundaries);
  const out = rows
    .filter(([t, , , change]) => listed.has(t) !== (change === 1))
    .map(([t, , , change]) => `${t}: a ${change === 1 ? "change" : "keep"} in the fixture`);
  const parts = new Set(rows.map(([t]) => t));
  for (const t of boundaries) if (!parts.has(t)) out.push(`${t}: not a part boundary of the fixture`);
  return out;
}

describe("the varga change boundaries against F1 (G-V2 a)", () => {
  it("covers the 18 keys: 3,480 part boundaries, 3,456 changes and 24 keeps", () => {
    expect(fixture.keys).toEqual([...VARGAS.map((varga) => varga.name), "D2cyclic", "D3cyclic"]);
    expect(Object.keys(fixture.varga)).toEqual(fixture.keys);
    const rows = Object.values(fixture.varga).flat();
    expect(rows).toHaveLength(3480);
    expect(rows.filter((row) => row[3] === 1)).toHaveLength(3456);
    expect(fixture.total).toEqual({ boundaries: 3480, changes: 3456, keeps: 24 });
  });

  it.each(Object.keys(fixture.varga))("%s: the change boundaries are the fixture's change rows", (key) => {
    const boundaries = changeBoundaries(...keyOf(key));
    expect(mismatches(fixture.varga[key]!, boundaries)).toEqual([]);
    expect(Object.isFrozen(boundaries)).toBe(true);
    expect([...boundaries]).toEqual([...boundaries].sort((a, b) => a - b));
  });

  it("gives the fixture's sign on the tick below and at every part boundary", () => {
    const wrong: string[] = [];
    for (const [key, rows] of Object.entries(fixture.varga)) {
      const [varga, scheme] = keyOf(key);
      for (const [t, below, at] of rows) {
        const signs = [vargaAtTick((t - 1 + CIRCLE) % CIRCLE, varga, scheme).signIndex, vargaAtTick(t, varga, scheme).signIndex];
        if (signs[0] !== below || signs[1] !== at) wrong.push(`${key} ${t}: ${signs} for ${below},${at}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("control (i): every part boundary taken for a change is 24 mismatches, the keeps", () => {
    const found = Object.values(fixture.varga).flatMap((rows) => mismatches(rows, rows.map(([t]) => t)));
    expect(found).toHaveLength(24);
    expect(found.every((line) => line.endsWith("a keep in the fixture"))).toBe(true);
  });

  it("control (ii): one change row turned into a keep is one mismatch", () => {
    const rows = fixture.varga.D60!.map((row): Row => [...row]);
    rows[0]![3] = 0;
    expect(mismatches(rows, changeBoundaries("D60"))).toEqual([`${rows[0]![0]}: a keep in the fixture`]);
  });
});
