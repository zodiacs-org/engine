// The engine's own sign-change instants for the slow planets, default path
// (astronomy-engine), from the built package.
// usage: node engine_ingresses.mjs <dist dir> > results/engine.json
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const dist = resolve(process.argv[2] ?? "dist");
const root = await import(pathToFileURL(resolve(dist, "index.js")).href);
const time = await import(pathToFileURL(resolve(dist, "time.js")).href);

const FROM = new Date("1800-01-03T00:00:00Z");
const TO = new Date("2199-12-29T00:00:00Z");
const out = { engine: root.ENGINE_VERSION, ephemeris: root.EPHEMERIS, from: FROM.toISOString(), to: TO.toISOString(), bodies: {} };
for (const body of ["Neptune", "Pluto"]) {
  const rows = [];
  for (let k = 0; k < 12; k += 1) {
    const found = root.searchLongitudeCrossings(body, k * 30, FROM, TO, { stepDays: 1, maxSamples: 400000 });
    if (found.status !== "complete") throw new Error(`${body} ${k}: ${found.status}`);
    for (const c of found.crossings) {
      const basis = time.timeBasis(c.at.getTime());
      rows.push({ boundary: k * 30, at: c.at.toISOString(), retrograde: c.retrograde, jdTT: 2451545 + basis.ttDays, deltaTModel: basis.deltaT.model });
    }
  }
  rows.sort((a, b) => a.jdTT - b.jdTT);
  out.bodies[body] = rows;
}
console.log(JSON.stringify(out, null, 1));
