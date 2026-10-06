// Cases for scripts/pure-tables.mjs, the check that a bundler can leave out a
// table nothing reads. Each case is a synthetic module or built file; the last
// two read this checkout's source. The build is checked by the export smoke
// test (scripts/module-resolution-smoke.mjs), after `npm run build`.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { UNMARKED_SOURCE, checkBuild, checkSource, unmarkedTables } from "./pure-tables.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const found = (code, options) => unmarkedTables(code, options).map(({ name, call }) => `${name ?? "(no table)"}: ${call}`);

describe("unmarkedTables", () => {
  it("accepts tables made of literals, names, functions and marked calls", () => {
    expect(found(`
const SIGNS = /*#__PURE__*/ Object.freeze([
  /*#__PURE__*/ Object.freeze({ slug: "aries", day: true } as const),
  /*#__PURE__*/ Object.freeze({ slug: "taurus", day: false } as const)
]);
const TEXT = "a|1\\nb|2";
export const SLUGS = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ SIGNS.map((sign) => sign.slug)) as readonly string[];
export const ROWS = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ TEXT.split("\\n").map((line) => line.split("|")));
export const KINDS = /* @__PURE__ */ Object.freeze(["x", \`y\`, -1, 2n, null, true] as const) satisfies readonly unknown[];
export const KEYS = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ Object.keys({ a: 1 }));
export const BY_SLUG = /*#__PURE__*/ new Map(/*#__PURE__*/ SIGNS.map((sign) => [sign.slug, sign]));
export const WRAPPED = /*#__PURE__*/ (Object.freeze({ inner: { ...{ a: 1 }, b: [...[2]] } }) as object);
export default /*#__PURE__*/ Object.freeze({ SIGNS, ["literal key"]: 1, method() { return SIGNS; } });
`)).toEqual([]);
  });

  it("names each unmarked call, outer or nested, and only the outer of a callee's chain", () => {
    expect(found(`
const T = "a\\nb";
export const A = Object.freeze(["x"]);
export const B = /*#__PURE__*/ Object.freeze([Object.freeze({ k: 1 }), /*#__PURE__*/ Object.freeze({ k: 2 })]);
export const C = /*#__PURE__*/ Object.freeze(T.split("\\n").map((line) => line));
export const D = /*#__PURE__*/ Object.freeze(Array.from({ length: 2 }, (_, index) => index));
export const E = /* note */ Object.freeze([]), F = Object.freeze([1]);
export const G = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ T.split(T + "x").map((line) => line));
export default Object.freeze([1]);
`)).toEqual([
      'A: unmarked: Object.freeze(["x"])',
      "B: unmarked: Object.freeze({ k: 1 })",
      'C: unmarked: T.split("\\n").map((line) => line)',
      "D: unmarked: Array.from({ length: 2 }, (_, index) => index)",
      "E: unmarked: Object.freeze([])",
      "F: unmarked: Object.freeze([1])",
      'G: the operator +: T + "x"',
      "default: unmarked: Object.freeze([1])"
    ]);
  });

  it("names what a bundler keeps although every call is marked", () => {
    expect(found(`
const BASE = /*#__PURE__*/ Object.freeze({ a: 1 });
const LIST = /*#__PURE__*/ Object.freeze([1]);
const KEY = "k";
export const SPREAD = /*#__PURE__*/ Object.freeze({ ...BASE, b: 2 });
export const SPREAD_LIST = /*#__PURE__*/ Object.freeze([...LIST, 2]);
export const DIVIDED = /*#__PURE__*/ Object.freeze([5 / 24]);
export const READ = /*#__PURE__*/ Object.freeze([Math.PI]);
export const INDEXED = /*#__PURE__*/ Object.freeze([LIST[0]]);
export const TEMPLATE = /*#__PURE__*/ Object.freeze([\`\${KEY}s\`]);
export const TAGGED = /*#__PURE__*/ Object.freeze([String.raw\`a\`]);
export const CHOSEN = /*#__PURE__*/ Object.freeze([KEY ? 1 : 2]);
export const COMPUTED = /*#__PURE__*/ Object.freeze({ [KEY]: 1 });
export const { x } = /*#__PURE__*/ Object.freeze({ x: 1 });
`)).toEqual([
      "SPREAD: a spread: ...BASE",
      "SPREAD_LIST: a spread: ...LIST",
      "DIVIDED: the operator /: 5 / 24",
      "READ: a property read: Math.PI",
      "INDEXED: a property read: LIST[0]",
      "TEMPLATE: a template with a substitution: `${KEY}s`",
      "TAGGED: a tagged template: String.raw`a`",
      "CHOSEN: a conditional: KEY ? 1 : 2",
      "COMPUTED: a computed key: [KEY]",
      "{ x }: a destructuring declaration"
    ]);
  });

  it("takes for a table what a function of the module freezes, a function called in place, and a Set or Map of data", () => {
    expect(found(`
function make() { return Object.freeze({ a: 1 }); }
const build = (n: number) => Object.freeze([n]);
function plain() { return [1]; }
export const MADE = make();
export const BUILT = build(1);
export const PLAIN = plain();
export const PLACED = (() => Object.freeze({ ...MADE }))();
export const SET = new Set(["a"]);
export const MAP = new Map([["a", 1]]);
export const STATE = new Map<string, number>();
export const MARKED = /*#__PURE__*/ make();
export const MARKED_PLACED = /*#__PURE__*/ (() => Object.freeze({ ...MADE }))();
export const LIB = Lib.freeze([1]);
`)).toEqual([
      "MADE: unmarked: make()",
      "BUILT: unmarked: build(1)",
      "PLACED: unmarked: (() => Object.freeze({ ...MADE }))()",
      'SET: unmarked: new Set(["a"])',
      'MAP: unmarked: new Map([["a", 1]])'
    ]);
  });

  it("does not read calls in function bodies, or declarations that build no table", () => {
    expect(found(`
export const BUILT = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ [1, 2].map((value) => Object.freeze({ value })));
export function make(value: number) {
  const row = Object.freeze({ value });
  return Object.freeze([row]);
}
export const later = () => Object.freeze({ at: Date.now() });
export const DEG = Math.PI / 180;
export class Table { rows = Object.freeze([1]); read() { return Object.freeze([2]); } }
`)).toEqual([]);
  });

  it("names a mark on a call whose value is discarded, wherever it is", () => {
    expect(found(`
const TABLE = [1, 2];
/*#__PURE__*/ Object.freeze(TABLE);
export function f(row: object) {
  /*#__PURE__*/ Object.freeze(row);
  void /*#__PURE__*/ g(row);
  return (/*#__PURE__*/ g(row), row);
}
export function g(row: object) { return /*#__PURE__*/ Object.freeze(row); }
`)).toEqual([
      "(no table): a mark on a discarded value: Object.freeze(TABLE)",
      "(no table): a mark on a discarded value: Object.freeze(row)",
      "(no table): a mark on a discarded value: g(row)",
      "(no table): a mark on a discarded value: g(row)"
    ]);
  });

  it("reads a built file's modules from esbuild's comments, and leaves out UNMARKED_SOURCE's tables", () => {
    const files = {
      "dist/chunk-A.js": [
        'import { x } from "./chunk-B.js";',
        "var BEFORE = Object.freeze([\"own\"]);",
        "",
        "// src/signs.ts",
        "var ELEMENTS = Object.freeze([\"fire\", \"earth\"]);",
        "var SLUGS = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ [\"aries\"].map((slug) => slug));",
        "function make() { return Object.freeze({}); }",
        "",
        "// src/vedic/dasha.ts",
        "var DASHA_LEVELS = Object.freeze([\"maha\"]);",
        "var POLICY = make();",
        "/* @__PURE__ */ Object.freeze(DASHA_LEVELS);",
        "",
        "// src/houses.ts",
        "var SYSTEMS = Object.freeze([\"whole\"]);",
        "var MADE = make();",
        "export { BEFORE, ELEMENTS, SLUGS, DASHA_LEVELS, POLICY, SYSTEMS, MADE };",
        ""
      ].join("\n")
    };
    const breaches = checkBuild({ files: Object.keys(files), read: (path) => files[path] });
    expect(breaches.map(({ file, line, name, call }) => `${file}:${line} ${name ?? "(no table)"}: ${call}`)).toEqual([
      'dist/chunk-A.js:2 BEFORE: unmarked: Object.freeze(["own"])',
      'dist/chunk-A.js:5 ELEMENTS: unmarked: Object.freeze(["fire", "earth"])',
      "dist/chunk-A.js:12 (no table): a mark on a discarded value: Object.freeze(DASHA_LEVELS)",
      'dist/chunk-A.js:15 SYSTEMS: unmarked: Object.freeze(["whole"])'
    ]);
  });
});

