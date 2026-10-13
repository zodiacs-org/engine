import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectMeasurements, summarizeTests } from "./parity-report-lib.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
assert.equal(process.versions.node.split(".")[0], "22", "Run the parity report with Node 22.");
assert.equal(process.argv.length, 2, "The parity report always runs the complete corpus; no filters accepted.");
const vitestFile = join(root, "generated", "parity-vitest.json");
const output = join(root, "generated", "parity-report.json");
mkdirSync(dirname(output), { recursive: true });
// A failed run must never leave an older passing report at the output path.
for (const file of [vitestFile, output]) rmSync(file, { force: true });

async function run(args, reportMode = false) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...(reportMode ? { RUSTCORE_PARITY_REPORT: "1" } : {}),
      NO_COLOR: "1", FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "inherit"]
  });
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; process.stdout.write(chunk); });
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  assert.equal(status.code, 0, `Parity command failed: ${status.signal ?? status.code}`);
  return stdout;
}

function walk(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix + entry.name;
    if (entry.isDirectory()) return walk(join(directory, entry.name), name + "/");
    assert(entry.isFile(), `Source must be a regular file: ${name}`);
    return [name];
  }).sort();
}

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function identities() {
  const sources = {};
  // Hash the checked-out reference sources, not output fixtures or arbiters.
  for (const file of walk(join(root, "..", "src"))) {
    if (file.endsWith(".ts") && !file.endsWith(".test.ts"))
      sources[`../src/${file}`] = digest(join(root, "..", "src", file));
  }
  for (const directory of ["crates", "ts", "tests", "scripts"]) {
    for (const file of walk(join(root, directory)))
      sources[`${directory}/${file}`] = digest(join(root, directory, file));
  }
  for (const file of ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "package.json", "package-lock.json", "PARITY.md",
    "vitest.config.ts", "tsconfig.json", "generated/time-data.ts", "generated/wasm-build.ts",
    "pkg/zodiacs_rustcore.js", "pkg/zodiacs_rustcore_bg.wasm",
    "node_modules/astronomy-engine/esm/astronomy.js"])
    sources[file] = digest(join(root, file));
  return sources;
}

const expectedFiles = walk(join(root, "tests"), "tests/").filter((file) => file.endsWith(".parity.ts"));
// Always build here, including when invoked directly, so the report cannot
// associate changed Rust sources with a stale but internally consistent WASM.
await run([join(root, "scripts", "run.mjs"), "build:wasm"]);
await run([join(root, "node_modules", "typescript", "bin", "tsc"), "--project", "tsconfig.json", "--noEmit"]);
const sourceDigests = identities();
const startedAt = new Date().toISOString();
const stdout = await run([join(root, "node_modules", "vitest", "vitest.mjs"),
  "run", "--config", "vitest.config.ts", "--reporter=default", "--reporter=json",
  `--outputFile.json=${vitestFile}`], true);
assert.deepEqual(identities(), sourceDigests, "Source or WASM files changed during parity execution; rerun.");
const tests = summarizeTests(JSON.parse(readFileSync(vitestFile, "utf8")), root, expectedFiles);
const measurements = collectMeasurements(stdout);
const report = {
  schema: "rustcore-parity/1",
  scope: "Synthetic compatibility with the checked-out TypeScript engine, not astronomical accuracy.",
  acceptance: "PARITY.md and the named tests; observed maxima do not set tolerances.",
  startedAt,
  completedAt: new Date().toISOString(),
  runtime: { node: process.version, v8: process.versions.v8, platform: platform(),
    release: release(), arch: arch(), cpu: cpus()[0]?.model ?? "unknown" },
  toolchain: readFileSync(join(root, "rust-toolchain.toml"), "utf8"),
  sourceDigests,
  tests,
  measurements
};
const json = JSON.stringify(report, null, 2) + "\n";
assert(Buffer.byteLength(json) < 2_000_000, "Parity summary exceeds the file-size cap.");
writeFileSync(output, json);
console.log("Parity report saved to generated/parity-report.json (ignored).");
