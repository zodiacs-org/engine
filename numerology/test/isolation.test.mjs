import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const project = new URL("../", import.meta.url);

test("private project declares no runtime dependencies and ignores generated directories", () => {
  const manifest = JSON.parse(readFileSync(new URL("package.json", project), "utf8"));
  assert.equal(manifest.private, true);
  assert.equal(manifest.license, "MIT");
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies", "bundledDependencies"]) {
    assert.equal(Object.keys(manifest[field] ?? {}).length, 0, `unexpected ${field}`);
  }
  const paths = [".build", ".cache", ".generated", "node_modules"].map((directory) =>
    `numerology/${directory}/isolation-probe`);
  const ignored = execFileSync("git", ["check-ignore", "--no-index", "--", ...paths], {
    cwd: new URL("../../", import.meta.url), encoding: "utf8"
  }).trim().split("\n");
  assert.deepEqual(ignored, paths);
});

test("every built library import and declaration stays inside the numerology build", () => {
  const build = new URL(".build/", project);
  const visited = new Set();
  function visit(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    const source = readFileSync(url, "utf8");
    const syntax = ts.createSourceFile(url.pathname, source, ts.ScriptTarget.Latest, true);
    function walk(node) {
      let specifier;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
        assert.equal(node.arguments.length, 1, "review computed library dependency");
        specifier = node.arguments[0];
      }
      if (specifier) {
        assert(ts.isStringLiteral(specifier), "review computed library dependency");
        assert(specifier.text.startsWith("./") && specifier.text.endsWith(".js"),
          `nonlocal library dependency: ${specifier.text}`);
        const target = new URL(specifier.text, url);
        const path = relative(fileURLToPath(build), fileURLToPath(target));
        assert(!isAbsolute(path) && !path.startsWith(".."), `escaped build: ${specifier.text}`);
        visit(target);
      }
      ts.forEachChild(node, walk);
    }
    walk(syntax);
  }
  // The declaration graph is checked as well: a type-only engine import must fail.
  visit(new URL("index.js", build));
  for (const file of readdirSync(build)) {
    if (file.endsWith(".d.ts")) visit(new URL(file, build));
  }
  assert(visited.size > 0);
});

test("engine npm dry run excludes this isolated project without running scripts", () => {
  const root = new URL("../../", import.meta.url);
  const env = { ...process.env, npm_config_cache: fileURLToPath(new URL(".cache/npm", project)) };
  const report = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }))[0];
  assert(report && Array.isArray(report.files));
  assert(report.files.some((file) => file.path === "package.json"));
  assert(!report.files.some((file) => file.path.startsWith("numerology/")));
  // This checks exclusion only. It does not substitute for the engine's
  // complete package-contents gate, which requires its existing dist/ build.
});

test("authored files stay below the size limit and docs have no em dash", () => {
  const ignored = new Set(["node_modules", ".build", ".cache", ".generated"]);
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) visit(url);
      else {
        assert(entry.isFile(), `unexpected non-regular file: ${entry.name}`);
        assert(statSync(url).size < 2_000_000, `file exceeds limit: ${entry.name}`);
        if (entry.name.endsWith(".md") || entry.name.endsWith(".txt")) {
          assert(!readFileSync(url, "utf8").includes("\u2014"), `em dash in ${entry.name}`);
        }
      }
    }
  }
  visit(project);
});