describe("checkSource", () => {
  it("leaves out UNMARKED_SOURCE's tables but not their marks on discarded values", () => {
    const tree = mkdtempSync(join(tmpdir(), "pure-tables-"));
    try {
      mkdirSync(join(tree, "src/vedic"), { recursive: true });
      writeFileSync(join(tree, "src/vedic/dasha.ts"), "export const A = Object.freeze([1]);\n/*#__PURE__*/ Object.freeze(A);\n");
      writeFileSync(join(tree, "src/signs.ts"), "export const B = Object.freeze([1]);\n");
      writeFileSync(join(tree, "src/signs.test.ts"), "export const C = Object.freeze([1]);\n");
      expect(checkSource(tree).map(({ file, line, name }) => `${file}:${line} ${name ?? "(no table)"}`)).toEqual([
        "src/signs.ts:1 B",
        "src/vedic/dasha.ts:2 (no table)"
      ]);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });
});

describe("this checkout", () => {
  it("leaves out the tables of the modules only ./calc and ./vedic load, and no other", () => {
    const modules = [];
    const walk = (directory) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) walk(path);
        else modules.push(relative(root, path).split("\\").join("/"));
      }
    };
    walk(join(root, "src"));
    expect(modules.filter((path) => UNMARKED_SOURCE.test(path)).sort()).toEqual([
      "src/calc.ts", "src/vedic/ayanamsa.ts", "src/vedic/dasha.ts", "src/vedic/kp.ts", "src/vedic/nakshatra.ts", "src/vedic/varga.ts"
    ]);
  });

  it("has no table in src/ that a bundler cannot leave out but those, and no mark on a discarded value", () => {
    expect(checkSource(root)).toEqual([]);
  });
});
