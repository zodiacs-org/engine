// Breaker, item 2: call every export that can read a position, on the installed package, and write what
// each result says about its ephemeris, with a digest of the result.
//   node probe.mjs <year> <out.json> [ae]        (from the install directory; "ae" = the caller chose astronomy-engine)
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
import * as housesE from "@zodiacs/engine/houses";
import * as receipt from "@zodiacs/engine/receipt";
import * as lite from "@zodiacs/engine/lite";
import * as time from "@zodiacs/engine/time";
import * as crossings from "@zodiacs/engine/crossings";
import * as geo from "@zodiacs/engine/geo";
import * as conventions from "@zodiacs/engine/conventions";
import * as deltat from "@zodiacs/engine/deltat";
import * as math from "@zodiacs/engine/internal/math";
import * as de440 from "@zodiacs/engine/de440";
import * as pack from "@zodiacs/engine/de440/pack";

const year = Number(process.argv[2]);
const out = process.argv[3];
if (process.argv[4] === "ae") root.setDefaultEphemeris("astronomy-engine");
const Y = (y, rest) => `${y < 0 ? "-" + String(-y).padStart(6, "0") : String(y).padStart(4, "0")}${rest}`;
const utc = Y(year, "-06-21T14:45:00Z");
const A = { utc, latitude: 40.4, longitude: -3.7 };
const B = { utc: Y(year - 3, "-01-09T03:20:00Z"), latitude: -33.9, longitude: 151.2 };
const later = Y(year + 28, "-09-03T00:00:00Z");
const d0 = Y(year, "-06-20T00:00:00Z"), d1 = Y(year, "-07-02T00:00:00Z"), yearOn = Y(year + 1, "-06-20T00:00:00Z");
const day = Y(year, "-06-21");
const obs = { latitude: 40.4, longitude: -3.7 };
const D = (s) => new Date(s);
const chartA = () => root.natalChart(A);
const angle = () => ({ ramc: 123.4, obliquity: 23.44, latitude: 40.4 });

