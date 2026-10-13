import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Session } from "node:inspector";
import { availableParallelism, cpus, release } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { benchmarkWorkloads } from "./benchmark-workloads.mjs";
import { buildReference } from "./build-reference.mjs";
import { edgeRoot, readToolchain, requireNode22 } from "./build-support.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const encode = (value) => JSON.stringify(value, null, 2) + "\n";
const supportPaths = [
  "package.json", "package-lock.json", "tsconfig.json", "../package.json",
  "scripts/profile-kernels.mjs", "scripts/benchmark-workloads.mjs",
  "scripts/build-reference.mjs", "scripts/build-support.mjs"
];

export function parseProfileOptions(args) {
  const options = { durationMs: 1000, warmupMs: 250, samplingIntervalUs: 1000 };
  const fields = { "--duration-ms": "durationMs", "--warmup-ms": "warmupMs" };
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    assert((flag === "--machine" || Object.hasOwn(fields, flag)) && !seen.has(flag)
      && typeof value === "string" && value.length > 0,
    "Usage: profile-kernels.mjs --machine public-label [--duration-ms N] [--warmup-ms N]");
    seen.add(flag);
    if (flag === "--machine") options.machine = value;
    else {
      assert(value === value.trim() && /^[1-9][0-9]*$/.test(value), "Profile durations must be decimal integers.");
      options[fields[flag]] = Number(value);
    }
  }
  validateOptions(options);
  return options;
}

function validateOptions(options) {
  assert(typeof options.machine === "string" && options.machine === options.machine.trim()
    && /^[a-z0-9][a-z0-9-]{0,63}$/.test(options.machine),
    "An explicit public --machine label is required; do not use a secret or hostname.");
  for (const field of ["durationMs", "warmupMs"]) {
    assert(Number.isSafeInteger(options[field]) && options[field] >= 50 && options[field] <= 10_000,
      `${field} must be an integer from 50 through 10000.`);
  }
  assert.equal(options.samplingIntervalUs, 1000, "Use the recorded sampling interval.");
}

function classify(source, name) {
  if (name === "(garbage collector)") return "garbage-collection";
  if (name === "(idle)") return "idle";
  if (source.startsWith("../src/")) return "engine";
  if (source.startsWith("node_modules/astronomy-engine/")) return "ephemeris";
  if (source === "scripts/benchmark-workloads.mjs") return "result-consumption";
  if (source === "scripts/profile-kernels.mjs") return "profile-driver";
  if (source.startsWith("src/")) return "workload";
  return "runtime-and-profiler";
}

// Esbuild's section markers identify the original module, not an original
// source line. Report the emitted bundle line separately, without pretending
// it is a source-map location. Only markers present in the input graph count.
export function bundleSections(bytes, inputPaths) {
  const inputs = new Set(inputPaths);
  const sections = [];
  for (const [line, text] of bytes.toString("utf8").split("\n").entries()) {
    if (text.startsWith("// ") && inputs.has(text.slice(3))) sections.push({ line, source: text.slice(3) });
  }
  assert(sections.length > 0, "Reference bundle contains no recognized source sections.");
  return sections;
}

function frameIdentity(frame, moduleUrl, sections) {
  let source = "(runtime)", bundleLine = null;
  if (frame.url === moduleUrl.href) {
    source = "(unmapped-bundle)";
    for (const section of sections) {
      if (section.line > frame.lineNumber) break;
      source = section.source;
    }
    bundleLine = frame.lineNumber + 1;
  } else if (frame.url?.startsWith("file:")) {
    const path = relative(edgeRoot, fileURLToPath(frame.url));
    // Never publish host-specific absolute paths from inspector call frames.
    source = !path.startsWith("..") && !isAbsolute(path) ? path.split("\\").join("/") : "(external-runtime)";
  } else if (frame.url?.startsWith("node:")) source = frame.url;
  const name = frame.functionName || "(anonymous)";
  return { source, function: name, bundleLine, category: classify(source, name) };
}

export function summarizeProfile(profile, moduleUrl, sections) {
  assert(Array.isArray(profile.nodes) && Array.isArray(profile.samples) && profile.samples.length > 0,
    "CPU profiler returned no samples.");
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  const identities = new Map();
  const rows = new Map();
  for (const node of profile.nodes) {
    const identity = frameIdentity(node.callFrame, moduleUrl, sections);
    const key = JSON.stringify(identity);
    identities.set(node.id, key);
    if (!rows.has(key)) rows.set(key, { ...identity, selfSamples: 0, inclusiveSamples: 0 });
    for (const child of node.children ?? []) {
      assert(!parent.has(child), "CPU profile node has multiple parents.");
      parent.set(child, node.id);
    }
  }
  const categories = {};
  for (const sample of profile.samples) {
    assert(nodes.has(sample), "CPU profile sample refers to a missing node.");
    const row = rows.get(identities.get(sample));
    row.selfSamples += 1;
    categories[row.category] = (categories[row.category] ?? 0) + 1;
    const visitedNodes = new Set(), visitedFunctions = new Set();
    for (let id = sample; id !== undefined; id = parent.get(id)) {
      assert(nodes.has(id) && !visitedNodes.has(id), "CPU profile stack is invalid.");
      visitedNodes.add(id);
      const key = identities.get(id);
      if (!visitedFunctions.has(key)) rows.get(key).inclusiveSamples += 1;
      visitedFunctions.add(key);
    }
  }
  return {
    totalSamples: profile.samples.length,
    profileDurationUs: profile.endTime - profile.startTime,
    selfSamplesByCategory: categories,
    functions: [...rows.values()].filter((row) => row.inclusiveSamples > 0).sort((a, b) =>
      b.selfSamples - a.selfSamples || b.inclusiveSamples - a.inclusiveSamples
      || a.source.localeCompare(b.source) || a.function.localeCompare(b.function))
  };
}

