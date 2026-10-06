// Cases for scripts/pure-tables.mjs, the check that a bundler can leave out a
// frozen table nothing reads. Each case is a synthetic module or built file;
// the last runs the check on this checkout's source. The build is checked by
// the export smoke test (scripts/module-resolution-smoke.mjs), after
// `npm run build`.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { UNMARKED_SOURCE, checkBuild, checkSource, unmarkedTables } from "./pure-tables.mjs";

const names = (code, options) => unmarkedTables(code, options).map(({ name, call }) => `${name ?? "(statement)"}: ${call}`);

describe("unmarkedTables", () => {
  it("accepts a table whose every load-time call is marked", () => {
    expect(names(`
export const ROWS = /*#__PURE__*/ Object.freeze([
  /*#__PURE__*/ Object.freeze({ a: 1 } as const),
  /*#__PURE__*/ Object.freeze({ a: 2 } as const)
]);
export const SLUGS = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ ROWS.map((row) => String(row.a))) as readonly string[];
export const KINDS = /* @__PURE__ */ Object.freeze(["x", "y"] as const) satisfies readonly string[];
`)).toEqual([]);
  });

  it("names an unmarked freeze, outer or nested", () => {
    expect(names(`
export const A = Object.freeze(["x"]);
export const B = /*#__PURE__*/ Object.freeze([Object.freeze({ k: 1 }), /*#__PURE__*/ Object.freeze({ k: 2 })]);
const C = /*#__PURE__*/ Object.freeze({ inner: Object.freeze([1, 2]) });
`)).toEqual([
      'A: Object.freeze(["x"])',
      "B: Object.freeze({ k: 1 })",
      "C: Object.freeze([1, 2])"
    ]);
  });

  it("names an unmarked call that builds the frozen value, but not one in a marked call's callee", () => {
    expect(names(`
const SIGNS = [{ slug: "aries" }];
const TEXT = "a|1\\nb|2";
export const A = /*#__PURE__*/ Object.freeze(SIGNS.map((sign) => sign.slug));
export const B = /*#__PURE__*/ Object.freeze(Array.from({ length: 2 }, (_, index) => index));
export const C = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ TEXT.split("\\n").map((line) => line));
export const D = /*#__PURE__*/ Object.freeze({ set: new Set(["x"]) });
`)).toEqual([
      "A: SIGNS.map((sign) => sign.slug)",
      "B: Array.from({ length: 2 }, (_, index) => index)",
      'D: new Set(["x"])'
    ]);
  });

  it("does not check calls in function bodies, or declarations that do not freeze", () => {
    expect(names(`
export const BUILT = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ [1, 2].map((value) => Object.freeze({ value })));
export function make(value: number) {
  const row = Object.freeze({ value });
  Object.freeze(row);
  return Object.freeze([row]);
}
export const later = () => Object.freeze({ at: Date.now() });
const LOOKUP = new Map([["a", 1]]);
export class Table { rows = Object.freeze([1]); read() { return Object.freeze([2]); } }
`)).toEqual([]);
  });

  it("names a freeze that runs at load outside a declaration", () => {
    const code = [
      "const TABLE = [1, 2];",
      "Object.freeze(TABLE);",
      "if (TABLE.length) Object.freeze(TABLE);",
      "export class Rows { static all = Object.freeze([1]); }",
      "export class Later { all = Object.freeze([1]); }"
    ].join("\n");
    expect(unmarkedTables(code).map(({ line, name }) => [line, name])).toEqual([[2, null], [3, null], [4, null]]);
  });

  it("reads a built file's modules from esbuild's comments, and leaves out UNMARKED_SOURCE's", () => {
    const files = {
      "dist/chunk-A.js": [
        'import { x } from "./chunk-B.js";',
        "",
        "// src/signs.ts",
        "var ELEMENTS = Object.freeze([\"fire\", \"earth\"]);",
        "var SLUGS = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ [\"aries\"].map((slug) => slug));",
        "",
        "// src/vedic/dasha.ts",
        "var DASHA_LEVELS = Object.freeze([\"maha\"]);",
        "",
        "// src/houses.ts",
        "var SYSTEMS = Object.freeze([\"whole\"]);",
        "export { ELEMENTS, SLUGS, DASHA_LEVELS, SYSTEMS };",
        ""
      ].join("\n")
    };
    const breaches = checkBuild({ files: Object.keys(files), read: (path) => files[path] });
    expect(breaches.map(({ file, line, name }) => `${file}:${line} ${name}`)).toEqual([
      "dist/chunk-A.js:4 ELEMENTS",
      "dist/chunk-A.js:11 SYSTEMS"
    ]);
    expect(UNMARKED_SOURCE.test("src/vedic/dasha.ts")).toBe(true);
    expect(UNMARKED_SOURCE.test("src/signs.ts")).toBe(false);
  });
});

describe("this checkout", () => {
  it("marks every frozen table in src/ but those of UNMARKED_SOURCE", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    expect(checkSource(root)).toEqual([]);
  });
});
