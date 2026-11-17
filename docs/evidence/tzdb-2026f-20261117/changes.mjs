/*
 * Every interval before 1970-01-01T00:00Z on which a zone name's UTC offset
 * under tzdata 2026f differs from tzdata 2025c, read from the zdump output
 * oracle.mjs writes, never from the engine. For each name it compares the
 * history this package ships for that release:
 *
 * - the "pinned" build (main data with backzone), or, for a name whose pinned
 *   and default builds differ at any instant from 1970 on (the names the
 *   generator must mark host-legal), the "default" build; the marking is
 *   worked out here from the dumps for each release separately;
 * - spans the dump marks "-00" (no local time) read from the same release's
 *   default build, as the engine reads them from the host's Intl.
 *
 * Each interval carries the NEWS sentence that explains it, quoted verbatim
 * from the release's NEWS file, or "unexplained". Names whose default builds
 * differ without the shipped history changing are listed apart, under
 * "defaultBuildOnly": they matter only to a host's Intl.
 *
 *   node docs/evidence/tzdb-2026f-20261117/changes.mjs DUMPS NEWS [changes.json]
 *
 * DUMPS is the directory oracle.mjs wrote; NEWS is tzdata 2026f's NEWS file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { offsetDifferences, readZdump, shipped } from "./zdump-read.mjs";

const [dumps, newsPath, outPath] = process.argv.slice(2);
if (!dumps || !newsPath) throw new Error("usage: changes.mjs DUMPS NEWS [changes.json]");
const news = readFileSync(newsPath, "utf8").replace(/\s+/g, " ");

const HISTORY_END = 0;
const at = (iso) => Date.parse(iso) / 1000;
const iso = (s) => (s === -Infinity ? null : new Date(s * 1000).toISOString());

/** The explanations, each a NEWS sentence (checked verbatim below) and the intervals it covers. */
const EXPLANATIONS = [
  {
    release: "2026e",
    news: "In 1925 Ireland fell back on 09-20 not 10-04 (thanks to Stan Ulbrych).",
    covers: (zone, d) => ["Europe/Dublin", "Eire"].includes(zone) && d.from >= at("1925-09-20T00:00:00Z") && d.to <= at("1925-10-05T00:00:00Z")
  },
  {
    release: "2026f",
    news: "In 1965 Brazil ended DST on 03-31 at 24:00 not 00:00, and in 1966 it ended DST on 03-01 at 01:00 not 00:00. (Thanks to Daniel Dias Rodrigues.)",
    covers: (zone, d) =>
      /^(America|Brazil)\//.test(zone) &&
      d.newOffset - d.oldOffset === 3600 &&
      ((d.from >= at("1965-03-31T00:00:00Z") && d.to <= at("1965-04-01T06:00:00Z")) ||
        (d.from >= at("1966-03-01T00:00:00Z") && d.to <= at("1966-03-01T06:00:00Z")))
  },
  {
    release: "2026d",
    news:
      "The backward-compatibility names EST5EDT, CST6CDT, MST7MDT, and PST8PDT now conform better to POSIX." +
      " [...] This change affects only timestamps before 1966-10-30 at 01:00 standard time.",
    covers: (zone, d) => ["EST5EDT", "CST6CDT", "MST7MDT", "PST8PDT"].includes(zone) && d.to <= at("1966-10-30T09:00:00Z")
  }
];
for (const { news: sentence } of EXPLANATIONS) {
  for (const part of sentence.split(" [...] ")) {
    if (!news.includes(part)) throw new Error(`changes: not verbatim in NEWS: ${part}`);
  }
}

/** What tzdb's own data files say where NEWS is silent: quoted for the reader, never counted as an explanation. */
const DATA_NOTES = {
  "America/Yellowknife":
    "tzdata 2026f backzone comments out its Zone America/Yellowknife with the line \"# Commented out as too wrong to be useful.\"; " +
    "the name is then backward's Link to America/Edmonton. No NEWS entry from 2026a to 2026f mentions it."
};

const read = (release, form) =>
  readZdump(
    readFileSync(join(dumps, `${release}-${form}-1800-1970.zdump`), "utf8") + readFileSync(join(dumps, `${release}-${form}-1970-2038.zdump`), "utf8")
  );

const before = { pinned: read("2025c", "pinned"), host: read("2025c", "default") };
const after = { pinned: read("2026f", "pinned"), host: read("2026f", "default") };
const names = [...new Set([...before.host.keys(), ...after.host.keys()])].sort();
const zones = [];
const defaultBuildOnly = [];
const hostLegal = { "2025c": [], "2026f": [] };
let unexplained = 0;
for (const name of names) {
  const old = shipped(before.pinned, before.host, name);
  const now = shipped(after.pinned, after.host, name);
  if (old?.hostLegal) hostLegal["2025c"].push(name);
  if (now?.hostLegal) hostLegal["2026f"].push(name);
  if (!old || !now) {
    zones.push({ zone: name, note: old ? "not in tzdata 2026f's default build" : "not in tzdata 2025c's default build" });
    continue;
  }
  const differences = offsetDifferences(old.clock, now.clock, HISTORY_END);
  if (differences.length === 0) {
    const hostDifferences = offsetDifferences(before.host.get(name), after.host.get(name), HISTORY_END);
    if (hostDifferences.length) defaultBuildOnly.push({ zone: name, intervals: hostDifferences.length });
    continue;
  }
  const intervals = differences.map((d) => {
    const explanation = EXPLANATIONS.find((e) => e.covers(name, d));
    if (!explanation) unexplained += 1;
    return {
      from: iso(d.from),
      to: iso(d.to),
      oldOffsetSeconds: d.oldOffset,
      newOffsetSeconds: d.newOffset,
      hours: d.from === -Infinity ? null : (d.to - d.from) / 3600,
      release: explanation ? explanation.release : null,
      news: explanation ? explanation.news : "unexplained"
    };
  });
  zones.push({ zone: name, form2025c: old.form, form2026f: now.form, ...(DATA_NOTES[name] ? { dataNote: DATA_NOTES[name] } : {}), intervals });
}

const result = {
  description:
    "Every interval before 1970-01-01T00:00Z on which the UTC offset of the history this package ships for a zone name differs between tzdata 2025c and 2026f, from zdump -v -c 1800,1970 on zic-compiled data (oracle.mjs). Offsets in seconds east; intervals are [from, to) in UTC; from null means from the beginning of the zone's history.",
  releases: { from: "2025c", to: "2026f" },
  hostLegal,
  changedZones: zones.filter((zone) => zone.intervals).length,
  intervals: zones.reduce((sum, zone) => sum + (zone.intervals?.length ?? 0), 0),
  unexplained,
  zones,
  defaultBuildOnly
};
const text = JSON.stringify(result, null, 2) + "\n";
if (outPath) writeFileSync(outPath, text);
console.log(
  `changes: ${result.changedZones} names, ${result.intervals} intervals, ${unexplained} unexplained; ` +
    `host-legal ${hostLegal["2025c"].length} (2025c), ${hostLegal["2026f"].length} (2026f); ` +
    `default build only: ${defaultBuildOnly.map((z) => z.zone).join(", ") || "none"}`
);
