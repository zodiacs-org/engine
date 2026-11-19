import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { LAST_LEAP_SECOND_MJD, build, parseC04, parseFinalsRows, parseLeapSeconds, readSources, render } from "./build-time-scales.mjs";

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

  it("stops on a leap second after 2017-01-01, which would break the continuous-UTC rule", () => {
    const { finals, c04, leapText } = inputs();
    expect(LAST_LEAP_SECOND_MJD).toBe(57_754);
    // The committed list's last change is 2017-01-01 (NTP 3692217600), to 37 s.
    const last = parseLeapSeconds(leapText).rows.at(-1);
    expect(last).toEqual([3_692_217_600, 37]);
    // The same list with a 38 s change on 2028-01-01 (NTP 3912019200) and its #h line recomputed, so only the new guard can refuse it.
    const lines = leapText.split("\n");
    const at = lines.findIndex((line) => line.startsWith("3692217600"));
    lines.splice(at + 1, 0, "3912019200\t38\t# 1 Jan 2028");
    const { updated, expires, rows } = parseLeapSecondsLoose(lines.join("\n"));
    const sha1 = createHash("sha1").update([updated, expires, ...rows.flat()].join("")).digest("hex");
    const words = sha1.match(/.{8}/g).join(" ");
    const forged = lines.map((line) => (line.startsWith("#h") ? `#h\t${words}` : line)).join("\n");
    expect(parseLeapSeconds(forged).rows.at(-1)).toEqual([3_912_019_200, 38]);
    expect(() => build({ leapText: forged, finals, c04 })).toThrow(/after 2017-01-01/);
    // The committed list passes it.
    expect(() => build({ leapText, finals, c04 })).not.toThrow();
  });
});

/** The list's numbers without its hash check, to forge a list in a test. */
function parseLeapSecondsLoose(text) {
  const rows = [];
  let updated = null;
  let expires = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("#$")) updated = Number(line.slice(2).trim());
    else if (line.startsWith("#@")) expires = Number(line.slice(2).trim());
    else if (line.trim() && !line.startsWith("#")) {
      const [ntp, dtai] = line.trim().split(/\s+/);
      rows.push([Number(ntp), Number(dtai)]);
    }
  }
  return { rows, updated, expires };
}
