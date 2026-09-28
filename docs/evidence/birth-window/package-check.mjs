/*
 * What the window entry point adds to the package, against a baseline build of
 * the commit it branches from:
 *
 * - every baseline JavaScript file in dist/ is byte-identical in the new build;
 * - every baseline declaration file says the same, once the declaration
 *   rollup's shared-chunk names and one-letter aliases are resolved;
 * - minified and gzipped sizes (esbuild, gzip -9, astronomy-engine external)
 *   of the root entry before and after, of the window entry alone, and of a
 *   module importing both;
 * - npm pack's packed and unpacked sizes against the package-contents gate
 *   (unpacked below 300,000 bytes).
 *
 *   node package-check.mjs --baseline DIR [--original DIR] [--out FILE]
 *     [--baseline-label TEXT] [--original-label TEXT]
 *
 * DIR is the dist/ of a baseline build; this checkout's dist/ is compared.
 * The baseline is the base commit with the Placidus change carried onto it
 * (src/houses.ts of the branch), so that the comparison isolates what the
 * window entry point adds; --original, the dist/ of the base commit as it is,
 * adds the root entry's size before the Placidus change.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "../../..");
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
assert(args.get("--baseline"), "Usage: node package-check.mjs --baseline DIR [--out FILE]");
const baseline = resolve(args.get("--baseline"));
const current = resolve(root, "dist");
const out = resolve(args.get("--out") ?? resolve(here, "package-check.json"));

const files = (dir) => readdirSync(dir).sort();
const read = (dir, name) => readFileSync(join(dir, name), "utf8");

// 1. JavaScript byte identity.
const baselineJs = files(baseline).filter((name) => name.endsWith(".js"));
const changedJs = baselineJs.filter((name) => read(baseline, name) !== read(current, name));
const addedJs = files(current).filter((name) => name.endsWith(".js") && !baselineJs.includes(name));

// 2. Declarations up to the rollup's chunk names and aliases. A shared chunk
// ends with `export { type Name as a, ... }`; entries import `a as Name` from
// it. Each alias must name the same declaration it names in its chunk, and
// with aliases and chunk names replaced by the declared names the files must
// be equal.
function canonicalDeclarations(dir) {
  const names = files(dir).filter((name) => name.endsWith(".d.ts"));
  const chunks = names.filter((name) => /-[A-Za-z0-9_-]{8}\.d\.ts$/.test(name));
  const aliases = new Map();
  for (const chunk of chunks) {
    const text = read(dir, chunk);
    const last = text.trimEnd().split("\n").at(-1);
    const map = new Map();
    for (const item of last.replace(/^export \{|\};?$/g, "").split(",")) {
      const [name, alias] = item.replace(/\btype\s+/, "").trim().split(/\s+as\s+/);
      map.set(alias ?? name, name);
    }
    aliases.set(chunk.replace(/\.d\.ts$/, ".js"), map);
  }
  const stem = (chunk) => chunk.replace(/-[A-Za-z0-9_-]{8}\.js$/, "-CHUNK.js");
  const canonical = new Map();
  for (const name of names) {
    let text = read(dir, name);
    if (chunks.includes(name)) {
      const lines = text.trimEnd().split("\n");
      const exported = [...aliases.get(name.replace(/\.d\.ts$/, ".js")).values()].sort();
      text = `${lines.slice(0, -1).join("\n")}\nexport { ${exported.join(", ")} };\n`;
    }
    text = text.replace(/(import|export) \{([^}]*)\} from '\.\/([^']+)';/g, (all, verb, list, from) => {
      const map = aliases.get(from);
      if (!map) return all;
      const resolved = list.split(",").map((item) => {
        const [alias, local] = item.replace(/\btype\s+/, "").trim().split(/\s+as\s+/);
        const declared = map.get(alias);
        assert(declared, `${name} uses unknown alias ${alias} of ${from}`);
        assert.equal(local ?? declared, declared, `alias ${alias} of ${from} is ${declared}, used as ${local}`);
        return declared;
      });
      return `${verb} { ${resolved.sort().join(", ")} } from './${stem(from)}';`;
    });
    canonical.set(chunks.includes(name) ? stem(name.replace(/\.d\.ts$/, ".js")) : name, text);
  }
  return canonical;
}
const before = canonicalDeclarations(baseline);
const after = canonicalDeclarations(current);
const changedDeclarations = [...before.keys()].filter((name) => before.get(name) !== after.get(name));
// The shared types chunk may gain exports the new entry uses; the rest must match.
const typeChunk = [...before.keys()].find((name) => name.startsWith("types-"));
const onlyAdded = changedDeclarations.every((name) => {
  if (name !== typeChunk) return false;
  const [b, a] = [before.get(name), after.get(name)];
  const body = (text) => text.trimEnd().split("\n").slice(0, -1).join("\n");
  const exported = (text) => text.trimEnd().split("\n").at(-1).replace(/^export \{ | \};$/g, "").split(", ");
  return body(b) === body(a) && exported(b).every((item) => exported(a).includes(item));
});

// 3. Sizes.
async function bundle(contents, dir) {
  const result = await build({
    stdin: { contents, resolveDir: dir, loader: "js" },
    bundle: true,
    format: "esm",
    minify: true,
    write: false,
    external: ["astronomy-engine"],
    logLevel: "silent"
  });
  const code = result.outputFiles[0].contents;
  return { minified: code.length, gzip: gzipSync(code, { level: 9 }).length };
}
const original = args.get("--original") ? resolve(args.get("--original")) : null;
const sizes = {
  ...(original ? { rootOriginal: await bundle(`export * from "./index.js";`, original) } : {}),
  rootBaseline: await bundle(`export * from "./index.js";`, baseline),
  root: await bundle(`export * from "./index.js";`, current),
  window: await bundle(`export * from "./window.js";`, current),
  rootAndWindow: await bundle(`export * from "./index.js"; export * from "./window.js";`, current)
};
sizes.windowAddsToRoot = {
  minified: sizes.rootAndWindow.minified - sizes.root.minified,
  gzip: sizes.rootAndWindow.gzip - sizes.root.gzip
};
const own = await build({
  entryPoints: [join(current, "window.js")],
  bundle: false,
  minify: true,
  write: false,
  format: "esm",
  logLevel: "silent"
});
sizes.windowModuleAlone = { minified: own.outputFiles[0].contents.length, gzip: gzipSync(own.outputFiles[0].contents, { level: 9 }).length };

// 4. npm pack's report, without scripts, for this checkout.
const pack = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root, encoding: "utf8" }))[0];
const report = {
  baseline: args.get("--baseline-label") ?? baseline,
  ...(original ? { original: args.get("--original-label") ?? original } : {}),
  javascript: { baselineFiles: baselineJs.length, changed: changedJs, added: addedJs },
  declarations: { baselineFiles: before.size, changedAfterResolvingAliases: changedDeclarations, onlyAddedExportsInSharedTypes: onlyAdded },
  sizes,
  pack: { packed: pack.size, unpacked: pack.unpackedSize, files: pack.files.length, gateUnpacked: 300_000, headroom: 300_000 - pack.unpackedSize },
  windowFiles: pack.files.filter((file) => file.path.startsWith("dist/window")).map((file) => ({ path: file.path, bytes: file.size }))
};
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(changedJs, [], "a baseline JavaScript file changed");
assert(onlyAdded, "a baseline declaration changed beyond added shared exports");
assert(pack.unpackedSize < 300_000, "package over the unpacked-size gate");
