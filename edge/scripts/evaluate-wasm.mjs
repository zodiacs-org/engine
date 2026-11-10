import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { availableParallelism, cpus, release } from "node:os";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { benchmarkProtocol, summarizeSamples } from "./benchmark-core.mjs";
import { benchmarkWorkloads } from "./benchmark-workloads.mjs";
import { edgeRoot, requireNode22 } from "./build-support.mjs";
import { buildExperiment, compileKernel, encode, sha256 } from "./build-wasm.mjs";

// Fixed before capture. No production build uses the candidate, regardless of
// the verdict. A pass only supports considering an opt-in for this tested host.
export const experimentProtocol = Object.freeze({
  schema: "edge-wasm-protocol/1", rounds: 3, samples: 15, warmupBatches: 5,
  iterations: { ...benchmarkProtocol().iterations, kernel: 256, identity: 100_000 },
  order: ["kernel", "identity", "chart", "houses", "transit-scan"],
  clock: "process.hrtime.bigint", unit: "ms/workload-invocation",
  pairedOrder: "alternate javascript/wasm then wasm/javascript; invert the first pair each round",
  timed: "synchronous workload call plus checksum consumption; exact checks outside timers",
  gc: "automatic; no forced collection",
  acceptance: { minimumImprovementPercent: 10, maximumControlRegressionPercent: 10,
    rule: "every round: chart and transit-scan improve by at least 10 percent; houses regresses at most 10 percent; all exact checks pass" }
});

export function kernelInputs() {
  const inputs = [];
  // Synthetic Julian centuries of TT; a compatibility grid, not accuracy data.
  for (let i = 0; i <= 4000; i++) {
    for (const terms of [0, 1, 5, 77]) inputs.push({ t: -2 + i / 1000, terms });
  }
  for (const t of [-20, -2, -1, -0, 0, Number.MIN_VALUE, -Number.MIN_VALUE, 1, 2, 20]) {
    for (let terms = 0; terms <= 77; terms++) inputs.push({ t, terms });
  }
  return inputs;
}

export function verifyKernel(javascript, wasm) {
  const inputs = kernelInputs();
  const bits = Buffer.allocUnsafe(inputs.length * 3 * 8);
  let offset = 0;
  for (const { t, terms } of inputs) {
    const expected = javascript.nutation(t, terms);
    const actual = wasm.nutation(t, terms);
    assert.deepStrictEqual(actual, expected, `Nutation differs at t=${t}, terms=${terms}.`);
    for (const key of ["dpsi", "deps", "om"]) { bits.writeDoubleBE(expected[key], offset); offset += 8; }
  }
  return { comparisons: inputs.length, outputFields: ["dpsi", "deps", "om"],
    grid: { fromCenturiesTT: -2, toCenturiesTT: 2, intervals: 4000, terms: [0, 1, 5, 77] },
    supplementalCenturiesTT: ["-20", "-2", "-1", "-0", "0", "Number.MIN_VALUE", "-Number.MIN_VALUE", "1", "2", "20"],
    supplementalTerms: "every integer from 0 through 77",
    expectedBinary64Sha256: sha256(bits), equal: true };
}

export function measurePair(javascript, wasm, protocol, round = 0, now = process.hrtime.bigint) {
  assert.equal(javascript.id, wasm.id);
  const { id } = javascript;
  const iterations = protocol.iterations[id];
  assert(Number.isSafeInteger(iterations) && iterations > 0);
  const expected = structuredClone(javascript.run());
  javascript.validate(expected);
  assert.deepStrictEqual(wasm.run(), expected, `${id}: WASM preflight differs.`);
  let checksum = 0;
  for (let i = 0; i < iterations; i++) checksum += javascript.consume(expected);
  assert(Number.isFinite(checksum));
  function batch(workload) {
    let consumed = 0, last;
    const start = now();
    for (let i = 0; i < iterations; i++) { last = workload.run(); consumed += workload.consume(last); }
    const ns = Number(now() - start);
    assert(Number.isSafeInteger(ns) && ns > 0);
    assert.equal(consumed, checksum, `${id}: checksum changed.`);
    assert.deepStrictEqual(last, expected, `${id}: exact result changed.`);
    return ns;
  }
  const times = { javascript: [], wasm: [] };
  const warmup = { javascript: [], wasm: [] };
  for (const [count, output] of [[protocol.warmupBatches, warmup], [protocol.samples, times]]) {
    assert(Number.isSafeInteger(count) && count > 0);
    for (let sample = 0; sample < count; sample++) {
      const pair = (round + sample) % 2 ? [["wasm", wasm], ["javascript", javascript]]
        : [["javascript", javascript], ["wasm", wasm]];
      for (const [kind, workload] of pair) output[kind].push(batch(workload));
    }
  }
  return { id, iterations, checksum, warmupNs: warmup, samplesNs: times,
    javascript: summarizeSamples(times.javascript, iterations), wasm: summarizeSamples(times.wasm, iterations) };
}

