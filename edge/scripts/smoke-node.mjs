import assert from "node:assert/strict";
import { buildReference } from "./build-reference.mjs";

const { moduleUrl } = await buildReference();
const { runSmokeCases, runExactSmokeCases } = await import(moduleUrl.href);
const first = runSmokeCases();
assert.deepStrictEqual(runSmokeCases(), first, "Node workload results changed on repeat.");
const exact = runExactSmokeCases();
assert.equal(runExactSmokeCases(), exact, "Node exact protocol results changed on repeat.");
assert.equal(first.transitScan.status, "complete");
assert(first.transitScan.crossings.length > 0, "Transit smoke must exercise a crossing.");
console.log(JSON.stringify({
  status: "passed",
  scope: "Node repeatability only; native parity is checked by smoke:runtimes",
  runtime: process.version,
  protocol: JSON.parse(exact)[0],
  engineVersion: first.engineVersion,
  ephemeris: first.ephemeris,
  chartCases: first.charts.length,
  houseCases: first.houses.length,
  transitStatus: first.transitScan.status
}, null, 2));
