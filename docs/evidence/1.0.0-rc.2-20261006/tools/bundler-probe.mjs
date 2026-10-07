// Which forms of a table a bundler leaves out of a program that does not read
// it. Writes a module of small tables, each with a marker string and none
// read, and a program that imports only a function beside them, to a
// temporary directory, the module importing one array from "outside", a
// module each bundler is told to leave outside, which it cannot see into;
// bundles the program with esbuild (the engine's own,
// from its node_modules), plain and minified, and, when their package
// directories are given, with Rolldown, at its default, which leaves out
// what it finds unused but does not minify, and minified, Vite, whose
// bundler is Rolldown, and Rollup; and prints which tables each bundle keeps.
// The tables' labels say which calls are marked /*#__PURE__*/.
//
// Then, for each of four statements that carry a marked freeze whose value is
// discarded, bundles a program that reads the table and prints whether it is
// still frozen: a bundler that drops the marked call drops the freeze too.
//
//   node bundler-probe.mjs <engine checkout> [<Rolldown package directory> [<Vite package directory> [<Rollup package directory>]]]
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [checkout, rolldownDirectory, vite, rollupDirectory] = process.argv.slice(2);
if (!checkout) {
  console.error("usage: node bundler-probe.mjs <engine checkout> [<Rolldown package directory> [<Vite package directory> [<Rollup package directory>]]]");
  process.exit(2);
}
const TABLES = {
  "A, the freeze marked, its map not": 'export const A = /*#__PURE__*/ Object.freeze(SIGNS.map((s) => s.slug + "A-marker"));',
  "B, the freeze and its map marked": 'export const B = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ SIGNS.map((s) => s.slug + "B-marker"));',
  "C, the freeze and a map over a split marked": 'export const C = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ ROWS.split("\\n").map((l) => l + "C-marker"));',
  "D, the outer freeze marked, an entry's not": 'export const D = /*#__PURE__*/ Object.freeze([Object.freeze({ k: "D-inner" })]);',
  "E, the outer freeze and the entry's marked": 'export const E = /*#__PURE__*/ Object.freeze([/*#__PURE__*/ Object.freeze({ k: "E-inner" })]);',
  "F, a freeze of Object.keys, both marked": 'export const F = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ Object.keys({ "F-key": 1 }));',
  "G, a freeze unmarked": 'export const G = Object.freeze(["G-unmarked"]);',
  "H, the freeze marked, its Array.from not": 'export const H = /*#__PURE__*/ Object.freeze(Array.from({ length: 2 }, (_, i) => "H-marker" + i));',
  "I, a map over a literal and its freezes marked": 'export const I = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ [["I-x", 1]].map(([n, y]) => /*#__PURE__*/ Object.freeze({ n, y })));',
  "J, a marked freeze of a spread of a table": 'export const J = /*#__PURE__*/ Object.freeze({ ...BASE, j: "J-x" });',
  "K, the same built in a function called in place, the call marked": 'export const K = /*#__PURE__*/ (() => Object.freeze({ ...BASE, k: "K-x" }))();',
  "L, a marked freeze of a quotient": 'export const L = /*#__PURE__*/ Object.freeze(["L-x", 5 / 24]);',
  "M, a value a function of the module freezes, the call marked": 'export const M = /*#__PURE__*/ make("M-x");',
  "N, a Set of data, marked": 'export const N = /*#__PURE__*/ new Set(["N-x"]);',
  "O, a Set of data, unmarked": 'export const O = new Set(["O-x"]);',
  "P, a Set of a table's entries, unmarked": 'export const P = new Set(LIST_P);',
  "Q, a Set of a table's entries, marked": 'export const Q = /*#__PURE__*/ new Set(LIST_Q);',
  "R, a table frozen by a statement of its own": 'const R_T = ["R-x"];\nObject.freeze(R_T);',
  "S, a table frozen by an if statement": 'const S_T = ["S-x"];\nif (S_T.length) Object.freeze(S_T);',
  "T, a frozen static field": 'export class T_C { static all = Object.freeze(["T-x"]); }',
  "U, a freeze in a static block": 'const U_T = ["U-x"];\nexport class U_C { static { Object.freeze(U_T); } }',
  "V, a marked freeze of a spread of an object literal": 'export const V = /*#__PURE__*/ Object.freeze({ ...{ v: "V-x" } });',
  "W, a marked freeze of a spread of an array literal": 'export const W = /*#__PURE__*/ Object.freeze([...["W-x"]]);',
  "X, a marked freeze of a property read": 'export const X = /*#__PURE__*/ Object.freeze([BASE.base, "X-x"]);',
  "Y, a marked freeze of a template with a substitution": 'export const Y = /*#__PURE__*/ Object.freeze([`${KEY}Y-x`]);',
  "Z, a marked table and a value read from it when the module loads": 'export const Z = /*#__PURE__*/ Object.freeze({ from: 2, tag: "Z-x" });\nconst Z_FROM = (Z.from - 1) * 2;\nexport function zFrom() { return Z_FROM; }',
  "AA, a marked call that spreads an array literal into its arguments": 'export const AA = /*#__PURE__*/ Object.freeze([/*#__PURE__*/ Math.max(...[1, 2]), "AA-x"]);',
  "AB, a freeze of a map over an array imported from outside, neither marked, the callback reading nothing": 'export const AB = Object.freeze([OUTSIDE.map(() => 1), "AB-x"]);',
  "AC, the same over an array of the module": 'export const AC = Object.freeze([LOCAL.map(() => 1), "AC-x"]);'
};
const MARKERS = {
  A: "A-marker", B: "B-marker", C: "C-marker", D: "D-inner", E: "E-inner", F: "F-key", G: "G-unmarked", H: "H-marker", I: "I-x", J: "J-x", K: "K-x", L: "L-x", M: "M-x",
  N: "N-x", O: "O-x", P: "P-x", Q: "Q-x", R: "R-x", S: "S-x", T: "T-x", U: "U-x", V: "V-x", W: "W-x", X: "X-x", Y: "Y-x", Z: "Z-x",
  AA: "AA-x", AB: "AB-x", AC: "AC-x"
};
const key = (label) => label.slice(0, label.indexOf(","));
const DISCARDED = {
  "after &&": "ok && /*#__PURE__*/ Object.freeze(TABLE);",
  "in a conditional": "ok ? /*#__PURE__*/ Object.freeze(TABLE) : null;",
  "on the right of a comma": "(0, /*#__PURE__*/ Object.freeze(TABLE));",
  "in a for loop's update": "for (let i = 0; i < 1; i += 1, /*#__PURE__*/ Object.freeze(TABLE));"
};

