// The build of @zodiacs/engine/core, which `npm run build` runs after tsup and
// scripts/build-lite.mjs. scripts/core-entry.mjs says how it is built and
// checks the result. It writes, beside tsup's output:
//
// - dist/core.js: src/core.ts bundled on its own, unminified (as the lite
//   parts are, so that the `// src/...` markers stay in it), importing
//   astronomy-engine and nothing else, without the DE440 pack;
// - dist/core.d.ts: the root's declarations, by re-export, since the entry
//   exports the root's names;
// - dist/metafile-core.json: esbuild's module list of the bundle, which the
//   export smoke test reads (readCoreModuleList in scripts/root-isolation.mjs).
//   Not packed (package.json "files").
import { writeFileSync } from "node:fs";

import { buildCore, checkCoreBuild } from "./core-entry.mjs";

const at = (path) => new URL(`../${path}`, import.meta.url);
const built = await buildCore({ write: true });
const { bytes } = checkCoreBuild(built);
writeFileSync(at("dist/core.d.ts"), 'export * from "./index.js";\n');
writeFileSync(at("dist/metafile-core.json"), JSON.stringify(built.metafile, null, 2) + "\n");
console.log(`core: dist/core.js ${bytes} bytes`);
