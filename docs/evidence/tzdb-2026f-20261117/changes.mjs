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
 * Each interval carries its cause: the NEWS sentence that explains it,
 * quoted verbatim from the release's NEWS file, or, where no NEWS entry
 * mentions it, the data-file lines that cause it; anything else is
 * "unexplained". The one data change no NEWS entry explains, America/
 * Yellowknife's, is listed with ownerDecision "held back": the owner held
 * it back (ZOD-282), and the package ships that name's tzdata 2025c history
 * (held.mjs). "held" checks this from the "held" dumps: the held name's
 * shipped history equals 2025c's, and every other name's equals 2026f's.
 * Names whose default
 * builds differ without the shipped history changing are listed apart, under
 * "defaultBuildOnly": they matter only to a host's Intl.
 *
 * Three more lists cover what an offset comparison cannot see, each read
 * from the same dumps:
 *
 * - "transitionsOnly": names whose shipped offsets before 1970 do not move
 *   but whose transitions do (an abbreviation, the daylight-saving flag, or
 *   a transition that changes neither offset);
 * - "eraEnds": names whose local mean time era (the pinned build's first
 *   change away from "LMT") ends at another instant or offset;
 * - "fromHistoryEnd": names whose default build from 1970 on gains or loses a
 *   change of standard offset (offset moves, daylight saving off on both
 *   sides), the transitions the generator records in LATER_CAUSES.
 *
 *   node docs/evidence/tzdb-2026f-20261117/changes.mjs DUMPS NEWS [changes.json]
 *
 * DUMPS is the directory oracle.mjs wrote; NEWS is tzdata 2026f's NEWS file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { HELD, heldNames } from "./held.mjs";
import { offsetDifferences, readZdump, shipped } from "./zdump-read.mjs";

const [dumps, newsPath, outPath] = process.argv.slice(2);
if (!dumps || !newsPath) throw new Error("usage: changes.mjs DUMPS NEWS [changes.json]");
const news = readFileSync(newsPath, "utf8").replace(/\s+/g, " ");

const HISTORY_END = 0;
const at = (iso) => Date.parse(iso) / 1000;
const iso = (s) => (s === -Infinity ? null : new Date(s * 1000).toISOString());

/** The explanations, each a NEWS sentence (checked verbatim below) or data-file lines, and the intervals it covers. */
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
  },
  {
    release: "2026f",
    news: null,
    newsNote: "No NEWS entry of 2026a to 2026f mentions America/Yellowknife.",
    source: [
      "tzdata 2025c backzone line 930: \"Zone America/Yellowknife 0\t-\t-00\t1935 # Yellowknife founded?\"",
      "tzdata 2026f backzone line 930: \"# Commented out as too wrong to be useful.\"",
      "tzdata 2026f backzone line 931: \"#Zone America/Yellowknife 0\t-\t-00\t1935 # Yellowknife founded?\"",
      "tzdata 2026f backward line 283: \"Link\tAmerica/Edmonton\tAmerica/Yellowknife\""
    ],
    cause: "backzone's Yellowknife zone is commented out, so the name follows backward's link to America/Edmonton, which kept summer time in 1947",
    ownerDecision: "held back",
    ownerDecisionNote:
      "Held back by the owner's decision (ZOD-282): no tzdb NEWS entry or other official announcement explains this data change, so the package ships tzdata 2025c's backzone lines 929 to 932 for this name (scripts/tzdb-held/yellowknife-2025c.zi) and the name answers as on tzdata 2025c.",
    covers: (zone, d) => zone === "America/Yellowknife" && d.from >= at("1947-04-27T00:00:00Z") && d.to <= at("1947-09-29T00:00:00Z")
  }
];

