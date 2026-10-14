import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const project = fileURLToPath(new URL("../", import.meta.url));
const parent = fileURLToPath(new URL("../../", import.meta.url));
const solver = resolve(parent, "src/sky/riseset.ts");
const vectorAdapter = resolve(project, "src/sky-vector.ts");
const astronomy = resolve(project, "node_modules/astronomy-engine/esm/astronomy.js");
const astronomyUrl = pathToFileURL(astronomy).href;
const contractPath = resolve(project, "sources/engine-sky-contract.json");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function readEngineContract() {
  return JSON.parse(readFileSync(contractPath, "utf8"));
}

/** Testable read boundary. Production always reads this checkout's bytes. */
export function verifyEngineSources(contract = readEngineContract(), read = readFileSync) {
  assert.equal(contract.schema, "fixedstars-engine-sky-contract/1", "unsupported sky adapter contract");
  assert.equal(contract.vectorImporter, "src/sky/riseset.ts");
  assert.equal(contract.vectorModule, "astronomy-engine");
  assert.equal(contract.bodySlot, "Pluto");
  assert.equal(contract.ephemeris.version, "2.1.19");
  assert.equal(JSON.parse(read(resolve(project, "node_modules/astronomy-engine/package.json"), "utf8")).version,
    contract.ephemeris.version, "incompatible sky ephemeris version");
  assert.equal(digest(read(astronomy)), contract.ephemeris.esmSha256, "incompatible sky ephemeris source");
  assert.equal(JSON.parse(read(resolve(parent, "package.json"), "utf8")).version,
    contract.engineVersion, "incompatible sky engine version");
  assert(contract.sources && Object.hasOwn(contract.sources, "src/sky/riseset.ts"), "missing sky solver contract");
  for (const [path, hash] of Object.entries(contract.sources)) {
    assert(/^src\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.ts$/u.test(path), "invalid engine contract path");
    assert(/^[a-f0-9]{64}$/u.test(hash), "invalid engine source digest");
    assert.equal(digest(read(resolve(parent, path))), hash, `incompatible engine sky source: ${path}`);
  }
}

/** Compile the existing solver unchanged; redirect only its dependency edge. */
export async function compileSkyAdapter(contract = readEngineContract()) {
  verifyEngineSources(contract);
  let substitutions = 0;
  const bundled = await build({
    absWorkingDir: parent,
    entryPoints: [resolve(project, "src/sky-adapter-entry.ts")],
    bundle: true, format: "esm", platform: "node", target: "node22",
    write: false, metafile: true, logLevel: "silent",
    plugins: [{
      name: "scoped-sky-vector",
      setup(builder) {
        builder.onResolve({ filter: /^astronomy-engine$/u }, (args) => {
          if (args.importer === solver) {
            substitutions += 1;
            return { path: vectorAdapter };
          }
          // All other engine modules and the shim itself keep the real
          // dependency. No patch to GeoVector, DefineStar or global exports.
          return { path: astronomyUrl, external: true };
        });
        // Pin bytes actually supplied to the compiler, not just an earlier
        // read. New imports and edits during compilation fail closed too.
        builder.onLoad({ filter: /\.ts$/u }, (args) => {
          const path = relative(parent, args.path).replaceAll("\\", "/");
          if (!path.startsWith("src/")) return undefined;
          const bytes = readFileSync(args.path);
          assert.equal(digest(bytes), contract.sources[path], `incompatible engine sky source: ${path}`);
          return { contents: bytes.toString("utf8"), loader: "ts" };
        });
      }
    }]
  });
  assert.equal(substitutions, 1, "expected only the solver's astronomy dependency to be substituted");
  const sourcePaths = Object.keys(bundled.metafile.inputs).map((path) => {
    const absolute = isAbsolute(path) ? path : resolve(parent, path);
    return relative(parent, absolute).replaceAll("\\", "/");
  }).filter((path) => path.startsWith("src/")).sort();
  assert.deepEqual(sourcePaths, Object.keys(contract.sources).sort(), "incompatible engine sky import graph");
  const code = bundled.outputFiles[0].text;
  assert(Buffer.byteLength(code) < 2_000_000, "sky adapter exceeds the project artifact size limit");
  return { code, sourcePaths, substitutions };
}

/** Each loaded proof has its own vector scope; nothing is written to disk. */
export async function loadSkyAdapter(contract = readEngineContract()) {
  const { code } = await compileSkyAdapter(contract);
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}#${randomUUID()}`;
  return import(/* @vite-ignore */ url);
}

/** Public Node preparation. All subsequent numerical searches are synchronous. */
export async function prepareStarSky() {
  const contract = readEngineContract();
  const adapter = await loadSkyAdapter(contract);
  return adapter.createStarSkySearch(adapter, contract);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 2, "usage: node fixedstars/scripts/build-sky-adapter.mjs");
  compileSkyAdapter().then(() => {
    console.log("Engine sky contract verified; unchanged solver compiled in memory with scoped vector substitution.");
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
