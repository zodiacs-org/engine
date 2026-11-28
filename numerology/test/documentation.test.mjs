import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import * as api from "../.build/index.js";

const project = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, project), "utf8");
const reference = read("docs/API.md");
const fixtures = JSON.parse(read("test/fixtures/profiles.json"));

function evaluate(source) {
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: project, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 20_000
  });
  assert.ifError(child.error);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stdout + child.stderr);
  assert.equal(child.stderr, "");
  assert(child.stdout.endsWith("\n"));
  return child.stdout;
}

test("API reference covers every value and type exported by the public entry", () => {
  const index = ts.createSourceFile("index.ts", read("src/index.ts"), ts.ScriptTarget.Latest, true);
  const values = [];
  const types = [];
  for (const statement of index.statements) {
    assert(ts.isExportDeclaration(statement), "review new public entry syntax");
    assert(statement.exportClause && ts.isNamedExports(statement.exportClause));
    for (const entry of statement.exportClause.elements) {
      (statement.isTypeOnly || entry.isTypeOnly ? types : values).push(entry.name.text);
    }
  }
  assert.deepEqual(values.sort(), Object.keys(api).sort());
  const identifiers = new Set([...reference.matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/gu)].map((match) => match[1]));
  for (const name of [...values, ...types]) assert(identifiers.has(name), `undocumented export: ${name}`);
});

test("schema inventory matches the library and CLI source identifiers", () => {
  const schemas = new Set();
  for (const file of readdirSync(new URL("src/", project))) {
    if (!file.endsWith(".ts")) continue;
    for (const match of read(`src/${file}`).matchAll(/schema:\s*"(numerology-[a-z-]+\/[0-9]+)"/gu)) {
      schemas.add(match[1]);
    }
  }
  const cliSchema = read("cli/run.mjs").match(/const SCHEMA = "([^"]+)"/u);
  assert(cliSchema);
  schemas.add(cliSchema[1]);
  const documented = new Set([...reference.matchAll(/`(numerology-[a-z-]+\/[0-9]+)`/gu)].map((match) => match[1]));
  assert.deepEqual([...schemas].sort(), [...documented].sort());
});

test("authored Markdown links resolve to existing local files", () => {
  const ignored = new Set(["node_modules", ".build", ".cache", ".generated"]);
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) visit(url);
      else if (entry.name.endsWith(".md")) {
        for (const match of readFileSync(url, "utf8").matchAll(/\]\(([^)]+)\)/gu)) {
          const target = match[1];
          if (/^(?:https?:|#)/u.test(target)) continue;
          assert(existsSync(new URL(target.split("#")[0], url)), `${fileURLToPath(url)}: missing ${target}`);
        }
      }
    }
  }
  visit(project);
});

test("every README JavaScript example executes against the local build", () => {
  const snippets = [...read("README.md").matchAll(/```js\n([\s\S]*?)```/gu)].map((match) => match[1]);
  assert(snippets.length > 0);
  for (const source of snippets) {
    assert(source.includes('from "./.build/index.js"'));
    evaluate(source.replaceAll('"./.build/index.js"', JSON.stringify(new URL(".build/index.js", project).href)));
  }
});

test("typed validation-document example agrees with the handwritten Chaldean control", () => {
  const snippets = [...read("docs/VALIDATION.md").matchAll(/```ts\n([\s\S]*?)```/gu)];
  assert.equal(snippets.length, 1);
  const source = snippets[0][1];
  // Check typing in consumer.test.mjs; this executes the documentation's actual text.
  const javascript = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022
  } }).outputText.replaceAll('"@zodiacs/numerology"', JSON.stringify(new URL(".build/index.js", project).href));
  const result = JSON.parse(evaluate(javascript));
  const expected = fixtures.profiles.find(({ id }) => id === "chaldean-shared-conventions");
  assert.equal(result.receipt.birthDate.iso, expected.date);
  assert.equal(result.receipt.suppliedName, expected.name);
  assert.equal(result.receipt.conventions.system, expected.options.system);
  assert.equal(result.receipt.targetDate.iso, expected.options.targetDate);
  assert.equal(result.expression.receipt.sum.output, expected.expressionPath[0]);
  assert.equal(result.expression.value, expected.expressionPath.at(-1));
  assert.deepEqual(Object.values(result.cycles).map(({ value }) => value), expected.cycles);
});
