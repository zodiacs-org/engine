/*
 * zdump's count of the offset changes that src/geo/roundtrip.test.ts expects
 * its scan to find on a host whose Intl is tzdb 2025c: for every name of the
 * default build, a history before 1970 (with "-00" spans read from the host)
 * and tzdata 2025c's default build from 1970 on, counted from 1850-01-01 to
 * 2038-01-01, both ends as the scan takes them. Three histories: tzdata
 * 2025c's, tzdata 2026f's as released, and what the package ships (2026f with
 * America/Yellowknife held at 2025c by the owner's decision, the "held" dumps).
 *
 *   node docs/evidence/tzdb-2026f-20261117/transition-count.mjs DUMPS
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { HELD } from "./held.mjs";
import { readZdump, shipped, stateAt } from "./zdump-read.mjs";

const [dumps] = process.argv.slice(2);
if (!dumps) throw new Error("usage: transition-count.mjs DUMPS");
const read = (release, form) =>
  readZdump(
    readFileSync(join(dumps, `${release}-${form}-1800-1970.zdump`), "utf8") + readFileSync(join(dumps, `${release}-${form}-1970-2038.zdump`), "utf8")
  );
const host = read("2025c", "default");
const START = Date.UTC(1850, 0, 1) / 1000;
const END = Date.UTC(2038, 0, 1) / 1000;
for (const [release, build, label] of [
  ["2025c", "pinned", "tzdata 2025c history"],
  ["2026f", "pinned", "tzdata 2026f history as released"],
  ["2026f", "held", "tzdata 2026f history with America/Yellowknife held at 2025c (shipped)"]
]) {
  const pinned = read(release, build);
  const own = read(release, "default");
  let total = 0;
  for (const name of host.keys()) {
    // The marked build, its "-00" spans left in place so that they read the host below.
    const held = build === "held" ? HELD.find((zone) => zone.name === name) ?? null : null;
    const form = shipped(pinned, own, name, held)?.form;
    const history = form === "main" ? own.get(name) : form ? pinned.get(name) : null;
    const intl = host.get(name);
    const offset = (t) => {
      if (t < 0 && history) {
        const state = stateAt(history, t);
        if (state.abbr !== "-00") return state.offset;
      }
      return stateAt(intl, t).offset;
    };
    const cuts = [...new Set([0, ...(history?.changes ?? []).map((c) => c.t), ...intl.changes.map((c) => c.t)])]
      .filter((t) => t > START && t <= END)
      .sort((a, b) => a - b);
    let previous = offset(START);
    for (const t of cuts) {
      const now = offset(t);
      if (now !== previous) total += 1;
      previous = now;
    }
  }
  console.log(`transition-count: ${label} before 1970, tzdb 2025c Intl after: ${total} offset changes, 1850 to 2037`);
}
