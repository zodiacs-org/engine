// The build of @zodiacs/engine/core, which `npm run build` runs after tsup and
// scripts/build-lite.mjs. scripts/core-entry.mjs says how it is built and
// checks the result. It writes, beside tsup's output:
//
// - dist/core.js: src/core.ts bundled on its own, unminified (as the lite
//   parts are, so that the `// src/...` markers stay in it), importing
//   astronomy-engine and nothing else, without the DE440 pack;
// - dist/core.d.ts: the root's declarations, by re-export, since the entry
//   exports the root's names, with defaultEphemeris and setDefaultEphemeris
//   declared again (same signatures) so that their documentation says this
//   entry's default, astronomy-engine, rather than the root's DE440 pack. A
//   local export takes precedence over `export *`, so the root's .d.ts files
//   stay as they are. Docs on shared types (DefaultEphemeris's members,
//   EphemerisFallback, Chart's ephemeris) are the root's: changing them would
//   mean changing the root's declarations;
// - dist/metafile-core.json: esbuild's module list of the bundle, which the
//   export smoke test reads (readCoreModuleList in scripts/root-isolation.mjs).
//   Not packed (package.json "files").
import { writeFileSync } from "node:fs";

import { buildCore, checkCoreBuild } from "./core-entry.mjs";

const at = (path) => new URL(`../${path}`, import.meta.url);
const built = await buildCore({ write: true });
const { bytes } = checkCoreBuild(built);
const CORE_DECLARATIONS = `export * from "./index.js";
import type { DefaultEphemeris, DefaultEphemerisName } from "./index.js";
/**
 * What a call outside \`withEphemeris\` computes on in @zodiacs/engine/core,
 * which carries no DE440 pack: \`name\` is \`"astronomy-engine"\`, this entry's
 * default, unless \`setDefaultEphemeris("de440")\` chose otherwise, and
 * \`de440.opened\` is always false, with \`de440.error\` saying why. The
 * setting is this entry's own: the root's \`setDefaultEphemeris\` does not
 * change it.
 */
export declare function defaultEphemeris(): DefaultEphemeris;
/**
 * Choose what a call outside \`withEphemeris\` computes on in
 * @zodiacs/engine/core, from now on: \`"astronomy-engine"\` (this entry's
 * default) or \`"de440"\`, which here still computes on astronomy-engine, since
 * this entry carries no pack, and flags each result \`"de440-unavailable"\`.
 * For DE440 positions, import @zodiacs/engine, or supply a pack through
 * @zodiacs/engine/de440 and \`withEphemeris\`. It is this entry's setting
 * alone: the root's is apart from it.
 */
export declare function setDefaultEphemeris(name: DefaultEphemerisName): void;
`;
writeFileSync(at("dist/core.d.ts"), CORE_DECLARATIONS);
writeFileSync(at("dist/metafile-core.json"), JSON.stringify(built.metafile, null, 2) + "\n");
console.log(`core: dist/core.js ${bytes} bytes`);
