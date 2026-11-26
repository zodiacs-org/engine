// The built package under package.json's "sideEffects": false, after
// `npm run build`; `npm run exports:smoke` runs it after
// scripts/module-resolution-smoke.mjs. scripts/dist-purity.mjs holds the
// checks and says why each matters:
//
// 1. no file under dist/ imports one of the package's own files bare
//    (`import "./chunk-X.js";`): scripts/build-chunk-imports.mjs takes out the
//    ones esbuild writes, and a bundler would drop any left, with a warning;
// 2. no file under dist/ awaits at its top level;
// 3. esbuild, the version the build runs, bundles the root's natalChart
//    alone, and each entry point in package.json "exports" whole
//    (`import * as`), for a browser, minified, with no warning and no error,
//    its "ignored-bare-import" warning raised to an error.
//
// It prints the size of the natalChart bundle, raw and gzipped (zlib, level
// 9), as a measurement; it is not a budget.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { bareImports, bundleOf, hasTopLevelAwait } from "./dist-purity.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const dist = new URL("../dist/", import.meta.url);
const files = readdirSync(dist).filter((name) => name.endsWith(".js")).sort();
assert(files.includes("index.js"), "dist/index.js is missing; run npm run build first");
for (const name of files) {
  const code = readFileSync(new URL(name, dist), "utf8");
  const bare = bareImports(code);
  assert.deepEqual(bare, [], `dist/${name} imports ${bare.join(", ")} bare; npm run build takes such imports out (scripts/build-chunk-imports.mjs)`);
  assert.equal(await hasTopLevelAwait(code), false, `dist/${name} awaits at its top level`);
}

const exportsMap = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).exports;
const programs = [
  ["the root's natalChart", 'import { natalChart } from "./dist/index.js";\nglobalThis.natalChart = natalChart;\n'],
  ...Object.entries(exportsMap).map(([subpath, target]) => [subpath, `import * as entry from ${JSON.stringify(target.import ?? target.default)};\nglobalThis.entry = entry;\n`])
];
let natal;
for (const [what, contents] of programs) {
  const bundle = await bundleOf({ root: ROOT, contents });
  assert.deepEqual([...bundle.errors, ...bundle.warnings], [], `esbuild bundles ${what} with errors or warnings`);
  natal ??= bundle;
}
console.log(
  `dist purity passed: no bare import and no top-level await in the ${files.length} JavaScript files under dist/; esbuild bundles the root's natalChart ` +
    `(${natal.bytes} bytes, ${natal.gzip} gzipped) and each of the ${programs.length - 1} entry points whole, for a browser and minified, with no warning`
);
