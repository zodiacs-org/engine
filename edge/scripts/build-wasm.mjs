import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";
import { edgeRoot, repositoryRoot, readToolchain, requireNode22 } from "./build-support.mjs";

const exec = promisify(execFile);
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const encode = (value) => JSON.stringify(value, null, 2) + "\n";
export const wasmDirectory = resolve(edgeRoot, ".generated/wasm");
export const compilerArgs = Object.freeze([
  "wasm/nutation.ts", "--outFile", ".generated/wasm/nutation.wasm",
  "--optimizeLevel", "3", "--shrinkLevel", "0", "--runtime", "stub",
  "--initialMemory", "1", "--maximumMemory", "1"
]);

export async function compileKernel() {
  requireNode22();
  const pkg = JSON.parse(await readFile(resolve(edgeRoot, "package.json")));
  const lock = JSON.parse(await readFile(resolve(edgeRoot, "package-lock.json")));
  const installed = JSON.parse(await readFile(resolve(edgeRoot, "node_modules/assemblyscript/package.json")));
  assert.equal(pkg.devDependencies.assemblyscript, installed.version);
  assert.equal(lock.packages["node_modules/assemblyscript"].version, installed.version);
  assert.equal(lock.packages[""].devDependencies.assemblyscript, installed.version);
  await mkdir(wasmDirectory, { recursive: true });
  const start = process.hrtime.bigint();
  const { stdout, stderr } = await exec(process.execPath,
    [resolve(edgeRoot, "node_modules/assemblyscript/bin/asc.js"), ...compilerArgs],
    { cwd: edgeRoot, timeout: 120_000, maxBuffer: 1_000_000 });
  const elapsedNs = Number(process.hrtime.bigint() - start);
  assert.equal(stdout + stderr, "", "Investigate compiler diagnostics.");
  const bytes = await readFile(resolve(wasmDirectory, "nutation.wasm"));
  assert(bytes.length < 2_000_000 && WebAssembly.validate(bytes), "Invalid WASM output.");
  const moduleStart = process.hrtime.bigint();
  const module = new WebAssembly.Module(bytes);
  const validationModuleCompileNs = Number(process.hrtime.bigint() - moduleStart);
  assert.deepEqual(WebAssembly.Module.imports(module).map(({ module, name, kind }) => [module, name, kind]).sort(),
    [["host", "cos", "function"], ["host", "remainder", "function"], ["host", "sin", "function"]]);
  return { bytes, validationModuleCompileNs,
    compiler: { name: "assemblyscript", version: installed.version, args: [...compilerArgs], elapsedNs } };
}

// The source file is read, checked and changed in esbuild's memory only.
// The unchanged constants and tilt() still come from the current engine.
export function replaceNutation(source) {
  assert.equal(sha256(source), "c11af594d4e8ad64e0a7ff1097505063c70812d2da84e14a6c0280d4841e62b0",
    "Nutation source changed; review and revalidate the translation before updating its digest.");
  const start = source.indexOf("export function nutation(");
  const end = source.indexOf("\n/** The nutation and obliquity of date. */", start);
  assert(start >= 0 && end > start, "Nutation source anchors changed; review the experiment.");
  assert.equal(source.indexOf("export function nutation(", start + 1), -1);
  return 'import { wasmNutation } from "edge-experimental-wasm";\n' + source.slice(0, start)
    + "export function nutation(t: number, terms = NUTATION_TERMS) { return wasmNutation(t, terms); }\n"
    + source.slice(end);
}

export async function buildExperiment(kind) {
  assert(["javascript", "wasm"].includes(kind), "Unknown experiment kind.");
  const { alias, engineVersion, ephemeris, toolchain } = await readToolchain();
  const sourceBytes = new Map();
  const output = await build({
    absWorkingDir: edgeRoot,
    stdin: { contents: 'export * from "./src/workloads.ts"; export * from "../src/nutation.ts";'
      + (kind === "wasm" ? 'export { initializeKernel } from "./wasm/adapter.mjs";' : ""),
    resolveDir: edgeRoot, sourcefile: "experiment-entry.mjs", loader: "js" },
    bundle: true, format: "esm", platform: "node", target: "es2022", alias,
    minify: false, legalComments: "inline", write: false, metafile: true, logLevel: "silent",
    plugins: [{ name: "isolated-nutation-experiment", setup(builder) {
      builder.onResolve({ filter: /^edge-experimental-wasm$/ }, () => ({ path: resolve(edgeRoot, "wasm/adapter.mjs") }));
      builder.onLoad({ filter: /\.(ts|js|mjs)$/ }, async ({ path }) => {
        const contents = await readFile(path);
        sourceBytes.set(path, contents);
        return { contents: kind === "wasm" && path === resolve(repositoryRoot, "src/nutation.ts")
          ? replaceNutation(contents.toString("utf8")) : contents,
        loader: path.endsWith(".ts") ? "ts" : "js" };
      });
    } }]
  });
  assert.equal(output.warnings.length, 0);
  const bytes = Buffer.from(output.outputFiles[0].contents);
  assert(bytes.length < 2_000_000);
  return { bytes, sourceBytes, identity: { kind, engineVersion, ephemeris, toolchain, bytes: bytes.length, sha256: sha256(bytes) } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 2, "Usage: node edge/scripts/build-wasm.mjs");
  const kernel = await compileKernel();
  for (const kind of ["javascript", "wasm"]) {
    const result = await buildExperiment(kind);
    await writeFile(resolve(wasmDirectory, `${kind}.mjs`), result.bytes);
  }
  for (const name of ["LICENSE", "LICENSING.md", "NOTICE"]) {
    await copyFile(resolve(repositoryRoot, name), resolve(wasmDirectory, name));
  }
  console.log(encode({ compiler: kernel.compiler, wasm: { bytes: kernel.bytes.length, sha256: sha256(kernel.bytes) } }));
}
