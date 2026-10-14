import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const project = fileURLToPath(new URL("../", import.meta.url));
const repository = path.dirname(project.slice(0, -1));
const ignored = new Set(["node_modules", ".cache", "generated", "coverage", "build"]);
const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.endsWith(".tsbuildinfo")) continue;
    const filename = path.join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Unexpected project symlink: ${filename}`);
    if (entry.isDirectory()) await collect(filename);
    else {
      assert(entry.isFile(), `Unexpected project file type: ${filename}`);
      assert((await stat(filename)).size < 2_000_000, `Project file reaches storage limit: ${filename}`);
      files.push(filename);
    }
  }
}
await collect(project);
for (const filename of files.filter((file) => file.endsWith(".md") || file.endsWith(".txt"))) {
  const content = await readFile(filename, "utf8");
  assert(!content.includes("\u2014"), `Em dash in project documentation: ${filename}`);
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^[a-z]+:/i.test(target) || target.startsWith("#")) continue;
    const resolved = path.resolve(path.dirname(filename), target.split("#")[0]);
    assert(!path.relative(repository, resolved).startsWith(".."), `Link leaves repository: ${target}`);
    await stat(resolved); // Keep project navigation reviewable as docs move.
  }
}

// Check the public library graph, including dynamic imports, without executing it.
const visited = new Set();
async function visit(filename) {
  if (visited.has(filename)) return;
  visited.add(filename);
  assert(!path.basename(filename).startsWith("cli-"), "CLI code reached the public library entry.");
  const content = await readFile(filename, "utf8");
  const source = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true);
  const imports = [];
  function scan(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (!(ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly : node.isTypeOnly)) {
        assert(ts.isStringLiteral(node.moduleSpecifier), "Library imports must be literal.");
        imports.push(node.moduleSpecifier.text);
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      assert(node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]), "Library dynamic imports must be literal.");
      imports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, scan);
  }
  scan(source);
  for (const specifier of imports) {
    if (specifier.startsWith(".")) {
      const resolved = path.resolve(path.dirname(filename), specifier.replace(/\.js$/, ".ts"));
      assert(!path.relative(path.join(project, "src"), resolved).startsWith(".."), "Library import leaves src/.");
      await visit(resolved);
    } else assert(["@zodiacs/engine", "@zodiacs/engine/calc", "@zodiacs/engine/receipt"].includes(specifier),
      `Unexpected library runtime dependency: ${specifier}`);
  }
}
await visit(path.join(project, "src/index.ts"));

// Documentation publishes resource contracts; prevent cap tables from drifting.
// The isolated build comes from npm test/build, never the engine checkout.
const api = await import("../build/index.js");
const cli = await import("../build/cli-request.js");
const limits = await readFile(path.join(project, "docs/receipts-and-limits.md"), "utf8");
const documented = [...limits.matchAll(/\| `(MAX_[A-Z_]+)` \| ([\d,]+)/g)];
assert.equal(documented.length, 8, "Expected all documented work and input cap contracts.");
for (const [, name, count] of documented) {
  assert.equal(Number(count.replaceAll(",", "")), api[name] ?? cli[name], `Documented cap differs from implementation: ${name}`);
}

const pkg = JSON.parse(await readFile(path.join(project, "package.json"), "utf8"));
assert.equal(pkg.private, true);
const archivePath = pkg.dependencies["@zodiacs/engine"];
assert.equal(archivePath, "file:../artifacts/zodiacs-engine-1.0.0.tgz");
const archive = await readFile(path.resolve(project, archivePath.slice(5)));
const digest = createHash("sha256").update(archive).digest("hex");
const receipt = (await readFile(path.join(repository, "artifacts/zodiacs-engine-1.0.0.sha256"), "utf8")).split(/\s+/)[0];
assert.equal(digest, receipt, "Carried archive differs from its receipt.");
const lock = JSON.parse(await readFile(path.join(project, "package-lock.json"), "utf8"));
assert.equal(lock.packages["node_modules/@zodiacs/engine"].integrity,
  "sha512-" + createHash("sha512").update(archive).digest("base64"), "Engine lock integrity differs from archive.");

// This is exclusion evidence, not the engine's built-package budget gate.
// Ignore scripts: no prepack hook, engine build, archive creation or git write.
const cache = path.join(project, ".cache/npm");
await mkdir(cache, { recursive: true });
const output = execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json", "--cache", cache], {
  cwd: repository, encoding: "utf8", timeout: 60_000, maxBuffer: 2_000_000
});
const reports = JSON.parse(output);
assert.equal(reports.length, 1, "Expected a single root package report.");
const packed = reports[0].files.map((file) => file.path);
assert(packed.includes("package.json"), "Root package report is incomplete.");
assert(!packed.some((file) => file === "relocation" || file.startsWith("relocation/")), "Relocation files leaked into engine package.");
console.log("Project files, documentation links/caps, public library imports, archive/lock integrity and npm exclusion passed.");
console.log("Engine build, built-package budgets, archive history and conformance gates are separate checks.");
