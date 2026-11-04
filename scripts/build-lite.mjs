// The build of @zodiacs/engine/lite, which `npm run build` runs after tsup.
//
// tsup builds the other entry points with code splitting, so a module that
// two of them load sits in a chunk they share, and a chunk can hold or import
// the ephemeris. ./lite must load no ephemeris (docs/lite.md), so it takes no
// part in that: esbuild, the version tsup runs, bundles each of its four parts,
// src/lite/<part>.ts, on its own and without splitting into
// dist/lite-<part>.js, which imports nothing; a module two parts use is copied
// into both. This script writes, beside tsup's output:
//
// - dist/lite-declinations.js, dist/lite-sect.js, dist/lite-composite.js and
//   dist/lite-dignities.js, unminified, so that the `// src/...` markers and
//   the pure marks the export smoke test reads stay in them;
// - dist/lite.js: the four export lines of src/lite.ts, each naming its
//   part's file, and nothing else;
// - dist/lite.d.ts: the declarations, by re-export from dist/index.d.ts (the
//   declination part) and dist/techniques.d.ts (the composite and dignity
//   parts), so that each name has one declaration in the package, and the
//   sect part's own, as TypeScript emits them from src/sect.ts, which imports
//   no type;
// - dist/metafile-lite.json: esbuild's module list of the four parts, with a
//   record for dist/lite.js and one for src/lite.ts, which the export smoke
//   test reads together with tsup's dist/metafile-esm.json
//   (readModuleList in scripts/root-isolation.mjs).
//
// The metafile is not packed (package.json "files"). It prints each file's
// bytes. The checks of the built entry are scripts/lite-entry.mjs's.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const at = (path) => new URL(`../${path}`, import.meta.url);

