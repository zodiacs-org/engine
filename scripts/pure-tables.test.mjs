// Cases for scripts/pure-tables.mjs, the check that a bundler can leave out a
// table nothing reads. Each case is a synthetic module or built file; the last
// two read this checkout's source. The build is checked by the export smoke
// test (scripts/module-resolution-smoke.mjs), after `npm run build`.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { UNMARKED_SOURCE, checkBuild, checkSource, tables, unmarkedTables } from "./pure-tables.mjs";

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
export const KINDS = /* @__PURE__ */ Object.freeze(["x", \`y\`, -1, 2n, null, true, /a+/u] as const) satisfies readonly unknown[];
export const KEYS = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ Object.keys({ a: 1 }));
export const BY_SLUG = /*#__PURE__*/ new Map(/*#__PURE__*/ SIGNS.map((sign) => [sign.slug, sign]));
export const WRAPPED = /*#__PURE__*/ (Object.freeze({ inner: { a: 1, b: [...[2]] } }) as object);
export const ASSERTED = (/*#__PURE__*/ Object.freeze([1]))!;
export const CAST = <readonly number[]>/*#__PURE__*/ Object.freeze([1]);
export const CLASSES = /*#__PURE__*/ Object.freeze([class { static kind = "row"; read() { return SIGNS; } }]);
export default /*#__PURE__*/ Object.freeze({ SIGNS, ["literal key"]: 1, method() { return SIGNS; }, get size() { return 2; } });
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
export const H = /*#__PURE__*/ Object.freeze({ inner: Object.freeze([1, 2]) });
export const I = <readonly number[]>Object.freeze([1]);
export const J = Object.freeze([1]) /*#__PURE__*/;
export const K = Object.freeze(/*#__PURE__*/ [1]);
export const L = Object.freeze([1])!;
export default Object.freeze([1]);
`)).toEqual([
      'A: unmarked: Object.freeze(["x"])',
      "B: unmarked: Object.freeze({ k: 1 })",
      'C: unmarked: T.split("\\n").map((line) => line)',
      "D: unmarked: Array.from({ length: 2 }, (_, index) => index)",
      "E: unmarked: Object.freeze([])",
      "F: unmarked: Object.freeze([1])",
      'G: the operator +: T + "x"',
      "H: unmarked: Object.freeze([1, 2])",
      "I: unmarked: Object.freeze([1])",
      "J: unmarked: Object.freeze([1])",
      "K: unmarked: Object.freeze(/*#__PURE__*/ [1])",
      "L: unmarked: Object.freeze([1])",
      "default: unmarked: Object.freeze([1])"
    ]);
  });

  it("names what a bundler keeps although every call is marked", () => {
    expect(found(`
const BASE = /*#__PURE__*/ Object.freeze({ a: 1 });
const LIST = /*#__PURE__*/ Object.freeze([1]);
const KEY = "k";
const COUNT = 2;
export const SPREAD = /*#__PURE__*/ Object.freeze({ ...BASE, b: 2 });
export const SPREAD_LITERAL = /*#__PURE__*/ Object.freeze({ ...{ a: 1 } });
export const SPREAD_LIST = /*#__PURE__*/ Object.freeze([...LIST, 2]);
export const SPREAD_ARGUMENT = /*#__PURE__*/ Object.freeze([/*#__PURE__*/ Math.max(...LIST)]);
export const SPREAD_LITERAL_ARGUMENT = /*#__PURE__*/ Object.freeze([/*#__PURE__*/ Math.max(...[1, 2])]);
export const DIVIDED = /*#__PURE__*/ Object.freeze([5 / 24]);
export const NEGATED = /*#__PURE__*/ Object.freeze([-COUNT]);
export const TYPED = /*#__PURE__*/ Object.freeze([typeof KEY]);
export const READ = /*#__PURE__*/ Object.freeze([Math.PI]);
export const INDEXED = /*#__PURE__*/ Object.freeze([LIST[0]]);
export const TEMPLATE = /*#__PURE__*/ Object.freeze([\`\${KEY}s\`]);
export const TAGGED = /*#__PURE__*/ Object.freeze([String.raw\`a\`]);
export const CHOSEN = /*#__PURE__*/ Object.freeze([KEY ? 1 : 2]);
export const COMPUTED = /*#__PURE__*/ Object.freeze({ [KEY]: 1 });
export const COMPUTED_METHOD = /*#__PURE__*/ Object.freeze({ [KEY]() { return 1; } });
export const STATIC_BLOCK = /*#__PURE__*/ Object.freeze([class { static { BASE.a; } }]);
export const STATIC_CALL = /*#__PURE__*/ Object.freeze([class { static all = Array.from(LIST); }]);
export const { x } = /*#__PURE__*/ Object.freeze({ x: 1 });
`)).toEqual([
      "SPREAD: a spread: ...BASE",
      "SPREAD_LITERAL: a spread: ...{ a: 1 }",
      "SPREAD_LIST: a spread: ...LIST",
      "SPREAD_ARGUMENT: a spread: ...LIST",
      "SPREAD_LITERAL_ARGUMENT: a spread: ...[1, 2]",
      "DIVIDED: the operator /: 5 / 24",
      "NEGATED: the operator -: -COUNT",
      "TYPED: the operator typeof: typeof KEY",
      "READ: a property read: Math.PI",
      "INDEXED: a property read: LIST[0]",
      "TEMPLATE: a template with a substitution: `${KEY}s`",
      "TAGGED: a tagged template: String.raw`a`",
      "CHOSEN: a conditional: KEY ? 1 : 2",
      "COMPUTED: a computed key: [KEY]",
      "COMPUTED_METHOD: a computed key: [KEY]",
      "STATIC_BLOCK: a static block: static { BASE.a; }",
      "STATIC_CALL: unmarked: Array.from(LIST)",
      "{ x }: a destructuring declaration"
    ]);
  });

  it("takes for a table what a function of the module makes, run when it loads, and a Set or Map of data", () => {
    expect(found(`
function make() { return Object.freeze({ a: 1 }); }
const build = (n: number) => Object.freeze([n]);
function plain() { return [1]; }
function outer() { return inner(); }
function inner() { return Object.freeze([2]); }
function makeSet() { return new Set([1]); }
function viaCallback() { return [1].map((value) => Object.freeze([value])); }
function viaLocal() { const freezeOne = () => Object.freeze([3]); return freezeOne(); }
function handler() { return () => Object.freeze([4]); }
const { freeze } = Object;
const freezing = Object.freeze;
export const MADE = make();
export const BUILT = build(1);
export const PLAIN = plain();
export const NESTED = outer();
export const SET_MADE = makeSet();
export const CALLBACK = viaCallback();
export const LOCAL = viaLocal();
export const HANDLER = handler();
export const ALIASED = freeze([5]);
export const ALIASED_TOO = freezing([6]);
export const PLACED = (() => Object.freeze({ ...MADE }))();
export const PLACED_PLAIN = (() => [7])();
export const EITHER = PLAIN || Object.freeze([8]);
export const SET = new Set(["a"]);
export const MAP = new Map([["a", 1]]);
export const STATE = new Map<string, number>();
export const MARKED = /*#__PURE__*/ make();
export const MARKED_PLACED = /*#__PURE__*/ (() => Object.freeze({ ...MADE }))();
export const LIB = Lib.freeze([1]);
`)).toEqual([
      "MADE: unmarked: make()",
      "BUILT: unmarked: build(1)",
      "NESTED: unmarked: outer()",
      "SET_MADE: unmarked: makeSet()",
      "CALLBACK: unmarked: viaCallback()",
      "LOCAL: unmarked: viaLocal()",
      "ALIASED: unmarked: freeze([5])",
      "ALIASED_TOO: unmarked: freezing([6])",
      "PLACED: unmarked: (() => Object.freeze({ ...MADE }))()",
      "EITHER: unmarked: Object.freeze([8])",
      "EITHER: the operator ||: PLAIN || Object.freeze([8])",
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

  it("names a freeze when its module loads outside a declaration", () => {
    const code = [
      "const TABLE = [1, 2];",
      "Object.freeze(TABLE);",
      "if (TABLE.length) Object.freeze(TABLE);",
      "export class Rows { static all = Object.freeze([1]); }",
      "export class Later { all = Object.freeze([1]); }",
      "export class Block { static { Object.freeze(TABLE); } }",
      "TABLE.forEach((value) => Object.freeze([value]));",
      "export const register = () => Object.freeze(TABLE);"
    ].join("\n");
    expect(unmarkedTables(code).map(({ line, name, call }) => `${line} ${name ?? "(no table)"}: ${call}`)).toEqual([
      "2 (no table): a freeze when its module loads, outside a declaration: Object.freeze(TABLE);",
      "3 (no table): a freeze when its module loads, outside a declaration: if (TABLE.length) Object.freeze(TABLE);",
      "4 Rows: a freeze when its module loads, outside a declaration: Object.freeze([1])",
      "6 Block: a freeze when its module loads, outside a declaration: { Object.freeze(TABLE); }",
      "7 (no table): a freeze when its module loads, outside a declaration: TABLE.forEach((value) => Object.freeze([value]));"
    ]);
  });

  it("holds what reads a table, its module's or an import, to the same rule", () => {
    const code = `
import { REMOTE, other } from "./remote.js";
const T = /*#__PURE__*/ Object.freeze({ from: 1, list: [1] });
const FROM = T.from * 2;
const ALIAS = T;
const VIA_ALIAS = ALIAS.from;
const READER = () => T.from;
const LATER = READER();
const MARKED = /*#__PURE__*/ READER();
const PLACED = /*#__PURE__*/ (() => T.from)();
const REMOTE_COUNT = REMOTE.length;
const OTHER_COUNT = other.length;
const UNRELATED = 1 + 2;
console.log(T);
export class Uses { static first = T.list[0]; }
export class Fine { read() { return T; } }
`;
    const importsTable = (specifier, name) => specifier === "./remote.js" && name === "REMOTE";
    expect(found(code, { importsTable })).toEqual([
      "FROM, which reads T: the operator *: T.from * 2",
      "FROM, which reads T: a property read: T.from",
      "VIA_ALIAS, which reads ALIAS (T): a property read: ALIAS.from",
      "LATER, which reads READER (T): unmarked: READER()",
      "REMOTE_COUNT, which reads REMOTE: a property read: REMOTE.length",
      "(no table): a statement that reads T when its module loads: console.log(T);",
      "Uses: a class its module keeps, which reads T"
    ]);
  });

  it("leaves out the tables and readers of an exempt module, but not its marks on discarded values", () => {
    const code = "const T = Object.freeze([1]);\nconst N = T.length;\n/*#__PURE__*/ Object.freeze(T);\n";
    expect(found(code, { exempt: () => true })).toEqual(["(no table): a mark on a discarded value: Object.freeze(T)"]);
  });

  it("names a mark on a call whose value is discarded, wherever it is", () => {
    expect(found(`
const TABLE = [1, 2];
const ok = TABLE.length > 0;
/*#__PURE__*/ Object.freeze(TABLE);
export function f(row: object) {
  /*#__PURE__*/ Object.freeze(row);
  void /*#__PURE__*/ g(row);
  (/*#__PURE__*/ g(row)) as unknown;
  ok && /*#__PURE__*/ g(row);
  ok ? /*#__PURE__*/ g(row) : null;
  (0, /*#__PURE__*/ g(row));
  for (let i = 0; i < 1; i += 1, /*#__PURE__*/ g(row));
  const kept = ok && /*#__PURE__*/ g(row);
  const last = (row, /*#__PURE__*/ g(row));
  return [kept, last, ok ? /*#__PURE__*/ g(row) : null, (/*#__PURE__*/ g(row), row)];
}
export function g(row: object) { return /*#__PURE__*/ Object.freeze(row); }
`)).toEqual([
      "(no table): a freeze when its module loads, outside a declaration: Object.freeze(TABLE);",
      "(no table): a mark on a discarded value: Object.freeze(TABLE)",
      "(no table): a mark on a discarded value: Object.freeze(row)",
      "(no table): a mark on a discarded value: g(row)",
      "(no table): a mark on a discarded value: g(row)",
      "(no table): a mark on a discarded value: g(row)",
      "(no table): a mark on a discarded value: g(row)",
      "(no table): a mark on a discarded value: g(row)",
      "(no table): a mark on a discarded value: g(row)",
      "(no table): a mark on a discarded value: g(row)"
    ]);
  });
});

describe("tables", () => {
  it("lists the tables the rule finds, with their modules and lines", () => {
    const code = "// src/a.ts\nvar A = Object.freeze([1]);\nvar NOT = [1];\n// src/b.ts\nvar B = /* @__PURE__ */ new Set([1]);\n";
    const module = (position) => (position < code.indexOf("// src/b.ts") ? "src/a.ts" : "src/b.ts");
    expect(tables(code, { fileName: "chunk.js", module }).map(({ module: name, line, name: table }) => `${name}:${line} ${table}`))
      .toEqual(["src/a.ts:2 A", "src/b.ts:5 B"]);
  });
});

describe("checkBuild", () => {
  it("reads a built file's modules from esbuild's comments, leaves out UNMARKED_SOURCE's, and follows tables across files", () => {
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
        "// a note, not a module",
        "var DASHA_EXTRA = Object.freeze([\"antar\"]);",
        "",
        "// src/houses.ts",
        "var SYSTEMS = Object.freeze([\"whole\"]);",
        "var MADE = make();",
        "export { BEFORE, ELEMENTS, SLUGS as SIGN_SLUGS, DASHA_LEVELS, POLICY, SYSTEMS, MADE };",
        ""
      ].join("\n"),
      "dist/index.js": [
        'import { SIGN_SLUGS } from "./chunk-A.js";',
        "",
        "// src/index.ts",
        "var COUNT = SIGN_SLUGS.length;",
        "export { COUNT };",
        ""
      ].join("\n")
    };
    const breaches = checkBuild({ files: Object.keys(files), read: (path) => files[path] });
    expect(breaches.map(({ file, line, name, call }) => `${file}:${line} ${name ?? "(no table)"}: ${call}`)).toEqual([
      'dist/chunk-A.js:2 BEFORE: unmarked: Object.freeze(["own"])',
      'dist/chunk-A.js:5 ELEMENTS: unmarked: Object.freeze(["fire", "earth"])',
      "dist/chunk-A.js:12 (no table): a mark on a discarded value: Object.freeze(DASHA_LEVELS)",
      'dist/chunk-A.js:17 SYSTEMS: unmarked: Object.freeze(["whole"])',
      "dist/index.js:4 COUNT, which reads SIGN_SLUGS (SLUGS): a property read: SIGN_SLUGS.length"
    ]);
  });
});

