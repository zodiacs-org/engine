// S3 (PREREGISTRATION.md): the engine against USNO's published rise, set and
// transit times, given to the minute. Reads usno_fetch.py's download; writes
// statistics and the differences of any case over 30 s (never the downloaded
// values themselves). On feature-sky this tool also compared the Chinese
// entry's solar terms with USNO and HKO (C3); that entry is held back from
// 0.1.1-rc.16, and its part is left out here.
// Usage: node published-compare.mjs USNO_DIR OUT.json [FETCHED]   (after npm run build)
// FETCHED is the date of the download (default 2026-09-29, the branch's).
import { readFileSync, writeFileSync } from "node:fs";
import { skyEventsOn } from "../../../../dist/sky.js";

const [dir, out, fetched = "2026-09-29"] = process.argv.slice(2);
const rstt = JSON.parse(readFileSync(`${dir}/usno-rstt.json`, "utf8"));
const TOLERANCE_S = 30;

function stats(values) {
  const sorted = values.map(Math.abs).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { count: 0 };
  return {
    count: n,
    median: sorted[Math.floor((n - 1) / 2)],
    p95: sorted[Math.ceil(0.95 * n) - 1],
    max: sorted[n - 1],
    over: sorted.filter((v) => v > TOLERANCE_S).length,
    signedMean: values.reduce((a, b) => a + b, 0) / n,
    signedMin: Math.min(...values),
    signedMax: Math.max(...values)
  };
}

// S3: Sun and Moon rise, set and upper transit, UTC day, the engine's defaults.
const PHEN = { Rise: "rise", Set: "set", "Upper Transit": "upper-transit" };
const s3 = { Sun: [], Moon: [] };
const s3Unpaired = [];
const s3Over = [];
for (const day of rstt) {
  for (const [body, list] of [["Sun", day.sundata], ["Moon", day.moondata]]) {
    const engine = skyEventsOn(body, { latitude: day.lat, longitude: day.lon }, day.date, { utcOffsetMinutes: 0 }).events.filter(
      (event) => event.kind !== "lower-transit"
    );
    const used = new Set();
    for (const phenomenon of list) {
      const kind = PHEN[phenomenon.phen];
      if (!kind) continue;
      const usnoMs = Date.parse(`${day.date}T${phenomenon.time}:00Z`);
      let best = -1;
      engine.forEach((event, i) => {
        if (event.kind === kind && !used.has(i) && (best < 0 || Math.abs(event.at - usnoMs) < Math.abs(engine[best].at - usnoMs))) best = i;
      });
      if (best < 0 || Math.abs(engine[best].at - usnoMs) > 1800_000) {
        s3Unpaired.push({ site: [day.lat, day.lon], date: day.date, body, kind, side: "usno-only" });
        continue;
      }
      used.add(best);
      const delta = (engine[best].at.getTime() - usnoMs) / 1000;
      s3[body].push(delta);
      if (Math.abs(delta) > TOLERANCE_S) s3Over.push({ site: [day.lat, day.lon], date: day.date, body, kind, deltaSeconds: delta });
    }
    engine.forEach((event, i) => {
      if (!used.has(i)) s3Unpaired.push({ site: [day.lat, day.lon], date: day.date, body, kind: event.kind, side: "engine-only" });
    });
  }
}

const result = {
  tolerance_s: TOLERANCE_S,
  S3_usno_rise_set_transit: {
    source: `https://aa.usno.navy.mil/api/rstt/oneday, tz=0, fetched ${fetched} (API 4.0.1)`,
    Sun: stats(s3.Sun),
    Moon: stats(s3.Moon),
    all: stats([...s3.Sun, ...s3.Moon]),
    unpaired: s3Unpaired,
    over: s3Over
  }
};
writeFileSync(out, JSON.stringify(result, null, 1) + "\n");
console.log(JSON.stringify({ S3: result.S3_usno_rise_set_transit.all, S3unpaired: s3Unpaired.length }, null, 1));
