import assert from "node:assert/strict";
import { buildReference } from "./build-reference.mjs";

const { moduleUrl } = await buildReference();
const { runSmokeCases } = await import(moduleUrl.href);
const first = runSmokeCases();
assert.deepStrictEqual(runSmokeCases(), first, "Node workload results changed on repeat.");
assert.equal(first.transitScan.status, "complete");
assert(first.transitScan.crossings.length > 0, "Transit smoke must exercise a crossing.");
console.log(JSON.stringify({
  status: "passed",
  scope: "Node repeatability only; cross-runtime comparison is pending",
  runtime: process.version,
  engineVersion: first.engineVersion,
  ephemeris: first.ephemeris,
  chartCases: first.charts.length,
  houseCases: first.houses.length,
  transitStatus: first.transitScan.status
}, null, 2));