describe("checkSource", () => {
  it("leaves out UNMARKED_SOURCE's tables and readers but not their marks on discarded values, and follows imports and exports", () => {
    const tree = mkdtempSync(join(tmpdir(), "pure-tables-"));
    try {
      mkdirSync(join(tree, "src/vedic"), { recursive: true });
      const write = (path, text) => writeFileSync(join(tree, path), text);
      write("src/vedic/dasha.ts", 'import { SLUGS } from "../signs.js";\nexport const A = Object.freeze([1]);\n/*#__PURE__*/ Object.freeze(A);\nconst N = SLUGS.length;\n');
      write("src/signs.ts", "export const B = Object.freeze([1]);\nexport const SLUGS = /*#__PURE__*/ Object.freeze([\"aries\"]);\n");
      write("src/index.ts", 'export { SLUGS as SIGN_SLUGS } from "./signs.js";\nexport * from "./signs.js";\n');
      write("src/reader.ts", 'import { SIGN_SLUGS, SLUGS } from "./index.js";\nexport const FIRST = SIGN_SLUGS[0];\nexport const ALL = SLUGS;\nexport const LAST = SLUGS[0];\n');
      write("src/signs.test.ts", "export const C = Object.freeze([1]);\n");
      expect(checkSource(tree).map(({ file, line, name, call }) => `${file}:${line} ${name ?? "(no table)"}: ${call}`)).toEqual([
        "src/reader.ts:2 FIRST, which reads SIGN_SLUGS (SLUGS): a property read: SIGN_SLUGS[0]",
        "src/reader.ts:4 LAST, which reads SLUGS: a property read: SLUGS[0]",
        "src/signs.ts:1 B: unmarked: Object.freeze([1])",
        "src/vedic/dasha.ts:3 (no table): a mark on a discarded value: Object.freeze(A)"
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

  it("has no table in src/ that a bundler cannot leave out but those, nothing that keeps one, and no mark on a discarded value", () => {
    expect(checkSource(root)).toEqual([]);
  });
});
