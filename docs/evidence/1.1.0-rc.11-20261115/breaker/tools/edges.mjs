// Breaker, item 2: labels at the two ends of the pack's span (1790-01-01 and 2210-01-01 TDB, less a day).
// For each labelled result near an end: does a result that names jpl-de440 with no flag rest on any instant
// outside the pack, and does a flagged result still name astronomy-engine?
//   node edges.mjs <out.json>
import { writeFileSync } from "node:fs";
import { natalChart, setDefaultEphemeris, positions, defaultEphemeris } from "@zodiacs/engine";
import * as t from "@zodiacs/engine/techniques";
const DAY = 86400000;
const ends = { low: Date.UTC(1790, 0, 1), high: Date.UTC(2210, 0, 1) };
const src = (ms) => positions(new Date(ms))[0].ephemeris; // what a position at this instant is computed on
const rows = [];
const FB = ["de440-unavailable", "outside-de440-span"];
const lab = (l) => `${l.ephemeris?.name ?? l.ephemeris}${(l.flags ?? []).filter((f) => FB.includes(f)).length ? "+" + l.flags.filter((f) => FB.includes(f)).join("+") : ""}`;
const note = (fn, input, label, instants, extra = {}) => {
  const sources = [...new Set(instants.map(src))];
  const clean = label === "jpl-de440";
  const bad = (clean && sources.some((s) => s !== "jpl-de440")) || (!clean && !/astronomy-engine\+outside-de440-span/.test(label)) ;
  rows.push({ fn, input, label, instantSources: sources, suspicious: bad, ...extra });
};
for (const [which, end] of Object.entries(ends)) {
  for (let k = -12; k <= 12; k++) {
    const at = end + k * DAY * 1.37;
    const iso = new Date(at).toISOString();
    for (const lon of [279.5, 281.0, 283.0, 100]) {
      for (const [fn, f] of [["solarReturnInstantDetailed", t.solarReturnInstantDetailed], ["mostRecentSolarReturnInstantDetailed", t.mostRecentSolarReturnInstantDetailed], ["lunarReturnInstantDetailed", t.lunarReturnInstantDetailed]]) {
        try { const r = f(lon, iso); note(fn, `${lon}, ${iso}`, lab(r), [at, r.value.getTime()], { value: r.value.toISOString() }); } catch (e) { rows.push({ fn, input: `${lon}, ${iso}`, threw: String(e.message).slice(0, 100) }); }
      }
    }
    try { const r = t.voidOfCourseAt(iso); note("voidOfCourseAt", iso, lab(r), [at, ...(r.lastAspect ? [new Date(r.lastAspect.at ?? r.lastAspect.exact ?? at).getTime()] : []), ...(r.nextIngress ? [new Date(r.nextIngress.at ?? at).getTime()] : [])]); } catch (e) { rows.push({ fn: "voidOfCourseAt", input: iso, threw: String(e.message).slice(0, 100) }); }
    try { const to = new Date(at + 3 * DAY).toISOString(); const r = t.moonSignsBetweenDetailed(iso, to); note("moonSignsBetweenDetailed", `${iso} to ${to}`, lab(r), [at, at + 3 * DAY]); } catch (e) { rows.push({ fn: "moonSignsBetweenDetailed", input: iso, threw: String(e.message).slice(0, 100) }); }
    try { const a = { utc: iso, latitude: 10, longitude: 20 }, b = { utc: new Date(at - 40 * DAY).toISOString(), latitude: 10, longitude: 20 }; const r = t.compositeChart(a, b); rows.push({ fn: "compositeChart(birth, birth 40 days earlier)", input: iso, label: `${r.ephemeris === null ? "null" : r.ephemeris.name}${r.flags.filter((f) => FB.includes(f)).map((f) => "+" + f).join("")}`, instantSources: [src(at), src(at - 40 * DAY)], suspicious: (r.ephemeris?.name === "jpl-de440" && r.flags.filter((f) => FB.includes(f)).length === 0) !== (src(at) === "jpl-de440" && src(at - 40 * DAY) === "jpl-de440") || ((src(at) !== "jpl-de440" || src(at - 40 * DAY) !== "jpl-de440") && !r.flags.includes("outside-de440-span")) }); } catch (e) { rows.push({ fn: "compositeChart", input: iso, threw: String(e.message).slice(0, 100) }); }
    try { const r = t.chartAspectPatterns({ utc: iso, latitude: 10, longitude: 20 }); note("chartAspectPatterns(birth)", iso, lab(r), [at]); } catch (e) { rows.push({ fn: "chartAspectPatterns", input: iso, threw: String(e.message).slice(0, 100) }); }
  }
  // lists across the end: every element against the source of a position at its own instant
  const from = new Date(end - 12 * DAY).toISOString(), to = new Date(end + 12 * DAY).toISOString();
  for (const [fn, f, when] of [["moonIngresses", t.moonIngresses, (e) => e.at], ["moonAspects", t.moonAspects, (e) => e.at ?? e.exact], ["voidOfCourseWindows", t.voidOfCourseWindows, (e) => e.start ?? e.from]]) {
    const list = f(from, to);
    let mismatched = 0; const seen = {};
    for (const e of list) {
      const ms = new Date(when(e)).getTime();
      const l = lab(e); seen[l] = (seen[l] ?? 0) + 1;
      const clean = l === "jpl-de440";
      if (clean !== (src(ms) === "jpl-de440")) mismatched++;
    }
    rows.push({ fn: `${fn} across the ${which} end`, input: `${from} to ${to}`, elements: list.length, labels: seen, elementsLabelledAgainstTheirOwnInstant: mismatched, suspicious: Object.keys(seen).length < 2 });
  }
}
const suspicious = rows.filter((r) => r.suspicious), threw = rows.filter((r) => r.threw);
writeFileSync(process.argv[2], JSON.stringify({ packSpanTtDays: defaultEphemeris().de440, rows: rows.length, suspicious: suspicious.length, threw: threw.length, detail: rows }, null, 1));
console.log(`${rows.length} rows, ${suspicious.length} suspicious, ${threw.length} threw`);
const by = {}; for (const r of suspicious) (by[r.fn] ??= []).push(r);
for (const [fn, rs] of Object.entries(by)) console.log(fn, rs.length, JSON.stringify(rs.slice(0, 3)));
for (const r of rows.filter((r) => /across/.test(r.fn))) console.log(JSON.stringify(r));
console.log(JSON.stringify(threw.slice(0, 3)));
