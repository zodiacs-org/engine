// The step `npm run build` runs right after tsup: it takes out of dist/ the
// bare chunk imports esbuild's code splitting writes into the entry files
// (scripts/dist-purity.mjs says why each one goes, and refuses one that
// may not), and writes the build's module list, dist/metafile-esm.json,
// again to match, as compact as tsup writes it. It prints what it took out.
// scripts/verify-dist-purity.mjs, which `npm run exports:smoke` runs, checks
// that no file under dist/ has a bare import left.
import { readFileSync, writeFileSync } from "node:fs";

import { dropBareChunkImports } from "./dist-purity.mjs";

const at = (path) => new URL(`../${path}`, import.meta.url);
const metafile = JSON.parse(readFileSync(at("dist/metafile-esm.json"), "utf8"));
const { texts, metafile: rewritten, dropped } = dropBareChunkImports({ metafile, read: (path) => readFileSync(at(path), "utf8") });
for (const [path, text] of texts) writeFileSync(at(path), text);
writeFileSync(at("dist/metafile-esm.json"), JSON.stringify(rewritten));
console.log(`chunk imports: took ${dropped.length} bare chunk imports out of ${texts.size} entry files, each a chunk the file loads through its named imports`);
