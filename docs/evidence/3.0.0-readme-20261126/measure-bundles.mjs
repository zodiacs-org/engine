// The bundle sizes README.md, docs/guide.md (*Bundle size in a web page*),
// docs/comparison.md and docs/de440.md quote for 3.0.0, measured on the build
// in dist/ (run `npm run build` first):
//
//   node docs/evidence/3.0.0-readme-20261126/measure-bundles.mjs
//
// Each program is an application's module, bundled by scripts/dist-purity.mjs's
// bundleOf, as scripts/ratchet.mjs and scripts/verify-dist-purity.mjs bundle
// theirs: esbuild, the version the build runs, for a browser, one ES module,
// minified, then gzip at level 9 (Node's zlib). The first, second, fourth,
// fifth and sixth programs are scripts/ratchet.mjs's own. `de440Pack` says
// whether the bundle holds the shipped pack's 3,319,552 characters of base64
// (scripts/verify-package-contents.mjs's PACK_DATA_BYTES). It prints one JSON
// object.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { bundleOf } from "../../../scripts/dist-purity.mjs";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PACK_CHARACTERS = 3_319_552;
const NATAL = 'import { natalChart } from "./dist/index.js";\n';
const PROGRAMS = {
  "natalChart from the root": `${NATAL}globalThis.chart = natalChart;\n`,
  "natalChart from ./core": 'import { natalChart } from "./dist/core.js";\nglobalThis.chart = natalChart;\n',
  "natalChart and useDe440": `${NATAL}import { useDe440 } from "./dist/de440-pack.js";\nglobalThis.chart = [natalChart, useDe440];\n`,
  "the whole of ./de440/pack": 'import * as pack from "./dist/de440-pack.js";\nglobalThis.pack = pack;\n',
  "natalChart and all of ./minor-bodies": `${NATAL}import * as minor from "./dist/minor-bodies.js";\nglobalThis.chart = [natalChart, minor];\n`,
  "natalChart and Chiron alone": `${NATAL}import { chiron, minorBodyPosition } from "./dist/minor-bodies.js";\nglobalThis.chart = [natalChart, minorBodyPosition(chiron, new Date())];\n`
};

const bundles = {};
for (const [name, contents] of Object.entries(PROGRAMS)) {
  const bundle = await bundleOf({ root: ROOT, contents });
  assert.deepEqual([...bundle.errors, ...bundle.warnings], [], `esbuild bundles ${name} with errors or warnings`);
  const runs = [...bundle.text.matchAll(/[A-Za-z0-9+/]{1000,}={0,2}/gu)].map((match) => match[0].length);
  bundles[name] = { minified: bundle.bytes, gzipped: bundle.gzip, de440Pack: runs.includes(PACK_CHARACTERS) };
}
const root = bundles["natalChart from the root"];
console.log(
  JSON.stringify(
    {
      node: process.version,
      esbuild: JSON.parse(readFileSync(new URL("../../../node_modules/esbuild/package.json", import.meta.url), "utf8")).version,
      packageVersion: JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).version,
      bundles,
      added: {
        "useDe440, gzipped": bundles["natalChart and useDe440"].gzipped - root.gzipped,
        "all five minor bodies, gzipped": bundles["natalChart and all of ./minor-bodies"].gzipped - root.gzipped,
        "Chiron alone, gzipped": bundles["natalChart and Chiron alone"].gzipped - root.gzipped
      }
    },
    null,
    2
  )
);
