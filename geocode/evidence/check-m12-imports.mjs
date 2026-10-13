import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Use the locked development toolchain, in memory. This emits no engine build,
// distributable artifact or copied atlas data. Tree shaking is disabled so
// unused re-exports cannot conceal import-time work from the runtime guard.
const project = fileURLToPath(new URL("../", import.meta.url));
const probe = fileURLToPath(new URL("../tests/fixtures/import-audit.mjs", import.meta.url));
const options = {
  absWorkingDir: project, bundle: true, platform: "node", format: "esm",
  target: "node22", write: false, metafile: true, treeShaking: false, logLevel: "silent"
};

function audit(source, mode) {
  const child = spawnSync(process.execPath, [probe], {
    cwd: project, input: JSON.stringify({ source, mode }), encoding: "utf8",
    timeout: 20_000, maxBuffer: 2_000_000,
    env: { ...process.env, NODE_OPTIONS: "", TSX_DISABLE_CACHE: "1" }
  });
  if (child.error) throw child.error;
  assert.equal(child.status, 0, child.stderr.slice(0, 1500));
  assert.equal(child.stderr, "", "import audit wrote diagnostics");
  return JSON.parse(child.stdout);
}

// Positive controls must fail even when import-time code catches the error.
for (const source of [
  'import fs from "node:fs"; try { fs.readFileSync("ignored"); } catch {}',
  'try { await fetch("https://example.invalid/"); } catch {}',
  'try { setInterval(() => {}, 1000); } catch {}',
  'import net from "node:net"; try { new net.Server().listen(0); } catch {}',
  'try { new Intl.DateTimeFormat(); } catch {}'
]) assert.equal(audit(source, "control").detected, true);

const core = await build({ ...options, entryPoints: ["src/index.ts"] });
const inputs = Object.keys(core.metafile.inputs);
assert(inputs.includes("../src/geo.ts"), "core must reuse the existing geo API");
assert(inputs.some((path) => path.startsWith("../src/tzdb/")), "missing existing zone history loaders");
for (const path of inputs) {
  assert(!path.includes("node_modules/"), `unexpected runtime package: ${path}`);
  assert(!path.startsWith("../atlas/"), `core loaded the Node atlas entry: ${path}`);
  assert(!/^src\/(?:http-|atlas-|load-index|build-index|publish-directory|cli)/u.test(path),
    `Node operation leaked into core: ${path}`);
  assert(!/(?:astronomy-engine|\.test\.|^\.\.\/src\/(?:index|internal|calc|houses|sky|vedic|timing|techniques))/u.test(path),
    `calculation or test code leaked into core: ${path}`);
  for (const dependency of core.metafile.inputs[path].imports) {
    assert(!dependency.external, `unexpected external core import: ${dependency.path}`);
  }
}
assert.deepEqual(audit(core.outputFiles[0].text, "core"), { mode: "core", passed: true });

// The atlas uses its source URL only to derive default data paths. Preserve
// that file URL when evaluating a bundle from a data URL; no data is loaded.
const optional = await build({ ...options,
  define: { "import.meta.url": JSON.stringify(new URL("../../atlas/tools/lib.mjs", import.meta.url).href) },
  stdin: {
  contents: 'export * from "./src/index.ts";\n'
    + 'export { loadAtlasTimeProvider } from "./src/atlas-time.ts";\n'
    + 'export { loadPlaceIndex } from "./src/load-index.ts";\n'
    + 'export { createGeocodeServer } from "./src/http-server.ts";\n',
  resolveDir: project, sourcefile: "acceptance-entries.ts", loader: "ts"
} });
assert(Object.hasOwn(optional.metafile.inputs, "../atlas/tools/lib.mjs"), "atlas bridge must reuse its resolver");
assert.deepEqual(audit(optional.outputFiles[0].text, "optional"), { mode: "optional", passed: true });

console.log(JSON.stringify({
  runtime: { node: process.version, icu: process.versions.icu, tz: process.versions.tz },
  checks: [
    "guards detect attempted filesystem, network, timer, listener and Intl work, including caught errors",
    "core graph reuses engine geo and timezone histories without Node loaders, atlas files or chart math",
    "core import, factories, lookup and date-only resolution perform no guarded work",
    "modern and historical IANA resolution work without filesystem, network, timers or listeners",
    "optional atlas, index-loader and HTTP entries import without guarded work",
    "HTTP factory and close-before-start open no listener or timer"
  ],
  passed: true
}, null, 2));
