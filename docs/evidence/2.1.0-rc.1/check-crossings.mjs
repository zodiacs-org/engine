// Pass the installed (or unpacked, with dependencies) 2.0.0 package directory.
// Build the candidate first. Compare the entire public result, including JSON field order.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as candidate from "../../../dist/index.js";
import { events } from "../../../dist/calc.js";

const baselineDir = process.argv[2];
assert.ok(baselineDir, "Pass the directory containing the 2.0.0 package.json");
const baseline = await import(pathToFileURL(resolve(baselineDir, "dist/index.js")));
const { events: oldEvents } = await import(pathToFileURL(resolve(baselineDir, "dist/calc.js")));
assert.equal(baseline.ENGINE_VERSION, "2.0.0");
assert.equal(candidate.ENGINE_VERSION, "2.1.0-rc.1");

const suite = new URL("../../../conformance/vectors/0.3.0/L4-events.json", import.meta.url);
const ingresses = JSON.parse(readFileSync(suite, "utf8")).vectors.filter(v => v.kind === "event.ingress");
assert.equal(ingresses.length, 70);
for (const source of ["de440", "astronomy-engine"]) {
  baseline.setDefaultEphemeris(source);
  candidate.setDefaultEphemeris(source);
  for (const { id, input } of ingresses) {
    const scale = "after_tt_s" in input ? "tt" : "utc";
    const endpoint = seconds => ({ jd: 2451545 + seconds / 86400, scale });
    const request = {
      kind: "longitude-crossing", body: input.body, longitude: input.longitude_deg,
      from: endpoint(input[`after_${scale}_s`]), to: endpoint(input[`before_${scale}_s`])
    };
    const before = oldEvents(request);
    const after = events(request);
    assert.equal(before.status, "ok", id);
    assert.equal(after.status, "ok", id);
    assert.equal(before.receipt.engine.version, baseline.ENGINE_VERSION);
    assert.equal(after.receipt.engine.version, candidate.ENGINE_VERSION);
    before.receipt.engine.version = candidate.ENGINE_VERSION;
    assert.equal(JSON.stringify(after), JSON.stringify(before), `${source} ${id}`);
  }
  console.log(`${source}: all ${ingresses.length} serialized events() results match 2.0.0 after updating the receipt version.`);
}