const OUTSIDE = ["outside"];
const require = createRequire(join(resolve(checkout), "package.json"));
const esbuild = require("esbuild");
const entryOf = (directory) => {
  const exported = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).exports["."];
  const target = typeof exported === "string" ? exported : exported.import?.default ?? exported.import ?? exported.default;
  return pathToFileURL(join(directory, target)).href;
};
const bundlers = [
  ["esbuild", async (entry) => (await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", external: OUTSIDE, write: false, logLevel: "silent" })).outputFiles[0].text],
  ["esbuild, minified", async (entry) => (await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", external: OUTSIDE, minify: true, write: false, logLevel: "silent" })).outputFiles[0].text]
];
const versions = [`esbuild ${esbuild.version}`];
if (rolldownDirectory) {
  const { rolldown, VERSION } = await import(entryOf(resolve(rolldownDirectory)));
  versions.push(`Rolldown ${VERSION}`);
  for (const [label, options] of [["Rolldown", {}], ["Rolldown, minified", { minify: true }]]) {
    bundlers.push([label, async (entry) => {
      const bundle = await rolldown({ input: entry, external: OUTSIDE, onLog() {} });
      const { output } = await bundle.generate({ format: "es", ...options });
      return output.map((chunk) => chunk.code ?? "").join("\n");
    }]);
  }
}
if (vite) {
  const { build, version } = await import(pathToFileURL(join(resolve(vite), "dist/node/index.js")).href);
  versions.push(`Vite ${version}`);
  bundlers.push(["Vite", async (entry) => {
    const result = await build({
      configFile: false, root: resolve(entry, ".."), publicDir: false, logLevel: "silent",
      build: { write: false, minify: true, rolldownOptions: { input: entry, external: OUTSIDE, preserveEntrySignatures: "strict", output: { entryFileNames: "entry.js" } } }
    });
    return (Array.isArray(result) ? result : [result]).flatMap((output) => output.output).filter((chunk) => chunk.type === "chunk").map((chunk) => chunk.code).join("\n");
  }]);
}
if (rollupDirectory) {
  const { rollup, VERSION } = await import(entryOf(resolve(rollupDirectory)));
  versions.push(`Rollup ${VERSION}`);
  bundlers.push(["Rollup", async (entry) => {
    const bundle = await rollup({ input: entry, external: OUTSIDE, onwarn() {} });
    const { output } = await bundle.generate({ format: "es" });
    return output.map((chunk) => chunk.code ?? "").join("\n");
  }]);
}

const directory = mkdtempSync(join(tmpdir(), "bundler-probe-"));
try {
  writeFileSync(join(directory, "tables.js"), [
    'import { OUTSIDE } from "outside";',
    'const LOCAL = [1, 2];',
    'const SIGNS = [{ slug: "aries" }, { slug: "taurus" }];',
    'const ROWS = "a|1\\nb|2";',
    'const KEY = "k";',
    'const BASE = /*#__PURE__*/ Object.freeze({ base: 1 });',
    'function make(value) { return Object.freeze({ value }); }',
    'const LIST_P = /*#__PURE__*/ Object.freeze(["P-x"]);',
    'const LIST_Q = /*#__PURE__*/ Object.freeze(["Q-x"]);',
    ...Object.values(TABLES),
    "export function used() { return 1; }",
    ""
  ].join("\n"));
  writeFileSync(join(directory, "entry.js"), 'import { used } from "./tables.js";\nexport const out = used();\n');
  console.log(versions.join(", "));
  console.log("Tables kept by a program that imports only used():");
  for (const [label, bundle] of bundlers) {
    const code = await bundle(join(directory, "entry.js"));
    const kept = Object.keys(TABLES).filter((label) => code.includes(MARKERS[key(label)])).map(key);
    console.log(`  ${label}: ${kept.length ? kept.join(", ") : "none"}`);
  }
  for (const label of Object.keys(TABLES)) console.log(`    ${label}`);
  console.log("Whether a table is still frozen after a marked freeze whose value is discarded:");
  for (const [label, statement] of Object.entries(DISCARDED)) {
    const sub = mkdtempSync(join(directory, "discarded-"));
    writeFileSync(join(sub, "table.js"), `const ok = true;\nconst TABLE = ["d"];\n${statement}\nexport function read() { return TABLE; }\n`);
    writeFileSync(join(sub, "entry.js"), 'import { read } from "./table.js";\nconsole.log(Object.isFrozen(read()) ? "frozen" : "not frozen");\n');
    const results = [];
    for (const [name, bundle] of bundlers) {
      writeFileSync(join(sub, "out.mjs"), await bundle(join(sub, "entry.js")));
      results.push(`${name}: ${execFileSync(process.execPath, [join(sub, "out.mjs")], { encoding: "utf8" }).trim()}`);
    }
    console.log(`  ${label}, \`${statement}\`: ${results.join("; ")}`);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
