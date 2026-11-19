#!/usr/bin/env node
/*
 * How far this tree's charts within six hours of the IERS table's end
 * (2027-10-02T00:00Z) differ from an earlier engine's, as a replay of that
 * engine's record would see them:
 *
 *   node speeds-near-table-end.mjs <earlier package directory> <this tree> [astronomy-engine] > results/near-table-end-<version>[-astronomy-engine].json
 *
 * Every minute from 18:00 on 2027-10-01 to 06:00 on 2027-10-02 UTC, and every
 * 100 ms within 100 s of the table's end, at
 * 48.2 N 16.37 E, Placidus, on each package's default source (the DE440
 * pack), or on astronomy-engine when the third argument names it. At or before the table's end the earlier engine's request is
 * replayed as it is (UTC); after it, as the UT1 instant that engine read
 * (natalReplayInput). For each body the largest difference of longitude,
 * latitude and speed, and for the angles and cusps the largest difference of
 * longitude. A speed is the change over samples 0.002 day apart (the true
 * node's 0.5 day), so a sample on the other side of the table's end, where the
 * rule changed, moves the speed and nothing else.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [earlierDir, thisDir, source] = process.argv.slice(2);
if (!earlierDir || !thisDir) throw new Error("usage: node speeds-near-table-end.mjs <earlier package directory> <this tree>");
const load = async (dir) => ({
  version: JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version,
  ...(await import(pathToFileURL(join(dir, "dist", "index.js")).href))
});
const earlier = await load(earlierDir);
const current = await load(thisDir);
if (source === "astronomy-engine") for (const engine of [earlier, current]) engine.setDefaultEphemeris("astronomy-engine");

const END = Date.UTC(2027, 9, 2);
const place = { latitude: 48.2, longitude: 16.37, houseSystem: "placidus" };
const wrap = (d) => ((d % 360) + 540) % 360 - 180;
const sides = { "at-or-before-table-end": {}, "after-table-end": {} };
const worst = (table, key, value, at) => {
  if (!table[key] || Math.abs(value) > Math.abs(table[key].value)) table[key] = { value, at: new Date(at).toISOString() };
};
const instants = new Set();
for (let at = END - 6 * 3_600_000; at <= END + 6 * 3_600_000; at += 60_000) instants.add(at);
for (let at = END - 100_000; at <= END + 100_000; at += 100) instants.add(at);
instants.add(END + 1);
for (const at of [...instants].sort((a, b) => a - b)) {
  const side = at <= END ? "at-or-before-table-end" : "after-table-end";
  const before = earlier.natalChart({ utc: new Date(at), ...place });
  const now = current.natalChart({ utc: new Date(at), ...(at > END ? { timeScale: "ut1" } : {}), ...place });
  const table = sides[side];
  for (const row of before.bodies) {
    const other = now.bodies.find((candidate) => candidate.body === row.body);
    worst(table, `${row.body} lon (deg)`, wrap(other.lon - row.lon), at);
    worst(table, `${row.body} lat (deg)`, other.lat - row.lat, at);
    worst(table, `${row.body} speed (deg/day)`, other.speed - row.speed, at);
  }
  for (const angle of Object.keys(before.angles)) worst(table, `angle ${angle} (deg)`, wrap(now.angles[angle] - before.angles[angle]), at);
  before.houses.cusps.forEach((cusp, index) => worst(table, "cusps (deg)", wrap(now.houses.cusps[index] - cusp), at));
}
const summary = (table) => {
  const out = {};
  for (const [key, { value, at }] of Object.entries(table)) out[key] = value === 0 ? 0 : { value, at };
  return out;
};
process.stdout.write(
  `${JSON.stringify({ earlier: earlier.version, source: source ?? "the package default, the DE440 pack", instants: "every minute from 2027-10-01T18:00Z to 2027-10-02T06:00Z, every 100 ms within 100 s of 2027-10-02T00:00Z, and 00:00:00.001Z", place, ...Object.fromEntries(Object.entries(sides).map(([k, v]) => [k, summary(v)])) }, null, 1)}\n`
);
