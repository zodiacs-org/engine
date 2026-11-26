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
//    its "ignored-bare-import" warning raised to an error;
// 4. from 3.0.0, the natalChart bundle holds no DE440 pack (no run of base64
//    of 1,000 characters or more) and is at most NATAL_CHART_GZIP bytes
//    gzipped (zlib, level 9): the root computes on astronomy-engine until
//    useDe440() from ./de440/pack loads the pack, which only that entry's
//    graph holds.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { bareImports, bundleOf, hasTopLevelAwait } from "./dist-purity.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
/**
 * The root's natalChart bundle, gzipped, at most: this check measured
 * 79,755 bytes, 36,219 gzipped, on 3.0.0's build with esbuild 0.27.7, where
 * 2.1.0's root gave 3,418,424 and 2,440,863, the pack included, and 2.1.0's
 * ./core 79,794 and 35,707.
 */
const NATAL_CHART_GZIP = 40_000;
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
assert(!/[A-Za-z0-9+/]{1000,}/u.test(natal.text), "the root's natalChart bundle holds the DE440 pack");
assert(natal.gzip <= NATAL_CHART_GZIP, `the root's natalChart bundle is ${natal.gzip} bytes gzipped, over ${NATAL_CHART_GZIP}`);
console.log(
  `dist purity passed: no bare import and no top-level await in the ${files.length} JavaScript files under dist/; esbuild bundles the root's natalChart ` +
    `(${natal.bytes} bytes, ${natal.gzip} gzipped of ${NATAL_CHART_GZIP}, no DE440 pack) and each of the ${programs.length - 1} entry points whole, ` +
    "for a browser and minified, with no warning"
);
