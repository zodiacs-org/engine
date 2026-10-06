// Each entry point's import graph in two builds, compared file by file: the
// JavaScript a plain `import` of the entry loads, statically and
// transitively, as scripts/verify-package-contents.mjs counts it, with the
// zone histories' dynamic imports followed too. For each entry the graphs are
// "identical" when they are the same files with the same bytes; otherwise
// they are compared again with esbuild's content-hashed chunk names
// (`chunk-XXXXXXXX.js`) and the value of `var ENGINE_VERSION = "...";`
// written out of every file, and are "same but for chunk names and version"
// when the sorted texts then agree. Changing the version changes the chunk
// that holds ENGINE_VERSION, and so its hashed name, and so the names in
// every file that imports it, and theirs in turn: the second comparison shows
// whether anything else changed. Prints one line per entry.
//
//   node graph-compare.mjs <dist directory> <dist directory>
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [a, b] = process.argv.slice(2);
if (!a || !b) throw new Error("usage: node graph-compare.mjs <dist directory> <dist directory>");

const ENTRIES = ["index.js", "calc.js", "crossings.js", "deltat.js", "geo.js", "houses-extra.js", "internal.js", "internal-math.js", "receipt.js", "sky.js", "techniques.js", "timing.js", "vedic.js", "window.js"];

/** The dist files an entry loads, its own included. */
function graph(dir, file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const text = readFileSync(join(dir, file), "utf8");
  for (const match of text.matchAll(/(?:import|export)\s*(?:[^'"]*?from\s*)?["'](\.\/[^"']+)["']/gu)) graph(dir, match[1].slice(2), seen);
  for (const match of text.matchAll(/import\(\s*["'](\.\/[^"']+)["']\s*\)/gu)) graph(dir, match[1].slice(2), seen);
  return seen;
}

const bytes = (dir, files) => files.reduce((sum, file) => sum + readFileSync(join(dir, file)).length, 0);
const normalized = (dir, file) =>
  readFileSync(join(dir, file), "utf8")
    .replace(/chunk-[A-Z0-9]{8}\.js/gu, "chunk.js")
    .replace(/var ENGINE_VERSION = "[^"]*";/gu, "var ENGINE_VERSION = VERSION;");

for (const entry of ENTRIES) {
  if (!existsSync(join(a, entry)) || !existsSync(join(b, entry))) {
    console.log(`${entry}: in ${existsSync(join(a, entry)) ? "the first build only" : existsSync(join(b, entry)) ? "the second build only" : "neither build"}`);
    continue;
  }
  const first = [...graph(a, entry)].sort();
  const second = [...graph(b, entry)].sort();
  const sizes = `${first.length} files, ${bytes(a, first)} bytes; ${second.length} files, ${bytes(b, second)} bytes`;
  const identical = first.length === second.length && first.every((file, i) => file === second[i] && readFileSync(join(a, file)).equals(readFileSync(join(b, file))));
  if (identical) {
    console.log(`${entry}: identical (${sizes})`);
    continue;
  }
  const textsA = first.map((file) => normalized(a, file)).sort();
  const textsB = second.map((file) => normalized(b, file)).sort();
  const same = textsA.length === textsB.length && textsA.every((text, i) => text === textsB[i]);
  console.log(`${entry}: ${same ? "same but for chunk names and version" : "differs"} (${sizes})`);
}
