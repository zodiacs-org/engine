// What the bundlers do with forms the third to eleventh reviews found
// scripts/pure-tables.mjs let through, one or more of each kind they found,
// and with forms of what it still does not read, labeled "still not read".
// For each form, writes its
// modules, in JavaScript as esbuild writes TypeScript, to a temporary
// directory and bundles a program with esbuild (the engine's own, from its
// node_modules), plain and minified, Rollup, and Rolldown, at its default and
// minified.
// - A form that may keep a table: the program imports only a function beside
//   it, and the probe prints which bundles keep the table's marker string.
// - A form whose module prints the table when it loads: the program is run
//   as written and from each bundle, and the probe prints which bundles'
//   programs print something else.
// - A marked call in a function: the program runs the function on an object
//   and prints which bundles leave the object unfrozen.
// - A marked call when the module loads: the program reads the module's
//   value, and the probe prints which bundles leave it unfrozen. A form of
//   more than one module names each; one named .ts is TypeScript, which
//   esbuild writes as JavaScript for ES2022, lowering its decorators.
// - A marked call whose callback a function of the module stores, a mark the
//   check asked for at the commit the review read, or still asks for: the
//   program counts what is stored, and the probe prints which bundles store
//   nothing.
//
//   node check-gaps-probe.mjs <engine checkout> <Rollup package directory> <Rolldown package directory>
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [checkout, rollupDirectory, rolldownDirectory] = process.argv.slice(2).map((path) => path && resolve(path));
if (!checkout || !rollupDirectory || !rolldownDirectory) {
  console.error("usage: node check-gaps-probe.mjs <engine checkout> <Rollup package directory> <Rolldown package directory>");
  process.exit(2);
}
const require = createRequire(join(checkout, "package.json"));
const esbuild = require("esbuild");
const entryOf = (directory) => {
  const exported = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).exports["."];
  const target = typeof exported === "string" ? exported : exported.import?.default ?? exported.import ?? exported.default;
  return pathToFileURL(join(directory, target)).href;
};
const { rollup, VERSION: rollupVersion } = await import(entryOf(rollupDirectory));
const { rolldown, VERSION: rolldownVersion } = await import(entryOf(rolldownDirectory));
const output = (chunks) => chunks.map((chunk) => chunk.code ?? "").join("\n");
const bundlers = [
  ["esbuild", async (entry) => (await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", write: false, logLevel: "silent" })).outputFiles[0].text],
  ["esbuild, minified", async (entry) => (await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", minify: true, write: false, logLevel: "silent" })).outputFiles[0].text],
  ["Rollup", async (entry) => output((await (await rollup({ input: entry, onwarn() {} })).generate({ format: "es" })).output)],
  ["Rolldown", async (entry) => output((await (await rolldown({ input: entry, onLog() {} })).generate({ format: "es" })).output)],
  ["Rolldown, minified", async (entry) => output((await (await rolldown({ input: entry, onLog() {} })).generate({ format: "es", minify: true })).output)]
];
const TABLE = 'export const T = /*#__PURE__*/ Object.freeze(["table-marker"]);\n';
const USED = "export function used() { return 1; }\n";
const DECORATOR = "function tag(value: unknown, context: unknown) { return value; }\n";
// Each form: its modules, TypeScript where named .ts, and the module the program imports `used` from.
const KEPT = {
  "third review: a class with a computed method name that is not a literal, whose method reads the table": {
    "tables.js": `${TABLE}const KEY = "k";\nexport class C { [KEY]() { return T; } }\n${USED}`
  },
  "third review: a value read from a default export through a default import": {
    "table.js": 'export default /*#__PURE__*/ Object.freeze(["table-marker"]);\n',
    "tables.js": `import T from "./table.js";\nexport const N = T.length;\n${USED}`
  },
  "third review: a value read from a table through a namespace import": {
    "table.js": TABLE,
    "tables.js": `import * as ns from "./table.js";\nexport const N = ns.T.length;\n${USED}`
  },
  "third review: a value read from a table through `export * as`": {
    "table.js": TABLE,
    "all.js": 'export * as all from "./table.js";\n',
    "tables.js": `import { all } from "./all.js";\nexport const N = all.T.length;\n${USED}`
  },
  "third review: a TypeScript namespace that reads the table": {
    "tables.ts": `${TABLE}export namespace NS { export const n = T.length; }\n${USED}`
  },
  "third review: a freeze of the table in a function declared in a block under an if, and called there": {
    "tables.js": `const T = ["table-marker"];\nif (T.length) { const f = () => Object.freeze(T); f(); }\nexport function read() { return T; }\n${USED}`
  },
  "third review: a name the module does not declare": {
    "tables.js": `export const T = /*#__PURE__*/ Object.freeze(["table-marker", someGlobal]);\n${USED}`
  },
  "fourth review: a decorator on a method of a class whose method reads the table": {
    "tables.ts": `${TABLE}${DECORATOR}export class C { @tag m() { return T; } }\n${USED}`
  },
  "fourth review: a decorator on a class whose method reads the table": {
    "tables.ts": `${TABLE}${DECORATOR}@tag export class C { m() { return T; } }\n${USED}`
  },
  "fourth review: a decorated class in the table": {
    "tables.ts": `${DECORATOR}export const T = /*#__PURE__*/ Object.freeze(["table-marker", @tag class {}]);\n${USED}`
  },
  "fourth review: a global the module declares with `declare`, named in the table": {
    "tables.ts": `declare const someGlobal: string;\nexport const T = /*#__PURE__*/ Object.freeze(["table-marker", someGlobal]);\n${USED}`
  },
  "fourth review: a var in a block of the module, the table's own, read there": {
    "tables.js": `var T = /*#__PURE__*/ Object.freeze(["table-marker"]);\n{ var T; console.log(T); }\n${USED}`
  },
  "fourth review: an anonymous default function that reads the table, called when an importing module loads": {
    "table.js": `${TABLE}export default function () { return T; }\n`,
    "tables.js": `import read from "./table.js";\nexport const N = read();\n${USED}`
  },
  "fifth review: a var of a `for` statement at the module's top level, the table's own, read in the loop": {
    "tables.js": `var T = /*#__PURE__*/ Object.freeze(["table-marker"]);\nfor (var T; ;) { console.log(T); break; }\n${USED}`
  },
  "fifth review: a function of the module that makes a table, called through `new`": {
    "tables.js": `function make() { return Object.freeze(["table-marker"]); }\nexport const T = new make();\n${USED}`
  },
  "fifth review: the second of two callbacks a function of the module passes to the same function, which makes the table": {
    "tables.js": `function each(f) { return f(); }\nfunction make() { each(() => 0); return each(() => Object.freeze(["table-marker"])); }\nexport const T = make();\n${USED}`
  },
  "fifth review: a table made in the callback of an unmarked `map` when the module loads": {
    "tables.js": `export const T = [1].map(() => Object.freeze(["table-marker"]));\n${USED}`
  },
  "fifth review: a table made in a callback that a function of the module calls, when the module loads": {
    "tables.js": `function build(make) { return make(); }\nexport const T = build(() => Object.freeze(["table-marker"]));\n${USED}`
  },
  "fifth review: a Set of data built in a callback when the module loads": {
    "tables.js": `export const T = [["table-marker"]].map((list) => new Set(list));\n${USED}`
  },
  "sixth review: a table made, when the module loads, by a function of the module given by name to map": {
    "tables.js": `function makeOne() { return Object.freeze(["table-marker"]); }\nexport const T = [1].map(makeOne);\n${USED}`
  },
  "sixth review: a table made by a function of the module given by name to a function of the module that calls it": {
    "tables.js": `function build(make) { return make(); }\nfunction makeOne() { return Object.freeze(["table-marker"]); }\nexport const T = build(makeOne);\n${USED}`
  },
  "sixth review: a function of the module that maps a function it declares, given by name, that makes a table": {
    "tables.js": `function make() { const one = () => Object.freeze(["table-marker"]); return [1].map(one); }\nexport const T = make();\n${USED}`
  },
  "sixth review: a function written in place that makes a table, called through a comma": {
    "tables.js": `export const T = (0, () => Object.freeze(["table-marker"]))();\n${USED}`
  },
  "sixth review: a const of the module bound to a function of the module that makes a table": {
    "tables.js": `function make() { return Object.freeze(["table-marker"]); }\nconst alias = make;\nexport const T = alias();\n${USED}`
  },
  "sixth review: two functions that pass a callback to each other, the later question settled no by an earlier one": {
    "tables.js": `function A(f, n) { if (n > 0) B(f, n - 1); return f(); }\nfunction B(g, n) { return A(g, n); }\nfunction make() { A(() => 0, 1); return B(() => Object.freeze(["table-marker"]), 0); }\nexport const T = make();\n${USED}`
  },
  "sixth review: a table made by a tagged template of a function of the module": {
    "tables.js": `function rows(strings) { return Object.freeze(strings.raw[0].split("|")); }\nexport const T = rows\`table-marker|b\`;\n${USED}`
  },
  "sixth review: a table made by a parameter's default function, called in the body": {
    "tables.js": `function build(make = () => Object.freeze(["table-marker"])) { return make(); }\nexport const T = build();\n${USED}`
  },
  "fifth review, still not read: a table made by a callback in an object literal that a function of the module calls": {
    "tables.js": `function run(spec) { return spec.make(); }\nexport const T = run({ make: () => Object.freeze(["table-marker"]) });\n${USED}`
  },
  "fifth review, still not read: a class of the module whose constructor makes a table, constructed when the module loads": {
    "tables.js": `class Table { constructor() { this.rows = Object.freeze(["table-marker"]); } }\nexport const T = new Table();\n${USED}`
  },
  "ninth review: a table made by the decorator, given by name, of a class at the module's top level": {
    "tables.ts": `function makeTable(value: any, context: unknown): any { Object.freeze(["table-marker"]); return value; }\n@makeTable export class C {}\n${USED}`
  },
  "ninth review: a table made by the decorator, given by name, of a class expression a top-level const holds": {
    "tables.ts": `function makeTable(value: any, context: unknown): any { Object.freeze(["table-marker"]); return value; }\nexport const C = @makeTable class {};\n${USED}`
  },
  "ninth review: a table made by a call of a module const bound to `true ? Object.freeze : keep`": {
    "tables.js": `function keep(value) { return value; }\nconst lock = true ? Object.freeze : keep;\nexport const T = lock(["table-marker"]);\n${USED}`
  },
  "ninth review: a table made by a local overloaded function, called when the module loads": {
    "tables.ts": `export const T = (() => { function make(): readonly string[]; function make() { return Object.freeze(["table-marker"]); } return make(); })();\n${USED}`
  },
  "tenth review: a table made by a static block of a class expression a top-level const holds": {
    "tables.js": `export const C = class { static held; static { this.held = Object.freeze(["table-marker"]); } };\n${USED}`
  },
  "tenth review: a table made by a function of the module that calls its parameter, whose default is Object.freeze, the argument left out": {
    "tables.js": `function make(lock = Object.freeze) { return lock(["table-marker"]); }\nexport const T = make();\n${USED}`
  },
  "tenth review: a table made by a call of `(lock = makeList)`, makeList a function of the module that makes one": {
    "tables.js": `function makeList() { return Object.freeze(["table-marker"]); }\nlet lock;\nexport const T = (lock = makeList)();\n${USED}`
  },
  "tenth review: a table made by the second of two local function declarations of one name, the one that runs": {
    "tables.js": `function make() { function build() { return ["x"]; } function build() { return Object.freeze(["table-marker"]); } return build(); }\nexport const T = make();\n${USED}`
  },
  "tenth review, still not read: a table made by a `new` of what `Math.PI > 4 ? Object.freeze : Maker` gives, Maker making one": {
    "tables.js": `function Maker() { this.held = Object.freeze(["table-marker"]); }\nexport const T = new (Math.PI > 4 ? Object.freeze : Maker)();\n${USED}`
  },
  "this record, still not read: a table made by a call of a name destructured at the top of the module, whose default is Object.freeze": {
    "tables.js": `const { lock = Object.freeze } = {};\nexport const T = lock(["table-marker"]);\n${USED}`
  },
  "eleventh review: a table made by a function written in place and called through what `=` assigns it, in a function the table's initializer calls": {
    "tables.js": `function make() { let x; return (x = () => Object.freeze(["table-marker"]))(); }\nexport const T = make();\n${USED}`
  },
  "eleventh review, still not read: a table made by the first of two `var`s of a name of the module, called between them": {
    "tables.js": `var make = function () { return Object.freeze(["table-marker"]); };\nexport const T = make();\nvar make = function () { return ["x"]; };\n${USED}`
  }
};
const PRINTED = {
  "fourth review: a var in a block of the module, the table's own, read there": `var T = /*#__PURE__*/ Object.freeze(["table-marker"]);\n{ var T; console.log(String(T)); }\n${USED}`,
  "fifth review: a var of a `for` statement at the module's top level, the table's own, read in the loop": `var T = /*#__PURE__*/ Object.freeze(["table-marker"]);\nfor (var T; ;) { console.log(String(T)); break; }\n${USED}`
};
const LOCKS = [
  "function lock(value) { return Object.freeze(value); }",
  "function lockAll(value) { for (const inner of Object.values(value)) if (typeof inner === \"object\" && inner !== null) lockAll(inner); return Object.freeze(value); }",
  "function lockKey(value) { Object.freeze(value); return \"k\"; }",
  "function lockList(value) { Object.freeze(value); return []; }"
].join("\n");
const UNFROZEN = {
  "third review: !": "!/*#__PURE__*/ Object.freeze(row);",
  "third review: typeof": "typeof /*#__PURE__*/ Object.freeze(row);",
  "third review: an array literal": "[/*#__PURE__*/ Object.freeze(row)];",
  "third review: an object literal": "({ a: /*#__PURE__*/ Object.freeze(row) });",
  "third review: a comparison": "/*#__PURE__*/ Object.freeze(row) === row;",
  "third review: the left of `&& 0`": "/*#__PURE__*/ Object.freeze(row) && 0;",
  "third review: a conditional's condition": "/*#__PURE__*/ Object.freeze(row) ? 1 : 2;",
  "third review: a binding that is not read": "const unused = /*#__PURE__*/ Object.freeze(row);",
  "fourth review: a binding that is not read, of a function that freezes what it is given": "const unused = /*#__PURE__*/ lock(row);",
  "fourth review: a binding that is not read, of a function that freezes what it is given, throughout": "const unused = /*#__PURE__*/ lockAll(row);",
  "fourth review: a binding that is not read, of a freeze of Object.assign(row, ...)": "const unused = /*#__PURE__*/ Object.freeze(Object.assign(row, {}));",
  "fourth review: a computed key of an object that is discarded": "({ [/*#__PURE__*/ lockKey(row)]: 1 });",
  "fourth review: a spread in an array that is discarded": "[.../*#__PURE__*/ lockList(row)];",
  "fourth review: a spread in an object that is discarded": "({ .../*#__PURE__*/ lockKey(row) });"
};
const UNFROZEN_AT_LOAD = {
  "fourth review: a marked call of a function that freezes a value of the module": "const STATE = { a: 1 };\nfunction lockState() { return Object.freeze(STATE); }\nexport const LOCKED = /*#__PURE__*/ lockState();\nexport function read() { return STATE; }\n",
  "fourth review: a marked call of a function that freezes, throughout, a value the module gives it": "const RAW = { signs: [\"aries\"] };\nfunction deepFreeze(value) { for (const inner of Object.values(value)) if (typeof inner === \"object\" && inner !== null) deepFreeze(inner); return Object.freeze(value); }\nexport const CONFIG = /*#__PURE__*/ deepFreeze(RAW);\nexport function read() { return RAW; }\n",
  "fifth review: a marked call of a function written in place that freezes a value of the module": "const RAW = { a: 1 };\nexport const T = /*#__PURE__*/ (() => Object.freeze(RAW))();\nexport function read() { return RAW; }\n",
  "fifth review: a marked call of a function of the module that freezes its parameter, whose default is a value of the module": "const STATE = { a: 1 };\nfunction lock(value = STATE) { return Object.freeze(value); }\nexport const T = /*#__PURE__*/ lock();\nexport function read() { return STATE; }\n",
  "fifth review: a marked `map` whose callback freezes the rows of an array of the module": "const ROWS = [{ a: 1 }];\nexport const T = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ ROWS.map((row) => Object.freeze(row)));\nexport function read() { return ROWS[0]; }\n",
  "fifth review: a marked call of a function of the module whose second callback to the same function freezes a value of the module": "const ROWS = [{ a: 1 }];\nfunction each(f) { return f(); }\nfunction lockRows() { each(() => 0); return each(() => Object.freeze(ROWS)); }\nexport const T = /*#__PURE__*/ lockRows();\nexport function read() { return ROWS; }\n",
  "fifth review: the same through a function that passes the callback on, called by one with a local function of the name of the function it passes it to": "const ROWS = [{ a: 1 }];\nfunction helper(g) { return g(); }\nfunction apply(f) { return helper(f); }\nfunction lockRows() { const helper = (x) => x; void helper; return apply(() => Object.freeze(ROWS)); }\nexport const T = /*#__PURE__*/ lockRows();\nexport function read() { return ROWS; }\n",
  "fifth review: a marked call of a function of the module that freezes a value of the module through a local name": "const STATE = { a: 1 };\nfunction lockState() { const s = STATE; return Object.freeze(s); }\nexport const T = /*#__PURE__*/ lockState();\nexport function read() { return STATE; }\n",
  "fifth review: a marked call of a function of the module that freezes the rows of an array of the module in a `for-of` loop": "const ROWS = [{ a: 1 }];\nfunction lockRows() { for (const row of ROWS) Object.freeze(row); return ROWS.length; }\nexport const N = /*#__PURE__*/ lockRows();\nexport function read() { return ROWS[0]; }\n",
  "fifth review: a marked call of a function of the module that freezes the rows of an array of the module in a `forEach` callback": "const ROWS = [{ a: 1 }];\nfunction lockRows() { ROWS.forEach((row) => Object.freeze(row)); return ROWS.length; }\nexport const N = /*#__PURE__*/ lockRows();\nexport function read() { return ROWS[0]; }\n",
  "fifth review: a marked call of a function of the module that freezes a value of the module through an assignment": "const STATE = { a: 1 };\nlet held;\nfunction lockState() { return Object.freeze(held = STATE); }\nexport const T = /*#__PURE__*/ lockState();\nexport function read() { return STATE; }\n",
  "fifth review: a marked `new` of a function of the module that freezes its argument": "const RAW = { a: 1 };\nfunction lock(value) { return Object.freeze(value); }\nexport const T = /*#__PURE__*/ new lock(RAW);\nexport function read() { return RAW; }\n",
  "fifth review: a marked deep freeze of an object literal with a getter that returns a value of the module": "const RAW = { a: 1 };\nfunction deepFreeze(value) { for (const inner of Object.values(value)) if (typeof inner === \"object\" && inner !== null) deepFreeze(inner); return Object.freeze(value); }\nexport const T = /*#__PURE__*/ deepFreeze({ get raw() { return RAW; } });\nexport function read() { return RAW; }\n",
  "fifth review, still not read: a marked `new` of a class of the module whose constructor freezes its argument": "const ROWS = [{ a: 1 }];\nclass Table { constructor(rows) { this.rows = Object.freeze(rows); } }\nexport const T = /*#__PURE__*/ new Table(ROWS);\nexport function read() { return ROWS; }\n",
  "fifth review, still not read: a marked freeze of what a method named `with` of an object of the module returns, the object itself": "const CONFIG = { with() { return CONFIG; } };\nexport const T = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ CONFIG.with());\nexport function read() { return CONFIG; }\n",
  "fifth review, still not read: a marked call of a method of an object of the module that freezes its argument": "const RAW = { a: 1 };\nconst util = { lock(value) { return Object.freeze(value); } };\nexport const T = /*#__PURE__*/ util.lock(RAW);\nexport function read() { return RAW; }\n",
  "fifth review, still not read: a marked call, through `call`, of a function written in place that freezes a value of the module": "const RAW = { a: 1 };\nexport const T = /*#__PURE__*/ (function () { return Object.freeze(RAW); }).call(null);\nexport function read() { return RAW; }\n",
  "fifth review: a marked call of a function of the module that freezes a value of the module through its own name for Object.freeze": "const STATE = { a: 1 };\nfunction lockState() { const { freeze } = Object; return freeze(STATE); }\nexport const T = /*#__PURE__*/ lockState();\nexport function read() { return STATE; }\n",
  "fifth review: a marked call of a function of the module whose two blocks each declare `f`, the first of which, called, freezes a value of the module": "const ROWS = [{ a: 1 }];\nfunction lockRows() { { const f = () => Object.freeze(ROWS); f(); } { const f = () => 0; return f(); } }\nexport const T = /*#__PURE__*/ lockRows();\nexport function read() { return ROWS; }\n"
};
Object.assign(UNFROZEN_AT_LOAD, {
  "sixth review: a marked call of a function that freezes the values of Object.values of a value of the module": "const STATE = { a: { b: 1 } };\nfunction lockValues() { for (const value of Object.values(STATE)) Object.freeze(value); return 1; }\nexport const N = /*#__PURE__*/ lockValues();\nexport function read() { return STATE.a; }\n",
  "sixth review: a marked call of a function that freezes an element of a new array that holds a value of the module": "const STATE = { a: 1 };\nfunction lockElement() { return Object.freeze([STATE][0]); }\nexport const T = /*#__PURE__*/ lockElement();\nexport function read() { return STATE; }\n",
  "sixth review: a marked call of a function whose destructured parameter's default holds a value of the module": "const STATE = { a: 1 };\nfunction lock({ inner } = { inner: STATE }) { return Object.freeze(inner); }\nexport const T = /*#__PURE__*/ lock();\nexport function read() { return STATE; }\n",
  "sixth review: a marked call of a function that gives a value of the module to a function it declares, which freezes it": "const STATE = { a: 1 };\nfunction lockState() { const freezeIt = (value) => Object.freeze(value); return freezeIt(STATE); }\nexport const T = /*#__PURE__*/ lockState();\nexport function read() { return STATE; }\n",
  "sixth review: a marked call of a function whose callback, given a value of the module by a function of the module, freezes it": "const STATE = { a: 1 };\nfunction each(f) { return f(STATE); }\nfunction lockIt() { return each((value) => Object.freeze(value)); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "sixth review: a marked call of a function that freezes a catch binding holding a value of the module": "const STATE = { a: 1 };\nfunction lockIt() { try { throw STATE; } catch (error) { return Object.freeze(error); } }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "sixth review: a marked reduce whose callback freezes the accumulator, a value of the module": "const STATE = { a: 1 };\nexport const T = /*#__PURE__*/ [{}].reduce((sum) => Object.freeze(sum), STATE);\nexport function read() { return STATE; }\n",
  "sixth review: a marked map over [undefined] whose callback's default is a value of the module": "const STATE = { a: 1 };\nexport const T = /*#__PURE__*/ [undefined].map((row = STATE) => Object.freeze(row));\nexport function read() { return STATE; }\n",
  "sixth review: a marked map over an array of the module with a function of the module, given by name, that freezes its element": "const ROWS = [{ a: 1 }];\nfunction lockRow(row) { return Object.freeze(row); }\nexport const T = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ ROWS.map(lockRow));\nexport function read() { return ROWS[0]; }\n",
  "sixth review: a marked map over an array of the module with Object.freeze itself": "const ROWS = [{ a: 1 }];\nexport const T = /*#__PURE__*/ ROWS.map(Object.freeze);\nexport function read() { return ROWS[0]; }\n",
  "sixth review: a marked call, through a comma, of a function of the module that freezes its argument": "const STATE = { a: 1 };\nfunction lock(value) { return Object.freeze(value); }\nexport const T = /*#__PURE__*/ (0, lock)(STATE);\nexport function read() { return STATE; }\n",
  "sixth review: a marked call of a const bound to a function of the module that freezes its argument": "const STATE = { a: 1 };\nfunction lock(value) { return Object.freeze(value); }\nconst lockAlias = lock;\nexport const T = /*#__PURE__*/ lockAlias(STATE);\nexport function read() { return STATE; }\n",
  "sixth review: a marked call of a function that freezes the rows of an array of the module in a for (var ... of) loop": "const ROWS = [{ a: 1 }];\nfunction lockRows() { for (var row of ROWS) Object.freeze(row); return 1; }\nexport const N = /*#__PURE__*/ lockRows();\nexport function read() { return ROWS[0]; }\n",
  "sixth review, still not read: a marked call of a function that calls, through a let it assigns, a function of the module that freezes its argument": "const STATE = { a: 1 };\nfunction lockAny(value) { return Object.freeze(value); }\nfunction viaLet() { let lock = lockAny; lock = lockAny; return lock(STATE); }\nexport const T = /*#__PURE__*/ viaLet();\nexport function read() { return STATE; }\n"
});
Object.assign(UNFROZEN_AT_LOAD, {
  "seventh review: a marked call of a function that deep-freezes a new object it fills with rows of the module": "const ROWS = [{ a: 1 }];\nfunction deepFreeze(value) { for (const inner of Object.values(value)) if (typeof inner === \"object\" && inner !== null) deepFreeze(inner); return Object.freeze(value); }\nfunction buildIndex() { const index = {}; for (const row of ROWS) index[row.a] = row; return deepFreeze(index); }\nexport const BY_A = /*#__PURE__*/ buildIndex();\nexport function read() { return ROWS[0]; }\n",
  "seventh review: a marked call of a function that freezes a property of a new object, assigned a value of the module first": "const STATE = { a: 1 };\nfunction lockIt() { const box = {}; box.v = STATE; return Object.freeze(box.v); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a function that pushes the rows of an array of the module into a new array and freezes its elements": "const ROWS = [{ a: 1 }];\nfunction lockRows() { const rows = []; rows.push(...ROWS); rows.forEach((row) => Object.freeze(row)); return rows.length; }\nexport const N = /*#__PURE__*/ lockRows();\nexport function read() { return ROWS[0]; }\n",
  "seventh review: a marked call of a function that puts a value of the module into the new object it is given, then deep-freezes it": "const STATE = { a: 1 };\nfunction deepFreeze(value) { for (const inner of Object.values(value)) if (typeof inner === \"object\" && inner !== null) deepFreeze(inner); return Object.freeze(value); }\nfunction fill(box) { box.v = STATE; return deepFreeze(box); }\nexport const T = /*#__PURE__*/ fill({});\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a function that gives `flag ? {...} : undefined` to one whose default, a value of the module, it freezes": "const STATE = { a: 1 };\nfunction lock(value = STATE) { return Object.freeze(value); }\nfunction lockMaybe(flag) { return lock(flag ? { a: 1 } : undefined); }\nexport const T = /*#__PURE__*/ lockMaybe(false);\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a function that gives a property that is not there to one whose default, a value of the module, it freezes": "const STATE = { a: 1 };\nfunction settings(overrides = STATE) { return Object.freeze(overrides); }\nfunction make(options) { return settings(options.overrides); }\nexport const S = /*#__PURE__*/ make({});\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a function with a local function that calls itself with a value of the module, and freezes its parameter": "const STATE = { a: 1 };\nfunction host() { const lockDeep = (value, n) => (n ? lockDeep(STATE, n - 1) : Object.freeze(value)); return lockDeep({}, 1); }\nexport const T = /*#__PURE__*/ host();\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a function with two local functions that call each other, one with a value of the module": "const STATE = { a: 1 };\nfunction host() { const f = (value, n) => { if (n) g(n - 1); return Object.freeze(value); }; const g = (n) => f(STATE, n); f({}, 0); return g(0); }\nexport const T = /*#__PURE__*/ host();\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a function that spreads a generator that freezes a value of the module": "const STATE = { a: 1 };\nfunction* g() { yield Object.freeze(STATE); }\nfunction lockAll() { return [...g()].length; }\nexport const N = /*#__PURE__*/ lockAll();\nexport function read() { return STATE; }\n",
  "seventh review: a marked deep freeze, which walks functions too, of an object literal holding a class whose static field is a value of the module": "const STATE = { a: 1 };\nfunction deepFreeze(value) { for (const inner of Object.values(value)) if (inner !== null && (typeof inner === \"object\" || typeof inner === \"function\")) deepFreeze(inner); return Object.freeze(value); }\nexport const T = /*#__PURE__*/ deepFreeze({ Kind: class { static state = STATE; } });\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a function whose local class freezes a value of the module in a static field": "const STATE = { a: 1 };\nfunction lockIt() { class Held { static held = Object.freeze(STATE); } return Held; }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a function that freezes the keys of a Map of the module": "const STATE = { a: 1 };\nconst INDEX = new Map([[STATE, 1]]);\nfunction lockKeys() { for (const key of INDEX.keys()) Object.freeze(key); return 1; }\nexport const N = /*#__PURE__*/ lockKeys();\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a function whose Map's forEach callback freezes its second parameter, the key": "const STATE = { a: 1 };\nfunction lockKeys() { new Map([[STATE, 1]]).forEach((value, key) => Object.freeze(key)); return 1; }\nexport const N = /*#__PURE__*/ lockKeys();\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of `(0, Object.freeze)` on a value of the module": "const STATE = { a: 1 };\nexport const T = /*#__PURE__*/ (0, Object.freeze)(STATE);\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a function that freezes a value of the module through `Object[\"freeze\"]`": "const STATE = { a: 1 };\nfunction lockIt() { return Object[\"freeze\"](STATE); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a function that freezes a function declaration it has assigned a value of the module": "const STATE = { a: 1 };\nfunction lockIt() { function held() {} held = STATE; return Object.freeze(held); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a function that freezes a `var` bound to a value of the module, of the name of a function it declares": "const STATE = { a: 1 };\nfunction lockIt() { var held = STATE; function held() {} return Object.freeze(held); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a `let` of the module, never assigned, bound to a function of the module that freezes its argument": "const STATE = { a: 1 };\nfunction lock(value) { return Object.freeze(value); }\nlet lockAlias = lock;\nexport const T = /*#__PURE__*/ lockAlias(STATE);\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a function that deep-freezes `Array.from(...[[1], () => STATE])`": "const STATE = { a: 1 };\nfunction deepFreeze(value) { for (const inner of Object.values(value)) if (typeof inner === \"object\" && inner !== null) deepFreeze(inner); return Object.freeze(value); }\nfunction lockAll() { return deepFreeze(Array.from(...[[1], () => STATE])); }\nexport const T = /*#__PURE__*/ lockAll();\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a function whose parameter's default freezes a value of the module": "const STATE = { a: 1 };\nfunction lockIt(value = Object.freeze(STATE)) { return value; }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "seventh review: a marked call of a function that freezes what an array literal inherits, `[].constructor`": "function lockIt() { return Object.freeze([].constructor); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return Array; }\n",
  "seventh review, still not read: a marked call of a function that calls, through a local var, a function of the module that freezes its argument": "const STATE = { a: 1 };\nfunction lockAny(value) { return Object.freeze(value); }\nfunction viaVar() { var lock = lockAny; return lock(STATE); }\nexport const T = /*#__PURE__*/ viaVar();\nexport function read() { return STATE; }\n",
  "seventh review, still not read: a marked call of a function of another module that freezes its argument": {
    "lock.js": "export function lock(value) { return Object.freeze(value); }\n",
    "module.js": "import { lock } from \"./lock.js\";\nconst STATE = { a: 1 };\nexport const T = /*#__PURE__*/ lock(STATE);\nexport function read() { return STATE; }\n"
  },
  "seventh review, still not read: a marked freeze of a `new` of a function of the module that returns a value of the module": "const STATE = { a: 1 };\nfunction Make() { return STATE; }\nexport const T = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ new Make());\nexport function read() { return STATE; }\n",
  "seventh review, still not read: a marked replace whose callback freezes a value of the module": "const STATE = { a: 1 };\nexport const T = /*#__PURE__*/ \"a\".replace(\"a\", () => { Object.freeze(STATE); return \"b\"; });\nexport function read() { return STATE; }\n",
  "seventh review, still not read: a marked call of a function that deep-freezes a new object it fills through another name": "const STATE = { a: 1 };\nfunction deepFreeze(value) { for (const inner of Object.values(value)) if (typeof inner === \"object\" && inner !== null) deepFreeze(inner); return Object.freeze(value); }\nfunction lockIt() { const box = {}; const alias = box; alias.v = STATE; return deepFreeze(box); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "seventh review, still not read: a marked call of a function that freezes an inherited part read with a key not written as a literal": "function lockIt() { const key = \"constructor\"; return Object.freeze([][key]); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return Array; }\n"
});
Object.assign(UNFROZEN_AT_LOAD, {
  "eighth review: a marked call of a function that calls a local function declaration a `var` of its name, never given a value, shares": "const STATE = { a: 1 };\nfunction lockIt() { var lock; function lock(value) { return Object.freeze(value); } return lock(STATE); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "eighth review: a marked call of a function that deep-freezes groups it builds with `groups.at(-1).push(row)` from rows of the module": "const ROWS = [{ a: 1 }, { a: 2 }];\nfunction deepFreeze(value) { for (const inner of Object.values(value)) if (typeof inner === \"object\" && inner !== null) deepFreeze(inner); return Object.freeze(value); }\nfunction group() { const groups = [[]]; for (const row of ROWS) { if (row.a > 1) groups.push([]); groups.at(-1).push(row); } return deepFreeze(groups); }\nexport const T = /*#__PURE__*/ group();\nexport function read() { return ROWS[0]; }\n",
  "eighth review: a marked call of a function that deep-freezes two new arrays, one of which `(flag ? a : b).push(STATE)` fills": "const STATE = { a: 1 };\nfunction deepFreeze(value) { for (const inner of Object.values(value)) if (typeof inner === \"object\" && inner !== null) deepFreeze(inner); return Object.freeze(value); }\nfunction split(flag) { const a = []; const b = []; (flag ? a : b).push(STATE); return deepFreeze([a, b]); }\nexport const T = /*#__PURE__*/ split(true);\nexport function read() { return STATE; }\n",
  "eighth review: a marked call of a function that freezes `[].values().next`, the built-in next of every array iterator": "function lockIt() { return Object.freeze([].values().next); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return [][Symbol.iterator]().next; }\n",
  "eighth review: a marked call of a function that calls `(flag ? Object.freeze : (v) => v)` on a value of the module": "const STATE = { a: 1 };\nfunction lockIt(flag) { return (flag ? Object.freeze : (v) => v)(STATE); }\nexport const T = /*#__PURE__*/ lockIt(true);\nexport function read() { return STATE; }\n",
  "eighth review: a marked call of a function that defines a class with a decorator, given by name, that freezes a value of the module": {
    "module.ts": "const STATE = { a: 1 };\nfunction lockState(value: unknown, context: unknown) { Object.freeze(STATE); return value; }\nfunction make() { @lockState class Held {} return Held; }\nexport const T = /*#__PURE__*/ make();\nexport function read() { return STATE; }\n"
  },
  "eighth review: two local functions, one freezing a value of the module and calling the other, which calls it; marked calls of the first, then of the second": "const STATE = { a: 1 };\nfunction host() {\n  const f = (n) => { if (n) { Object.freeze(STATE); g(n - 1); } return 1; };\n  const g = (n) => (n ? f(n) : 0);\n  const a = /*#__PURE__*/ f(0);\n  const b = /*#__PURE__*/ g(1);\n  return a;\n}\nexport const T = host();\nexport function read() { return STATE; }\n",
  "eighth review: a marked call of a function that freezes `constructor` destructured from an array literal, the global Array": "function lockIt() { const { constructor } = []; return Object.freeze(constructor); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return Array; }\n",
  "eighth review: a marked call of a function that freezes a module const named `undefined`": "const undefined = { a: 1 };\nfunction lockIt() { return Object.freeze(undefined); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return undefined; }\n",
  "eighth review, still not read: a marked call of a function that calls the function another function of the module returns": "const STATE = { a: 1 };\nfunction makeLocker() { return (value) => Object.freeze(value); }\nfunction lockIt() { return makeLocker()(STATE); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "eighth review, still not read: a marked call of a function that calls `globalThis.Object.freeze` on a value of the module": "const STATE = { a: 1 };\nfunction lockIt() { return globalThis.Object.freeze(STATE); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "eighth review, still not read: a marked call of a function that calls a local function declaration it has assigned a function that freezes": "const STATE = { a: 1 };\nfunction lockIt() { function lock(value) { return value; } lock = (value) => Object.freeze(value); return lock(STATE); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "eighth review, still not read: a marked call of a function that calls a local function declaration a `var` of its name, given a function that freezes, replaces": "const STATE = { a: 1 };\nfunction lockAny(value) { return Object.freeze(value); }\nfunction lockIt() { var lock = lockAny; function lock(value) { return value; } return lock(STATE); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "eighth review, still not read: a marked call of a `let` of the module bound to a function and assigned one that freezes": "const STATE = { a: 1 };\nlet lock = (value) => value;\nlock = (value) => Object.freeze(value);\nexport const T = /*#__PURE__*/ lock(STATE);\nexport function read() { return STATE; }\n",
  "eighth review, still not read: a marked call of a function that calls a function of the module read from an array literal": "const STATE = { a: 1 };\nfunction lock(value) { return Object.freeze(value); }\nfunction lockIt() { return [lock][0](STATE); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "eighth review, still not read: a marked call of a function that calls a function a conditional chooses, one that freezes": "const STATE = { a: 1 };\nfunction lockAny(value) { return Object.freeze(value); }\nfunction keep(value) { return value; }\nfunction lockIt(flag) { return (flag ? lockAny : keep)(STATE); }\nexport const T = /*#__PURE__*/ lockIt(true);\nexport function read() { return STATE; }\n",
  "eighth review, still not read: a marked call of a function that deep-freezes a new object a function of the module, given it, fills with a value of the module": "const STATE = { a: 1 };\nfunction deepFreeze(value) { for (const inner of Object.values(value)) if (typeof inner === \"object\" && inner !== null) deepFreeze(inner); return Object.freeze(value); }\nfunction put(box) { box.v = STATE; }\nfunction lockIt() { const box = {}; put(box); return deepFreeze(box); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "this record, still not read: a marked call of a function that calls, through `this`, the function an iteration method is given as the `this` of the function it calls, one that freezes a value of the module": "const STATE = { a: 1 };\nfunction lockIt() { return [0].map(function () { return this(STATE); }, (value) => Object.freeze(value)); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n"
});
Object.assign(UNFROZEN_AT_LOAD, {
  "ninth review: a marked call of a function that decorates a class with its parameter, given a function of the module that freezes a value of the module": {
    "module.ts": "const STATE = { a: 1 };\nfunction lockState(value: any, context: unknown): any { Object.freeze(STATE); return value; }\nfunction make(decorate: (value: any, context: unknown) => any) { @decorate class Held {} return Held; }\nexport const T = /*#__PURE__*/ make(lockState);\nexport function read() { return STATE; }\n"
  },
  "ninth review: a marked call of a function that calls a local const bound to `flag ? Object.freeze : keep` on a value of the module": "const STATE = { a: 1 };\nfunction keep(value) { return value; }\nfunction lockIt(flag) { const lock = flag ? Object.freeze : keep; return lock(STATE); }\nexport const T = /*#__PURE__*/ lockIt(true);\nexport function read() { return STATE; }\n",
  "ninth review: a marked call of a function that calls `(lock = Object.freeze)` on a value of the module": "const STATE = { a: 1 };\nfunction lockIt() { let lock; return (lock = Object.freeze)(STATE); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "ninth review: a marked call of a function that calls a local overloaded function that freezes a value of the module": {
    "module.ts": "const STATE = { a: 1 };\nfunction lockIt() {\n  function lock(value: object): object;\n  function lock(value: any) { return Object.freeze(value); }\n  return lock(STATE);\n}\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n"
  },
  "ninth review: a marked call of a function that freezes `[Symbol.iterator]` destructured from an array literal, Array.prototype.values": "function lockIt() { const { [Symbol.iterator]: values } = []; return Object.freeze(values); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return Array.prototype.values; }\n",
  "ninth review: a marked call of a function that freezes a class expression whose decorator returns a class of the module": {
    "module.ts": "class Base {}\nfunction swap(value: any, context: unknown): any { return Base; }\nfunction make() { const Held = @swap class {}; return Object.freeze(Held); }\nexport const T = /*#__PURE__*/ make();\nexport function read() { return Base; }\n"
  },
  "ninth review: a marked call of a function that calls `(flag ? Object.freeze : deepFreeze)`, given false, on a new object holding a value of the module": "const STATE = { a: 1 };\nfunction deepFreeze(value) { for (const inner of Object.values(value)) if (typeof inner === \"object\" && inner !== null) deepFreeze(inner); return Object.freeze(value); }\nfunction lockIt(flag) { return (flag ? Object.freeze : deepFreeze)({ inner: STATE }); }\nexport const T = /*#__PURE__*/ lockIt(false);\nexport function read() { return STATE; }\n",
  "ninth review, still not read: a marked call of a function that deep-freezes groups it fills, rows of the module, through a local function that returns the last": "const ROWS = [{ a: 1 }, { a: 2 }];\nfunction deepFreeze(value) { for (const inner of Object.values(value)) if (typeof inner === \"object\" && inner !== null) deepFreeze(inner); return Object.freeze(value); }\nfunction lockIt() { const groups = [[]]; function last() { return groups[groups.length - 1]; } for (const row of ROWS) last().push(row); return deepFreeze(groups); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return ROWS[0]; }\n",
  "ninth review, still not read: a marked call of a function whose class decorator makes a table and gives `addInitializer` a function that freezes a value of the module": {
    "module.ts": "const STATE = { a: 1 };\nfunction register(value: any, context: ClassDecoratorContext): any { Object.freeze([\"one\"]); context.addInitializer(() => { Object.freeze(STATE); }); return value; }\nfunction make() { @register class Held {} return Held; }\nexport const T = /*#__PURE__*/ make();\nexport function read() { return STATE; }\n"
  }
});
Object.assign(UNFROZEN_AT_LOAD, {
  "tenth review: a marked call of a module `let` bound to `Math.PI > 3 ? deepFreeze : Object.freeze`, which an exported function may assign, on a new object holding a value of the module": "const STATE = { a: 1 };\nfunction deepFreeze(value) { for (const inner of Object.values(value)) if (typeof inner === \"object\" && inner !== null) deepFreeze(inner); return Object.freeze(value); }\nlet lock = Math.PI > 3 ? deepFreeze : Object.freeze;\nexport function setLock(next) { lock = next; }\nexport const T = /*#__PURE__*/ lock({ inner: STATE });\nexport function read() { return STATE; }\n",
  "tenth review: a marked call of a function that calls `(flag ? Object.freeze : runIt)`, given false, with a function that freezes a value of the module, which runIt calls": "const STATE = { a: 1 };\nfunction runIt(callback) { callback(); return 1; }\nfunction lockIt(flag) { return (flag ? Object.freeze : runIt)(() => { Object.freeze(STATE); }); }\nexport const T = /*#__PURE__*/ lockIt(false);\nexport function read() { return STATE; }\n",
  "tenth review: a marked call of a function that calls its parameter, whose default is Object.freeze, on a value of the module, the argument left out": "const STATE = { a: 1 };\nfunction lockIt(lock = Object.freeze) { return lock(STATE); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "tenth review: a marked call of a function that decorates a class with `(0, deco)`, deco its parameter, given a function that freezes a value of the module": {
    "module.ts": "const STATE = { a: 1 };\nfunction lockState(value: any, context: unknown) { Object.freeze(STATE); return value; }\nfunction make(deco: (value: any, context: any) => any) { @(0, deco) class Held {} return Held; }\nexport const T = /*#__PURE__*/ make(lockState);\nexport function read() { return STATE; }\n"
  },
  "tenth review: a marked call of a function with two local declarations of `lock`, the second of which, the one that runs, freezes a value of the module": "const STATE = { a: 1 };\nfunction lockIt() { function lock(value) { return value; } function lock(value) { return Object.freeze(value); } return lock(STATE); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "tenth review: a marked call of a function that calls `(lock = lockState)` on a new object, lockState freezing a value of the module": "const STATE = { a: 1 };\nfunction lockState(value) { Object.freeze(STATE); return value; }\nfunction lockIt() { let lock; return (lock = lockState)({ a: 1 }); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "tenth review: a marked call of a function that calls a const bound to its parameter on a value of the module, given Object.freeze": "const STATE = { a: 1 };\nfunction apply(f) { const g = f; return g(STATE); }\nexport const T = /*#__PURE__*/ apply(Object.freeze);\nexport function read() { return STATE; }\n",
  "tenth review, still not read: a marked call of a function that constructs `new (flag ? Object.freeze : Locker)()`, given false, Locker freezing a value of the module": "const STATE = { a: 1 };\nfunction Locker() { Object.freeze(STATE); }\nfunction lockIt(flag) { return new (flag ? Object.freeze : Locker)(); }\nexport const T = /*#__PURE__*/ lockIt(false);\nexport function read() { return STATE; }\n",
  "tenth review, still not read: a marked call of a function that tags a template with `(flag ? Object.freeze : lockTag)`, given false, lockTag freezing a value of the module": "const STATE = { a: 1 };\nfunction lockTag(strings) { Object.freeze(STATE); return strings; }\nfunction lockIt(flag) { return (flag ? Object.freeze : lockTag)`x`; }\nexport const T = /*#__PURE__*/ lockIt(false);\nexport function read() { return STATE; }\n",
  "this record, still not read: a marked call of a function that calls, on a value of the module, a name a `var` destructures, whose default is Object.freeze": "const STATE = { a: 1 };\nfunction lockIt() { var { lock = Object.freeze } = {}; return lock(STATE); }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "this record, still not read: a marked call of a function that calls, on a value of the module, a name a catch clause destructures, whose default is Object.freeze": "const STATE = { a: 1 };\nfunction lockIt() { try { throw {}; } catch ({ lock = Object.freeze }) { return lock(STATE); } }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n",
  "tenth review, still not read: a marked call of a function that gives forEach, over an array holding a function that freezes a value of the module, `Object.freeze && runIt`, which calls what it is given": "const STATE = { a: 1 };\nfunction runIt(value) { if (typeof value === \"function\") value(); return value; }\nfunction lockIt() { [() => { Object.freeze(STATE); }].forEach(Object.freeze && runIt); return 1; }\nexport const T = /*#__PURE__*/ lockIt();\nexport function read() { return STATE; }\n"
});
Object.assign(UNFROZEN_AT_LOAD, {
  "eleventh review: a marked call of a `var` of the module, between it and a second `var` of its name bound to Object.freeze, of a function that runs what it is given, given one that freezes a value of the module": "const STATE = { a: 1 };\nvar lock = function (callback) { callback(); return 1; };\nexport const T = /*#__PURE__*/ lock(() => { Object.freeze(STATE); });\nvar lock = Object.freeze;\nexport function read() { return STATE; }\n",
  "eleventh review: a marked call of a `var` of the module bound to Object.freeze and declared again in a loop's head over deepFreeze, on a new object holding a value of the module": "const STATE = { a: 1 };\nfunction deepFreeze(value) { for (const inner of Object.values(value)) if (typeof inner === \"object\" && inner !== null) deepFreeze(inner); return Object.freeze(value); }\nvar lock = Object.freeze;\nfor (var lock of [deepFreeze]);\nexport const T = /*#__PURE__*/ lock({ inner: STATE });\nexport function read() { return STATE; }\n",
  "eleventh review: a marked call of a function that calls a function written in place, through what `=` assigns it, that calls its parameter on a value of the module, given Object.freeze": "const STATE = { a: 1 };\nfunction apply(f) { let x; return (x = () => f(STATE))(); }\nexport const T = /*#__PURE__*/ apply(Object.freeze);\nexport function read() { return STATE; }\n",
  "eleventh review: a marked call of a function that gives its parameter, through what `=` assigns, to one that calls it on a value of the module, given Object.freeze": "const STATE = { a: 1 };\nfunction runWith(callback) { return callback(STATE); }\nfunction apply(f) { let x; return runWith((x = f)); }\nexport const T = /*#__PURE__*/ apply(Object.freeze);\nexport function read() { return STATE; }\n",
  "eleventh review, still not read: a marked call of a function that calls `(flag ? Object.freeze : runRest)`, given false, with a function that freezes a value of the module, runRest running what it gathers with `...`": "const STATE = { a: 1 };\nfunction runRest(...callbacks) { callbacks.forEach((callback) => callback()); return 1; }\nfunction lockIt(flag) { return (flag ? Object.freeze : runRest)(() => { Object.freeze(STATE); }); }\nexport const T = /*#__PURE__*/ lockIt(false);\nexport function read() { return STATE; }\n",
  "eleventh review, still not read: a marked call of a function that calls `(flag ? Object.freeze : runArguments)`, given false, with a function that freezes a value of the module, runArguments running `arguments[0]`": "const STATE = { a: 1 };\nfunction runArguments() { arguments[0](); return 1; }\nfunction lockIt(flag) { return (flag ? Object.freeze : runArguments)(() => { Object.freeze(STATE); }); }\nexport const T = /*#__PURE__*/ lockIt(false);\nexport function read() { return STATE; }\n"
});
const DROPPED = {
  "fourth review: a marked call of a function of the module that gives a callback to one that passes it to one that stores it": "export const handlers = [];\nfunction store(g) { handlers.push(g); return handlers.length; }\nfunction register(f) { return store(f); }\nfunction setup() { return register(() => Object.freeze([1])); }\nexport const OFF = /*#__PURE__*/ setup();\n",
  "fifth review: the same through a function that passes the callback on, called by one with a local function of the name of the function it passes it to": "export const handlers = [];\nfunction store(g) { handlers.push(g); return handlers.length; }\nfunction register(f) { return store(f); }\nfunction viaRegister() { const store = (h) => h(); void store; return register(() => Object.freeze([1])); }\nexport const REGISTERED = /*#__PURE__*/ viaRegister();\n",
  "sixth review, still not read: a method named map of an object of the module, which stores the function it is given": "export const handlers = [];\nconst registry = { map(f) { handlers.push(f); return handlers.length; } };\nexport const N = /*#__PURE__*/ registry.map(() => Object.freeze([1]));\n"
};

console.log(`esbuild ${esbuild.version}, Rollup ${rollupVersion}, Rolldown ${rolldownVersion}`);
const directory = mkdtempSync(join(tmpdir(), "check-gaps-probe-"));
const runs = async (sub) => {
  const unfrozen = [];
  for (const [name, bundle] of bundlers) {
    writeFileSync(join(sub, "out.mjs"), await bundle(join(sub, "entry.js")));
    if (execFileSync(process.execPath, [join(sub, "out.mjs")], { encoding: "utf8" }).trim() === "not frozen") unfrozen.push(name);
  }
  return unfrozen;
};
try {
  console.log("Bundles that keep the table in a program that imports only a function beside the form:");
  for (const [label, modules] of Object.entries(KEPT)) {
    const sub = mkdtempSync(join(directory, "kept-"));
    for (const [name, code] of Object.entries(modules)) {
      const js = name.endsWith(".ts") ? (await esbuild.transform(code, { loader: "ts", format: "esm" })).code : code;
      writeFileSync(join(sub, name.replace(/\.ts$/u, ".js")), js);
    }
    writeFileSync(join(sub, "entry.js"), 'import { used } from "./tables.js";\nexport const out = used();\n');
    const kept = [];
    for (const [name, bundle] of bundlers) if ((await bundle(join(sub, "entry.js"))).includes("table-marker")) kept.push(name);
    console.log(`  ${label}: ${kept.length ? kept.join("; ") : "none"}`);
  }
  console.log("Bundles whose program prints otherwise than the program as written, which prints the table when its module loads:");
  for (const [label, code] of Object.entries(PRINTED)) {
    const sub = mkdtempSync(join(directory, "printed-"));
    writeFileSync(join(sub, "tables.js"), code);
    writeFileSync(join(sub, "entry.js"), 'import { used } from "./tables.js";\nconsole.log(String(used()));\n');
    const written = execFileSync(process.execPath, [join(sub, "entry.js")], { encoding: "utf8" }).trim().replace(/\n/gu, " | ");
    const otherwise = [];
    for (const [name, bundle] of bundlers) {
      writeFileSync(join(sub, "out.mjs"), await bundle(join(sub, "entry.js")));
      const printed = execFileSync(process.execPath, [join(sub, "out.mjs")], { encoding: "utf8" }).trim().replace(/\n/gu, " | ");
      if (printed !== written) otherwise.push(`${name} (${printed})`);
    }
    console.log(`  ${label}, as written (${written}): ${otherwise.length ? otherwise.join("; ") : "none"}`);
  }
  console.log("Bundles whose program finds the object unfrozen after a marked call in each position of a function it runs:");
  for (const [label, statement] of Object.entries(UNFROZEN)) {
    const sub = mkdtempSync(join(directory, "unfrozen-"));
    writeFileSync(join(sub, "freeze.js"), `${LOCKS}\nexport function freezeIt(row) {\n  ${statement}\n  return row;\n}\n`);
    writeFileSync(join(sub, "entry.js"), 'import { freezeIt } from "./freeze.js";\nconsole.log(Object.isFrozen(freezeIt({ a: { b: 1 } })) ? "frozen" : "not frozen");\n');
    const unfrozen = await runs(sub);
    console.log(`  ${label}, \`${statement}\`: ${unfrozen.length ? unfrozen.join("; ") : "none"}`);
  }
  console.log("Bundles whose program finds the module's value unfrozen after a marked call when the module loads:");
  for (const [label, code] of Object.entries(UNFROZEN_AT_LOAD)) {
    const sub = mkdtempSync(join(directory, "at-load-"));
    for (const [name, text] of Object.entries(typeof code === "string" ? { "module.js": code } : code)) {
      const js = name.endsWith(".ts") ? (await esbuild.transform(text, { loader: "ts", format: "esm", target: "es2022" })).code : text;
      writeFileSync(join(sub, name.replace(/\.ts$/u, ".js")), js);
    }
    writeFileSync(join(sub, "entry.js"), 'import { read } from "./module.js";\nconsole.log(Object.isFrozen(read()) ? "frozen" : "not frozen");\n');
    const unfrozen = await runs(sub);
    console.log(`  ${label}: ${unfrozen.length ? unfrozen.join("; ") : "none"}`);
  }
  console.log("Bundles whose program finds no callback stored after a marked call when the module loads:");
  for (const [label, code] of Object.entries(DROPPED)) {
    const sub = mkdtempSync(join(directory, "dropped-"));
    writeFileSync(join(sub, "module.js"), code);
    writeFileSync(join(sub, "entry.js"), 'import { handlers } from "./module.js";\nconsole.log(handlers.length ? "stored" : "not stored");\n');
    const dropped = [];
    for (const [name, bundle] of bundlers) {
      writeFileSync(join(sub, "out.mjs"), await bundle(join(sub, "entry.js")));
      if (execFileSync(process.execPath, [join(sub, "out.mjs")], { encoding: "utf8" }).trim() === "not stored") dropped.push(name);
    }
    console.log(`  ${label}: ${dropped.length ? dropped.join("; ") : "none"}`);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
