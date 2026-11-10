import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { arch, availableParallelism, cpus, platform, release, totalmem } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { combineReports, markdownTable, summarizeCriterion, summarizeNode, validateBaseline, validateCoverage } from "./benchmark-report-lib.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const generated = join(root, "generated");
const mode = process.argv[2] ?? "all";
assert.equal(process.versions.node.split(".")[0], "22", "Run benchmarks with Node 22.");
assert.equal(process.argv.length, process.argv[2] ? 3 : 2, "No benchmark filters or extra arguments accepted.");
assert(["all", "native", "node", "smoke", "check"].includes(mode), "Expected all, native, node, smoke or check.");
// Do not silently measure a customized runtime or copy arbitrary environment
// values into committed evidence. Use the pinned default compiler/runtime flags.
for (const key of ["NODE_OPTIONS", "RUSTFLAGS", "CARGO_ENCODED_RUSTFLAGS"])
  assert(!process.env[key], `Unset ${key} for the reproducible benchmark commands.`);
const toolchain = readFileSync(join(root, "rust-toolchain.toml"), "utf8").match(/^channel\s*=\s*"([^"]+)"/m)[1];
const env = { ...process.env,
  CARGO_HOME: join(root, ".cache/cargo"), RUSTUP_HOME: join(root, ".tools/rustup"), RUSTUP_TOOLCHAIN: toolchain,
  CARGO_TARGET_DIR: join(root, "target"),
  PATH: [join(root, ".cache/cargo/bin"), dirname(process.execPath), process.env.PATH ?? ""].join(delimiter),
  NO_COLOR: "1", FORCE_COLOR: "0" };

async function run(command, args, capture = false, extraEnv = {}) {
  const child = spawn(command, args, { cwd: root, env: { ...env, ...extraEnv },
    stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"] });
  let stdout = "";
  if (capture) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
  }
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  assert.equal(status.code, 0, `${command} failed (${status.signal ?? status.code}).`);
  return stdout;
}
const cargo = args => run("rustup", ["run", toolchain, "cargo", ...args], true);

function walk(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = prefix + entry.name;
    if (entry.isDirectory()) return walk(join(directory, entry.name), name + "/");
    assert(entry.isFile(), `Expected regular source file: ${name}`);
    return [name];
  }).sort();
}
const digest = path => createHash("sha256").update(readFileSync(path)).digest("hex");
function sourceDigests() {
  const sources = {};
  for (const file of walk(join(root, "../src"))) {
    if (file.endsWith(".ts") && !file.endsWith(".test.ts")) sources[`../src/${file}`] = digest(join(root, "../src", file));
  }
  for (const directory of ["crates", "ts", "benchmarks", "scripts"])
    for (const file of walk(join(root, directory))) sources[`${directory}/${file}`] = digest(join(root, directory, file));
  for (const file of ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "package.json", "package-lock.json", "tsconfig.json",
    "node_modules/astronomy-engine/esm/astronomy.js"])
    sources[file] = digest(join(root, file));
  return sources;
}
function optionalText(path) { return existsSync(path) ? readFileSync(path, "utf8").trim() : null; }
function machine() {
  return { os: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? "unknown",
    logicalCpus: cpus().length, availableParallelism: availableParallelism(), totalMemoryBytes: totalmem(),
    cgroupCpuMax: optionalText("/sys/fs/cgroup/cpu.max"),
    cgroupMemoryMax: optionalText("/sys/fs/cgroup/memory.max"),
    node: process.version, v8: process.versions.v8,
    note: "Shared managed container; CPU affinity/frequency and concurrent host load were not controlled." };
}
function writeJson(file, value) {
  const json = JSON.stringify(value, null, 2) + "\n";
  assert(Buffer.byteLength(json) < 2_000_000, "Benchmark summary exceeds file-size cap.");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, json);
}
function removeOld(file) { rmSync(file, { force: true }); }

async function bundle() {
  const output = join(generated, "benchmark-node", "runner.mjs");
  mkdirSync(dirname(output), { recursive: true });
  const result = await build({ absWorkingDir: root, entryPoints: ["benchmarks/node.ts"],
    outfile: output, bundle: true, platform: "node", format: "esm", target: "node22", metafile: true,
    alias: { "astronomy-engine": join(root, "node_modules/astronomy-engine/esm/astronomy.js") } });
  writeJson(join(generated, "benchmark-node", "bundle-inputs.json"), result.metafile);
  return output;
}