// name -> call. Every function export of every entry point is either here or in NO_POSITIONS below.
const calls = {
  ".:natalChart": () => root.natalChart(A),
  ".:natalChart(no time)": () => root.natalChart({ utc, timeKnown: false }),
  ".:positions": () => root.positions(utc),
  ".:transits": () => root.transits(A, later),
  ".:transits(chart)": () => root.transits(chartA(), later),
  ".:synastry": () => root.synastry(A, B),
  ".:progressedBodies": () => root.progressedBodies(utc, later),
  ".:moonPhase": () => root.moonPhase(utc),
  ".:saturnReturn": () => root.saturnReturn(utc),
  ".:searchLongitudeCrossings": () => root.searchLongitudeCrossings("Sun", 240, d0, yearOn),
  ".:findLongitudeCrossings": () => root.findLongitudeCrossings("Sun", 240, d0, yearOn),
  ".:chartPoints(birth)": () => root.chartPoints(A),
  ".:chartDeclinations(birth)": () => root.chartDeclinations(A),
  ".:defaultEphemeris": () => root.defaultEphemeris(),
  "./internal:bodyLongitude": () => internal.bodyLongitude("Mars", D(utc)),
  "./internal:bodyLongitudeDetailed": () => internal.bodyLongitudeDetailed("Mars", D(utc)),
  "./internal:longitudeSpeed": () => internal.longitudeSpeed("Mars", D(utc)),
  "./internal:longitudeSpeedDetailed": () => internal.longitudeSpeedDetailed("Mars", D(utc)),
  "./internal:computeBodies": () => internal.computeBodies(D(utc)),
  "./internal:computeChart": () => internal.computeChart({ utc: D(utc), latitude: 40.4, longitude: -3.7, timeKnown: true, houseSystem: "placidus" }),
  "./receipt:createNatalEnvelope": () => receipt.createNatalEnvelope(chartA()),
  "./calc:calc Sun": () => calcE.calc({ body: "Sun", time: utc }),
  "./calc:calc Moon equatorial-icrs": () => calcE.calc({ body: "Moon", time: utc, frame: "equatorial-icrs" }),
  "./calc:calc Venus sidereal": () => calcE.calc({ body: "Venus", time: utc, zodiac: { sidereal: "lahiri" } }),
  "./calc:calc North Node": () => calcE.calc({ body: "North Node", time: utc }),
  "./calc:calc Mean Node": () => calcE.calc({ body: "Mean Node", time: utc }),
  "./calc:calc Jupiter heliocentric": () => calcE.calc({ body: "Jupiter", time: utc, center: "heliocentric" }),
  "./calc:calc Jupiter topocentric": () => calcE.calc({ body: "Jupiter", time: utc, center: { topocentric: obs } }),
  "./calc:calc Jupiter astrometric": () => calcE.calc({ body: "Jupiter", time: utc, flags: { correction: "astrometric" } }),
  "./calc:chart": () => calcE.chart({ time: utc, place: obs }),
  "./calc:events crossing": () => calcE.events({ kind: "longitude-crossing", body: "Sun", longitude: 240, from: d0, to: yearOn }),
  "./calc:houses": () => calcE.houses({ time: utc, place: obs }),
  "./window:birthWindow": () => win.birthWindow({ start: Y(year, "-06-21T14:00:00Z"), end: Y(year, "-06-21T15:00:00Z"), ...obs }),
  "./techniques:solarReturn": () => tech.solarReturn(A, later),
  "./techniques:lunarReturn": () => tech.lunarReturn(A, later),
  "./techniques:solarReturnInstant": () => tech.solarReturnInstant(77, later),
  "./techniques:solarReturnInstantDetailed": () => tech.solarReturnInstantDetailed(77, later),
  "./techniques:mostRecentSolarReturnInstant": () => tech.mostRecentSolarReturnInstant(77, later),
  "./techniques:mostRecentSolarReturnInstantDetailed": () => tech.mostRecentSolarReturnInstantDetailed(77, later),
  "./techniques:lunarReturnInstant": () => tech.lunarReturnInstant(77, later),
  "./techniques:lunarReturnInstantDetailed": () => tech.lunarReturnInstantDetailed(77, later),
  "./techniques:moonIngresses": () => tech.moonIngresses(d0, d1),
  "./techniques:moonAspects": () => tech.moonAspects(d0, d1),
  "./techniques:voidOfCourseAt": () => tech.voidOfCourseAt(utc),
  "./techniques:voidOfCourseWindows": () => tech.voidOfCourseWindows(d0, d1),
  "./techniques:moonSignsBetween": () => tech.moonSignsBetween(d0, d1),
  "./techniques:moonSignsBetweenDetailed": () => tech.moonSignsBetweenDetailed(d0, d1),
  "./techniques:moonSignCandidates": () => tech.moonSignCandidates(day),
  "./techniques:compositeChart(births)": () => tech.compositeChart(A, B),
  "./techniques:compositeChart(charts)": () => tech.compositeChart(chartA(), root.natalChart(B)),
  "./techniques:davisonChart": () => tech.davisonChart(A, B),
  "./techniques:chartAspectPatterns(birth)": () => tech.chartAspectPatterns(A),
  "./techniques:chartAspectPatterns(chart)": () => tech.chartAspectPatterns(chartA()),
  "./techniques:compositeMidpoints(charts)": () => tech.compositeMidpoints(chartA().bodies, root.natalChart(B).bodies),
  "./timing:profectionAt": () => timing.profectionAt(A, later),
  "./timing:profectionYear": () => timing.profectionYear(A, 30),
  "./timing:firdaria": () => timing.firdaria(A),
  "./timing:firdariaAt": () => timing.firdariaAt(A, later),
  "./timing:planetaryReturns": () => timing.planetaryReturns(A, "Jupiter", utc, later),
  "./timing:solarArc": () => timing.solarArc(utc, later),
  "./timing:solarArcDirections": () => timing.solarArcDirections(A, later),
  "./timing:zodiacalReleasing": () => timing.zodiacalReleasing(A, "Lot of Fortune", utc, later),
  "./timing:zodiacalReleasingAt": () => timing.zodiacalReleasingAt(A, "Lot of Fortune", later),
  "./sky:skyEvents Sun": () => sky.skyEvents("Sun", obs, d0, d1),
  "./sky:skyEvents Mars": () => sky.skyEvents("Mars", obs, d0, d1),
  "./sky:skyEventsOn Moon": () => sky.skyEventsOn("Moon", obs, day),
  "./sky:planetaryHours": () => sky.planetaryHours(obs, day),
  "./sky:planetaryHourAt": () => sky.planetaryHourAt(obs, utc),
  "./vedic:ayanamsa lahiri": () => vedic.ayanamsa("lahiri", utc),
  "./vedic:ayanamsa true-chitra": () => vedic.ayanamsa("true-chitra", utc),
  "./vedic:siderealChart": () => vedic.siderealChart(A, "lahiri"),
  "./vedic:siderealChart(chart)": () => vedic.siderealChart(chartA(), "lahiri"),
  "./vedic:vargaSensitivity": () => vedic.vargaSensitivity(A, "lahiri"),
  "./timing:releasingPeriods": () => timing.releasingPeriods("leo", utc, utc, later),
  "./timing:releasingAt": () => timing.releasingAt("leo", utc, later),
  "./vedic:vimshottariAt": () => vedic.vimshottariAt(vedic.siderealChart(A, "lahiri").bodies.find((b) => b.body === "Moon").sidereal ?? vedic.siderealChart(A, "lahiri").bodies.find((b) => b.body === "Moon"), later),
  ".:outsideReferenceSpan": () => root.outsideReferenceSpan(D(utc))
};
// Exports that take no instant and no birth (numbers, a supplied list, a caller's own longitude function, a
// place or a calendar date alone), so no position is read: listed so that the coverage is explicit.
const NO_POSITIONS = new Set(["setDefaultEphemeris", "withEphemeris", "findLongitudeCrossingsWith", "searchLongitudeCrossingsWith"]);

