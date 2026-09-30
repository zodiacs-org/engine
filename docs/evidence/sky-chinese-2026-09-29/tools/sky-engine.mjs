// Runs the engine's skyEvents over the S1/S2 grid and writes one JSON line per
// (convention, site, date, body): the events in the UTC day, and the engine's
// ΔT and UT1 − UTC at the start of the day (from natalChart, public API).
// Usage: node sky-engine.mjs OUT.jsonl.gz   (after npm run build)
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { natalChart } from "../../../../dist/index.js";
import { skyEventsOn } from "../../../../dist/sky.js";
import { CONVENTIONS, DATES, SITES } from "./grid.mjs";

const lines = [];
const started = Date.now();
let count = 0;
for (const site of SITES) {
  for (const date of DATES) {
    const chart = natalChart({ utc: `${date}T00:00:00Z`, latitude: site.latitude, longitude: site.longitude });
    const deltaT = chart.deltaT.seconds;
    const dut1 = chart.timeScale.ut1MinusUtc?.seconds ?? 0;
    for (const convention of CONVENTIONS) {
      for (const body of convention.bodies) {
        const result = skyEventsOn(body, site, date, { ...convention.options, utcOffsetMinutes: 0 });
        lines.push(JSON.stringify({
          convention: convention.name, lat: site.latitude, lon: site.longitude, date, body, deltaT, dut1,
          status: result.status, flags: result.flags, samples: result.samples,
          events: result.events.map((event) => [event.kind, event.at.getTime()])
        }));
        count += 1;
      }
    }
  }
}
writeFileSync(process.argv[2], gzipSync(lines.join("\n") + "\n"));
console.log(`${count} searches in ${((Date.now() - started) / 1000).toFixed(1)} s`);
