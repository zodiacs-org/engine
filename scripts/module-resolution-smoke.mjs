import assert from "node:assert/strict";

const engine = await import("@zodiacs/engine");
const geo = await import("@zodiacs/engine/geo");
const internal = await import("@zodiacs/engine/internal");
const internalMath = await import("@zodiacs/engine/internal/math");

for (const name of [
  "positions",
  "natalChart",
  "transits",
  "synastry",
  "moonPhase",
  "saturnReturn"
]) {
  assert.equal(typeof engine[name], "function", `missing root export: ${name}`);
}

assert.equal(typeof geo.resolveLocalToUtc, "function");
assert.equal(typeof geo.createGeoNamesClient, "function");
assert.equal("resolveLocalToUtc" in engine, false, "geo leaked into the core entry");
for (const name of ["bodyLongitude", "longitudeSpeed", "computeBodies", "computeChart"]) {
  assert.equal(typeof internal[name], "function", `missing internal site export: ${name}`);
}
assert.equal(typeof internalMath.computeAngles, "function");
assert.equal(typeof internalMath.findAspects, "function");
assert.equal(internalMath.ENGINE_VERSION, "0.1.0");
assert.equal("computeChart" in internalMath, false, "ephemeris leaked into internal math entry");

console.log("@zodiacs/engine export smoke test passed");
