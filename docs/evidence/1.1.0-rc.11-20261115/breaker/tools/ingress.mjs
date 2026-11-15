// Breaker, item 7: the Sun's tropical ingress into 0° Sagittarius (240°) in November 2026, from the installed
// package, by every function that can give it, on its default path; then the same after the caller chooses
// astronomy-engine. Each time to the millisecond, with the ephemeris the result names.
//   node ingress.mjs <out.json>
import { writeFileSync } from "node:fs";
import * as root from "@zodiacs/engine";
import * as calcE from "@zodiacs/engine/calc";
import * as tech from "@zodiacs/engine/techniques";
import * as timing from "@zodiacs/engine/timing";
import * as internal from "@zodiacs/engine/internal";
import * as win from "@zodiacs/engine/window";
import * as crossings from "@zodiacs/engine/crossings";
const from = "2026-11-21T00:00:00Z", to = "2026-11-23T00:00:00Z";
const bisect = (lonAt) => {
  let a = Date.parse(from), b = Date.parse(to);
  const f = (ms) => ((lonAt(ms) - 240 + 540) % 360) - 180;
  if (!(f(a) < 0 && f(b) > 0)) throw new Error("not bracketed");
  while (b - a > 1) { const m = Math.floor((a + b) / 2); if (f(m) < 0) a = m; else b = m; }
  return new Date(b);
};
const run = () => {
  const rows = [];
  const add = (fn, get) => { try { const [at, names, extra] = get(); rows.push({ fn, utc: at instanceof Date ? at.toISOString() : at, names, ...(extra ?? {}) }); } catch (e) { rows.push({ fn, threw: `${e.name}: ${String(e.message).slice(0, 140)}` }); } };
  add("positions() bisected to 1 ms", () => { const at = bisect((ms) => root.positions(new Date(ms)).find((b) => b.body === "Sun").lon); const s = root.positions(at).find((b) => b.body === "Sun"); return [at, s.ephemeris, { fallback: s.fallback ?? null }]; });
  add("natalChart() bisected to 1 ms", () => { const at = bisect((ms) => root.natalChart({ utc: new Date(ms), timeKnown: false }).bodies.find((b) => b.body === "Sun").lon); const c = root.natalChart({ utc: at, timeKnown: false }); return [at, c.ephemeris.name, { flags: c.flags }]; });
  add("calc() bisected to 1 ms", () => { const at = bisect((ms) => calcE.calc({ body: "Sun", time: new Date(ms) }).lon); const r = calcE.calc({ body: "Sun", time: at }); return [at, r.receipt.engine.ephemeris.name, { flags: r.flags }]; });
  add("calc chart() bisected to 1 ms", () => { const at = bisect((ms) => calcE.chart({ time: new Date(ms), place: { latitude: 0, longitude: 0 } }).chart.bodies.find((b) => b.body === "Sun").lon); const c = calcE.chart({ time: at, place: { latitude: 0, longitude: 0 } }); return [at, c.chart.ephemeris.name, { flags: c.chart.flags }]; });
  add("internal bodyLongitude bisected to 1 ms (label from bodyLongitudeDetailed)", () => { const at = bisect((ms) => internal.bodyLongitude("Sun", new Date(ms))); const d = internal.bodyLongitudeDetailed("Sun", at); return [at, d.ephemeris.name, { flags: d.flags }]; });
  add("findLongitudeCrossings", () => { const c = root.findLongitudeCrossings("Sun", 240, from, to); return [c[0].at, "(a bare list: no label)", { crossings: c.length }]; });
  add("searchLongitudeCrossings", () => { const r = root.searchLongitudeCrossings("Sun", 240, from, to); return [r.crossings[0].at, "(flags only)", { flags: r.flags, status: r.status }]; });
  add("searchLongitudeCrossings, stepDays 0.25", () => { const r = root.searchLongitudeCrossings("Sun", 240, from, to, { stepDays: 0.25 }); return [r.crossings[0].at, "(flags only)", { flags: r.flags }]; });
  add("crossings entry: findLongitudeCrossingsWith(internal bodyLongitude)", () => { const c = crossings.findLongitudeCrossingsWith((b, d) => internal.bodyLongitude(b, d), "Sun", 240, new Date(from), new Date(to)); return [c[0].at, "(caller's longitudes: no label)"]; });
  add("calc events longitude-crossing", () => { const r = calcE.events({ kind: "longitude-crossing", body: "Sun", longitude: 240, from, to }); const e = r.events[0]; return [e.at ?? e.utc ?? e.time, r.receipt.engine.ephemeris.name, { flags: r.flags, status: r.status, keys: Object.keys(e) }]; });
  add("techniques solarReturnInstantDetailed(240, near)", () => { const d = tech.solarReturnInstantDetailed(240, "2026-11-20T00:00:00Z"); return [d.value, d.ephemeris.name, { flags: d.flags, plain: tech.solarReturnInstant(240, "2026-11-20T00:00:00Z").toISOString() }]; });
  add("techniques mostRecentSolarReturnInstantDetailed(240, 2026-12-01)", () => { const d = tech.mostRecentSolarReturnInstantDetailed(240, "2026-12-01T00:00:00Z"); return [d.value, d.ephemeris.name, { flags: d.flags }]; });
  add("techniques solarReturn(chart with the Sun at 240°, 2026-11-20)", () => {
    const natalAt = tech.solarReturnInstant(240, "2025-11-20T00:00:00Z");
    const natal = root.natalChart({ utc: natalAt, latitude: 0, longitude: 0 });
    const sun = natal.bodies.find((b) => b.body === "Sun").lon;
    const r = tech.solarReturn(natal, "2026-11-20T00:00:00Z");
    const at = r.at ?? r.instant ?? r.chart?.input?.utc ?? r.chart?.utc;
    return [at, r.chart?.ephemeris?.name ?? null, { flags: r.flags, natalSunLon: sun, natalAt: natalAt.toISOString(), secondsFor240: ((240 - sun) / 1.0115) * 86400 }];
  });
  add("timing planetaryReturns(same chart, Sun)", () => {
    const natalAt = tech.solarReturnInstant(240, "2025-11-20T00:00:00Z");
    const natal = root.natalChart({ utc: natalAt, latitude: 0, longitude: 0 });
    const r = timing.planetaryReturns(natal, "Sun", from, to);
    const first = (r.returns ?? r.crossings ?? [])[0];
    return [first?.at ?? first?.exact ?? JSON.stringify(first).slice(0, 80), "(flags only)", { flags: r.flags, status: r.status, natalSunLon: natal.bodies.find((b) => b.body === "Sun").lon }];
  });
  add("window birthWindow 07:00 to 08:00 (Sun's sign change)", () => {
    const w = win.birthWindow({ start: "2026-11-22T07:00:00Z", end: "2026-11-22T08:00:00Z", latitude: 0, longitude: 0 });
    const text = JSON.stringify(w);
    const sun = w.bodies?.find?.((b) => b.body === "Sun") ?? w.signs?.Sun ?? null;
    return [JSON.stringify(sun)?.slice(0, 400) ?? text.slice(0, 300), w.ephemeris.name, { flags: w.flags, keys: Object.keys(w) }];
  });
  return rows;
};
const out = { defaultPath: { default: root.defaultEphemeris().name, rows: run() } };
root.setDefaultEphemeris("astronomy-engine");
out.afterChoosingAstronomyEngine = { default: root.defaultEphemeris().name, rows: run() };
root.setDefaultEphemeris("de440");
// What stays on astronomy-engine whatever the default: calc() with another correction or centre (not the ingress as usually meant)
out.calcOnAstronomyEngineByDesign = ["astrometric", "geometric"].map((correction) => { const at = bisect((ms) => calcE.calc({ body: "Sun", time: new Date(ms), flags: { correction } }).lon); return { correction, utc: at.toISOString(), names: calcE.calc({ body: "Sun", time: at, flags: { correction } }).receipt.engine.ephemeris.name }; });
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) { console.log("##", k, v.default ?? ""); for (const r of v.rows ?? v) console.log(JSON.stringify(r).slice(0, 420)); }
