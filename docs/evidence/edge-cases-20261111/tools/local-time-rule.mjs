#!/usr/bin/env node
/*
 * ZOD-97, classes T1 to T3 of ../EDGE-CASES.md: the engine's rule for a
 * repeated wall time (the earlier instant, flag dst-fold) and a skipped one
 * (moved forward by the jump, flag dst-gap), against the IANA tzdb 2025c
 * vectors the repository commits (conformance/vectors/L3-time-calendars.json,
 * arbiter tzdb-2025c-backzone) and the boundary cases of ../EDGE-CASES.md.
 *
 *   npm run build
 *   node docs/evidence/edge-cases-20261111/tools/local-time-rule.mjs [OUT.json]
 *
 * It needs no network. It reads the built dist/geo.js (ZODIACS_ENGINE_DIST
 * names another build). It writes one record per case and exits 1 if any case
 * fails or errors. From 1970 on the engine reads the host's Intl, so the
 * record carries the host's tz release (process.versions.tz) and each case's
 * zone source.
 *
 * First run on 2026-11-11: ../results/local-time-rule.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("../../../../", import.meta.url).pathname);
const distDir = process.env.ZODIACS_ENGINE_DIST ? resolve(process.env.ZODIACS_ENGINE_DIST) : resolve(root, "dist");
const geo = await import(pathToFileURL(resolve(distDir, "geo.js")).href);

/** A wall time as milliseconds, read as if it were UTC (proleptic Gregorian). */
function wallMs(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const at = new Date(0);
  at.setUTCFullYear(y, m - 1, d);
  return at.setUTCHours(hh, mm, 0, 0);
}

const cases = [];

// 1. The committed vectors: every ambiguous or nonexistent local time.
//    For a fold the vector gives both offsets; the earlier instant is the one
//    with the larger offset east. For a gap the vector gives only the status;
//    the offset before the jump is from tzdb's rules as ../EDGE-CASES.md
//    states them, where it states them.
const OFFSET_BEFORE_GAP = {
  "L3-TZ-0028": -18000, // America/New_York 2021-03-14: EST
  "L3-TZ-0032": 3600, // Europe/London 1941-05-04: BST
  "L3-TZ-0034": -16200, // America/Caracas 2016-05-01: -04:30
  "L3-TZ-0035": -36000 // Pacific/Apia 2011-12-30: -11:00 with summer time
};
const vectors = JSON.parse(readFileSync(resolve(root, "conformance/vectors/L3-time-calendars.json"), "utf8"));
const list = vectors.vectors ?? vectors.cases ?? Object.values(vectors).find((value) => Array.isArray(value) && value[0]?.kind);
if (!Array.isArray(list)) throw new Error("no vector list in L3-time-calendars.json");
for (const vector of list) {
  if (vector.kind !== "time.zone-offset" || !vector.input?.local) continue;
  const [date, clock] = vector.input.local.split("T");
  if (!clock.endsWith(":00")) continue;
  const time = clock.slice(0, 5);
  if (vector.expected.status === "ambiguous") {
    const earlier = Math.max(...vector.expected.utc_offsets_s);
    cases.push({ id: `T1/${vector.id}`, source: `fixture ${vector.id}`, zone: vector.input.zone, date, time, kind: "fold", utcMs: wallMs(date, time) - earlier * 1000 });
  } else if (vector.expected.status === "nonexistent") {
    const before = OFFSET_BEFORE_GAP[vector.id];
    cases.push({
      id: `T2/${vector.id}`,
      source: `fixture ${vector.id}${before === undefined ? " (status only)" : " and the offset before the jump from tzdb's rules"}`,
      zone: vector.input.zone,
      date,
      time,
      kind: "gap",
      utcMs: before === undefined ? null : wallMs(date, time) - before * 1000
    });
  }
}

