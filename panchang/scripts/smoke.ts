import assert from "node:assert/strict";
import {
  instantaneousPanchang, luminarySnapshot, panchangDay, prepareCivilDay, prepareSunriseDay,
  resolveCivilDay, resolveSunriseDay, searchLimbTransitions
} from "../src/index.js";

// Exercise the actual source runtime, independently of Vite's test alias.
const snapshot = luminarySnapshot("2020-01-01T00:00:00Z");
if (snapshot.status !== "ok") throw new Error(snapshot.engine.reason);
assert.equal(snapshot.utc, "2020-01-01T00:00:00.000Z");
assert.equal(snapshot.ayanamsa.name, "lahiri");
assert.equal(snapshot.moon.sidereal.receipt.engine.ephemeris.version, "2.1.19");
console.log("Source runtime loads the engine adapter and its locally pinned dependency.");

const instant = instantaneousPanchang("2020-01-01T00:00:00Z");
if (instant.status !== "ok") throw new Error(instant.engine.reason);
assert.deepEqual(instant.sun, snapshot.sun);
assert.deepEqual(instant.moon, snapshot.moon);
assert.deepEqual(instant.nakshatra, snapshot.nakshatra);
assert.equal(instant.ayanamsa.name, "lahiri");
assert.equal(instant.karana.index, instant.tithi.index * 2 + instant.karana.half - 1);
console.log("Source runtime classifies instantaneous limbs while retaining engine receipts and ayanamsa.");

// Exercise the engine's dynamic historical timezone import in the source runtime.
const input = { date: "1880-06-01", timeZone: "America/New_York",
  observer: { latitude: 40.25, longitude: -73.25 } };
await prepareCivilDay(input);
const civil = resolveCivilDay(input);
if (civil.status !== "ok") throw new Error(civil.reason);
assert.equal(civil.start.utc, "1880-06-01T04:53:00.000Z");
assert.equal(civil.end.utc, "1880-06-02T04:53:00.000Z");
assert.equal(civil.start.resolution.zone.source, "tzdb");
console.log("Source runtime prepares engine timezone history and resolves the synthetic observer's mean-time civil day.");

await prepareSunriseDay(input);
const sunrise = resolveSunriseDay(input);
if (sunrise.status !== "ok") throw new Error(sunrise.reason);
assert.equal(sunrise.start.civilDate, input.date);
assert.equal(sunrise.vara.weekday, "Tuesday");
assert.equal(sunrise.start.snapshot.ayanamsa.name, "lahiri");
assert.equal(sunrise.end.snapshot.sun.sidereal.receipt.engine.ephemeris.version, "2.1.19");
assert(Date.parse(sunrise.end.utc) > Date.parse(sunrise.start.utc));
console.log("Source runtime resolves a historical sunrise day with vara, horizon conventions and engine receipts.");

const transitions = searchLimbTransitions(sunrise.start.utc, sunrise.end.utc, { ayanamsa: sunrise.ayanamsa });
if (transitions.status !== "ok") throw new Error(transitions.reason);
assert(transitions.transitions.length > 0);
assert.deepEqual(transitions.startState.sun, sunrise.start.snapshot.sun);
assert.deepEqual(transitions.startState.moon, sunrise.start.snapshot.moon);
for (const interval of transitions.intervals) {
  assert(Date.parse(interval.start.at) < Date.parse(transitions.to));
  assert(Date.parse(interval.end.at) > Date.parse(transitions.from));
  assert.equal(interval.start.after.ayanamsa.name, sunrise.ayanamsa);
  assert.equal(interval.end.after.moon.sidereal.receipt.engine.ephemeris.version, "2.1.19");
}
console.log("Source runtime finds limb transitions with full intervals and original engine receipts.");

const day = panchangDay(input, { monthConvention: "amanta" });
if (day.status !== "ok") throw new Error(day.reason);
assert.equal(day.sunriseState.utc, day.sunrise.start.utc);
assert.equal(day.monthConvention, "amanta");
assert.equal(day.sunriseMonth, day.months.startMonth);
assert.equal(day.tithiComparison.start, day.sunrise.start);
assert.equal(day.tithiComparison.end, day.sunrise.end);
assert.deepEqual(day.tithiComparison.startTithi, day.sunriseState.tithi);
assert(["ordinary", "adhika", "kshaya"].includes(day.sunriseMonth.kind));
assert.equal(day.sunriseMonth.namingLunation.start.after.ayanamsa.name, day.ayanamsa);
assert.equal(day.sunriseMonth.end.after.sun.sidereal.receipt.engine.ephemeris.version, "2.1.19");
assert.deepEqual(day.sunriseState, day.timeline.startState);
assert.equal(day.segments[0]!.start, day.sunrise.start.utc);
assert.equal(day.segments.at(-1)!.end, day.sunrise.end.utc);
for (const [index, segment] of day.segments.entries()) {
  if (index > 0) assert.equal(segment.start, day.segments[index - 1]!.end);
  assert(Date.parse(segment.end) > Date.parse(segment.start));
  assert.equal(segment.vara, day.sunrise.vara);
  assert(day.months.intervals.includes(segment.month));
  assert(day.timeline.intervals.includes(segment.intervals.tithi));
  assert.equal(segment.intervals.tithi.start.after.ayanamsa.name, day.ayanamsa);
  assert.equal(segment.intervals.tithi.end.after.moon.sidereal.receipt.engine.ephemeris.version, "2.1.19");
}
console.log("Source runtime assembles chronological day segments with full limb boundaries and engine receipts.");
console.log("Source runtime retains amanta naming lunations, adjacent phase events and sidereal solar ingress receipts.");
const anomalyDay = panchangDay({ date: "2026-05-20", timeZone: "Asia/Kolkata",
  observer: { latitude: 12.5, longitude: 75.25 } }, { monthConvention: "purnimanta" });
if (anomalyDay.status !== "ok") throw new Error(anomalyDay.reason);
assert.equal(anomalyDay.sunriseMonth.kind, "adhika");
assert.equal(anomalyDay.sunriseMonth.start.kind, "new-moon");
assert.equal(anomalyDay.sunriseMonth.end.kind, "new-moon");
assert.equal(anomalyDay.sunriseMonth.name, "Jyaishtha");
console.log("Source runtime preserves month anomalies and forward sunrise tithi comparisons with original receipts.");