export function assessExperiment(rounds, exact) {
  assert.equal(rounds.length, experimentProtocol.rounds);
  const medianTwice = (values) => {
    assert.equal(values.length, experimentProtocol.samples);
    const sorted = [...values].sort((a, b) => a - b);
    for (const value of sorted) assert(Number.isSafeInteger(value) && value > 0);
    const mid = Math.floor(sorted.length / 2);
    return BigInt(sorted[mid]) + BigInt(sorted.length % 2 ? sorted[mid] : sorted[mid - 1]);
  };
  const checks = rounds.flatMap(({ results }, round) => {
    assert.deepEqual(results.map(({ id }) => id), experimentProtocol.order);
    return results.filter(({ id }) => ["chart", "transit-scan", "houses"].includes(id)).map((result) => {
      const javascript = summarizeSamples(result.samplesNs.javascript, result.iterations).medianMs;
      const wasm = summarizeSamples(result.samplesNs.wasm, result.iterations).medianMs;
      const limit = result.id === "houses" ? 1.1 : 0.9;
      return { round: round + 1, id: result.id, javascriptMedianMs: javascript, wasmMedianMs: wasm,
        ratio: wasm / javascript, requiredMaximumRatio: limit,
        passes: medianTwice(result.samplesNs.wasm) * 100n
          <= medianTwice(result.samplesNs.javascript) * (result.id === "houses" ? 110n : 90n) };
    });
  });
  return { status: exact && checks.every(({ passes }) => passes) ? "benefit-observed" : "rejected",
    productionEnabled: false, exact, checks,
    scope: "Node on this host and these synthetic cases only; other runtimes are unmeasured" };
}

const supportPaths = ["scripts/evaluate-wasm.mjs", "scripts/build-wasm.mjs", "scripts/build-support.mjs",
  "scripts/benchmark-core.mjs", "scripts/benchmark-workloads.mjs", "wasm/nutation.ts", "wasm/adapter.mjs",
  "package.json", "package-lock.json", "tsconfig.json", "../package.json",
  "node_modules/assemblyscript/package.json", "node_modules/binaryen/package.json", "node_modules/long/package.json"];