// 1. src/lite.ts holds the four export lines, in this order, and comments.
const PARTS = ["declinations", "sect", "composite", "dignities"];
const entryText = readFileSync(at("src/lite.ts"), "utf8");
const lines = entryText
  .replace(/\/\*[\s\S]*?\*\//gu, "")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("//"));
assert.deepEqual(lines, PARTS.map((part) => `export * from "./lite/${part}.js";`),
  "src/lite.ts must hold only comments and the four export lines of its parts, in the order declinations, sect, composite, dignities");

// 2. The four parts, each its own bundle, in one esbuild call.
const target = JSON.parse(readFileSync(at("tsconfig.base.json"), "utf8")).compilerOptions.target.toLowerCase();
assert.equal(target, "es2022", "the lite parts take tsconfig.base.json's target");
const result = await build({
  absWorkingDir: ROOT,
  entryPoints: Object.fromEntries(PARTS.map((part) => [`lite-${part}`, `src/lite/${part}.ts`])),
  bundle: true,
  splitting: false,
  format: "esm",
  platform: "neutral",
  target,
  tsconfig: "tsconfig.build.json",
  metafile: true,
  minify: false,
  outdir: "dist",
  write: true,
  logLevel: "warning"
});
const metafile = result.metafile;
assert.deepEqual(Object.keys(metafile.outputs).sort(), PARTS.map((part) => `dist/lite-${part}.js`).sort(),
  "esbuild wrote other files than the four lite parts");
for (const [path, output] of Object.entries(metafile.outputs)) {
  assert.deepEqual(output.imports, [], `${path} imports a module; each lite part must import nothing`);
}

// 3. dist/lite.js: src/lite.ts's export lines, each naming its part's file.
const liteJs = PARTS.map((part) => `export * from "./lite-${part}.js";\n`).join("");
writeFileSync(at("dist/lite.js"), liteJs);

// 4. The module list, with dist/lite.js and src/lite.ts in it.
metafile.outputs["dist/lite.js"] = {
  imports: PARTS.map((part) => ({ path: `dist/lite-${part}.js`, kind: "import-statement" })),
  exports: PARTS.flatMap((part) => metafile.outputs[`dist/lite-${part}.js`].exports).sort(),
  entryPoint: "src/lite.ts",
  inputs: { "src/lite.ts": { bytesInOutput: Buffer.byteLength(liteJs) } },
  bytes: Buffer.byteLength(liteJs)
};
metafile.inputs["src/lite.ts"] = {
  bytes: Buffer.byteLength(entryText),
  imports: PARTS.map((part) => ({ path: `src/lite/${part}.ts`, kind: "import-statement", original: `./lite/${part}.js` })),
  format: "esm"
};
writeFileSync(at("dist/metafile-lite.json"), JSON.stringify(metafile));

// 5. dist/lite.d.ts. Each part's export lists, read from its source.
function exportLists(part) {
  const source = ts.createSourceFile(`${part}.ts`, readFileSync(at(`src/lite/${part}.ts`), "utf8"), ts.ScriptTarget.ES2022, true);
  const lists = { from: null, values: [], types: [] };
  for (const statement of source.statements) {
    assert(ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause) && statement.moduleSpecifier,
      `src/lite/${part}.ts may hold only export lists from one module`);
    const from = statement.moduleSpecifier.text;
    assert(lists.from === null || lists.from === from, `src/lite/${part}.ts re-exports from two modules`);
    lists.from = from;
    for (const element of statement.exportClause.elements) {
      assert(!element.propertyName, `src/lite/${part}.ts renames ${element.name.text}`);
      (statement.isTypeOnly || element.isTypeOnly ? lists.types : lists.values).push(element.name.text);
    }
  }
  return lists;
}
const DECLARED_BY = { declinations: "./index.js", composite: "./techniques.js", dignities: "./techniques.js" };
const SOURCE_OF = { declinations: "../declination.js", sect: "../sect.js", composite: "../techniques/composite.js", dignities: "../techniques/dignities.js" };
/** The sect part's declarations, as TypeScript emits them from src/sect.ts. */
function sectDeclarations() {
  const config = ts.getParsedCommandLineOfConfigFile(fileURLToPath(at("tsconfig.build.json")), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    }
  });
  const options = {
    ...config.options, declaration: true, emitDeclarationOnly: true, declarationMap: false, sourceMap: false,
    noEmit: false, composite: false, incremental: false, tsBuildInfoFile: undefined
  };
  const file = fileURLToPath(at("src/sect.ts"));
  const program = ts.createProgram([file], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnostics(diagnostics, { getCanonicalFileName: (name) => name, getCurrentDirectory: () => ROOT, getNewLine: () => "\n" }));
  let text = null;
  program.emit(program.getSourceFile(file), (name, data) => {
    if (name.endsWith("sect.d.ts")) text = data;
  }, undefined, true);
  assert(text !== null, "TypeScript emitted no declarations for src/sect.ts");
  assert(!/^\s*import\b|\bfrom\s*["'][^"']+["']\s*;/mu.test(text), "src/sect.ts's declarations import a module; the sect part's must stand alone");
  return text.trimEnd();
}
const declarationText = PARTS.map((part) => {
  const lists = exportLists(part);
  assert.equal(lists.from, SOURCE_OF[part], `src/lite/${part}.ts must re-export ${SOURCE_OF[part]}`);
  if (part === "sect") return sectDeclarations();
  const from = DECLARED_BY[part];
  return [
    `export { ${lists.values.join(", ")} } from '${from}';`,
    `export type { ${lists.types.join(", ")} } from '${from}';`
  ].join("\n");
}).join("\n") + "\n";
writeFileSync(at("dist/lite.d.ts"), declarationText);
// The declarations compile, as the API report and a consumer read them.
{
  const program = ts.createProgram([fileURLToPath(at("dist/lite.d.ts"))], {
    strict: true, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022,
    types: [], noEmit: true
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, `dist/lite.d.ts does not compile:\n${ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (name) => name, getCurrentDirectory: () => ROOT, getNewLine: () => "\n"
  })}`);
}

// 6. The files and their bytes.
for (const name of ["lite.js", ...PARTS.map((part) => `lite-${part}.js`), "lite.d.ts", "metafile-lite.json"]) {
  console.log(`lite: dist/${name} ${Buffer.byteLength(readFileSync(at(`dist/${name}`)))} bytes`);
}
