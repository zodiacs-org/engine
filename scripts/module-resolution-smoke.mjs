import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const engine = await import("@zodiacs/engine");
const geo = await import("@zodiacs/engine/geo");
const receipt = await import("@zodiacs/engine/receipt");
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

for (const name of [
  "createNatalEnvelope",
  "parseNatalEnvelope",
  "serializeNatalEnvelope",
  "natalReplayInput",
  "redactNatalEnvelope"
]) {
  assert.equal(typeof receipt[name], "function", `missing receipt export: ${name}`);
  assert.equal(name in engine, false, `receipt leaked into root: ${name}`);
}

assert.equal(typeof geo.resolveLocalToUtc, "function");
assert.equal(typeof geo.createGeoNamesClient, "function");
assert.equal("resolveLocalToUtc" in engine, false, "geo leaked into the core entry");
for (const name of ["bodyLongitude", "longitudeSpeed", "computeBodies", "computeChart"]) {
  assert.equal(typeof internal[name], "function", `missing internal site export: ${name}`);
}
assert.equal(typeof internalMath.computeAngles, "function");
assert.equal(typeof internalMath.findAspects, "function");
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(engine.ENGINE_VERSION, manifest.version);
assert.equal(internalMath.ENGINE_VERSION, manifest.version);
assert.equal("computeChart" in internalMath, false, "ephemeris leaked into internal math entry");

// The optional codec must remain a browser-safe data boundary. Inspect the
// controlled ESM build graph, including shared chunks, without importing the
// core graph as evidence that the receipt entry is isolated.
const visitedReceiptChunks = new Set();
function checkReceiptChunk(url) {
  if (visitedReceiptChunks.has(url.href)) return;
  visitedReceiptChunks.add(url.href);
  const code = readFileSync(url, "utf8");
  assert(!/\bimport\s*\(/u.test(code), "dynamic import in receipt build");
  for (const match of code.matchAll(/\b(?:from\s*|import\s*)["']([^"']+)["']/gu)) {
    const specifier = match[1];
    assert(specifier.startsWith("./"), `external dependency in receipt build: ${specifier}`);
    const dependency = new URL(specifier, url);
    assert(dependency.href.startsWith(new URL("../dist/", import.meta.url).href));
    checkReceiptChunk(dependency);
  }
}
checkReceiptChunk(new URL("../dist/receipt.js", import.meta.url));
console.log("@zodiacs/engine export smoke test passed; receipt graph has no external imports");