/** Uzhgorod and Zaporozhye: their backzone zones are gone, so each name is backward's link to Europe/Kyiv. */
const UKRAINE = {
  release: "2026f",
  news: "Move Europe/Uzhgorod and Europe/Zaporozhye to 'backzone'; backward-compatibility links still work, albeit with different timestamps before October 1991.",
  newsRelease: "2022d",
  newsNote: "The 2022d entry is the only NEWS entry that mentions either name; none of 2026a to 2026f mentions their removal from backzone.",
  source: [
    "tzdata 2025c backzone line 1588: \"Zone Europe/Uzhgorod\t1:29:12 -\tLMT\t1890 Oct\" (deleted with the rest of its zone in 2026f)",
    "tzdata 2025c backzone line 1631: \"Zone Europe/Zaporozhye\t2:20:40 -\tLMT\t1880\" (deleted with the rest of its zone in 2026f)",
    "tzdata 2026f backward lines 295 and 296: \"Link\tEurope/Kyiv\t\tEurope/Uzhgorod\", \"Link\tEurope/Kyiv\t\tEurope/Zaporozhye\""
  ]
};

/** The four POSIX-style names: 2026d moved them to backward with federal rules and POSIX abbreviations. */
const POSIX = {
  release: "2026d",
  news:
    "The backward-compatibility names EST5EDT, CST6CDT, MST7MDT, and PST8PDT now conform better to POSIX. For example, EST5EDT now always uses the abbreviation \"EST\" for standard time (now always 5 hours behind UT) and \"EDT\" for daylight saving time, whereas it formerly had different UT offsets before standard time was introduced and sometimes used abbreviations like \"LMT\", \"EWT\" and \"EPT\", all contrary to POSIX.",
  source: [
    "tzdata 2025c backzone lines 1840 to 1845: \"Zone\tEST5EDT\t\t -5:00\tUS\tE%sT\" and the same for CST6CDT, MST7MDT and PST8PDT, under rule US",
    "tzdata 2025c northamerica line 180: \"Rule\tUS\t1945\tonly\t-\tAug\t14\t23:00u\t1:00\tP # Peace\" (War time W becomes Peace time P: a transition with no offset change)",
    "tzdata 2026f backward lines 372 to 375: the same four zones under rule USback",
    "tzdata 2026f backward line 335: \"# To conform to POSIX, this copy uses D instead of W for War and P for Peace.\"",
    "tzdata 2026f backward line 340: \"Rule\tUSback\t1945\tonly\t-\tAug\t14\t23:00u\t1:00\tD # Peace\" (D before and after, so zic records no transition)"
  ]
};

/** Morocco and Western Sahara go to permanent +00 on 2026-09-20. */
const MOROCCO = {
  release: "2026c",
  news:
    "Morocco plans to move back to permanent UTC, without daylight saving time transitions, on 2026-09-20 at 02:00. This also affects Western Sahara."
};

for (const { news: sentence } of [...EXPLANATIONS, UKRAINE, POSIX, MOROCCO]) {
  if (sentence === null) continue;
  for (const part of sentence.split(" [...] ")) {
    if (!news.includes(part)) throw new Error(`changes: not verbatim in NEWS: ${part}`);
  }
}

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
let awaitingOwner = 0;
let heldBack = 0;
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
    else if (explanation.ownerDecision) heldBack += 1;
    else if (explanation.ownerAcceptance) awaitingOwner += 1;
    return {
      from: iso(d.from),
      to: iso(d.to),
      oldOffsetSeconds: d.oldOffset,
      newOffsetSeconds: d.newOffset,
      hours: d.from === -Infinity ? null : (d.to - d.from) / 3600,
      release: explanation ? explanation.release : null,
      news: explanation ? explanation.news : "unexplained",
      ...(explanation?.newsNote ? { newsNote: explanation.newsNote } : {}),
      ...(explanation?.source ? { cause: explanation.cause, source: explanation.source } : {}),
      ...(explanation?.ownerDecision ? { ownerDecision: explanation.ownerDecision, ownerDecisionNote: explanation.ownerDecisionNote } : {}),
      ...(explanation?.ownerAcceptance ? { ownerAcceptance: explanation.ownerAcceptance } : {})
    };
  });
  zones.push({ zone: name, form2025c: old.form, form2026f: now.form, intervals });
}

/** One clock's changes before 1970 as comparable rows. */
const rows = (clock) =>
  new Set(clock.changes.filter((c) => c.t < HISTORY_END).map((c) => `${iso(c.t)} ${c.offset} ${c.isdst} ${c.abbr}`));
