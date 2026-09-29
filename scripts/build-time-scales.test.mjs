import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { build, parseC04, parseFinalsRows, parseLeapSeconds, readSources, render } from "./build-time-scales.mjs";

/*
 * The generator's inputs are committed (scripts/time-scale-sources/), so its
 * check runs here, from the checkout alone: IERS replaces finals2000A.all
 * every day, and the file of 2026-09-24 cannot be fetched again.
 */
describe("scripts/build-time-scales.mjs", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const sources = readSources(root);
  const inputs = () => ({ leapText: sources.leapText, finals: parseFinalsRows(sources.finalsText), c04: parseC04(sources.c04Text) });

  it("rebuilds src/time-scale-data.ts byte for byte from its committed sources", () => {
    const committed = readFileSync(new URL("../src/time-scale-data.ts", import.meta.url), "utf8");
    expect(render(build(inputs()))).toBe(committed);
  });

  it("joins C04's 1972 to finals2000A.all on a knot, with the table's bound over both", () => {
    const { table, stats } = build(inputs());
    expect([table.from, table.finalsFrom, table.to]).toEqual([41_317, 41_684, 61_680]);
    expect(stats.c04).toBe(367);
    expect(stats.finals).toBe(19_997);
    expect(Math.max(stats.worst.c04, stats.worst.finals)).toBeLessThanOrEqual(table.bound);
    expect((table.finalsFrom - (table.from + 1)) % table.step).toBe(0);
  });

  it("refuses rows that leave a gap before finals2000A.all, and a list whose own hash fails", () => {
    const { finals, c04, leapText } = inputs();
    expect(() => build({ leapText, finals, c04: c04.slice(0, -1) })).toThrow(/day before finals2000A begins/);
    expect(() => parseLeapSeconds(leapText.replace(/^(3692217600\s+)37/m, "$138"))).toThrow(/does not match its #h/);
  });
});
