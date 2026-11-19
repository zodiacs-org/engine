// Breaker rc.12, items 0 and 2: a second hunt for a silent fallback, with argument forms the rc.11 probe
// (probe.mjs) does not use: computed charts where it passes births, births where it passes charts, option
// variants, other bodies and other kinds of calc events. One line per call: a digest of the result and what
// its text says. hunt2_report.py compares a damaged or out-of-span run with the healthy run.
//   node hunt2.mjs <year> <out.json>
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import * as root from "@zodiacs/engine";
import * as calcE from "@zodiacs/engine/calc";
import * as win from "@zodiacs/engine/window";
import * as tech from "@zodiacs/engine/techniques";
import * as timing from "@zodiacs/engine/timing";
import * as sky from "@zodiacs/engine/sky";
import * as vedic from "@zodiacs/engine/vedic";
import * as internal from "@zodiacs/engine/internal";
import * as receipt from "@zodiacs/engine/receipt";
const year = Number(process.argv[2]);
const Y = (y, rest) => `${String(y).padStart(4, "0")}${rest}`;
const utc = Y(year, "-03-04T05:06:07Z");
const A = { utc, latitude: -12.05, longitude: -77.04 };
const B = { utc: Y(year - 7, "-11-30T22:10:00Z"), latitude: 59.9, longitude: 10.75 };
const later = Y(year + 31, "-02-11T12:00:00Z");
const d0 = Y(year, "-03-01T00:00:00Z"), d1 = Y(year, "-03-20T00:00:00Z"), y1 = Y(year + 2, "-03-01T00:00:00Z");
const obs = { latitude: -12.05, longitude: -77.04 };
const cA = () => root.natalChart(A), cB = () => root.natalChart(B);
const sid = () => vedic.siderealChart(A, "lahiri");
const calls = {
  ".:natalChart whole-sign": () => root.natalChart({ ...A, houseSystem: "whole-sign" }),
  ".:natalChart tt": () => root.natalChart({ ...A, timeScale: "tt" }),
  ".:positions(Date)": () => root.positions(new Date(utc)),
  ".:transits(chart, later)": () => root.transits(cA(), later),
  ".:synastry(charts)": () => root.synastry(cA(), cB()),
  ".:synastry(chart, birth)": () => root.synastry(cA(), B),
  ".:progressedBodies": () => root.progressedBodies(utc, later),
  ".:moonPhase(Date)": () => root.moonPhase(new Date(later)),
  ".:saturnReturn(birth)": () => root.saturnReturn(A),
  ".:saturnReturn(chart)": () => root.saturnReturn(cA()),
  ".:chartPoints(chart)": () => root.chartPoints(cA()),
  ".:chartPoints(birth, no time)": () => root.chartPoints({ utc, timeKnown: false }),
  ".:chartDeclinations(chart)": () => root.chartDeclinations(cA()),
  ".:chartDeclinations(birth, no time)": () => root.chartDeclinations({ utc, timeKnown: false }),
  ".:searchLongitudeCrossings Moon": () => root.searchLongitudeCrossings("Moon", 12.5, d0, d1),
  ".:searchLongitudeCrossings Mars": () => root.searchLongitudeCrossings("Mars", 100, d0, y1),
  ".:searchLongitudeCrossings North Node": () => root.searchLongitudeCrossings("North Node", 100, d0, Y(year + 19, "-03-01T00:00:00Z")),
  "./internal:bodyLongitudeDetailed Moon": () => internal.bodyLongitudeDetailed("Moon", new Date(utc)),
  "./internal:bodyLongitudeDetailed North Node": () => internal.bodyLongitudeDetailed("North Node", new Date(utc)),
  "./internal:longitudeSpeedDetailed Pluto": () => internal.longitudeSpeedDetailed("Pluto", new Date(utc)),
  "./internal:computeBodies": () => internal.computeBodies(new Date(later)),
  "./receipt:createNatalEnvelope": () => receipt.createNatalEnvelope(cA()),
  "./receipt:serialize(create)": () => receipt.serializeNatalEnvelope(receipt.createNatalEnvelope(cA())),
  "./calc:calc Pluto ecliptic-j2000": () => calcE.calc({ body: "Pluto", time: utc, frame: "ecliptic-j2000" }),
  "./calc:calc South Node": () => calcE.calc({ body: "South Node", time: utc }),
  "./calc:calc Mercury cartesian": () => calcE.calc({ body: "Mercury", time: utc, flags: { cartesian: true } }),
  "./calc:calc Moon topocentric": () => calcE.calc({ body: "Moon", time: utc, center: { topocentric: obs } }),
  "./calc:calc Saturn geometric": () => calcE.calc({ body: "Saturn", time: utc, flags: { correction: "geometric" } }),
  "./calc:calc Lilith": () => calcE.calc({ body: "Mean Lilith", time: utc }),
  "./calc:chart sidereal": () => calcE.chart({ time: utc, place: obs, zodiac: { sidereal: "lahiri" } }),
  "./calc:chart no place": () => calcE.chart({ time: utc }),
  "./calc:events Moon crossing": () => calcE.events({ kind: "longitude-crossing", body: "Moon", longitude: 33, from: d0, to: d1 }),
  "./calc:events station": () => calcE.events({ kind: "station", body: "Mercury", from: d0, to: y1 }),
  "./calc:events ingress": () => calcE.events({ kind: "sign-ingress", body: "Venus", from: d0, to: y1 }),
  "./window:birthWindow day": () => win.birthWindow({ start: Y(year, "-03-04T00:00:00Z"), end: Y(year, "-03-05T00:00:00Z"), ...obs }),
  "./techniques:solarReturn(chart)": () => tech.solarReturn(cA(), later),
  "./techniques:lunarReturn(chart)": () => tech.lunarReturn(cA(), later),
  "./techniques:compositeChart(chart, birth)": () => tech.compositeChart(cA(), B),
  "./techniques:davisonChart(charts)": () => tech.davisonChart(cA(), cB()),
  "./techniques:voidOfCourseAt(later)": () => tech.voidOfCourseAt(later),
  "./techniques:moonSignCandidates": () => tech.moonSignCandidates(Y(year, "-03-04")),
  "./techniques:moonAspects": () => tech.moonAspects(d0, d1),
  "./techniques:chartAspectPatterns(no time)": () => tech.chartAspectPatterns({ utc, timeKnown: false }),
  "./timing:profectionAt(chart)": () => timing.profectionAt(cA(), later),
  "./timing:profectionYear(chart)": () => timing.profectionYear(cA(), 30),
  "./timing:firdaria(chart)": () => timing.firdaria(cA()),
  "./timing:firdariaAt(chart)": () => timing.firdariaAt(cA(), later),
  "./timing:planetaryReturns(chart) Mars": () => timing.planetaryReturns(cA(), "Mars", utc, later),
  "./timing:planetaryReturns(birth) Moon": () => timing.planetaryReturns(A, "Moon", utc, Y(year, "-09-04T00:00:00Z")),
  "./timing:solarArcDirections(chart)": () => timing.solarArcDirections(cA(), later),
  "./timing:zodiacalReleasing(chart) Spirit": () => timing.zodiacalReleasing(cA(), "Lot of Spirit", utc, later),
  "./timing:zodiacalReleasingAt(chart)": () => timing.zodiacalReleasingAt(cA(), "Lot of Fortune", later),
  "./vedic:siderealChart raman": () => vedic.siderealChart(A, "raman"),
  "./vedic:siderealChart true-chitra": () => vedic.siderealChart(A, "true-chitra"),
  "./vedic:vargaSensitivity(chart)": () => vedic.vargaSensitivity(cA(), "lahiri"),
  "./vedic:ayanamsa true-revati": () => vedic.ayanamsa("true-revati", utc),
  "./vedic:ayanamsa galactic": () => vedic.ayanamsa("galactic-center-0-sag", utc),
  "./sky:skyEvents Moon": () => sky.skyEvents("Moon", obs, d0, d1),
  "./sky:skyEventsOn Venus": () => sky.skyEventsOn("Venus", obs, Y(year, "-03-04")),
  "./sky:planetaryHourAt": () => sky.planetaryHourAt(obs, later)
};
const results = {};
for (const [name, fn] of Object.entries(calls)) {
  try {
    const value = fn();
    const text = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
    const top = value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) ? value : null;
    results[name] = { digest: createHash("sha256").update(text).digest("hex").slice(0, 16), status: top && "status" in top ? `${top.status}${top.reason ? ":" + top.reason : ""}` : undefined,
      unavailable: text.includes("de440-unavailable"), outside: text.includes("outside-de440-span"), namesAE: text.includes("astronomy-engine"), namesDe440: text.includes("jpl-de440"),
      topEphemeris: top && top.ephemeris !== undefined ? (top.ephemeris === null ? null : top.ephemeris.name ?? top.ephemeris) : undefined, topFlags: top && Array.isArray(top.flags) ? top.flags : undefined };
  } catch (e) { results[name] = { threw: `${e?.name}: ${String(e?.message).slice(0, 140)}` }; }
}
writeFileSync(process.argv[3], JSON.stringify({ year, defaultEphemeris: root.defaultEphemeris(), results }, null, 1));
console.log(process.argv[3], Object.keys(results).length, "calls,", Object.values(results).filter((r) => r.threw).length, "threw; opened", root.defaultEphemeris().de440.opened);