const transitionsOnly = [];
for (const name of names) {
  const old = shipped(before.pinned, before.host, name);
  const now = shipped(after.pinned, after.host, name);
  if (!old || !now || offsetDifferences(old.clock, now.clock, HISTORY_END).length) continue;
  const a = rows(old.clock);
  const b = rows(now.clock);
  const removed = [...a].filter((row) => !b.has(row));
  const added = [...b].filter((row) => !a.has(row));
  if (!removed.length && !added.length) continue;
  const source = ["EST5EDT", "CST6CDT", "MST7MDT", "PST8PDT"].includes(name) ? POSIX : null;
  if (!source) unexplained += 1;
  transitionsOnly.push({
    zone: name,
    removed,
    added,
    release: source ? source.release : null,
    news: source ? source.news : "unexplained",
    ...(source ? { source: source.source } : {})
  });
}

/** The pinned build's local mean time era: [end, offset], or null without one. */
const era = (clock) => {
  let previous = clock.initial;
  for (const change of clock.changes) {
    if (previous.abbr === "LMT" && change.abbr !== "LMT") return [change.t, previous.offset];
    previous = change;
  }
  return null;
};
const eraEnds = [];
for (const name of names) {
  if (!before.host.has(name) || !after.host.has(name)) continue;
  const old = before.pinned.has(name) ? era(before.pinned.get(name)) : null;
  const now = after.pinned.has(name) ? era(after.pinned.get(name)) : null;
  if (JSON.stringify(old) === JSON.stringify(now)) continue;
  const source = name === "America/Yellowknife" ? EXPLANATIONS.at(-1) : ["Europe/Uzhgorod", "Europe/Zaporozhye"].includes(name) ? UKRAINE : null;
  if (!source) unexplained += 1;
  else if (source.ownerDecision) heldBack += 1;
  else if (source.ownerAcceptance) awaitingOwner += 1;
  eraEnds.push({
    zone: name,
    era2025c: old && { end: iso(old[0]), offsetSeconds: old[1] },
    era2026f: now && { end: iso(now[0]), offsetSeconds: now[1] },
    release: source ? source.release : null,
    news: source ? source.news : "unexplained",
    ...(source?.newsRelease ? { newsRelease: source.newsRelease } : {}),
    ...(source?.newsNote ? { newsNote: source.newsNote } : {}),
    ...(source ? { source: source.source } : {}),
    ...(source?.ownerDecision ? { ownerDecision: source.ownerDecision, ownerDecisionNote: source.ownerDecisionNote } : {}),
    ...(source?.ownerAcceptance ? { ownerAcceptance: source.ownerAcceptance } : {})
  });
}

/*
 * What ships: the "held" build (2026f's pinned build with the held zone).
 * The held name's shipped history must equal 2025c's (offsets, transitions,
 * abbreviations and era, before 1970), and every other name's must equal
 * 2026f's; anything else stops the script.
 */
const heldBuild = read("2026f", "held");
const heldOf = (name) => HELD.find((zone) => zone.name === name) ?? null;
const held = [];
let othersIdentical = 0;
for (const name of names) {
  const shippedNow = shipped(heldBuild, after.host, name, heldOf(name));
  if (heldNames.has(name)) {
    const old = shipped(before.pinned, before.host, name);
    const offsets = offsetDifferences(old.clock, shippedNow.clock, HISTORY_END).length;
    const a = rows(old.clock);
    const b = rows(shippedNow.clock);
    const transitions = [...a].filter((row) => !b.has(row)).length + [...b].filter((row) => !a.has(row)).length;
    const sameEra = JSON.stringify(era(before.pinned.get(name))) === JSON.stringify(era(heldBuild.get(name)));
    const sameForm = old.form === shippedNow.form && old.hostLegal === shippedNow.hostLegal;
    if (offsets || transitions || !sameEra || !sameForm) throw new Error(`changes: held ${name} does not ship tzdata 2025c's history`);
    const zone = heldOf(name);
    held.push({
      zone: name,
      heldAt: zone.release,
      file: "scripts/tzdb-held/yellowknife-2025c.zi",
      ownerDecision: "held back",
      firstDifferenceFromDefault: iso(zone.firstDifferenceFromDefault),
      shipped: "tzdata 2025c's history: 0 offset differences, 0 transition differences before 1970, the same local mean time era (none) and the same data form as tzdata 2025c"
    });
    continue;
  }
  const pure = shipped(after.pinned, after.host, name);
  if (JSON.stringify(pure) !== JSON.stringify(shippedNow)) throw new Error(`changes: ${name} differs between the held and the 2026f builds`);
  othersIdentical += 1;
}
const shippedIntervals = zones.reduce((sum, zone) => sum + (heldNames.has(zone.zone) ? 0 : zone.intervals?.length ?? 0), 0);
const shippedZones = zones.filter((zone) => zone.intervals && !heldNames.has(zone.zone)).length;

