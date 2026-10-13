import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { OPT_IN_SOURCE } from "../../scripts/root-isolation.mjs";
import { bundleConfig, FILE_LIMIT, TARGETS } from "../build.config.mjs";
import { edgeRoot, EPHEMERIS_SOURCE, readToolchain } from "./build-support.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const posix = (path) => path.split(sep).join("/");
const legalNames = ["LICENSE", "LICENSING.md", "NOTICE"];
const supportSources = [
  "../package.json", "../scripts/root-isolation.mjs",
  "package.json", "package-lock.json", "tsconfig.json", "build.config.mjs",
  "scripts/build-bundles.mjs", "scripts/build-support.mjs",
  "node_modules/astronomy-engine/package.json", "node_modules/esbuild/package.json",
  ...legalNames.map((name) => `../${name}`)
];

export function validateGraph(metafile) {
  assert(metafile?.inputs && metafile?.outputs, "Missing esbuild graph.");
  const inputs = Object.keys(metafile.inputs);
  assert(inputs.includes(EPHEMERIS_SOURCE), "Graph must use the edge ephemeris ESM entry.");
  assert(inputs.includes("../src/index.ts"), "Graph must include the engine root API.");
  for (const [path, input] of Object.entries(metafile.inputs)) {
    assert(!isAbsolute(path) && !path.includes("\\") && posix(relative(edgeRoot, resolve(edgeRoot, path))) === path, `Nonportable input path: ${path}`);
    assert(path === EPHEMERIS_SOURCE || /^(?:\.\.\/src|src)\/[\w./-]+\.(?:ts|js)$/.test(path), `Unexpected bundle input: ${path}`);
    assert(!/(?:\.test\.|\.spec\.|\/fixtures\/)/.test(path), `Test data in bundle graph: ${path}`);
    if (path.startsWith("../src/")) assert(!OPT_IN_SOURCE.test(path.slice(3)), `Opt-in engine module in root graph: ${path}`);
    assert.equal(input.format, "esm", `Non-ESM input: ${path}`);
    for (const imported of input.imports) {
      assert(!imported.external, `External input import: ${imported.path}`);
      assert.equal(imported.kind, "import-statement", `Non-static ESM import: ${imported.path}`);
      assert(Object.hasOwn(metafile.inputs, imported.path), `Unresolved input import: ${imported.path}`);
    }
  }
  assert(Object.keys(metafile.outputs).length > 0, "Missing bundle outputs.");
  for (const [path, output] of Object.entries(metafile.outputs)) {
    assert.equal(output.imports.length, 0, `Output is not self-contained: ${path}`);
    for (const input of Object.keys(output.inputs)) {
      assert(Object.hasOwn(metafile.inputs, input), `Unresolved output input: ${input}`);
    }
  }
}

export function validateFiles(files) {
  for (const [name, bytes] of files) {
    assert(/^[\w.-]+$/.test(name) && name !== "." && name !== "..", `Output must be a flat local file: ${name}`);
    assert(bytes.byteLength < FILE_LIMIT, `Output exceeds project file limit: ${name}`);
  }
}

async function sourceRecord(path, compiled) {
  const absolute = resolve(edgeRoot, path);
  // Symlinked sources could otherwise hash or bundle files outside this project.
  assert.equal(await realpath(absolute), absolute, `Symlinked build input: ${path}`);
  const bytes = await readFile(absolute);
  if (compiled?.has(absolute)) assert(bytes.equals(compiled.get(absolute)), `Input changed during build: ${path}`);
  return { path, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

export async function buildTarget(target, { write = true } = {}) {
  const config = bundleConfig(target);
  const { alias, engineVersion, ephemeris, toolchain } = await readToolchain();
  const outdir = resolve(edgeRoot, ".generated", target);
  const compiled = new Map();
  const result = await build({
    ...config,
    absWorkingDir: edgeRoot,
    outdir,
    alias,
    plugins: [{
      name: "record-compiled-bytes",
      setup(builder) {
        builder.onLoad({ filter: /\.(?:ts|js)$/ }, async ({ path }) => {
          const contents = await readFile(path);
          compiled.set(path, contents);
          return { contents, loader: path.endsWith(".ts") ? "ts" : "js" };
        });
      }
    }],
    tsconfig: resolve(edgeRoot, "tsconfig.json"),
    metafile: true,
    write: false,
    logLevel: "silent"
  });
  assert.equal(result.warnings.length, 0, "Bundle warnings require investigation.");
  validateGraph(result.metafile);
  const files = new Map();
  for (const output of result.outputFiles) {
    const name = posix(relative(outdir, output.path));
    const metaPath = posix(relative(edgeRoot, output.path));
    assert.equal(output.contents.byteLength, result.metafile.outputs[metaPath]?.bytes, `Output graph size mismatch: ${name}`);
    files.set(name, Buffer.from(output.contents));
  }
  assert.deepEqual(
    [...files.keys()].sort(),
    Object.keys(config.entryPoints).map((name) => `${name}.mjs`).sort(),
    "Unexpected bundle outputs."
  );
  const dependencyText = await readFile(resolve(edgeRoot, EPHEMERIS_SOURCE), "utf8");
  const dependencyNotice = dependencyText.match(/^\/\*\*[\s\S]*?\*\//)?.[0];
  assert(dependencyNotice?.includes("MIT License") && dependencyNotice.includes("@preserve"), "Missing dependency licence.");
  for (const [name, bytes] of files) {
    assert(bytes.toString("utf8").includes(dependencyNotice), `Dependency licence removed from ${name}`);
  }
  files.set("ASTRONOMY-LICENSE.txt", Buffer.from(dependencyNotice + "\n"));
  for (const name of legalNames) files.set(name, await readFile(resolve(edgeRoot, "..", name)));
  files.set("metafile.json", json(result.metafile));

  const paths = [...new Set([...Object.keys(result.metafile.inputs), ...supportSources])].sort();
  const sources = await Promise.all(paths.map((path) => sourceRecord(path, compiled)));
  for (const source of sources) {
    const input = result.metafile.inputs[source.path];
    if (input) assert.equal(input.bytes, source.bytes, `Input changed during build: ${source.path}`);
  }
  const manifest = {
    schema: "edge-build/1",
    target,
    engineVersion,
    ephemeris,
    toolchain,
    config: { ...config, alias: { "astronomy-engine": EPHEMERIS_SOURCE }, tsconfig: "tsconfig.json" },
    sourceDigest: sha256(json(sources)),
    sources,
    outputs: [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, bytes]) => ({
      path, bytes: bytes.byteLength, sha256: sha256(bytes)
    }))
  };
  files.set("manifest.json", json(manifest));
  validateFiles(files);
  if (write) {
    const generated = resolve(edgeRoot, ".generated");
    await mkdir(generated, { recursive: true });
    assert.equal(await realpath(generated), generated, "Generated output directory must not be a symlink.");
    // Only this known target's ignored directory is replaced.
    await rm(outdir, { recursive: true, force: true });
    await mkdir(outdir);
    for (const [name, bytes] of files) await writeFile(resolve(outdir, name), bytes);
  }
  return { files, manifest, metafile: result.metafile };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  assert(args.length <= 1, "Usage: node edge/scripts/build-bundles.mjs [workers|deno|bun|browser]");
  const targets = args.length ? args : Object.keys(TARGETS);
  for (const target of targets) {
    const { manifest } = await buildTarget(target);
    console.log(`Built edge/.generated/${target}/ (source SHA-256 ${manifest.sourceDigest})`);
  }
}