// 2. The boundary minutes of ../EDGE-CASES.md. Expected instants are ISO UTC.
const BOUNDARY = [
  ["T1-f", "America/New_York", "2021-11-07", "01:00", "fold", "2021-11-07T05:00:00.000Z"],
  ["T1-g", "America/New_York", "2021-11-07", "01:59", "fold", "2021-11-07T05:59:00.000Z"],
  ["T1-h", "America/New_York", "2021-11-07", "00:59", null, "2021-11-07T04:59:00.000Z"],
  ["T1-i", "America/New_York", "2021-11-07", "02:00", null, "2021-11-07T07:00:00.000Z"],
  ["T2-d", "America/New_York", "2021-03-14", "02:00", "gap", "2021-03-14T07:00:00.000Z"],
  ["T2-e", "America/New_York", "2021-03-14", "02:59", "gap", "2021-03-14T07:59:00.000Z"],
  ["T2-f", "America/New_York", "2021-03-14", "01:59", null, "2021-03-14T06:59:00.000Z"],
  ["T2-g", "America/New_York", "2021-03-14", "03:00", null, "2021-03-14T07:00:00.000Z"],
  ["T3-a", "Pacific/Apia", "2011-12-30", "12:00", "gap", "2011-12-30T22:00:00.000Z"],
  ["T3-b", "Pacific/Apia", "2011-12-30", "00:00", "gap", "2011-12-30T10:00:00.000Z"],
  ["T3-c", "Pacific/Apia", "2011-12-30", "23:59", "gap", "2011-12-31T09:59:00.000Z"],
  ["T3-d", "Pacific/Apia", "2011-12-29", "23:59", null, "2011-12-30T09:59:00.000Z"],
  ["T3-e", "Pacific/Apia", "2011-12-31", "00:00", null, "2011-12-30T10:00:00.000Z"],
  ["T3-f", "Pacific/Kwajalein", "1993-08-21", "12:00", "gap", "1993-08-22T00:00:00.000Z"]
];
for (const [id, zone, date, time, kind, iso] of BOUNDARY) {
  cases.push({ id, source: "tzdb's rules, as ../EDGE-CASES.md states them", zone, date, time, kind, utcMs: Date.parse(iso) });
}

const DATE_LINE = new Set(["T3-a", "T3-b", "T3-c", "T3-f", "T2/L3-TZ-0035"]);
const records = [];
for (const item of cases) {
  const record = { ...item, expectedUtc: item.utcMs === null ? null : new Date(item.utcMs).toISOString() };
  delete record.utcMs;
  try {
    await geo.prepareLocalTime(item.date, item.zone);
    const resolved = geo.resolveLocalToUtc(item.date, item.time, item.zone);
    const flag = item.kind === "fold" ? "dst-fold" : item.kind === "gap" ? "dst-gap" : null;
    const checks = {
      // The rule: the instant.
      instant: item.utcMs === null ? null : resolved.utc.getTime() === item.utcMs,
      // The flag, and no flag of the other kind.
      flag: flag === null ? !resolved.flags.includes("dst-fold") && !resolved.flags.includes("dst-gap") : resolved.flags.includes(flag) && resolved.flags.filter((name) => name.startsWith("dst-")).length === 1,
      jumpKind: (resolved.jump?.kind ?? null) === item.kind,
      policy: resolved.localResolution.policy.fold === "earlier" && resolved.localResolution.policy.gap === "shift-forward"
    };
    if (DATE_LINE.has(item.id)) checks.dateLineCause = resolved.jump?.cause === "date-line";
    if (item.id === "T3-a") checks.shiftIsOneDay = resolved.localResolution.gapShiftMinutes === 1440;
    record.engine = {
      utc: resolved.utc.toISOString(),
      offsetMinutes: resolved.offsetMinutes,
      flags: resolved.flags,
      jump: resolved.jump,
      transition: resolved.transition,
      gapShiftMinutes: resolved.localResolution.gapShiftMinutes,
      zoneSource: resolved.zone.source,
      tzdbVersion: resolved.zone.tzdbVersion
    };
    record.checks = checks;
    record.verdict = Object.values(checks).every((value) => value !== false) ? "pass" : "fail";
  } catch (error) {
    record.verdict = "error";
    record.error = String(error?.message ?? error);
  }
  records.push(record);
}

const counts = records.reduce((all, record) => ({ ...all, [record.verdict]: (all[record.verdict] ?? 0) + 1 }), {});
const out = {
  what: "ZOD-97 T1 to T3: the repeated and the skipped wall time, docs/evidence/edge-cases-20261111/EDGE-CASES.md",
  node: process.version,
  hostTz: process.versions.tz ?? null,
  dist: distDir.startsWith(root) ? distDir.slice(root.length + 1) : "(outside the repository)",
  counts,
  records
};
const text = `${JSON.stringify(out, null, 1)}\n`;
if (process.argv[2]) writeFileSync(process.argv[2], text);
for (const record of records) console.log(`${record.verdict.padEnd(5)} ${record.id.padEnd(14)} ${record.zone} ${record.date} ${record.time} -> ${record.engine?.utc ?? record.error} (expected ${record.expectedUtc ?? "status only"})`);
console.log(JSON.stringify({ hostTz: out.hostTz, counts }));
if (records.some((record) => record.verdict !== "pass")) process.exit(1);