/** The default build's changes of standard offset from 1970 on. */
const standardChanges = (clock) => {
  const out = [];
  let previous = clock.initial;
  for (const change of clock.changes) {
    if (change.t >= HISTORY_END && change.offset !== previous.offset && change.isdst === 0 && previous.isdst === 0) {
      out.push(`${iso(change.t)} ${previous.offset} ${change.offset}`);
    }
    previous = change;
  }
  return new Set(out);
};
const fromHistoryEnd = [];
for (const name of names) {
  const a = before.host.has(name) ? standardChanges(before.host.get(name)) : new Set();
  const b = after.host.has(name) ? standardChanges(after.host.get(name)) : new Set();
  const removed = [...a].filter((row) => !b.has(row));
  const added = [...b].filter((row) => !a.has(row));
  if (!removed.length && !added.length) continue;
  const source = ["Africa/Casablanca", "Africa/El_Aaiun"].includes(name) ? MOROCCO : null;
  if (!source) unexplained += 1;
  fromHistoryEnd.push({ zone: name, removed, added, release: source ? source.release : null, news: source ? source.news : "unexplained" });
}

const result = {
  description:
    "Every interval before 1970-01-01T00:00Z on which the UTC offset of the history this package ships for a zone name differs between tzdata 2025c and 2026f as released, from zdump -v on zic-compiled data (oracle.mjs). Entries with ownerDecision 'held back' do not ship: the package holds America/Yellowknife at tzdata 2025c by the owner's decision ('held', 'shipped'). Offsets in seconds east; intervals are [from, to) in UTC; from null means from the beginning of the zone's history. transitionsOnly, eraEnds and fromHistoryEnd list what moves without such an offset change; rows are 'UTC offset isdst abbreviation' (transitionsOnly) or 'UTC offsetBefore offsetAfter' (fromHistoryEnd).",
  releases: { from: "2025c", to: "2026f" },
  hostLegal,
  changedZones: zones.filter((zone) => zone.intervals).length,
  intervals: zones.reduce((sum, zone) => sum + (zone.intervals?.length ?? 0), 0),
  unexplained,
  awaitingOwner,
  heldBack,
  shipped: {
    description:
      "What the package ships: tzdata 2026f with America/Yellowknife held at tzdata 2025c by the owner's decision. Names and intervals whose shipped offsets before 1970 move, the held name's excluded; every other name ships exactly 2026f's history (the held and 2026f builds compared name by name).",
    changedZones: shippedZones,
    intervals: shippedIntervals,
    otherNamesIdenticalTo2026f: othersIdentical
  },
  held,
  zones,
  defaultBuildOnly,
  transitionsOnly,
  eraEnds,
  fromHistoryEnd
};
const text = JSON.stringify(result, null, 2) + "\n";
if (outPath) writeFileSync(outPath, text);
console.log(
  `changes: ${result.changedZones} names, ${result.intervals} intervals, ${unexplained} unexplained, ${awaitingOwner} awaiting the owner, ${heldBack} held back by the owner's decision; ` +
    `shipped: ${shippedZones} names, ${shippedIntervals} intervals, held ${held.map((z) => `${z.zone} at ${z.heldAt}`).join(", ") || "none"} (2025c's history), ${othersIdentical} other names identical to 2026f; ` +
    `transitions only: ${transitionsOnly.map((z) => z.zone).join(", ") || "none"}; ` +
    `era ends: ${eraEnds.map((z) => z.zone).join(", ") || "none"}; ` +
    `from 1970: ${fromHistoryEnd.map((z) => z.zone).join(", ") || "none"}; ` +
    `host-legal ${hostLegal["2025c"].length} (2025c), ${hostLegal["2026f"].length} (2026f); ` +
    `default build only: ${defaultBuildOnly.map((z) => z.zone).join(", ") || "none"}`
);
