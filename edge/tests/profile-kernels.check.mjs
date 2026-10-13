import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { bundleSections, parseProfileOptions, summarizeProfile } from "../scripts/profile-kernels.mjs";
import { edgeRoot, requireNode22 } from "../scripts/build-support.mjs";

requireNode22();
const moduleUrl = new URL("file:///synthetic-profile-bundle.mjs");
const sections = [
  { line: 0, source: "node_modules/astronomy-engine/esm/astronomy.js" },
  { line: 20, source: "../src/nutation.ts" },
  { line: 40, source: "src/workloads.ts" }
];
const frame = (functionName, lineNumber = -1, url = "") => ({ functionName, lineNumber, url });
const node = (id, callFrame, children = []) => ({ id, callFrame, children });
const profile = (nodes, samples) => ({ startTime: 1000, endTime: 9000, nodes, samples });

test("profile CLI requires public provenance and strict bounded durations", () => {
  assert.deepEqual(parseProfileOptions(["--machine", "public-runner"]), {
    machine: "public-runner", durationMs: 1000, warmupMs: 250, samplingIntervalUs: 1000
  });
  assert.deepEqual(parseProfileOptions(["--warmup-ms", "50", "--machine", "public", "--duration-ms", "10000"]), {
    machine: "public", durationMs: 10000, warmupMs: 50, samplingIntervalUs: 1000
  });
  for (const args of [[], ["--machine"], ["--machine", ""], ["--machine", "--duration-ms"],
    ["--unknown", "100"], ["--machine", "a", "--machine", "b"],
    ["--machine", "a", "--duration-ms", "100", "--duration-ms", "200"],
    ["--machine", "a", "--warmup-ms", "100", "--warmup-ms", "200"],
    ["--machine=a"], ["--machine", "a", "trailing"]]) assert.throws(() => parseProfileOptions(args));
  for (const label of ["UPPER", "host.example", "user@host", "has space", "a".repeat(65),
    "public\n", "public\r", "public\u2028", "public\u2029"]) {
    assert.throws(() => parseProfileOptions(["--machine", label]), /public --machine label/);
  }
  for (const value of ["0", "49", "10001", "-50", "+50", "050", "50.0", "5e2", "NaN", "Infinity",
    "9007199254740992", " 50", "50 ", "50\n", "50\r", "50\u2028", "50\u2029"]) {
    for (const flag of ["--duration-ms", "--warmup-ms"]) {
      assert.throws(() => parseProfileOptions(["--machine", "public", flag, value]));
    }
  }
});

test("section markers use only modules in the esbuild graph and retain emitted line positions", () => {
  const input = Buffer.from("// ignored.ts\n// ../src/nutation.ts\nfunction a() {}\n// src/workloads.ts\n");
  assert.deepEqual(bundleSections(input, ["../src/nutation.ts", "src/workloads.ts"]), [
    { line: 1, source: "../src/nutation.ts" }, { line: 3, source: "src/workloads.ts" }
  ]);
  assert.throws(() => bundleSections(input, ["missing.ts"]), /no recognized source sections/);
});

test("self counts partition samples while inclusive counts include descendants once per function", () => {
  const result = summarizeProfile(profile([
    node(1, frame("(root)"), [2]),
    node(2, frame("chartWorkload", 42, moduleUrl.href), [3]),
    node(3, frame("nutation", 22, moduleUrl.href), [4, 5]),
    node(4, frame("nutation", 22, moduleUrl.href)),
    node(5, frame("cos", 1, "node:synthetic-runtime"))
  ], [2, 3, 4, 5, 5]), moduleUrl, sections);
  assert.equal(result.totalSamples, 5);
  assert.equal(result.profileDurationUs, 8000);
  assert.deepEqual(result.selfSamplesByCategory, { workload: 1, engine: 2, "runtime-and-profiler": 2 });
  const rows = new Map(result.functions.map((row) => [row.function, row]));
  assert.deepEqual(rows.get("nutation"), {
    source: "../src/nutation.ts", function: "nutation", bundleLine: 23, category: "engine",
    selfSamples: 2, inclusiveSamples: 4
  });
  assert.equal(rows.get("chartWorkload").inclusiveSamples, 5);
  assert.equal(rows.get("(root)").inclusiveSamples, 5);
  assert.equal(rows.get("cos").inclusiveSamples, 2);
  assert.equal(result.functions.reduce((total, row) => total + row.selfSamples, 0), result.totalSamples);
});

test("same-named functions from distinct emitted locations remain separate", () => {
  const result = summarizeProfile(profile([
    node(1, frame("(root)"), [2, 3, 4]),
    node(2, frame("iterate", 22, moduleUrl.href)),
    node(3, frame("iterate", 24, moduleUrl.href)),
    node(4, frame("iterate", 5, moduleUrl.href))
  ], [2, 3, 4]), moduleUrl, sections);
  const functions = result.functions.filter((row) => row.function === "iterate");
  assert.equal(functions.length, 3);
  assert.deepEqual(functions.map((row) => row.bundleLine).sort((a, b) => a - b), [6, 23, 25]);
  assert.deepEqual(result.selfSamplesByCategory, { engine: 2, ephemeris: 1 });
});

test("overhead categories remain visible and external absolute paths are omitted", () => {
  const rows = [
    frame("(garbage collector)"), frame("(idle)"),
    frame("exercise", 10, pathToFileURL(resolve(edgeRoot, "scripts/profile-kernels.mjs")).href),
    frame("consume", 10, pathToFileURL(resolve(edgeRoot, "scripts/benchmark-workloads.mjs")).href),
    frame("native", 10, "node:inspector"),
    frame("external", 10, "file:///private-host/location/runtime.mjs")
  ];
  const result = summarizeProfile(profile([
    node(1, frame("(root)"), rows.map((_, i) => i + 2)),
    ...rows.map((callFrame, i) => node(i + 2, callFrame))
  ], rows.map((_, i) => i + 2)), moduleUrl, sections);
  assert.deepEqual(result.selfSamplesByCategory, {
    "garbage-collection": 1, idle: 1, "profile-driver": 1, "result-consumption": 1, "runtime-and-profiler": 2
  });
  assert(!JSON.stringify(result).includes("private-host"));
  assert(!JSON.stringify(result).includes(edgeRoot));
});

test("profile summarization rejects empty captures and invalid sampled stacks", () => {
  assert.throws(() => summarizeProfile(profile([], []), moduleUrl, sections), /no samples/);
  assert.throws(() => summarizeProfile(profile([node(1, frame("root"))], [2]), moduleUrl, sections), /missing node/);
  assert.throws(() => summarizeProfile(profile([
    node(1, frame("root"), [3]), node(2, frame("other"), [3]), node(3, frame("shared"))
  ], [3]), moduleUrl, sections), /multiple parents/);
  assert.throws(() => summarizeProfile(profile([
    node(1, frame("root"), [2]), node(2, frame("cycle"), [1])
  ], [2]), moduleUrl, sections), /stack is invalid/);
});
