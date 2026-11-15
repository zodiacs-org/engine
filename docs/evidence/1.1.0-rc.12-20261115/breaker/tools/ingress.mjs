// Breaker rc.12, item 7: the Sun's tropical ingress into Sagittarius (240 degrees) on 2026-11-22 from the
// installed package, by every function that can give it, on the default path and then after the caller
// chooses astronomy-engine. Times to the millisecond with what each result names.
//   node ingress.mjs <out.json>
import { writeFileSync } from "node:fs";
import * as root from "@zodiacs/engine";
import * as calcE from "@zodiacs/engine/calc";
import * as tech from "@zodiacs/engine/techniques";
import * as timing from "@zodiacs/engine/timing";
import * as internal from "@zodiacs/engine/internal";
import * as win from "@zodiacs/engine/window";
import * as crossings from "@zodiacs/engine/crossings";
import * as vedic from "@zodiacs/engine/vedic";
const from = "2026-11-21T12:00:00Z", to = "2026-11-23T12:00:00Z";
const bisect = (lonAt) => { let a = Date.parse(from), b = Date.parse(to); const f = (ms) => ((lonAt(ms) - 240 + 540) % 360) - 180; if (!(f(a) < 0 && f(b) > 0)) throw new Error("not bracketed"); while (b - a > 1) { const m = Math.floor((a + b) / 2); if (f(m) < 0) a = m; else b = m; } return new Date(b); };
const sunOf = (list) => list.find((b) => b.body === "Sun");
const iso = (d) => (d instanceof Date ? d.toISOString() : String(d));
const run = () => {
  const rows = [];
  const add = (fn, get) => { try { const [at, names, extra] = get(); rows.push({ fn, utc: iso(at), names, ...(extra ?? {}) }); } catch (e) { rows.push({ fn, threw: `${e.name}: ${String(e.message).slice(0, 160)}` }); } };
  add("positions(), bisected", () => { const at = bisect((ms) => sunOf(root.positions(new Date(ms))).lon); return [at, sunOf(root.positions(at)).ephemeris]; });
  add("natalChart(), bisected", () => { const f = (ms) => root.natalChart({ utc: new Date(ms), latitude: 51.5, longitude: 0 }); const at = bisect((ms) => sunOf(f(ms).bodies).lon); const c = f(at.getTime()); return [at, c.ephemeris.name, { flags: c.flags, signBefore: sunOf(f(at.getTime() - 1).bodies).sign, signAt: sunOf(c.bodies).sign }]; });
  add("transits(natal, date) transiting Sun, bisected", () => { const natal = root.natalChart({ utc: "1990-01-01T00:00:00Z", latitude: 0, longitude: 0 }); const g = (ms) => root.transits(natal, new Date(ms)); const pick = (t) => sunOf(t.positions); const at = bisect((ms) => pick(g(ms)).lon); const t = g(at.getTime()); return [at, pick(t).ephemeris ?? t.ephemeris?.name, { keys: Object.keys(t) }]; });
  add("calc(), bisected", () => { const at = bisect((ms) => calcE.calc({ body: "Sun", time: new Date(ms) }).lon); const r = calcE.calc({ body: "Sun", time: at }); return [at, r.receipt.engine.ephemeris.name, { flags: r.flags }]; });
  add("calc chart(), bisected", () => { const f = (ms) => calcE.chart({ time: new Date(ms), place: { latitude: 0, longitude: 0 } }); const at = bisect((ms) => sunOf(f(ms).chart.bodies).lon); return [at, f(at.getTime()).chart.ephemeris.name]; });
  add("internal bodyLongitude, bisected (label: bodyLongitudeDetailed)", () => { const at = bisect((ms) => internal.bodyLongitude("Sun", new Date(ms))); const d = internal.bodyLongitudeDetailed("Sun", at); return [at, d.ephemeris.name, { flags: d.flags }]; });
  add("internal computeBodies, bisected", () => { const at = bisect((ms) => sunOf(internal.computeBodies(new Date(ms))).lon); return [at, sunOf(internal.computeBodies(at)).ephemeris]; });
  add("vedic siderealChart tropical longitude of the Sun, bisected", () => { const f = (ms) => vedic.siderealChart({ utc: new Date(ms), latitude: 0, longitude: 0 }, "lahiri"); const lon = (c) => { const s = sunOf(c.bodies); return s.tropical ?? s.tropicalLon ?? s.lon; }; const at = bisect((ms) => lon(f(ms))); const c = f(at.getTime()); return [at, c.ephemeris?.name ?? "(no name)", { flags: c.flags, sunKeys: Object.keys(sunOf(c.bodies)) }]; });
  add("findLongitudeCrossings", () => { const c = root.findLongitudeCrossings("Sun", 240, from, to); return [c[0].at, "(bare list, no label)", { crossings: c.length }]; });
  add("searchLongitudeCrossings", () => { const r = root.searchLongitudeCrossings("Sun", 240, from, to); return [r.crossings[0].at, "(flags only)", { flags: r.flags, status: r.status, crossings: r.crossings.length }]; });
  add("crossings entry findLongitudeCrossingsWith(bodyLongitude)", () => { const c = crossings.findLongitudeCrossingsWith((b, d) => internal.bodyLongitude(b, d), "Sun", 240, new Date(from), new Date(to)); return [c[0].at, "(the caller's longitudes)"]; });
  add("calc events() longitude-crossing", () => { const r = calcE.events({ kind: "longitude-crossing", body: "Sun", longitude: 240, from, to }); const e = r.events[0]; return [e.at ?? e.utc ?? e.time, r.receipt.engine.ephemeris.name, { flags: r.flags, status: r.status }]; });
  add("techniques solarReturnInstant(240)", () => [tech.solarReturnInstant(240, "2026-11-20T00:00:00Z"), "(bare Date, no label)"]);
  add("techniques solarReturnInstantDetailed(240)", () => { const d = tech.solarReturnInstantDetailed(240, "2026-11-20T00:00:00Z"); return [d.value, d.ephemeris.name, { flags: d.flags }]; });
  add("techniques mostRecentSolarReturnInstantDetailed(240, 2026-12-01)", () => { const d = tech.mostRecentSolarReturnInstantDetailed(240, "2026-12-01T00:00:00Z"); return [d.value, d.ephemeris.name, { flags: d.flags }]; });
  const natal240 = () => root.natalChart({ utc: tech.solarReturnInstant(240, "2025-11-20T00:00:00Z"), latitude: 0, longitude: 0 });
  add("techniques solarReturn(chart with the Sun at 240)", () => { const n = natal240(); const r = tech.solarReturn(n, "2026-11-20T00:00:00Z"); const at = r.at ?? r.instant ?? r.chart?.input?.utc; return [at, r.chart?.ephemeris?.name ?? null, { flags: r.flags, natalSunLon: sunOf(n.bodies).lon }]; });
  add("timing planetaryReturns(same chart, Sun)", () => { const n = natal240(); const r = timing.planetaryReturns(n, "Sun", from, to); const first = (r.returns ?? r.crossings ?? [])[0]; return [first?.at ?? first?.exact ?? JSON.stringify(first).slice(0, 80), "(flags only)", { flags: r.flags, status: r.status }]; });
  add("window birthWindow 07:00 to 08:00, the Sun's sign switch", () => { const w = win.birthWindow({ start: "2026-11-22T07:00:00Z", end: "2026-11-22T08:00:00Z", latitude: 0, longitude: 0 }); const text = JSON.stringify(w); const m = /2026-11-22T07:2\d:\d\d\.\d{3}Z/.exec(text.slice(text.indexOf("Sun"))); const sw = (w.switches ?? []).find?.((s) => JSON.stringify(s).includes("Sun")); return [sw ? JSON.stringify(sw).slice(0, 300) : m?.[0], w.ephemeris.name, { flags: w.flags, keys: Object.keys(w) }]; });
  return rows;
};
const out = { engine: root.ENGINE_VERSION, node: process.version, defaultPath: { default: root.defaultEphemeris().name, rows: run() } };
root.setDefaultEphemeris("astronomy-engine");
out.afterChoosingAstronomyEngine = { default: root.defaultEphemeris().name, rows: run() };
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
for (const k of ["defaultPath", "afterChoosingAstronomyEngine"]) { console.log(k); for (const r of out[k].rows) console.log(" ", r.fn, "|", r.threw ?? r.utc.slice(0, 200), "|", r.names, r.flags ? JSON.stringify(r.flags) : ""); }
