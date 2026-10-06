// The public API of @zodiacs/engine, written out from the built declarations.
//
//   node scripts/api-report.mjs          # write api/*.api.md from dist/
//   node scripts/api-report.mjs --check  # exit 1 if dist/ declares anything else
//
// Run after `npm run build`. Each public entry point in package.json's
// "exports" gets one file: its exported declarations as dist/*.d.ts gives them,
// without comments, sorted by name, and then every declaration they refer to
// that the entry point does not export, with the entry points that do. What
// these files hold is what docs/versioning.md promises not to break within a
// major version, so a change to one is a change to the API: --check makes CI
// fail until the file is regenerated and committed with the change.
//
// The two internal entry points are left out on purpose: README.md, "Internal
// site entry points", says they carry no semantic-versioning guarantee.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

export const INTERNAL_ENTRIES = Object.freeze(["./internal", "./internal/math"]);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The file name an entry point's report is written to: "." is "engine", "./calc" is "calc". */
export function reportName(subpath) {
  return subpath === "." ? "engine" : subpath.slice(2).replaceAll("/", "-");
}

function importName(packageName, subpath) {
  return subpath === "." ? packageName : `${packageName}/${subpath.slice(2)}`;
}

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

/**
 * The release tags docs/versioning.md gives a meaning to, as they stand in a
 * declaration's documentation comment. The comments themselves are left out of
 * the report; these two tags are not, because each changes what the
 * declaration promises.
 */
export const RELEASE_TAGS = Object.freeze(["deprecated", "experimental"]);

/** A declaration as source text, comments removed, without `export` or `export default`, after its release tags. */
function print(node) {
  const target = ts.isVariableDeclaration(node) && node.parent.declarations.length === 1
    ? node.parent.parent
    : node;
  let text = printer.printNode(ts.EmitHint.Unspecified, target, target.getSourceFile());
  if (ts.isVariableDeclaration(target)) text = `declare const ${text};`;
  const tagged = ts.isVariableDeclaration(node) ? [node, node.parent.parent] : [node];
  const tags = new Set(tagged.flatMap((each) => ts.getJSDocTags(each).map((tag) => tag.tagName.text))
    .filter((name) => RELEASE_TAGS.includes(name)));
  const head = [...tags].sort().map((name) => `/** @${name} */\n`).join("");
  return head + text.replace(/^export (default )?/u, "");
}

/** The node whose text stands for a declaration: a variable's statement, or the declaration itself. */
function owner(declaration) {
  return ts.isVariableDeclaration(declaration) ? declaration.parent.parent : declaration;
}

/**
 * Every public entry point's report, as a map from file name to text. Reads
 * `packageDir`'s package.json and the declaration files its "exports" name.
 */
