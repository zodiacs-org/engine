// Whether bundlers leave out each table of the build when nothing reads it.
// For every table that scripts/pure-tables.mjs finds in the built files (the
// zone-history shards apart), writes a module that holds the table's
// declaration and, verbatim, every declaration of the table's own module it
// reads, and theirs in turn; each other name it reads, but the globals in
// GLOBALS below (a wider list than the rule's own, since it only says what
// to leave as the build has it), is imported from a module the bundlers are
// told is external, so that they cannot see into it.
// A program imports that module and reads nothing. Bundles the program with
// esbuild (the engine's own), plain and minified, Rollup and Rolldown, and
// again with the table's declaration taken out: the table is left out when
// the two bundles are the same, but for the import from outside, which a
// bundler keeps and a minifier names as it likes, and the module's file name.
// Prints, for each table, each bundler's verdict. The built files are the
// checkout's, or those of the package directory given last, such as an
// unpacked archive; the rule, TypeScript and esbuild are the checkout's.
//
//   node tables-dropped.mjs <engine checkout> <Rollup package directory> <Rolldown package directory> [<package directory>]
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [checkout, rollupDirectory, rolldownDirectory, built] = process.argv.slice(2).map((path) => path && resolve(path));
const packageDirectory = built ?? checkout;
if (!checkout || !rollupDirectory || !rolldownDirectory) {
  console.error("usage: node tables-dropped.mjs <engine checkout> <Rollup package directory> <Rolldown package directory> [<package directory>]");
  process.exit(2);
}
const require = createRequire(join(checkout, "package.json"));
const ts = require("typescript");
const esbuild = require("esbuild");
const { tables, UNMARKED_SOURCE } = await import(pathToFileURL(join(checkout, "scripts/pure-tables.mjs")).href);
/** A package's ES module entry, from its exports map. */
const entryOf = (directory) => {
  const exported = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).exports["."];
  const target = typeof exported === "string" ? exported : exported.import?.default ?? exported.import ?? exported.default;
  return pathToFileURL(join(directory, target)).href;
};
const { rollup } = await import(entryOf(rollupDirectory));
const { rolldown } = await import(entryOf(rolldownDirectory));
const GLOBALS = new Set([
  "Object", "Array", "Math", "Date", "Number", "String", "Boolean", "Set", "Map", "WeakSet", "WeakMap", "JSON", "Symbol", "BigInt",
  "RegExp", "Error", "RangeError", "TypeError", "Float64Array", "Intl", "Reflect", "Promise", "undefined", "Infinity", "NaN",
  "isFinite", "isNaN", "globalThis", "arguments"
]);
const EXTERNAL = "outside-the-module";
/** A bundle without its import from outside and the names of the files bundled. */
const normalize = (code, file) =>
  code.replace(new RegExp(`import\\s*(?:\\{[^}]*\\}\\s*from\\s*)?["']${EXTERNAL}["'];?`, "gu"), "").replaceAll(file, "").trim();

/** The names a node reads that it does not declare itself. */
function freeNames(node) {
  const read = new Set();
  const bound = new Set();
  const visit = (child) => {
    if (ts.isIdentifier(child)) {
      const parent = child.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.name === child) return;
      if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isGetAccessorDeclaration(parent) ||
        ts.isSetAccessorDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.name === child) return;
      if ((ts.isParameter(parent) || ts.isBindingElement(parent) || ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent) ||
        ts.isFunctionExpression(parent) || ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) && parent.name === child) {
        bound.add(child.text);
        return;
      }
      if (ts.isBindingElement(parent) && parent.propertyName === child) return;
      if (ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) return;
      read.add(child.text);
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return [...read].filter((name) => !bound.has(name) && !GLOBALS.has(name));
}

