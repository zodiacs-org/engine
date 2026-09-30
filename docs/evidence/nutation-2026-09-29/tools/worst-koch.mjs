// Feed Swiss's own RAMC and true obliquity at each engine's worst Koch case
// on the ladder (1850–2049) to that engine's Koch function, and report how far
// the cusps then are from Swiss's, as the site's rc.9 worst-koch.mjs did.
// Keeps each case's instant, place and two differences only.
//
//   node docs/evidence/nutation-2026-09-29/tools/worst-koch.mjs "$WORK/worst-koch-inputs.json" > results/worst-koch.json
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { BUILD, unpackRc15 } from "./engines.mjs";

const worst = JSON.parse(readFileSync(process.argv[2], "utf8"));
const gap = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180) * 3600;
const rc15 = unpackRc15();
try {
  const out = {};
  for (const [name, dist] of [["rc15", rc15.dist], ["build", BUILD]]) {
    const { computeAngles, kochCusps } = await import(pathToFileURL(join(dist, "internal-math.js")).href);
    const w = worst[name];
    const input = { gastHours: w.swissRamc / 15, latitude: w.latitude, longitude: 0, obliquity: w.swissTrueObliquity };
    const cusps = kochCusps(input, computeAngles(input));
    out[name] = {
      utc: w.utc,
      latitude: w.latitude,
      longitude: w.longitude,
      endToEndArcsec: w.endToEndArcsec,
      givenSwissInputsArcsec: Math.max(...cusps.map((cusp, index) => gap(cusp, w.swissCusps[index])))
    };
  }
  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
} finally {
  rc15.cleanup();
}
