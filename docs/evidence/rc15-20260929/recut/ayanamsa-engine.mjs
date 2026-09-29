// The engine's side of the Swiss Ephemeris ayanamsa comparison
// (docs/evidence/vedic-2026-09-28/tools/swiss_ayanamsa.py, whose statistics
// for rc.15 are ayanamsa-swiss.json, measured on the first cut), on the first
// cut and on this build: the same 14,647 instants, the nine named and three
// user-defined ayanamsas, through the same bridge (engine-bridge.mjs). Where
// the two builds give the same mean and true ayanamsa at every instant, the
// comparison's differences from Swiss, which are engine minus Swiss, are the
// same for this build. Swiss Ephemeris is not run here. Statistics only.
//
//   node ayanamsa-engine.mjs <first cut package directory> <this package directory> [out.json]
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const bridge = fileURLToPath(new URL("../../vedic-2026-09-28/tools/engine-bridge.mjs", import.meta.url));
const [firstCut, candidate, out] = process.argv.slice(2);

// swiss_ayanamsa.py's grid: every 10 days from 1800-01-01 to 2200-12-31 UT at a
// time of day from its linear congruential generator (seed 20260928).
const DAY = 86_400_000;
const UNIX_JD = 2_440_587.5;
const instants = [];
let seed = 20260928n;
const end = Math.round((2_524_958.5 - UNIX_JD) * DAY);
for (let ms = Math.round((2_378_496.5 - UNIX_JD) * DAY); ms < end; ms += 10 * DAY) {
  seed = (seed * 1103515245n + 12345n) % 2n ** 31n;
  instants.push(ms + Number(seed % BigInt(DAY)));
}
const named = ["lahiri", "fagan-bradley", "krishnamurti", "raman", "yukteswar", "true-chitra", "true-revati", "true-pushya", "galactic-center"];
const definitions = Object.fromEntries(named.map((name) => [name, name]));
for (const [name, julianDateTT, value] of [["user-j1900", 2_415_020.0, 22.46], ["user-b1950", 2_433_282.5, 23.15], ["user-j2000", 2_451_545.0, 23.85]]) {
  definitions[name] = { name, epoch: { julianDateTT }, value };
}
const request = JSON.stringify({ kind: "ayanamsa", definitions, instants, sun: true });
const rows = (root) =>
  JSON.parse(execFileSync(process.execPath, [bridge, join(resolve(root), "dist/index.js")], { input: request, encoding: "utf8", maxBuffer: 1 << 30 }));
const [a, b] = [rows(firstCut), rows(candidate)];

const report = { firstCut: a.engineVersion, candidate: b.engineVersion, instants: instants.length, ayanamsas: {} };
const years = (list) => (list.length ? [new Date(Math.min(...list)).toISOString().slice(0, 10), new Date(Math.max(...list)).toISOString().slice(0, 10)] : null);
for (const name of Object.keys(definitions)) {
  const stat = { meanIdentical: 0, trueIdentical: 0, nutationIdentical: 0, julianDateTTIdentical: 0, maxMeanDifferenceArcsec: 0, maxTrueDifferenceArcsec: 0 };
  const deltaTChanged = [];
  let maxDeltaT = 0;
  a.result[name].forEach(([mean, truth, nutation, deltaT, jd], k) => {
    const [mean2, truth2, nutation2, deltaT2, jd2] = b.result[name][k];
    if (mean === mean2) stat.meanIdentical += 1;
    if (truth === truth2) stat.trueIdentical += 1;
    if (nutation === nutation2) stat.nutationIdentical += 1;
    if (jd === jd2) stat.julianDateTTIdentical += 1;
    stat.maxMeanDifferenceArcsec = Math.max(stat.maxMeanDifferenceArcsec, Math.abs(mean2 - mean) * 3600);
    stat.maxTrueDifferenceArcsec = Math.max(stat.maxTrueDifferenceArcsec, Math.abs(truth2 - truth) * 3600);
    if (deltaT !== deltaT2) {
      deltaTChanged.push(instants[k]);
      maxDeltaT = Math.max(maxDeltaT, Math.abs(deltaT2 - deltaT));
    }
  });
  stat.deltaT = { changedAt: deltaTChanged.length, between: years(deltaTChanged), maxChangeSeconds: Number(maxDeltaT.toPrecision(4)) };
  report.ayanamsas[name] = stat;
}
report.sunIdentical = a.result.sun.filter((lon, k) => lon === b.result.sun[k]).length;
const text = `${JSON.stringify(report, null, 1)}\n`;
if (out) writeFileSync(out, text);
process.stdout.write(text);
