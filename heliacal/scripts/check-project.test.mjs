import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { auditFiles, auditSourceImports } from "./check-project.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "heliacal-audit-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return {
    root,
    put(name, content) {
      mkdirSync(dirname(join(root, name)), { recursive: true });
      writeFileSync(join(root, name), content);
      return name;
    }
  };
}

test("audits untracked files too, skips deletions, and enforces the strict decimal byte limit", (t) => {
  const { root, put } = fixture(t);
  const below = put("heliacal/below.bin", Buffer.alloc(1_999_999));
  const boundary = put("heliacal/boundary.bin", Buffer.alloc(2_000_000));
  const larger = put("heliacal/larger.bin", Buffer.alloc(2_000_001));
  const result = auditFiles(root, [below, boundary, larger, "heliacal/deleted.md", below]);
  assert.equal(result.files, 3);
  assert.equal(result.violations.length, 2);
  assert.match(result.violations[0], /boundary\.bin.*smaller than 2000000/);
  assert.match(result.violations[1], /larger\.bin.*smaller than 2000000/);
});

test("checks documentation punctuation without interpreting code escapes as prose", (t) => {
  const { root, put } = fixture(t);
  const files = [
    put("heliacal/guide.MD", `one\u2014two`),
    put("heliacal/CHANGES.txt", `three\u2014four`),
    put("heliacal/valid.md", "ASCII hyphens - and en dashes \u2013 are allowed."),
    put("heliacal/scripts/escape.mjs", 'const forbidden = "\\u2014";')
  ];
  const result = auditFiles(root, files);
  assert.equal(result.violations.length, 2);
  assert(result.violations.every((message) => message.includes("documentation contains U+2014")));
});

test("rejects tracked output folders, outside paths and symlinks without reading their target", (t) => {
  const { root, put } = fixture(t);
  const generated = put("heliacal/generated/table.json", "{}");
  const nested = put("heliacal/test/.cache/output.txt", "cached");
  const target = put("secret.txt", "fixture text");
  symlinkSync(join(root, target), join(root, "heliacal/link.md"));
  const result = auditFiles(root, [generated, nested, "heliacal/link.md", "heliacal/../secret.txt"]);
  assert.equal(result.violations.length, 4);
  assert(result.violations.some((message) => message.includes("regular files")));
  assert(result.violations.some((message) => message.includes("outside heliacal/")));
  assert.equal(result.violations.filter((message) => message.includes("stay untracked and ignored")).length, 2);
});

test("accepts relative engine/source imports and ignores import-like prose", () => {
  const source = `
    import { calc } from "../../src/calc.js";
    import type { Observer } from "../../src/sky/riseset.js";
    export { phase } from "./phase.js";
    type Receipt = import("../../src/calc.js").CalcReceipt;
    const load = () => import("./phase.js");
    const label = 'import("node:fs")';
    // import "../../fixedstars/src/index.js";
  `;
  assert.deepEqual(auditSourceImports("heliacal/src/sample.ts", source, "/example"), []);
});

test("rejects external packages, sibling projects, script imports and computed imports", () => {
  const cases = [
    'import "node:fs";',
    'import "astronomy-engine";',
    'export * from "../../fixedstars/src/index.js";',
    'import type { T } from "../../events/index.js";',
    'type T = import("../../calendar/index.js").T;',
    'import "../scripts/source-loader.mjs";',
    'const load = () => import("../../../other-repo/index.js");',
    'const load = (path) => import(path);',
    'const load = (path) => require(path);',
    'import fs = require("node:fs");'
  ];
  for (const source of cases) {
    assert.equal(auditSourceImports("heliacal/src/sample.ts", source, "/example").length, 1, source);
  }
});
