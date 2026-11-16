#!/usr/bin/env node
/*
 * ZOD-97, T3 (calendar-switch skipped days) and the flags a chart carries.
 *
 *   npm run build
 *   node docs/evidence/edge-cases-20261111/tools/calendar-switch.mjs [OUT.json]
 *
 * The arbiter is calendar arithmetic written here (the Julian day number of a
 * Julian or a Gregorian date, by the usual integer formulas; no engine code)
 * and tzdb 2025c's local mean time for the zone, read from its `europe` file:
 *   Zone Europe/Rome   0:49:56 - LMT 1866 Dec 12
 *   Zone Europe/London -0:01:15 - LMT 1847 Dec  1
 * A date in the days a changeover skipped never existed there. ZOD-97's rule:
 * the engine refuses or flags such a date, and resolves the valid neighbours
 * to the right instant. Verdicts: "pass", "noted" (a calendarNote, when the
 * caller names the country; no flag), "silent" (accepted with no signal).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("../../../../", import.meta.url).pathname);
const distDir = process.env.ZODIACS_ENGINE_DIST ? resolve(process.env.ZODIACS_ENGINE_DIST) : resolve(root, "dist");
const geo = await import(pathToFileURL(resolve(distDir, "geo.js")).href);
const { natalChart } = await import(pathToFileURL(resolve(distDir, "index.js")).href);

/** Julian day number of a calendar date (integer arithmetic; Meeus, Astronomical Algorithms, ch. 7, in integer form). */
function jdn(year, month, day, calendar) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  const days = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4);
  return calendar === "julian" ? days - 32083 : days - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}
/** UTC of local noon on a Julian day number, for a clock `offset` seconds east. JDN 2440588 is 1970-01-01. */
const noonUtc = (number, offset) => new Date(((number - 2440588) * 86400 + 43200 - offset) * 1000).toISOString();

const ROME = 49 * 60 + 56;
const LONDON = -75;
// [id, zone, lmt, country, date, calendar, existed there?, what]
const CASES = [
  ["T3-j", "Europe/Rome", ROME, "IT", "1582-10-04", "julian", true, "the last Julian day in Rome"],
  ["T3-k", "Europe/Rome", ROME, "IT", "1582-10-15", "gregorian", true, "the first Gregorian day in Rome, the next day"],
  ["T3-l", "Europe/Rome", ROME, "IT", "1582-10-10", "gregorian", false, "a Gregorian date inside the ten skipped days, country given"],
  ["T3-l", "Europe/Rome", ROME, undefined, "1582-10-10", "gregorian", false, "the same date, no country given"],
  ["T3-l", "Europe/Rome", ROME, "IT", "1582-10-05", "gregorian", false, "the first skipped date"],
  ["T3-l", "Europe/Rome", ROME, "IT", "1582-10-14", "gregorian", false, "the last skipped date"],
  ["T3-m", "Europe/London", LONDON, "GB", "1752-09-02", "julian", true, "the last Julian day in Britain"],
  ["T3-m", "Europe/London", LONDON, "GB", "1752-09-14", "gregorian", true, "the first Gregorian day in Britain, the next day"],
  ["T3-n", "Europe/London", LONDON, "GB", "1752-09-08", "julian", false, "a date of the eleven days Britain skipped, read as Julian"],
  ["T3-n", "Europe/London", LONDON, "GB", "1752-09-08", "gregorian", false, "the same date read as Gregorian"],
  ["T3-n", "Europe/London", LONDON, undefined, "1752-09-08", "gregorian", false, "the same, no country given"]
];

const records = [];
for (const [id, zone, lmt, country, date, calendar, existed, what] of CASES) {
  const record = { id, zone, country: country ?? null, date, calendar, existedThere: existed, what };
  const [y, m, d] = date.split("-").map(Number);
  const number = jdn(y, m, d, calendar);
  record.arbiter = { jdn: number, utcOfLocalNoon: noonUtc(number, lmt), lmtSeconds: lmt };
  try {
    await geo.prepareLocalTime(date, zone);
    const resolved = geo.resolveLocalToUtc(date, "12:00", zone, { calendar, ...(country ? { country } : {}) });
    const birth = geo.resolveLocalBirth({ date, time: "12:00", timeZone: zone, calendar, ...(country ? { country } : {}), latitude: 41.9, longitude: 12.5 });
    const chart = natalChart(birth.birth);
    record.engine = { utc: resolved.utc.toISOString(), gregorianDate: resolved.date, flags: resolved.flags, calendarNote: resolved.calendarNote ? { kind: resolved.calendarNote.kind, firstGregorian: resolved.calendarNote.adoption?.firstGregorian, lastJulian: resolved.calendarNote.adoption?.lastJulian } : null, chartFlags: chart.flags };
    const instant = resolved.utc.toISOString() === record.arbiter.utcOfLocalNoon;
    record.instantMatchesArithmetic = instant;
    record.verdict = !instant ? "fail" : existed ? (resolved.calendarNote ? "fail" : "pass") : resolved.calendarNote ? "noted" : "silent";
  } catch (error) {
    record.engine = { threw: String(error?.message ?? error) };
    record.verdict = existed ? "fail" : "refused";
  }
  records.push(record);
  console.log(`${record.verdict.padEnd(8)} ${id} ${zone} ${calendar} ${date} country=${country ?? "-"} -> ${record.engine.utc ?? record.engine.threw} note=${JSON.stringify(record.engine.calendarNote ?? null)} chartFlags=${JSON.stringify(record.engine.chartFlags ?? null)}`);
}

// The flags a chart carries for the civil-time cases: is the ambiguity visible on the chart itself?
for (const [id, zone, date, time, flag] of [["T1-a", "America/New_York", "2021-11-07", "01:30", "dst-fold"], ["T2-a", "America/New_York", "2021-03-14", "02:30", "dst-gap"], ["T3-a", "Pacific/Apia", "2011-12-30", "12:00", "dst-gap"]]) {
  const record = { id: `${id}/chart`, zone, date, time, what: "the flag on the resolved birth and on the chart computed from it" };
  try {
    await geo.prepareLocalTime(date, zone);
    const { birth, resolution } = geo.resolveLocalBirth({ date, time, timeZone: zone, latitude: 40, longitude: -74 });
    const chart = natalChart(birth);
    record.engine = { utc: birth.utc.toISOString(), birthFlags: birth.flags, chartFlags: chart.flags, chartInputFlags: chart.input.flags, jump: resolution.jump, gapShiftMinutes: resolution.localResolution.gapShiftMinutes };
    record.verdict = birth.flags.includes(flag) && (chart.flags.includes(flag) || chart.input.flags?.includes(flag)) ? "pass" : "fail";
  } catch (error) {
    Object.assign(record, { verdict: "error", error: String(error?.message ?? error) });
  }
  records.push(record);
  console.log(`${record.verdict.padEnd(8)} ${record.id} ${JSON.stringify(record.engine ?? record.error)}`);
}

const counts = records.reduce((all, record) => ({ ...all, [record.verdict]: (all[record.verdict] ?? 0) + 1 }), {});
const text = `${JSON.stringify({ what: "ZOD-97 T3, calendar switch, and chart flags", node: process.version, counts, records }, null, 1)}\n`;
if (process.argv[2]) writeFileSync(process.argv[2], text);
console.log(JSON.stringify(counts));
if (records.some((record) => record.verdict === "fail" || record.verdict === "error")) process.exit(1);
