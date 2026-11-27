// What the built package must be under package.json's "sideEffects": false,
// and the build step that makes it so: the bare imports esbuild's code
// splitting writes into the entry files, which scripts/build-chunk-imports.mjs
// (run by `npm run build` right after tsup) takes out; and the checks
// scripts/verify-dist-purity.mjs (run by `npm run exports:smoke`) makes of
// dist/: no bare import left, no top-level await, and no warning when esbuild
// bundles an entry point as an application does.
//
// esbuild gives each entry file an import of every chunk that holds a module
// of its graph. Where the entry file takes no name from that chunk, the
// import is bare, `import "./chunk-X.js";`, so that the chunk is evaluated
// for what its code does when it runs. esbuild writes it whether the chunk's
// code does anything or not: for a chunk of pure functions as well
// (scripts/dist-purity.test.mjs builds such a case), so no pure mark in
// src/ removes it. Under package.json's "sideEffects": false a bundler drops
// a bare import of the package's own files, and esbuild says so with an
// "ignored-bare-import" warning for each, wherever the importing file is not
// under node_modules.
//
// The import is not needed where the file loads the chunk all the same,
// through its named imports and the imports of the chunks those load: an ES
// module is evaluated before any module that imports it, so the chunk still
// runs before the code that uses it. dropBareChunkImports takes out each such
// import, from the file and from the build's module list
// (dist/metafile-esm.json, whose bytes scripts/root-isolation.mjs holds to
// the files), and refuses a bare import of a chunk the file would not load
// otherwise: such a chunk is in the graph only for what its code does when it
// is evaluated, which "sideEffects": false says the package never needs, so
// its source must change instead (a pure mark, or work done at the first
// call rather than at import).
import assert from "node:assert/strict";
import { posix } from "node:path";
import { gzipSync } from "node:zlib";
import { build, transform } from "esbuild";

/** A bare import of one of the package's own files: `import "./x.js";` on a line of its own. */
const BARE_IMPORT = /^import\s*(["'])(\.\.?\/[^"']+)\1;?[ \t]*$/u;

/** The specifier a line imports bare, or null. */
const bareSpecifier = (line) => BARE_IMPORT.exec(line)?.[2] ?? null;

/** The specifiers of the bare imports of the package's own files in a built file, in order. */
export function bareImports(code) {
  return code.split("\n").map(bareSpecifier).filter((specifier) => specifier !== null);
}

/** The output path ("dist/chunk-X.js") a specifier in `file` names. */
const targetOf = (file, specifier) => posix.normalize(posix.join(posix.dirname(file), specifier));

/** The output files reached from `starts` through import statements, the starts included. */
function loadedFrom(starts, edges) {
  const seen = new Set();
  const stack = [...starts];
  while (stack.length > 0) {
    const path = stack.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    for (const edge of edges.get(path) ?? []) stack.push(edge);
  }
  return seen;
}

/**
 * Takes out of a build every bare import of a chunk that its file loads
 * through its other imports. `metafile` is esbuild's (tsup's
 * dist/metafile-esm.json); `read(path)` gives an output file's text by the
 * path the metafile writes ("dist/index.js"). Returns `texts`, the new text of
 * each file that changed; `metafile`, a copy whose records of those files
 * have their new bytes and no longer list the imports taken out; and
 * `dropped`, each import taken out as [file, chunk]. Throws, naming it, at a
 * bare import of a chunk the file would not load otherwise, and at one the
 * metafile does not list.
 */
export function dropBareChunkImports({ metafile, read }) {
  assert(metafile && typeof metafile === "object" && metafile.outputs && metafile.inputs,
    "dist/metafile-esm.json is missing or not an esbuild metafile; rebuild with npm run build");
  const files = Object.keys(metafile.outputs).filter((path) => path.endsWith(".js"));
  const texts = new Map(files.map((path) => [path, read(path)]));
  const bare = new Map();
  for (const [file, code] of texts) {
    const targets = bareImports(code).map((specifier) => targetOf(file, specifier));
    if (targets.length === 0) continue;
    const listed = metafile.outputs[file].imports.filter((edge) => edge.kind === "import-statement" && !edge.external).map((edge) => edge.path);
    for (const target of targets) {
      assert.equal(listed.filter((path) => path === target).length, 1,
        `${file} imports ${target} bare, which the build's module list does not list once among its imports`);
    }
    bare.set(file, new Set(targets));
  }
  // Every import statement between the package's files but the bare ones.
  const named = new Map(files.map((file) => [file, metafile.outputs[file].imports
    .filter((edge) => edge.kind === "import-statement" && !edge.external && !bare.get(file)?.has(edge.path))
    .map((edge) => edge.path)]));
  const outputs = structuredClone(metafile.outputs);
  const changed = new Map();
  const dropped = [];
  for (const [file, targets] of bare) {
    const loaded = loadedFrom(named.get(file), named);
    for (const target of targets) {
      assert(loaded.has(target),
        `${file} imports ${target} only for what its code does when it is evaluated: no named import of the file loads it. ` +
          'Under "sideEffects": false a bundler drops that import, so make the code it runs pure, or run it at the first call');
      dropped.push([file, target]);
    }
    const text = texts.get(file).split("\n").filter((line) => {
      const specifier = bareSpecifier(line);
      return specifier === null || !targets.has(targetOf(file, specifier));
    }).join("\n");
    changed.set(file, text);
    outputs[file].imports = outputs[file].imports.filter((edge) => !(edge.kind === "import-statement" && targets.has(edge.path)));
    outputs[file].bytes = Buffer.byteLength(text);
  }
  return { texts: changed, metafile: { ...metafile, outputs }, dropped };
}

/**
 * Whether a built file awaits at its top level, which require() of an ES
 * module refuses and which makes a bundler hold back every module that
 * imports it. esbuild, converting the file to CommonJS, refuses exactly that
 * ("Top-level await is currently not supported with the "cjs" output
 * format"); any other refusal is thrown on.
 */
export async function hasTopLevelAwait(code) {
  try {
    await transform(code, { format: "cjs", loader: "js", logLevel: "silent" });
    return false;
  } catch (error) {
    if (Array.isArray(error?.errors) && error.errors.some((message) => message.text.startsWith("Top-level await is currently not supported"))) return true;
    throw error;
  }
}

/** One of esbuild's messages, with where it points. */
const said = (message) => `${message.text}${message.location ? ` (${message.location.file}:${message.location.line})` : ""}`;

/**
 * esbuild's bundle of `contents`, an application's module read as if it sat
 * in the package's folder (`root`), as an application bundles it for a
 * browser: one ES module, minified, every import followed, with esbuild's
 * "ignored-bare-import" warning raised to an error. Returns the warnings and
 * errors as esbuild words them, the bundle's text, its bytes and its bytes
 * gzipped (zlib, level 9).
 */
export async function bundleOf({ root, contents }) {
  let result;
  try {
    result = await build({
      stdin: { contents, resolveDir: root, sourcefile: "application.js", loader: "js" },
      absWorkingDir: root,
      bundle: true,
      format: "esm",
      platform: "browser",
      minify: true,
      write: false,
      logLevel: "silent",
      logOverride: { "ignored-bare-import": "error" }
    });
  } catch (error) {
    if (!Array.isArray(error?.errors)) throw error;
    return { warnings: (error.warnings ?? []).map(said), errors: error.errors.map(said), text: "", bytes: 0, gzip: 0 };
  }
  const text = result.outputFiles[0].text;
  return { warnings: result.warnings.map(said), errors: result.errors.map(said), text, bytes: Buffer.byteLength(text), gzip: gzipSync(text, { level: 9 }).length };
}