/** The names a top-level statement declares. */
function declared(statement) {
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) return [statement.name.text];
  if (!ts.isVariableStatement(statement)) return [];
  const names = [];
  const collect = (name) => {
    if (ts.isIdentifier(name)) names.push(name.text);
    else for (const element of name.elements) if (!ts.isOmittedExpression(element)) collect(element.name);
  };
  for (const declaration of statement.declarationList.declarations) collect(declaration.name);
  return names;
}

const bundlers = [
  ["esbuild", (entry) => esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", external: [EXTERNAL], write: false, logLevel: "silent" }).then((result) => result.outputFiles[0].text)],
  ["esbuildMinified", (entry) => esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", minify: true, external: [EXTERNAL], write: false, logLevel: "silent" }).then((result) => result.outputFiles[0].text)],
  ["rollup", async (entry) => (await (await rollup({ input: entry, external: [EXTERNAL], onwarn() {} })).generate({ format: "es" })).output.map((chunk) => chunk.code ?? "").join("")],
  ["rolldown", async (entry) => (await (await rolldown({ input: entry, external: [EXTERNAL], onLog() {} })).generate({ format: "es" })).output.map((chunk) => chunk.code ?? "").join("")]
];

const work = mkdtempSync(join(tmpdir(), "tables-dropped-"));
try {
  const seen = new Set();
  let index = 0;
  for (const file of readdirSync(join(packageDirectory, "dist")).filter((name) => name.endsWith(".js") && !name.startsWith("tzdb-")).sort()) {
    const code = readFileSync(join(packageDirectory, "dist", file), "utf8");
    const starts = [...code.matchAll(/^\/\/ (src\/.*\S)[ \t]*$/gmu)].map((match) => ({ at: match.index, module: match[1] }));
    const module = (position) => {
      let name = "";
      for (const start of starts) if (start.at < position) name = start.module;
      return name;
    };
    const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const statements = source.statements.map((statement, order) => ({ statement, order, module: module(statement.getStart(source)) }));
    for (const table of tables(code, { fileName: file, module })) {
      // A table that more than one built file holds (a chunk's copy) is probed once.
      const key = `${table.module}\u0000${table.statement}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const own = statements.filter((entry) => entry.module === table.module);
      const byName = new Map(own.flatMap((entry) => declared(entry.statement).map((name) => [name, entry])));
      const home = own.find((entry) => entry.statement.getText(source) === table.statement);
      // The table's own module's declarations it reads, and theirs, verbatim; the rest imported from outside.
      const included = new Set();
      const outside = new Set();
      const queue = [home];
      while (queue.length) {
        const entry = queue.pop();
        for (const name of freeNames(entry.statement)) {
          const found = byName.get(name);
          if (found && found !== home) {
            if (!included.has(found)) {
              included.add(found);
              queue.push(found);
            }
          } else if (!found && !declared(home.statement).includes(name)) outside.add(name);
        }
      }
      const helpers = [...included].sort((a, b) => a.order - b.order).map((entry) => entry.statement.getText(source));
      const header = outside.size ? `import { ${[...outside].sort().join(", ")} } from "${EXTERNAL}";\n` : "";
      const directory = join(work, String(index++));
      mkdirSync(directory);
      writeFileSync(join(directory, "with.js"), `${header}${helpers.join("\n")}\n${table.statement}\n`);
      writeFileSync(join(directory, "without.js"), `${header}${helpers.join("\n")}\n`);
      writeFileSync(join(directory, "entry-with.js"), 'import "./with.js";\n');
      writeFileSync(join(directory, "entry-without.js"), 'import "./without.js";\n');
      const verdict = {};
      for (const [label, bundle] of bundlers) {
        const [withTable, withoutTable] = [await bundle(join(directory, "entry-with.js")), await bundle(join(directory, "entry-without.js"))];
        verdict[label] = normalize(withTable, "with.js") === normalize(withoutTable, "without.js") ? "dropped" : "kept";
      }
      console.log(JSON.stringify({ module: table.module, name: table.name, exempt: UNMARKED_SOURCE.test(table.module), helpers: helpers.length, outside: outside.size, ...verdict }));
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
