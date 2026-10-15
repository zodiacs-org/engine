/** Synthetic integration example. Run pilot:build first; no network or file writes. */
import assert from "node:assert/strict";
import { createAspectPolicy, findConfiguredAspects } from "../../src/configured-aspects.js";
import { searchLongitudeCrossingsWith } from "../../src/crossings.js";
import {
  createBodyAdapter, createIngressSearcher, createRetrogradeWindowSearcher,
  createStationSearcher, loadChironPilot
} from "../src/index.ts";

const adapter = await createBodyAdapter([await loadChironPilot()]);
const time = { jd: 2451600.25, scale: "tt" } as const;
const position = adapter.calcWithMinorBodies({ body: "Chiron", time });
if (position.status !== "ok") throw new Error(`Position refused: ${position.reason}`);

const bodies = ["Chiron", "Mars"] as const;
const rows = adapter.aspectRows(bodies, time);
if (rows.status !== "ok") throw new Error(`Aspect rows refused: ${rows.reason}`);
const aspects = {
  result: findConfiguredAspects(rows.rows, createAspectPolicy({ bodies })),
  receipt: rows.receipt
};

// Explicit TT endpoints are calendar-2000 test inputs, unrelated to birth data.
const interval = {
  body: "Chiron", from: { jd: 2451545.5, scale: "tt" },
  to: { jd: 2451908.5, scale: "tt" }, maxSamples: 100_000
} as const;
const stationSearcher = await createStationSearcher(adapter);
const stations = stationSearcher.searchStations(interval);
const retrogrades = (await createRetrogradeWindowSearcher(adapter)).searchRetrogradeWindows(interval);
const ingresses = (await createIngressSearcher(adapter)).searchIngresses(interval);
if (stations.status !== "complete") throw new Error(`Stations refused: ${stations.reason}`);
if (retrogrades.status !== "complete") throw new Error(`Retrogrades refused: ${retrogrades.reason}`);
if (ingresses.status !== "complete") throw new Error(`Ingresses refused: ${ingresses.reason}`);

// In this callback, Date calendar readings mean TT, including returned Dates.
// Their ISO Z suffix must not be presented as a UTC conversion.
const callback = adapter.createLongitudeCallback({ dateScale: "tt" });
const crossingSearch = searchLongitudeCrossingsWith(
  callback.longitudeAt, "Chiron", 250,
  new Date("2000-01-02T00:00:00Z"), new Date("2000-12-30T00:00:00Z"),
  { stepDays: 1, maxSamples: 2000 }
);
if (crossingSearch.status !== "complete") throw new Error(`Crossings refused: ${crossingSearch.reason}`);
const crossings = { result: crossingSearch, receipt: callback.receipt };

// A pilot installs Chiron alone. Refusals retain receipts and never partial rows.
const unavailable = adapter.aspectRows(["Chiron", "Ceres"], time);
assert.equal(unavailable.status, "refused");
if (unavailable.status !== "refused") throw new Error("Expected unavailable-body refusal");
assert.equal(unavailable.reason, "body-unavailable");
assert.deepEqual(unavailable.rows, []);
const budgetRefusal = stationSearcher.searchStations({ ...interval, maxSamples: 1 });
assert.equal(budgetRefusal.status, "refused");
if (budgetRefusal.status !== "refused") throw new Error("Expected sample-budget refusal");
assert.equal(budgetRefusal.reason, "sample-budget");
assert.deepEqual(budgetRefusal.stations, []);

// Retain complete provider/search receipts beside derived analyses when saving.
// This example keeps the serializable record in memory and prints a small view.
const record = { position, aspects, stations, retrogrades, ingresses, crossings, unavailable, budgetRefusal };
const serializedRecord = JSON.stringify(record);
assert.equal(JSON.parse(serializedRecord).position.receipt.schema, "minorbodies-body-adapter-v1");
console.log(JSON.stringify({
  body: "Chiron", jdTt: time.jd,
  stationDirections: stations.stations.map(event => event.direction),
  retrogradeWindows: retrogrades.windows.map(window => ({
    startJdTt: window.startJdTt, endJdTt: window.endJdTt,
    clippedStart: window.clippedStart, clippedEnd: window.clippedEnd
  })),
  ingressCount: ingresses.ingresses.length, crossingCount: crossingSearch.crossings.length,
  aspectCount: aspects.result.aspects.length,
  expectedRefusals: [unavailable.reason, budgetRefusal.reason],
  outputScope: "summary-only;complete-results-and-receipts-retained-in-record"
}, null, 2));
