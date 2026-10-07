// Whether a bundler leaves out a table that names a global the module does
// not declare, or has a well-known symbol for a computed key. For each name
// in scripts/pure-tables.mjs's GLOBALS, and one that is no global, writes a
// module whose only table is a marked freeze of an array holding a marker
// string and the name; and for each name in its WELL_KNOWN_SYMBOLS, and one
// that is no well-known symbol, a table whose object has `[Symbol.NAME]` for a
// key, and a class, beside a table, with a method of that key that reads the
// table. A program imports only a function beside them, from a temporary
// directory; the probe bundles it with esbuild (the engine's own, from its
// node_modules), plain and minified, Rollup, and Rolldown, at its default and
// minified, and prints which of them keep the table.
//
//   node globals-probe.mjs <engine checkout> <Rollup package directory> <Rolldown package directory>
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [checkout, rollupDirectory, rolldownDirectory] = process.argv.slice(2).map((path) => path && resolve(path));
if (!checkout || !rollupDirectory || !rolldownDirectory) {
  console.error("usage: node globals-probe.mjs <engine checkout> <Rollup package directory> <Rolldown package directory>");
  process.exit(2);
}
const require = createRequire(join(checkout, "package.json"));
const esbuild = require("esbuild");
const entryOf = (directory) => {
  const exported = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).exports["."];
  const target = typeof exported === "string" ? exported : exported.import?.default ?? exported.import ?? exported.default;
  return pathToFileURL(join(directory, target)).href;
};
const { rollup, VERSION: rollupVersion } = await import(entryOf(rollupDirectory));
const { rolldown, VERSION: rolldownVersion } = await import(entryOf(rolldownDirectory));
// The checker's GLOBALS and WELL_KNOWN_SYMBOLS, read from its source, and a name in neither.
const checker = readFileSync(join(checkout, "scripts/pure-tables.mjs"), "utf8");
const list = (name) => {
  const listed = new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`, "u").exec(checker);
  if (!listed) throw new Error(`${name} not found in scripts/pure-tables.mjs`);
  return [...listed[1].matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
};
const names = [...list("GLOBALS"), "someGlobal"];
const symbols = [...list("WELL_KNOWN_SYMBOLS"), "notWellKnown"];
const output = (chunks) => chunks.map((chunk) => chunk.code ?? "").join("\n");
const bundlers = [
  ["esbuild", async (entry) => (await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", write: false, logLevel: "silent" })).outputFiles[0].text],
  ["esbuild, minified", async (entry) => (await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", minify: true, write: false, logLevel: "silent" })).outputFiles[0].text],
  ["Rollup", async (entry) => output((await (await rollup({ input: entry, onwarn() {} })).generate({ format: "es" })).output)],
  ["Rolldown", async (entry) => output((await (await rolldown({ input: entry, onLog() {} })).generate({ format: "es" })).output)],
  ["Rolldown, minified", async (entry) => output((await (await rolldown({ input: entry, onLog() {} })).generate({ format: "es", minify: true })).output)]
];
console.log(`esbuild ${esbuild.version}, Rollup ${rollupVersion}, Rolldown ${rolldownVersion}`);
console.log("Bundles that keep `export const T = /*#__PURE__*/ Object.freeze([marker, NAME])` in a program that imports only a function beside it:");
const directory = mkdtempSync(join(tmpdir(), "globals-probe-"));
try {
  for (const name of names) {
    const marker = `kept-${name}-marker`;
    writeFileSync(join(directory, "tables.js"), `export const T = /*#__PURE__*/ Object.freeze([${JSON.stringify(marker)}, ${name}]);\nexport function used() { return 1; }\n`);
    writeFileSync(join(directory, "entry.js"), 'import { used } from "./tables.js";\nexport const out = used();\n');
    const kept = [];
    for (const [label, bundle] of bundlers) if ((await bundle(join(directory, "entry.js"))).includes(marker)) kept.push(label);
    console.log(`  ${name}: ${kept.length ? kept.join("; ") : "none"}`);
  }
  console.log("Bundles that keep a table with the key `[Symbol.NAME]`, and one that a class beside it, with a method of that key, reads:");
  for (const name of symbols) {
    const marker = `kept-${name}-marker`;
    const results = [];
    for (const [form, code] of [
      ["table", `export const T = /*#__PURE__*/ Object.freeze({ list: [${JSON.stringify(marker)}], [Symbol.${name}]: 1 });\n`],
      ["class", `export const T = /*#__PURE__*/ Object.freeze([${JSON.stringify(marker)}]);\nexport class C { [Symbol.${name}]() { return T; } }\n`]
    ]) {
      writeFileSync(join(directory, "tables.js"), `${code}export function used() { return 1; }\n`);
      writeFileSync(join(directory, "entry.js"), 'import { used } from "./tables.js";\nexport const out = used();\n');
      const kept = [];
      for (const [label, bundle] of bundlers) if ((await bundle(join(directory, "entry.js"))).includes(marker)) kept.push(label);
      results.push(`${form}: ${kept.length ? kept.join("; ") : "none"}`);
    }
    console.log(`  Symbol.${name}: ${results.join(" | ")}`);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