export function buildApiReports(packageDir = ROOT) {
  const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const entries = Object.entries(pkg.exports)
    .filter(([subpath]) => !INTERNAL_ENTRIES.includes(subpath))
    .map(([subpath, target]) => ({ subpath, file: resolve(packageDir, target.types) }))
    .sort((a, b) => (a.subpath < b.subpath ? -1 : a.subpath > b.subpath ? 1 : 0));
  const distDir = resolve(packageDir, "dist");
  const program = ts.createProgram(entries.map((entry) => entry.file), {
    strict: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    types: [],
    noEmit: true,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    const host = { getCanonicalFileName: (f) => f, getCurrentDirectory: () => packageDir, getNewLine: () => "\n" };
    throw new Error(`the declarations do not compile:\n${ts.formatDiagnostics(diagnostics, host)}`);
  }
  const checker = program.getTypeChecker();
  const resolveAlias = (symbol) => (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
  const inPackage = (node) => {
    const file = node.getSourceFile().fileName;
    return resolve(file).startsWith(distDir + sep);
  };

  // Which entry points export each declaration, and under which name.
  const exportedAs = new Map();
  const exportsOf = new Map();
  for (const entry of entries) {
    const source = program.getSourceFile(entry.file);
    if (!source) throw new Error(`no declarations at ${relative(packageDir, entry.file)}`);
    const moduleSymbol = checker.getSymbolAtLocation(source);
    const list = checker.getExportsOfModule(moduleSymbol)
      .map((symbol) => ({ name: symbol.name, target: resolveAlias(symbol) }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    exportsOf.set(entry.subpath, list);
    for (const { name, target } of list) {
      for (const declaration of target.declarations ?? []) {
        const key = owner(declaration);
        const names = exportedAs.get(key) ?? [];
        names.push(`${importName(pkg.name, entry.subpath)} (${name})`);
        exportedAs.set(key, names);
      }
    }
  }

  const reports = new Map();
  for (const entry of entries) {
    const exported = new Set();
    const exportedText = [];
    for (const { name, target } of exportsOf.get(entry.subpath)) {
      const declarations = target.declarations ?? [];
      if (!declarations.length) throw new Error(`${entry.subpath} exports ${name} with no declaration`);
      for (const declaration of declarations) exported.add(owner(declaration));
      const declaredName = target.name;
      const head = declaredName === name ? "" : `// exported as ${name}\n`;
      exportedText.push(head + declarations.map((declaration) => print(declaration)).join("\n"));
    }

    // Declarations the exported ones refer to, followed to the end, that this
    // entry point does not export. Type parameters and the language's own
    // types (Date, Record, ...) are not followed; a type from another package
    // is listed by name.
    const referenced = new Map();
    const external = new Set();
    const visit = (node) => {
      let name;
      if (ts.isTypeReferenceNode(node)) name = node.typeName;
      else if (ts.isExpressionWithTypeArguments(node)) name = node.expression;
      else if (ts.isTypeQueryNode(node)) name = node.exprName;
      if (name) {
        const identifier = ts.isQualifiedName(name) ? name.left : name;
        const symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(identifier) ? identifier.expression : identifier);
        if (symbol) {
          const target = resolveAlias(symbol);
          if (!(target.flags & ts.SymbolFlags.TypeParameter)) {
            for (const declaration of target.declarations ?? []) {
              if (inPackage(declaration)) {
                const key = owner(declaration);
                if (!exported.has(key) && !referenced.has(key)) {
                  referenced.set(key, target);
                  visit(key);
                }
              } else {
                const file = declaration.getSourceFile().fileName;
                if (!program.isSourceFileDefaultLibrary(declaration.getSourceFile())) {
                  const match = /node_modules\/((?:@[^/]+\/)?[^/]+)\//u.exec(file.replaceAll("\\", "/"));
                  external.add(`${match ? match[1] : relative(packageDir, file)}: ${target.name}`);
                }
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    for (const key of exported) visit(key);

    const referencedText = [...referenced.entries()]
      .map(([key, target]) => ({ key, name: target.name }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (print(a.key) < print(b.key) ? -1 : 1))
      .map(({ key }) => {
        const elsewhere = exportedAs.get(key);
        const head = elsewhere ? `// exported by ${elsewhere.join(", ")}` : "// not exported by any entry point";
        return `${head}\n${print(key)}`;
      });

    const id = importName(pkg.name, entry.subpath);
    const lines = [
      `# ${id}`,
      "",
      `The public declarations of \`${id}\`, as \`${relative(packageDir, entry.file).replaceAll("\\", "/")}\` gives them,`,
      "without comments. Generated by `scripts/api-report.mjs`; do not edit.",
      "`npm run api:check` fails when the build declares anything else. Within a",
      "major version these declarations change only as `docs/versioning.md` allows.",
      "",
      `## Exported (${exportsOf.get(entry.subpath).length})`,
      "",
      "```ts",
      exportedText.join("\n\n"),
      "```",
    ];
    if (referencedText.length) {
      lines.push("", `## Referenced, not exported here (${referencedText.length})`, "", "```ts", referencedText.join("\n\n"), "```");
    }
    if (external.size) {
      lines.push("", "## Types from other packages", "", ...[...external].sort().map((item) => `- ${item}`));
    }
    reports.set(`${reportName(entry.subpath)}.api.md`, `${lines.join("\n")}\n`);
  }
  return reports;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  const check = process.argv.includes("--check");
  const apiDir = join(ROOT, "api");
  const reports = buildApiReports(ROOT);
  if (check) {
    const problems = [];
    const present = existsSync(apiDir) ? readdirSync(apiDir).filter((name) => name.endsWith(".api.md")) : [];
    for (const [name, text] of reports) {
      const path = join(apiDir, name);
      if (!existsSync(path)) problems.push(`api/${name} is missing`);
      else if (readFileSync(path, "utf8") !== text) problems.push(`api/${name} differs from the build's declarations`);
    }
    for (const name of present) if (!reports.has(name)) problems.push(`api/${name} names no public entry point`);
    if (problems.length) {
      console.error(`api-report: the public API changed:\n- ${problems.join("\n- ")}\nIf the change is meant, run npm run api:report and commit api/ with a CHANGELOG entry (docs/versioning.md).`);
      process.exit(1);
    }
    console.log(`api-report: ${reports.size} entry points match api/`);
  } else {
    rmSync(apiDir, { recursive: true, force: true });
    mkdirSync(apiDir, { recursive: true });
    for (const [name, text] of reports) writeFileSync(join(apiDir, name), text);
    console.log(`api-report: wrote ${reports.size} files to api/`);
  }
}
