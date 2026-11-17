/*
 * Records, as evidence only, what this Node's own Intl says at every probe of
 * src/geo/host-probes-intervals.json, and what the built engine (dist/geo.js)
 * gives for three wall times on this real host, unemulated.
 *
 *   npm run build && node docs/evidence/host-zone-probes-20261117/tools/host-says.mjs > results/node-<version>.json
 *
 * The verdict per probe compares Intl's offset with the pinned and baseline
 * offsets that zdump gives there (tools/zdump-check.mjs checks those).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const spelled = JSON.parse(readFileSync(resolve("src/geo/host-probes-intervals.json"), "utf8"));
const intl = (zone, ms) => {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(ms)
    .find((part) => part.type === "timeZoneName").value;
  const match = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?)?$/.exec(name);
  return (match[1] === "-" ? -1 : 1) * (Number(match[2] ?? 0) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0));
};

const counts = { pinned: 0, baseline: 0, neither: 0 };
const disagreements = [];
for (const [name, rows] of Object.entries(spelled.byName)) {
  for (const [from, to, probe, pinned, baseline] of rows) {
    const says = intl(name, Date.parse(probe));
    const verdict = says === pinned ? "pinned" : says === baseline ? "baseline" : "neither";
    counts[verdict] += 1;
    if (verdict !== "pinned") disagreements.push({ name, from, to, probe, intl: says, pinned, baseline, verdict });
  }
}

const geo = await import(resolve("dist/geo.js"));
const cases = [
  ["2026-12-15", "12:00", "America/Havana"],
  ["2027-01-15", "12:00", "America/Vancouver"],
  ["2024-03-31", "02:30", "Europe/Chisinau"]
].map(([date, time, zone]) => {
  const resolved = geo.resolveLocalToUtc(date, time, zone);
  return { date, time, zone, utc: resolved.utc.toISOString(), offsetMinutes: resolved.offsetMinutes, flags: resolved.flags, zone_: resolved.zone };
});

console.log(
  JSON.stringify(
    {
      node: process.version,
      tz: process.versions.tz,
      icu: process.versions.icu,
      pinned: spelled.pinned.version,
      baseline: spelled.baseline.version,
      probes: spelled.intervals,
      intlAgreesWith: counts,
      disagreements,
      engine: cases
    },
    null,
    1
  )
);