export async function evaluateWasm({ machine }) {
  requireNode22();
  assert.deepEqual(process.execArgv, [], "Run measurements without Node CLI flags.");
  assert(!process.env.NODE_OPTIONS, "Unset NODE_OPTIONS before measuring.");
  assert(typeof machine === "string" && machine === machine.trim()
    && /^[a-z0-9][a-z0-9-]{0,63}$/.test(machine), "Use a public machine label.");
  const sourceBytes = new Map();
  for (const path of supportPaths) sourceBytes.set(resolve(edgeRoot, path), await readFile(resolve(edgeRoot, path)));
  const compiled = await compileKernel();
  const builds = {}, modules = {};
  for (const kind of ["javascript", "wasm"]) {
    builds[kind] = await buildExperiment(kind);
    for (const [path, bytes] of builds[kind].sourceBytes) {
      if (sourceBytes.has(path)) assert(sourceBytes.get(path).equals(bytes), "Input changed during build.");
      sourceBytes.set(path, bytes);
    }
    modules[kind] = await import(`data:text/javascript;base64,${builds[kind].bytes.toString("base64")}`);
  }
  const startup = [];
  let instance;
  for (let i = 0; i < 11; i++) {
    const start = process.hrtime.bigint();
    const module = new WebAssembly.Module(compiled.bytes);
    const compiledAt = process.hrtime.bigint();
    instance = modules.wasm.initializeKernel(module, modules.wasm);
    const end = process.hrtime.bigint();
    startup.push({ moduleCompileNs: Number(compiledAt - start), instantiateAndTablesNs: Number(end - compiledAt) });
  }
  const initialMemoryBytes = instance.exports.memory.buffer.byteLength;
  const exactKernel = verifyKernel(modules.javascript, modules.wasm);
  const exact = modules.javascript.runExactSmokeCases();
  assert.equal(modules.wasm.runExactSmokeCases(), exact, "Whole workload results differ.");
  const sweep = Array.from({ length: 64 }, (_, i) => -2 + i * 4 / 63);
  const workloads = {};
  for (const kind of ["javascript", "wasm"]) {
    const module = modules[kind];
    const identity = kind === "wasm" ? instance.exports.identity : (x) => x;
    workloads[kind] = [{
      id: "kernel", run: () => sweep.map((t) => module.nutation(t)),
      consume: (rows) => rows.reduce((sum, { dpsi, deps, om }) => sum + dpsi + deps + om, 0),
      validate: (rows) => assert.equal(rows.length, sweep.length)
    }, {
      id: "identity", run: () => identity(0.125), consume: (value) => value,
      validate: (value) => assert.equal(value, 0.125)
    }, ...benchmarkWorkloads(module)];
  }
  const startedAt = new Date().toISOString();
  const rounds = [];
  for (let round = 0; round < experimentProtocol.rounds; round++) {
    const results = workloads.javascript.map((workload, index) => measurePair(workload, workloads.wasm[index], experimentProtocol, round));
    rounds.push({ round: round + 1, results });
  }
  const completedAt = new Date().toISOString();
  assert.equal(modules.javascript.runExactSmokeCases(), exact);
  assert.equal(modules.wasm.runExactSmokeCases(), exact);
  assert.equal(instance.exports.memory.buffer.byteLength, initialMemoryBytes);
  const sources = [];
  for (const [path, bytes] of [...sourceBytes].sort(([a], [b]) => a.localeCompare(b))) {
    assert(bytes.equals(await readFile(path)), `Source changed during measurement: ${relative(edgeRoot, path)}`);
    sources.push({ path: relative(edgeRoot, path).split("\\").join("/"), bytes: bytes.length, sha256: sha256(bytes) });
  }
  const cpuInfo = cpus();
  return { schema: "edge-wasm-experiment/1", startedAt, completedAt, protocol: experimentProtocol,
    provenance: { machine: { label: machine, platform: process.platform, arch: process.arch, release: release(),
      cpuModels: [...new Set(cpuInfo.map(({ model }) => model))].sort(), logicalCpuCount: cpuInfo.length, availableParallelism: availableParallelism() },
    runtime: { name: "node", node: process.versions.node, v8: process.versions.v8 },
    sources, sourceDigest: sha256(encode(sources)), builds: Object.values(builds).map(({ identity }) => identity) },
    compilation: { ...compiled.compiler, outputBytes: compiled.bytes.length, outputSha256: sha256(compiled.bytes) },
    startup: { validationModuleCompileNs: compiled.validationModuleCompileNs, samples: startup,
      method: "validationModuleCompileNs is the first observed Module construction after WebAssembly.validate; samples are cached repeats; instantiation includes copying tables" },
    exact: { kernel: exactKernel, workloads: { equal: true, sha256: sha256(exact) },
      memory: { initialBytes: initialMemoryBytes, finalBytes: instance.exports.memory.buffer.byteLength } },
    workloadSet: { kernel: { centuriesTT: sweep, terms: 77 },
      identity: "constant scalar round-trip plus checksum loop; JS may inline this lower-bound control",
      engine: benchmarkWorkloads(modules.javascript).map(({ id, inputs, unit }) => ({ id, inputs, unit })) },
    rounds, decision: assessExperiment(rounds, true) };
}

export function parseWasmOptions(args) {
  assert(args.length === 2 && args[0] === "--machine" && typeof args[1] === "string"
    && args[1] === args[1].trim() && /^[a-z0-9][a-z0-9-]{0,63}$/.test(args[1]),
    "Usage: evaluate-wasm.mjs --machine public-label");
  return { machine: args[1] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = encode(await evaluateWasm(parseWasmOptions(process.argv.slice(2))));
    assert(Buffer.byteLength(report) < 2_000_000, "Experiment report exceeds the project file limit.");
    process.stdout.write(report);
  } catch (error) {
    console.error(`WASM evaluation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