const modules = { ".": root, "./calc": calcE, "./window": win, "./techniques": tech, "./timing": timing, "./sky": sky, "./vedic": vedic, "./internal": internal, "./houses": housesE, "./receipt": receipt, "./lite": lite, "./time": time, "./crossings": crossings, "./geo": geo, "./conventions": conventions, "./deltat": deltat, "./internal/math": math, "./de440": de440, "./de440/pack": pack };
const covered = new Set(Object.keys(calls).map((k) => { const [entry, rest] = k.split(":"); return `${entry}:${rest.split(/[ (]/)[0]}`; }));
const notCalled = [];
for (const [entry, m] of Object.entries(modules)) for (const [name, v] of Object.entries(m)) if (typeof v === "function" && !covered.has(`${entry}:${name}`)) notCalled.push(`${entry}:${name}`);

const results = {};
for (const [name, fn] of Object.entries(calls)) {
  try {
    const value = fn();
    const text = JSON.stringify(value) ?? String(value);
    const top = value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) ? value : null;
    results[name] = {
      kind: Array.isArray(value) ? `array[${value.length}]` : value instanceof Date ? "Date" : typeof value,
      status: top && "status" in top ? `${top.status}${top.reason ? ":" + top.reason : ""}` : undefined,
      digest: createHash("sha256").update(text).digest("hex").slice(0, 16),
      unavailable: text.includes('"de440-unavailable"'),
      outside: text.includes('"outside-de440-span"'),
      namesAstronomyEngine: text.includes("astronomy-engine"),
      namesDe440: text.includes("jpl-de440"),
      topEphemeris: top && top.ephemeris !== undefined ? (top.ephemeris === null ? null : top.ephemeris.name ?? top.ephemeris) : undefined,
      topFlags: top && Array.isArray(top.flags) ? top.flags : undefined,
      head: text.slice(0, 120)
    };
  } catch (error) {
    results[name] = { threw: `${error?.name}: ${String(error?.message).slice(0, 160)}` };
  }
}
writeFileSync(out, JSON.stringify({ year, chose: process.argv[4] ?? null, defaultEphemeris: root.defaultEphemeris(), notCalled, results }, null, 1));
console.log(`${out}: ${Object.keys(results).length} calls, ${Object.values(results).filter((r) => r.threw).length} threw, ${notCalled.length} function exports not called; pack opened: ${root.defaultEphemeris().de440.opened}`);