async function nativeBenchmark() {
  const output = join(generated, "benchmark-native.json");
  removeOld(output);
  // --no-run produces the binary path as structured Cargo output, avoiding glob
  // selection of an obsolete benchmark binary from a different build.
  const messages = (await cargo(["bench", "--locked", "-p", "zodiacs-rustcore", "--bench", "numeric",
    "--no-run", "--message-format=json"])).trim().split("\n").map(line => JSON.parse(line));
  const binaries = messages.filter(message => message.reason === "compiler-artifact" &&
    message.target.name === "numeric" && message.executable).map(message => message.executable);
  assert.equal(binaries.length, 1, "Expected exactly one native benchmark executable.");
  const executable = binaries[0];
  const descriptor = JSON.parse(await run(executable, ["--describe"], true));
  validateCoverage(descriptor.manifest);
  const snapshot = sourceDigests();
  const compiler = (await run("rustup", ["run", toolchain, "rustc", "-vV"], true)).trim();
  const artifact = { sha256: digest(executable), path: relative(root, executable),
    criterion: "0.5.1", profile: "Cargo bench (optimized), workspace release LTO=true, codegen-units=1",
    compiler, customRustflags: false };
  const directory = join(generated, "benchmark-native", "criterion");
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const startedAt = new Date().toISOString();
  await run(executable, ["--bench", "--noplot"], false, { RUSTCORE_BENCH_OUTPUT: directory });
  const completedAt = new Date().toISOString();
  assert.deepEqual(sourceDigests(), snapshot, "Sources changed during native measurement; rerun.");
  const records = walk(directory).filter(file => file.endsWith("/new/benchmark.json"));
  const measurements = records.map(file => {
    const folder = join(directory, dirname(file));
    const read = name => JSON.parse(readFileSync(join(folder, name), "utf8"));
    return summarizeCriterion(read("benchmark.json"), read("estimates.json"), read("sample.json"));
  });
  validateCoverage(measurements);
  writeJson(output, { kind: "native", startedAt, completedAt, machine: machine(), sourceDigests: snapshot,
    artifact, descriptor, settings: { sampleSize: 30, warmupSeconds: 1, measurementSeconds: 2 }, measurements });
  console.log("Native summary saved to generated/benchmark-native.json (ignored).");
}

async function nodeBenchmark(smoke = false) {
  const output = join(generated, "benchmark-node.json");
  if (!smoke) removeOld(output);
  await run(process.execPath, ["scripts/run.mjs", "build:wasm"]);
  const runner = await bundle();
  const descriptor = JSON.parse(await run(process.execPath, [runner, "describe"], true));
  validateCoverage(descriptor.manifest);
  const snapshot = sourceDigests();
  const artifact = { runnerSha256: digest(runner), wasmSha256: digest(join(root, "pkg/zodiacs_rustcore_bg.wasm")),
    glueSha256: digest(join(root, "pkg/zodiacs_rustcore.js")),
    nodeFlags: [], esbuild: JSON.parse(readFileSync(join(root, "node_modules/esbuild/package.json"), "utf8")).version };
  const startedAt = new Date().toISOString();
  const raw = JSON.parse(await run(process.execPath, [runner, smoke ? "smoke" : "warm"], true));
  const cold = { id: "positions/cold", callsPerIteration: 9, repeats: { typescript: 1, wasm: 1 },
    samples: { typescript: [], wasm: [] } };
  const checksums = { typescript: [], wasm: [] };
  for (let sample = 0; sample < raw.settings.samples; sample++) {
    const order = sample % 2 === 0 ? ["typescript", "wasm"] : ["wasm", "typescript"];
    for (const runtime of order) {
      const record = JSON.parse(await run(process.execPath, [runner, "cold", runtime], true));
      assert.equal(record.runtime, runtime);
      assert(Number.isFinite(record.checksum) && Number.isFinite(record.nsPerCall) && record.nsPerCall > 0);
      cold.samples[runtime].push(record.nsPerCall);
      checksums[runtime].push(record.checksum);
    }
  }
  raw.measurements.push(cold);
  raw.coldChecksums = checksums;
  const completedAt = new Date().toISOString();
  assert.deepEqual(sourceDigests(), snapshot, "Sources changed during Node measurement; rerun.");
  validateCoverage(raw.measurements);
  writeJson(join(generated, "benchmark-node", smoke ? "smoke.json" : "samples.json"), raw);
  if (smoke) {
    console.log("Every Node benchmark workload and fresh-process path passed its smoke run.");
    return;
  }
  writeJson(output, { kind: "node", startedAt, completedAt, machine: machine(), sourceDigests: snapshot,
    artifact, descriptor, settings: raw.settings, measurements: summarizeNode(raw) });
  console.log("Node summary saved to generated/benchmark-node.json (ignored).");
}

if (mode === "check") {
  const file = join(root, "docs/evidence/benchmark-baseline.json");
  const report = JSON.parse(readFileSync(file, "utf8"));
  validateBaseline(report);
  assert.equal(readFileSync(join(root, "docs/evidence/benchmark-baseline.md"), "utf8"), markdownTable(report),
    "Committed benchmark table does not match its evidence JSON.");
  assert.deepEqual(sourceDigests(), report.sourceDigests, "Baseline sources changed; rerun and record the benchmark.");
  console.log("Committed baseline covers every workload, matches the table and names this source snapshot.");
} else {
  if (mode === "all") removeOld(join(generated, "benchmark-report.json"));
  if (mode === "all" || mode === "native") await nativeBenchmark();
  if (mode === "all" || mode === "node" || mode === "smoke") await nodeBenchmark(mode === "smoke");
  if (mode === "all") {
    const read = kind => JSON.parse(readFileSync(join(generated, `benchmark-${kind}.json`), "utf8"));
    const report = combineReports(read("native"), read("node"));
    writeJson(join(generated, "benchmark-report.json"), report);
    writeFileSync(join(generated, "benchmark-table.md"), markdownTable(report));
    console.log("Combined baseline candidates saved to generated/benchmark-report.json and benchmark-table.md (ignored).");
  }
}