function exercise(workload, durationMs) {
  const start = process.hrtime.bigint();
  const budget = BigInt(durationMs) * 1_000_000n;
  let iterations = 0, checksum = 0, last;
  do {
    last = workload.run();
    checksum += workload.consume(last);
    iterations += 1;
  } while (process.hrtime.bigint() - start < budget);
  const elapsedNs = Number(process.hrtime.bigint() - start);
  assert(Number.isSafeInteger(elapsedNs) && Number.isFinite(checksum), "Invalid profile loop result.");
  return { iterations, elapsedNs, checksum, last };
}

async function sourceRecords(paths) {
  return Promise.all(paths.map(async (path) => {
    const bytes = await readFile(resolve(edgeRoot, path));
    return { path, bytes: bytes.byteLength, sha256: hash(bytes) };
  }));
}

export async function profileKernels(options) {
  requireNode22();
  validateOptions(options);
  assert.deepEqual(process.execArgv, [], "Run profiles without Node CLI flags.");
  assert(!process.env.NODE_OPTIONS, "Unset NODE_OPTIONS before profiling.");
  const { engineVersion, ephemeris, toolchain } = await readToolchain();
  const { moduleUrl, bytes, metafile } = await buildReference();
  const paths = [...new Set([...Object.keys(metafile.inputs), ...supportPaths])].sort();
  const sources = await sourceRecords(paths);
  const sections = bundleSections(bytes, Object.keys(metafile.inputs));
  const module = await import(moduleUrl.href + `?profile=${hash(bytes)}`);
  // Inspector includes the import query in call-frame URLs.
  const profiledUrl = new URL(moduleUrl.href + `?profile=${hash(bytes)}`);
  const exact = module.runExactSmokeCases();
  const workloads = benchmarkWorkloads(module);
  const startedAt = new Date().toISOString();
  const session = new Session();
  session.connect();
  const post = (method, params = {}) => new Promise((accept, reject) => {
    session.post(method, params, (error, result) => error ? reject(error) : accept(result));
  });
  const results = [];
  try {
    await post("Profiler.enable");
    await post("Profiler.setSamplingInterval", { interval: options.samplingIntervalUs });
    for (const workload of workloads) {
      const expected = structuredClone(workload.run());
      workload.validate(expected);
      const warmup = exercise(workload, options.warmupMs);
      assert.deepEqual(warmup.last, expected, "Warmup changed workload results.");
      await post("Profiler.start");
      const measured = exercise(workload, options.durationMs);
      const { profile } = await post("Profiler.stop");
      assert.deepEqual(measured.last, expected, "Profiling changed workload results.");
      const { last: warmupLast, ...warmupRecord } = warmup;
      const { last: measuredLast, ...measuredRecord } = measured;
      results.push({ id: workload.id, warmup: warmupRecord, measured: measuredRecord,
        ...summarizeProfile(profile, profiledUrl, sections) });
    }
  } finally {
    session.disconnect();
  }
  const completedAt = new Date().toISOString();
  assert.equal(module.runExactSmokeCases(), exact, "Profiling changed exact smoke results.");
  assert.deepEqual(await sourceRecords(paths), sources, "Profile inputs changed during measurement.");
  const cpuInfo = cpus();
  return {
    schema: "edge-kernel-profile/1", startedAt, completedAt,
    protocol: {
      method: "node:inspector CPU Profiler", durationMsPerWorkload: options.durationMs,
      warmupMsPerWorkload: options.warmupMs, samplingIntervalUs: options.samplingIntervalUs,
      measured: "complete workload calls plus checksum consumption and wall-clock loop checks",
      counts: "self counts partition all samples; inclusive counts deduplicate recursion and overlap between functions",
      locations: "source module from esbuild section markers; bundleLine is an emitted bundle line",
      limits: "sampling is approximate, includes profiler and runtime overhead, and is not a benchmark speedup measurement"
    },
    provenance: {
      machine: { label: options.machine, platform: process.platform, arch: process.arch,
        release: release(), cpuModels: [...new Set(cpuInfo.map(({ model }) => model))].sort(),
        logicalCpuCount: cpuInfo.length, availableParallelism: availableParallelism() },
      runtime: { name: "node", node: process.versions.node, v8: process.versions.v8 },
      engineVersion, ephemeris, toolchain,
      sourceDigest: hash(encode(sources)), sources,
      bundle: { path: ".generated/reference/workloads.mjs", bytes: bytes.byteLength, sha256: hash(bytes) }
    },
    workloadSet: workloads.map(({ id, unit, inputs }) => ({ id, unit, inputs })),
    exactResultSha256: hash(exact), results
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = encode(await profileKernels(parseProfileOptions(process.argv.slice(2))));
    assert(Buffer.byteLength(report) < 2_000_000, "Profile report exceeds the project file limit.");
    process.stdout.write(report);
  } catch (error) {
    console.error(`Kernel profiling failed: ${error.message}`);
    process.exitCode = 1;
  }
}
