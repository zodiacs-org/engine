import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildExperiment, compileKernel, replaceNutation, sha256 } from "../scripts/build-wasm.mjs";
import { experimentProtocol, verifyKernel, measurePair, assessExperiment, parseWasmOptions } from "../scripts/evaluate-wasm.mjs";

const compiled = await compileKernel();
const builds = {};
const modules = {};
for (const kind of ["javascript", "wasm"]) {
  builds[kind] = await buildExperiment(kind);
  modules[kind] = await import(`data:text/javascript;base64,${builds[kind].bytes.toString("base64")}`);
}
const module = new WebAssembly.Module(compiled.bytes);

test("kernel compilation is reproducible and has only the declared host math imports", async () => {
  assert.deepEqual((await compileKernel()).bytes, compiled.bytes);
  assert.deepEqual(WebAssembly.Module.imports(module).map(({ module, name }) => `${module}.${name}`).sort(),
    ["host.cos", "host.remainder", "host.sin"]);
  assert.deepEqual(WebAssembly.Module.exports(module).map(({ name }) => name).sort(),
    ["dataPointer", "identity", "memory", "nutation"]);
});

test("experimental replacement requires the reviewed source digest and leaves engine bytes untouched", async () => {
  const source = await readFile(new URL("../../src/nutation.ts", import.meta.url), "utf8");
  const changed = replaceNutation(source);
  assert(changed.includes("return wasmNutation(t, terms)"));
  assert(changed.includes("export function tilt(tt: number): Tilt"));
  assert.throws(() => replaceNutation(source.replace("let dp = 0;", "let dp = 1;")), /source changed/);
  assert.throws(() => replaceNutation("export function nutation() {}"), /source changed/);
  assert.equal(await readFile(new URL("../../src/nutation.ts", import.meta.url), "utf8"), source);
  assert.equal(builds.javascript.sourceBytes.has(new URL("../wasm/adapter.mjs", import.meta.url).pathname), false);
  assert(!builds.javascript.bytes.toString().includes("Initialize the experimental WASM kernel"));
});

test("adapter refuses uninitialized use and incompatible tables", () => {
  assert.throws(() => modules.wasm.nutation(0), /Initialize/);
  assert.throws(() => modules.wasm.initializeKernel(compiled.bytes, modules.wasm), /compiled WASM/);
  for (const changed of [
    { NUTATION_TERMS: 78 }, { ARGUMENTS: [0] }, { MULTIPLIERS: "7".repeat(385) },
    { coefficients: () => [1] }, { OFFSETS: [NaN, 0] }
  ]) assert.throws(() => modules.wasm.initializeKernel(module, { ...modules.wasm, ...changed }), /layout changed/);
});

test("WASM matches complete binary64 kernel and smoke results without growing memory", () => {
  const instance = modules.wasm.initializeKernel(module, modules.wasm);
  const buffer = instance.exports.memory.buffer;
  const report = verifyKernel(modules.javascript, modules.wasm);
  assert.equal(report.comparisons, 16_784);
  assert.equal(report.equal, true);
  assert.equal(buffer.byteLength, 65_536);
  const exact = modules.javascript.runExactSmokeCases();
  assert.equal(modules.wasm.runExactSmokeCases(), exact);
  for (const t of [NaN, Infinity, -Infinity]) assert.throws(() => modules.wasm.nutation(t), RangeError);
  for (const terms of [-1, 0.5, 78, Infinity]) assert.throws(() => modules.wasm.nutation(0, terms), RangeError);
  assert.equal(instance.exports.memory.buffer, buffer);
  assert.throws(() => instance.exports.memory.grow(1), RangeError);
  assert.equal(modules.javascript.runExactSmokeCases(), exact);
});

test("exact kernel verification detects signed-zero differences", () => {
  const javascript = { nutation: () => ({ dpsi: 0, deps: 0, om: 0 }) };
  const wasm = { nutation: () => ({ dpsi: -0, deps: 0, om: 0 }) };
  assert.throws(() => verifyKernel(javascript, wasm), /Nutation differs/);
});

test("paired timer alternates order and excludes full-result validation from time samples", () => {
  const calls = [];
  const operation = (kind) => ({ id: "unit", run() { calls.push(kind); return { a: 4 }; },
    consume: ({ a }) => a, validate: ({ a }) => assert.equal(a, 4) });
  let clock = 0n;
  const protocol = { samples: 3, warmupBatches: 1, iterations: { unit: 2 } };
  const report = measurePair(operation("js"), operation("wasm"), protocol, 0, () => { clock += 1000n; return clock; });
  assert.deepEqual(calls, ["js", "wasm", // preflight
    "js", "js", "wasm", "wasm", // warmup
    "js", "js", "wasm", "wasm", // measured pairs
    "wasm", "wasm", "js", "js", "js", "js", "wasm", "wasm"]);
  assert.equal(report.checksum, 8);
  assert.deepEqual(report.samplesNs, { javascript: [1000, 1000, 1000], wasm: [1000, 1000, 1000] });
  assert.equal(report.javascript.medianMs, 0.0005);
});

test("paired timer fails on changed results even when consumed checksums match", () => {
  const javascript = { id: "unit", run: () => ({ a: 1, detail: 1 }), consume: ({ a }) => a, validate() {} };
  let count = 0, clock = 0n;
  const wasm = { ...javascript, run: () => ({ a: 1, detail: ++count > 1 ? 2 : 1 }) };
  assert.throws(() => measurePair(javascript, wasm, { samples: 1, warmupBatches: 1, iterations: { unit: 1 } },
    0, () => ++clock), /exact result changed/);
});

function decisionRounds(wasmNs = 900) {
  return Array.from({ length: experimentProtocol.rounds }, (_, i) => ({ round: i + 1,
    results: experimentProtocol.order.map((id) => ({ id, iterations: 1,
      samplesNs: { javascript: Array(15).fill(1000), wasm: Array(15).fill(id === "houses" ? 1100 : wasmNs) } })) }));
}

test("benefit rule requires exactness and every end-to-end workload in every round", () => {
  assert.equal(assessExperiment(decisionRounds(), true).status, "benefit-observed");
  assert.equal(assessExperiment(decisionRounds(), false).status, "rejected");
  assert.equal(assessExperiment(decisionRounds(901), true).status, "rejected");
  assert.equal(assessExperiment(decisionRounds(), true).productionEnabled, false);
  for (const id of ["chart", "houses", "transit-scan"]) {
    const rounds = decisionRounds();
    rounds[2].results.find((result) => result.id === id).samplesNs.wasm.fill(id === "houses" ? 1101 : 901);
    assert.equal(assessExperiment(rounds, true).status, "rejected", id);
  }
  assert.throws(() => assessExperiment(decisionRounds().slice(0, 2), true));
});

test("experiment CLI requires one public machine label and rejects extra or malformed options", () => {
  assert.deepEqual(parseWasmOptions(["--machine", "public-host"]), { machine: "public-host" });
  for (const args of [[], ["--machine"], ["--machine", ""], ["--machine", "public\n"],
    ["--machine", "private/host"], ["--machine", "public", "--samples", "3"], ["--unknown", "public"]]) {
    assert.throws(() => parseWasmOptions(args));
  }
});

test("build identities record the executed bytes", () => {
  for (const build of Object.values(builds)) {
    assert.equal(build.identity.sha256, sha256(build.bytes));
    assert.equal(build.identity.bytes, build.bytes.length);
  }
});
