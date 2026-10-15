import assert from "node:assert/strict";
import { instantaneousPanchang, luminarySnapshot, prepareCivilDay, resolveCivilDay } from "../src/index.js";

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
