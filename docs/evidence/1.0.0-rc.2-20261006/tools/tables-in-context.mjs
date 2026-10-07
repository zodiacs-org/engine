// Which tables a program keeps when it loads an entry point of the package
// but reads nothing from it: a table is kept by its own declaration, which
// tables-dropped.mjs probes alone, and by whatever else a program keeps that
// reads it. Copies the built files of the checkout, or of the package
// directory given last, such as an unpacked archive, into a directory with no
// package.json, so that the bundlers take each file to have effects and keep
// whatever in it they cannot leave out. For each entry point of the package's
// exports map, bundles a program that imports it and nothing else with
// esbuild (the engine's own), Rollup and Rolldown, astronomy-engine left
// outside: esbuild unminified, since writing a table `void 0` can change the
// names its minifier gives, so that its two bundles may differ though neither
// keeps the table, and the other two at their defaults. It bundles each
// program once as built, and once for each table that scripts/pure-tables.mjs
// finds in a file the entry point loads (the zone-history shards apart), with
// the table's initializer written `void 0`. The program keeps the table when
// the two bundles differ, in whatever form the bundler gave it: a
// declaration, a bare statement or an inlined value. When writing every such
// table `void 0` at once changes nothing, the program keeps none of them, and
// the tables are not bundled one by one. Prints, for each table, the entry
// points whose program keeps it under each bundler.
//
//   node tables-in-context.mjs <engine checkout> <Rollup package directory> <Rolldown package directory> [<package directory>]
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [checkout, rollupDirectory, rolldownDirectory, built] = process.argv.slice(2).map((path) => path && resolve(path));
const packageDirectory = built ?? checkout;
if (!checkout || !rollupDirectory || !rolldownDirectory) {
  console.error("usage: node tables-in-context.mjs <engine checkout> <Rollup package directory> <Rolldown package directory> [<package directory>]");
  process.exit(2);
}
const require = createRequire(join(checkout, "package.json"));
const ts = require("typescript");
const esbuild = require("esbuild");
const { tables, UNMARKED_SOURCE } = await import(pathToFileURL(join(checkout, "scripts/pure-tables.mjs")).href);
const entryOf = (directory) => {
  const exported = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).exports["."];
  const target = typeof exported === "string" ? exported : exported.import?.default ?? exported.import ?? exported.default;
  return pathToFileURL(join(directory, target)).href;
};
const { rollup } = await import(entryOf(rollupDirectory));
const { rolldown } = await import(entryOf(rolldownDirectory));
const OUTSIDE = ["astronomy-engine"];
const bundlers = [
  ["esbuild", (entry) => esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", external: OUTSIDE, write: false, logLevel: "silent" })
    .then((result) => result.outputFiles.map((file) => file.text).join("\n"))],
  ["rollup", async (entry) => (await (await rollup({ input: entry, external: OUTSIDE, onwarn() {} })).generate({ format: "es" })).output.map((chunk) => chunk.code ?? "").join("\n")],
  ["rolldown", async (entry) => (await (await rolldown({ input: entry, external: OUTSIDE, onLog() {} })).generate({ format: "es" })).output.map((chunk) => chunk.code ?? "").join("\n")]
];

/** A built file's tables, each with the span of its initializer. */
function tablesOf(file, code) {
  const starts = [...code.matchAll(/^\/\/ (src\/.*\S)[ \t]*$/gmu)].map((match) => ({ at: match.index, module: match[1] }));
  const module = (position) => {
    let name = "";
    for (const start of starts) if (start.at < position) name = start.module;
    return name;
  };
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const spans = new Map();
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer) spans.set(declaration.name.getText(source), [declaration.initializer.getStart(source), declaration.initializer.getEnd()]);
      }
    } else if (ts.isExportAssignment(statement)) spans.set(null, [statement.expression.getStart(source), statement.expression.getEnd()]);
  }
  return tables(code, { fileName: file, module }).map((table) => ({ file, ...table, span: spans.get(table.name) }));
}

/** The built files a file imports statically, and theirs. */
function graph(work, file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const code = readFileSync(join(work, file), "utf8");
  const specifiers = [
    ...code.matchAll(/(?:^|[;\s}])import\s*(?:[\w$*{}\s,]+from\s*)?["']([^"']+)["']/gu),
    ...code.matchAll(/(?:^|[;\s}])export\s*(?:\*|\{[^}]*\})\s*from\s*["']([^"']+)["']/gu)
  ].map((match) => match[1]).filter((specifier) => specifier.startsWith("."));
  for (const specifier of specifiers) graph(work, posix.normalize(posix.join(posix.dirname(file), specifier)), seen);
  return seen;
}

const work = mkdtempSync(join(tmpdir(), "tables-in-context-"));
try {
  const dist = join(packageDirectory, "dist");
  mkdirSync(join(work, "dist"));
  const files = readdirSync(dist).filter((name) => name.endsWith(".js")).sort();
  const text = new Map(files.map((name) => [`dist/${name}`, readFileSync(join(dist, name), "utf8")]));
  for (const [path, code] of text) writeFileSync(join(work, path), code);
  const found = files.filter((name) => !name.startsWith("tzdb-")).flatMap((name) => tablesOf(`dist/${name}`, text.get(`dist/${name}`)));
  const unspanned = found.filter((table) => !table.span);
  if (unspanned.length) throw new Error(`no initializer found for ${unspanned.map((table) => table.name).join(", ")}`);
  // The package's entry points, from its exports map.
  const exportsMap = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8")).exports;
  const entries = [...new Set(Object.values(exportsMap).map((value) => (typeof value === "string" ? value : value.import?.default ?? value.import ?? value.default))
    .filter((target) => typeof target === "string" && target.endsWith(".js")).map((target) => posix.normalize(target)))].sort();
  /** The file with the given tables' initializers written `void 0`. */
  const written = (path, chosen) => {
    let code = text.get(path);
    for (const table of chosen.filter((entry) => entry.file === path).sort((a, b) => b.span[0] - a.span[0])) {
      code = code.slice(0, table.span[0]) + "void 0" + code.slice(table.span[1]);
    }
    return code;
  };
  const bundleWith = async (bundle, program, chosen) => {
    const touched = [...new Set(chosen.map((table) => table.file))];
    for (const path of touched) writeFileSync(join(work, path), written(path, chosen));
    try {
      return await bundle(program);
    } finally {
      for (const path of touched) writeFileSync(join(work, path), text.get(path));
    }
  };
  const kept = new Map(found.map((table) => [table, Object.fromEntries(bundlers.map(([label]) => [label, []]))]));
  for (const entry of entries) {
    const program = join(work, `program-${entry.replace(/[^\w.-]/gu, "_")}.mjs`);
    writeFileSync(program, `import ${JSON.stringify(`./${posix.normalize(entry)}`)};\n`);
    const loaded = graph(work, posix.normalize(entry));
    const relevant = found.filter((table) => loaded.has(table.file));
    for (const [label, bundle] of bundlers) {
      const base = await bundle(program);
      if (await bundleWith(bundle, program, relevant) === base) continue;
      for (const table of relevant) {
        if (await bundleWith(bundle, program, [table]) !== base) kept.get(table)[label].push(entry);
      }
    }
  }
  for (const table of found) {
    console.log(JSON.stringify({ module: table.module, name: table.name, exempt: UNMARKED_SOURCE.test(table.module), ...kept.get(table) }));
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
