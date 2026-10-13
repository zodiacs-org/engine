import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { bundleConfig, FILE_LIMIT, TARGETS } from "../build.config.mjs";
import { buildTarget, validateFiles, validateGraph } from "../scripts/build-bundles.mjs";

const edgeRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const ephemerisRoot = resolve(edgeRoot, "node_modules/astronomy-engine");
const dependency = JSON.parse(await readFile(resolve(ephemerisRoot, "package.json"), "utf8"));
const dependencySource = await readFile(resolve(ephemerisRoot, dependency.exports["."].import), "utf8");
const dependencyNotice = dependencySource.slice(0, dependencySource.indexOf("*/") + 2);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const text = (bytes) => Buffer.from(bytes).toString("utf8");
const importBytes = (bytes) => import(`data:text/javascript;base64,${Buffer.from(bytes).toString("base64")}`);

// This reference reads the root entry directly, independently of the edge
// re-export wrapper. Nothing is written, so parallel test files cannot race
// over reference artifacts. Every execution in this file still uses Node.
const referenceBuild = await build({
  absWorkingDir: edgeRoot,
  entryPoints: { engine: "../src/index.ts", workloads: "src/workloads.ts" },
  outdir: resolve(edgeRoot, ".generated/bundle-test-reference"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",
  alias: { "astronomy-engine": resolve(ephemerisRoot, dependency.exports["."].import) },
  tsconfig: resolve(edgeRoot, "tsconfig.json"),
  minify: false,
  legalComments: "inline",
  write: false,
  logLevel: "silent"
});
const reference = Object.fromEntries(await Promise.all(referenceBuild.outputFiles.map(async (file) => [
  file.path.endsWith("/engine.js") ? "engine" : "workloads",
  await importBytes(file.contents)
])));
const expectedWorkloads = reference.workloads.runSmokeCases();
const bundles = new Map();
const bundleFor = (target) => {
  if (!bundles.has(target)) bundles.set(target, buildTarget(target, { write: false }));
  return bundles.get(target);
};

test("target configurations cover the requested runtimes", () => {
  assert.deepEqual(Object.keys(TARGETS).sort(), ["browser", "bun", "deno", "workers"]);
  assert.equal(FILE_LIMIT, 2_000_000);
  for (const target of Object.keys(TARGETS)) {
    assert.deepEqual(bundleConfig(target).entryPoints, {
      engine: "src/engine.ts",
      workloads: "src/workloads.ts",
      ...(target === "workers" ? { worker: "src/worker.ts" } : {})
    });
  }
});

for (const target of Object.keys(TARGETS)) {
  test(`${target} emits a reproducible self-contained bundle with Node parity and provenance`, async () => {
    const { files, manifest, metafile } = await bundleFor(target);
    assert.ok(files instanceof Map);
    const moduleNames = target === "workers" ? ["engine.mjs", "worker.mjs", "workloads.mjs"] : ["engine.mjs", "workloads.mjs"];
    assert.deepEqual([...files.keys()].filter((path) => path.endsWith(".mjs")).sort(), moduleNames);
    assert.doesNotThrow(() => validateGraph(metafile));
    assert.deepEqual(JSON.parse(text(files.get("manifest.json"))), manifest);
    assert.deepEqual(JSON.parse(text(files.get("metafile.json"))), metafile);
    assert.equal(manifest.target, target);
    assert.equal(manifest.engineVersion, reference.engine.ENGINE_VERSION);
    assert.deepEqual(manifest.ephemeris, reference.engine.EPHEMERIS);
    assert.equal(manifest.toolchain.node, process.version);
    assert.match(manifest.sourceDigest, /^[a-f0-9]{64}$/);
    assert.equal(manifest.sourceDigest, sha256(Buffer.from(JSON.stringify(manifest.sources, null, 2) + "\n")));

    for (const [name, bytes] of files) {
      assert.ok(!isAbsolute(name) && !name.split(/[\\/]/).includes(".."), name);
      assert.ok(bytes.byteLength > 0 && bytes.byteLength < FILE_LIMIT, name);
    }
    assert.deepEqual(
      manifest.outputs.map(({ path }) => path).sort(),
      [...files.keys()].filter((path) => path !== "manifest.json").sort()
    );
    for (const output of manifest.outputs) {
      const bytes = files.get(output.path);
      assert.equal(output.bytes, bytes.byteLength, output.path);
      assert.equal(output.sha256, sha256(bytes), output.path);
    }
    assert.ok(manifest.sources.length > 0);
    assert.equal(new Set(manifest.sources.map(({ path }) => path)).size, manifest.sources.length);
    for (const source of manifest.sources) {
      assert.ok(!isAbsolute(source.path) && !source.path.includes("\\"), source.path);
      const bytes = await readFile(resolve(edgeRoot, source.path));
      assert.equal(source.bytes, bytes.byteLength, source.path);
      assert.equal(source.sha256, sha256(bytes), source.path);
    }
    const sourcePaths = new Set(manifest.sources.map(({ path }) => path));
    for (const path of [
      "../src/index.ts", "src/workloads.ts", "src/engine.ts",
      "package-lock.json", "build.config.mjs", "tsconfig.json",
      "scripts/build-bundles.mjs", "scripts/build-support.mjs",
      "node_modules/astronomy-engine/esm/astronomy.js"
    ]) assert.ok(sourcePaths.has(path), `Missing provenance: ${path}`);
    if (target === "workers") {
      for (const path of ["src/worker.ts", "src/http.ts"]) {
        assert.ok(sourcePaths.has(path), `Missing Worker provenance: ${path}`);
      }
    } else {
      for (const path of ["src/worker.ts", "src/http.ts"]) {
        assert.ok(!sourcePaths.has(path), `Unexpected Worker source in ${target}: ${path}`);
      }
    }

    for (const name of ["LICENSE", "LICENSING.md", "NOTICE"]) {
      assert.deepEqual(Buffer.from(files.get(name)), await readFile(resolve(repositoryRoot, name)), name);
    }
    assert.ok(dependencyNotice.includes("Permission is hereby granted"));
    assert.equal(text(files.get("ASTRONOMY-LICENSE.txt")), dependencyNotice + "\n");
    for (const name of moduleNames) {
      assert.ok(text(files.get(name)).includes(dependencyNotice), `${name} must retain the full dependency MIT notice`);
    }

    const engine = await importBytes(files.get("engine.mjs"));
    const workloads = await importBytes(files.get("workloads.mjs"));
    assert.deepEqual(Object.keys(engine).sort(), Object.keys(reference.engine).sort(), "Root API exports were omitted or added");
    assert.deepEqual(Object.keys(workloads).sort(), Object.keys(reference.workloads).sort());
    assert.deepStrictEqual(workloads.runSmokeCases(), expectedWorkloads, "Bundle workload results differ under Node");
    for (const { input } of reference.workloads.CHART_CASES) {
      assert.deepStrictEqual(engine.natalChart(input), reference.engine.natalChart(input));
    }

    const repeated = await buildTarget(target, { write: false });
    assert.deepEqual([...repeated.files.keys()].sort(), [...files.keys()].sort());
    for (const [name, bytes] of files) {
      assert.deepEqual(Buffer.from(repeated.files.get(name)), Buffer.from(bytes), `${name} changed on a repeated build`);
    }
    assert.deepEqual(repeated.manifest, manifest);
  });
}

test("Worker module exposes a self-contained fetch handler with Node chart JSON parity", async () => {
  const { files, metafile } = await bundleFor("workers");
  const output = metafile.outputs[".generated/workers/worker.mjs"];
  assert.ok(output, "Worker entry is missing from the build graph");
  assert.deepEqual(output.imports, []);
  assert.deepEqual(output.exports, ["default"]);
  // Importing from a data URL also refuses unresolved relative imports.
  const worker = await importBytes(files.get("worker.mjs"));
  assert.deepEqual(Object.keys(worker), ["default"]);
  assert.equal(typeof worker.default.fetch, "function");
  for (const { id, input } of reference.workloads.CHART_CASES) {
    const response = await worker.default.fetch(new Request("https://edge.invalid/chart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }));
    assert.ok(response instanceof Response, id);
    assert.equal(response.status, 200, id);
    assert.match(response.headers.get("content-type"), /^application\/json(?:;|$)/i, id);
    assert.deepStrictEqual(await response.json(), {
      ok: true,
      result: JSON.parse(JSON.stringify(reference.engine.natalChart(input)))
    }, `${id}: Worker chart JSON differs under Node`);
  }
});

test("graph validation rejects incompatible or unexpectedly imported modules", async () => {
  const { metafile } = await bundleFor("workers");
  const inputName = Object.keys(metafile.inputs).find((path) => path.endsWith("src/index.ts"));
  const outputName = Object.keys(metafile.outputs)[0];
  assert.ok(inputName && outputName);
  const cases = [
    ["external builtin", (graph) => graph.inputs[inputName].imports.push({ path: "node:fs", kind: "import-statement", external: true })],
    ["external URL", (graph) => graph.inputs[inputName].imports.push({ path: "https://example.invalid/module.js", kind: "import-statement", external: true })],
    ["dynamic import", (graph) => graph.inputs[inputName].imports.push({ path: inputName, kind: "dynamic-import" })],
    ["CommonJS require", (graph) => graph.inputs[inputName].imports.push({ path: inputName, kind: "require-call" })],
    ["CommonJS module", (graph) => { graph.inputs[inputName].format = "cjs"; }],
    ["unresolved module", (graph) => graph.inputs[inputName].imports.push({ path: "../src/missing.ts", kind: "import-statement" })],
    ["opt-in module", (graph) => { graph.inputs["../src/geo/index.ts"] = { bytes: 1, format: "esm", imports: [] }; }],
    ["root-installed dependency", (graph) => { graph.inputs["../node_modules/astronomy-engine/esm/astronomy.js"] = { bytes: 1, format: "esm", imports: [] }; }],
    ["unexpected edge dependency", (graph) => { graph.inputs["node_modules/other-package/index.js"] = { bytes: 1, format: "esm", imports: [] }; }],
    ["remaining output import", (graph) => graph.outputs[outputName].imports.push({ path: "./chunk.mjs", kind: "import-statement" })]
  ];
  for (const [name, mutate] of cases) {
    const changed = structuredClone(metafile);
    mutate(changed);
    assert.throws(() => validateGraph(changed), undefined, name);
  }
});

test("output validation enforces the strict size limit and flat local names", () => {
  assert.doesNotThrow(() => validateFiles(new Map([["allowed.mjs", Buffer.alloc(FILE_LIMIT - 1)]])));
  for (const size of [FILE_LIMIT, FILE_LIMIT + 1]) {
    assert.throws(() => validateFiles(new Map([["oversize.mjs", Buffer.alloc(size)]])), /limit/);
  }
  for (const name of ["../outside.mjs", "/absolute.mjs", "nested/output.mjs", "nested\\output.mjs", ".", "..", ""]) {
    assert.throws(() => validateFiles(new Map([[name, Buffer.from("export {};")]])), /flat local file/);
  }
});

test("unknown target names fail instead of choosing a default", async () => {
  for (const target of ["worker", "node", "../outside", "toString", "", undefined]) {
    await assert.rejects(async () => buildTarget(target, { write: false }));
  }
});
