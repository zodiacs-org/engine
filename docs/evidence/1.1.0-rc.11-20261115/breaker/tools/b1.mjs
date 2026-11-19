// Breaker, item 2 (B1): the twelve functions the rc.10 review named, on the installed package. For each,
// the label its result (or its labelled form) carries, checked against what is expected in this state.
//   node b1.mjs <expect: healthy|damaged|chosen> <out.json>
import { writeFileSync } from "node:fs";
import { natalChart, defaultEphemeris, setDefaultEphemeris } from "@zodiacs/engine";
import * as t from "@zodiacs/engine/techniques";
import * as internal from "@zodiacs/engine/internal";
const [state, out] = process.argv.slice(2);
if (state === "chosen") setDefaultEphemeris("astronomy-engine");
const rows = [];
const iso = (v) => (v instanceof Date ? v.toISOString() : JSON.stringify(v));
for (const year of [1991, 1750, 2230]) {
  const Y = (rest) => `${year}${rest}`;
  const A = { utc: Y("-06-21T14:45:00Z"), latitude: 40.4, longitude: -3.7 };
  const B = { utc: Y("-01-09T03:20:00Z"), latitude: -33.9, longitude: 151.2 };
  const near = Y("-09-03T00:00:00Z"), d0 = Y("-06-20T00:00:00Z"), d1 = Y("-07-02T00:00:00Z");
  const inside = year === 1991;
  const want = state === "chosen" ? { name: "astronomy-engine", flag: null }
    : state === "damaged" ? { name: "astronomy-engine", flag: "de440-unavailable" }
    : inside ? { name: "jpl-de440", flag: null } : { name: "astronomy-engine", flag: "outside-de440-span" };
  const FALLBACK = ["de440-unavailable", "outside-de440-span"];
  const judge = (fn, labels, extra = {}) => {
    // labels: [{ephemeris, flags}] every label the result carries (one for an object, one per element of a list)
    const problems = [];
    if (labels.length === 0) problems.push("no label at all");
    for (const l of labels) {
      const name = l.ephemeris?.name;
      const fb = (l.flags ?? []).filter((f) => FALLBACK.includes(f));
      if (name !== want.name) problems.push(`names ${name}, expected ${want.name}`);
      if (want.flag ? !(fb.length === 1 && fb[0] === want.flag) : fb.length !== 0) problems.push(`fallback flags [${fb}], expected [${want.flag ?? ""}]`);
      if (name === "jpl-de440" && !/^[0-9a-f]{64}$/.test(l.ephemeris.version)) problems.push("jpl-de440 without the pack's digest");
    }
    rows.push({ year, fn, labels: labels.length, names: [...new Set(labels.map((l) => l.ephemeris?.name))], flags: [...new Set(labels.flatMap((l) => l.flags ?? []))], ...extra, ok: problems.length === 0, problems: [...new Set(problems)] });
  };
  const detailed = (fn, plain, det) => {
    const p = plain(), d = det();
    judge(fn, [d], { plainEqualsDetailedValue: iso(p) === iso(d.value), value: iso(d.value).slice(0, 60), plainHasNoLabel: typeof p !== "object" || p instanceof Date || Array.isArray(p) });
    if (iso(p) !== iso(d.value)) rows[rows.length - 1].ok = false, rows[rows.length - 1].problems.push("detailed value differs from the plain result");
  };
  const guard = (fn, run) => { try { run(); } catch (e) { rows.push({ year, fn, ok: false, problems: [`threw ${e.name}: ${String(e.message).slice(0, 120)}`] }); } };
  guard("solarReturnInstant", () => detailed("solarReturnInstant / solarReturnInstantDetailed", () => t.solarReturnInstant(77, near), () => t.solarReturnInstantDetailed(77, near)));
  guard("mostRecentSolarReturnInstant", () => detailed("mostRecentSolarReturnInstant / …Detailed", () => t.mostRecentSolarReturnInstant(77, near), () => t.mostRecentSolarReturnInstantDetailed(77, near)));
  guard("lunarReturnInstant", () => detailed("lunarReturnInstant / lunarReturnInstantDetailed", () => t.lunarReturnInstant(77, near), () => t.lunarReturnInstantDetailed(77, near)));
  guard("moonSignsBetween", () => detailed("moonSignsBetween / moonSignsBetweenDetailed", () => t.moonSignsBetween(d0, d1), () => t.moonSignsBetweenDetailed(d0, d1)));
  guard("bodyLongitude", () => detailed("internal bodyLongitude / bodyLongitudeDetailed", () => internal.bodyLongitude("Mars", new Date(A.utc)), () => internal.bodyLongitudeDetailed("Mars", new Date(A.utc))));
  guard("longitudeSpeed", () => detailed("internal longitudeSpeed / longitudeSpeedDetailed", () => internal.longitudeSpeed("Mars", new Date(A.utc)), () => internal.longitudeSpeedDetailed("Mars", new Date(A.utc))));
  guard("moonIngresses", () => { const v = t.moonIngresses(d0, d1); judge("moonIngresses (each element)", v, { elements: v.length }); });
  guard("moonAspects", () => { const v = t.moonAspects(d0, d1); judge("moonAspects (each element)", v, { elements: v.length }); });
  guard("voidOfCourseAt", () => { const v = t.voidOfCourseAt(A.utc); judge("voidOfCourseAt", [v, ...(v.lastAspect ? [v.lastAspect] : []), ...(v.nextIngress?.ephemeris ? [v.nextIngress] : [])]); });
  guard("voidOfCourseWindows", () => { const v = t.voidOfCourseWindows(d0, d1); judge("voidOfCourseWindows (each element and its lastAspect)", v.flatMap((w) => [w, ...(w.lastAspect ? [w.lastAspect] : [])]), { elements: v.length }); });
  guard("compositeChart", () => { judge("compositeChart(birth, birth)", [t.compositeChart(A, B)]); });
  guard("compositeChart charts", () => { judge("compositeChart(chart, chart)", [t.compositeChart(natalChart(A), natalChart(B))]); });
  guard("chartAspectPatterns", () => { judge("chartAspectPatterns(birth)", [t.chartAspectPatterns(A)]); });
  guard("chartAspectPatterns chart", () => { judge("chartAspectPatterns(chart)", [t.chartAspectPatterns(natalChart(A))]); });
}
const bad = rows.filter((r) => !r.ok);
writeFileSync(out, JSON.stringify({ state, packOpened: defaultEphemeris().de440.opened, error: defaultEphemeris().de440.error, checks: rows.length, failed: bad.length, rows }, null, 1));
console.log(`${state}: pack opened ${defaultEphemeris().de440.opened}; ${rows.length} checks, ${bad.length} failed`);
for (const r of bad) console.log("  FAIL", r.year, r.fn, r.problems.join("; "));
