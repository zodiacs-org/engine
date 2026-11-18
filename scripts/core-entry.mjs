// The build of @zodiacs/engine/core and the checks of what it holds.
//
// The core entry exports what the root exports and computes on
// astronomy-engine, without the shipped DE440 pack. tsup builds the root with
// code splitting, and the root's ephemeris module imports the pack, so the
// core entry takes no part in that build: esbuild, the version tsup runs,
// bundles src/core.ts on its own into one file, with
// src/core/ephemeris-shipped.ts in place of src/ephemeris-shipped.ts (the
// module that names the root's default source and opens the pack), and
// astronomy-engine left as an import of the package's dependency.
//
// buildCore() is that build; scripts/build-core.mjs writes it to dist/ and
// the unit suite (scripts/core-entry.test.mjs) runs it in memory, so that the
// suite tests the same bundle without a build. checkCoreBuild() is what the
// bundle must satisfy, whichever way it was made.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const at = (path) => new URL(`../${path}`, import.meta.url);

/**
 * The source modules dist/core.js must not hold: the pack's text, the entry
 * that gives the pack out, and the root's module that opens it and names
 * DE440 as the default.
 */
export const CORE_BANNED_SOURCES = Object.freeze(["src/de440-pack.ts", "src/de440/pack-data.ts", "src/ephemeris-shipped.ts"]);

/** The core entry's own modules, which no other entry's graph holds. */
export const CORE_OWN_SOURCES = Object.freeze(["src/core.ts", "src/core/ephemeris-shipped.ts"]);

/** The pack's text: one run of base64 of over 1,000 characters, as scripts/verify-package-contents.mjs finds it. */
const PACK_TEXT = /[A-Za-z0-9+/]{1000,}={0,2}/u;

/**
 * Bundles src/core.ts. With `write`, writes dist/core.js; without, returns
 * the text. Returns `{ text, metafile, swapped }`: `swapped` counts the
 * imports of ./ephemeris-shipped.js that were pointed at the core's stand-in.
 */
export async function buildCore({ write = false } = {}) {
  const target = JSON.parse(readFileSync(at("tsconfig.base.json"), "utf8")).compilerOptions.target.toLowerCase();
  let swapped = 0;
  const result = await build({
    absWorkingDir: ROOT,
    entryPoints: { core: "src/core.ts" },
    bundle: true,
    splitting: false,
    format: "esm",
    platform: "neutral",
    target,
    tsconfig: "tsconfig.build.json",
    external: ["astronomy-engine"],
    metafile: true,
    minify: false,
    outdir: "dist",
    write,
    logLevel: "warning",
    plugins: [{
      name: "core-ephemeris",
      setup(builder) {
        builder.onResolve({ filter: /^\.\/ephemeris-shipped\.js$/ }, () => {
          swapped += 1;
          return { path: fileURLToPath(at("src/core/ephemeris-shipped.ts")) };
        });
      }
    }]
  });
  const text = write ? readFileSync(at("dist/core.js"), "utf8") : result.outputFiles.find((file) => file.path.endsWith("core.js")).text;
  return { text, metafile: result.metafile, swapped };
}

/**
 * The checks every core bundle must pass: the stand-in was swapped in once;
 * no module of CORE_BANNED_SOURCES is in its module list or marked in its
 * text; it imports astronomy-engine and nothing else, and nothing lazily;
 * and it holds no run of base64 long enough to be the pack.
 */
export function checkCoreBuild({ text, metafile, swapped }) {
  assert.equal(swapped, 1, "src/ephemeris.ts must import ./ephemeris-shipped.js once, and nothing else may");
  const output = metafile.outputs["dist/core.js"];
  assert(output, "the core build wrote no dist/core.js");
  const inputs = Object.keys(metafile.inputs);
  for (const banned of CORE_BANNED_SOURCES) {
    assert(!inputs.includes(banned) && !Object.hasOwn(output.inputs, banned), `dist/core.js must not hold ${banned}`);
    assert(!text.includes(`\n// ${banned}\n`), `dist/core.js marks ${banned}`);
  }
  for (const own of CORE_OWN_SOURCES) assert(inputs.includes(own), `the core build does not list ${own}`);
  assert.deepEqual(output.imports.map((entry) => entry.path), ["astronomy-engine"], "dist/core.js may import astronomy-engine and nothing else");
  assert(!/\bimport\s*\(/u.test(text), "dist/core.js must not import anything lazily");
  assert(!PACK_TEXT.test(text), "dist/core.js holds a run of base64 as long as the pack's");
  return { inputs: inputs.sort(), bytes: Buffer.byteLength(text) };
}
