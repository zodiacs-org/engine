// Import graphs of each entry point in one or more packages, as
// scripts/verify-package-contents.mjs counts them: the JavaScript a plain
// `import` of an entry loads, statically and transitively (astronomy-engine
// and declarations not counted). For the root entry the bytes are also split
// by the source module that each region of a file comes from (the build
// marks each module's code with `// src/...`); lines before the first mark
// are the file's imports, and the closing `export { ... }` its exports.
//
// Each package's files, as its package.json `files` packs them, are also
// split by what loads them: the root's import graph; the other JavaScript,
// which only the opt-in entry points load, the zone histories apart;
// declarations, those the root's index.d.ts reaches and the others; and the
// documents and the manifest. Each graph's headroom is its budget in
// scripts/verify-package-contents.mjs over its size, as a percentage of the
// size.
//
//   node sizes.mjs <label>=<package directory> ... > sizes.json
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// scripts/verify-package-contents.mjs, rc.15.
const BUDGETS = {
  ".": 100_000, "./crossings": 10_000, "./deltat": 5_500, "./geo": 35_000, "./internal": 60_000,
  "./internal/math": 20_000, "./receipt": 70_000, "./timing": 120_000, "./vedic": 120_000
};
const SHARD_BUDGET = 200_000;
const TOTAL_CAP = 700_000;
const SHARD = /^dist\/tzdb-\d{4}[a-z]-\d{2}-[A-Za-z0-9]+\.js$/u;
const headroom = (bytes, budget) => (budget === undefined ? null : Number((((budget - bytes) / bytes) * 100).toFixed(2)));

/** The files `files` packs: `dist/*<extension>` patterns and named files, and package.json. */
function packed(root, manifest) {
  const out = new Set(["package.json"]);
  for (const pattern of manifest.files) {
    const star = /^dist\/\*(\.[a-z.]+)$/u.exec(pattern);
    if (star) {
      for (const name of readdirSync(join(root, "dist"))) if (name.endsWith(star[1])) out.add(`dist/${name}`);
    } else out.add(pattern);
  }
  return [...out].sort();
}

/** Declarations that dist/index.d.ts reaches through relative imports. */
function rootDeclarations(root) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const match of readFileSync(join(root, file), "utf8").matchAll(/\bfrom\s*["'](\.\/[^"']+)["']|import\(\s*["'](\.\/[^"']+)["']\s*\)/gmu)) {
      visit(`dist/${(match[1] ?? match[2]).slice(2).replace(/\.js$/u, "")}.d.ts`);
    }
  };
  visit("dist/index.d.ts");
  return seen;
}

function packageSplit(root, manifest, core) {
  const declarations = rootDeclarations(root);
  const split = { rootJs: 0, optInJs: 0, zoneHistories: 0, rootDeclarations: 0, otherDeclarations: 0, documents: 0, manifest: 0 };
  const files = packed(root, manifest);
  let zoneFiles = 0;
  for (const file of files) {
    const bytes = statSync(join(root, file)).size;
    const kind = file === "package.json" ? "manifest"
      : file.endsWith(".d.ts") ? (declarations.has(file) ? "rootDeclarations" : "otherDeclarations")
      : file.endsWith(".js") ? (core.has(file) ? "rootJs" : SHARD.test(file) ? "zoneHistories" : "optInJs")
      : "documents";
    if (kind === "zoneHistories") zoneFiles += 1;
    split[kind] += bytes;
  }
  const total = Object.values(split).reduce((sum, bytes) => sum + bytes, 0);
  return { files: files.length, total, cap: TOTAL_CAP, headroomPercent: headroom(total, TOTAL_CAP), split, zoneHistories: { files: zoneFiles, budget: SHARD_BUDGET, headroomPercent: headroom(split.zoneHistories, SHARD_BUDGET) } };
}

const IMPORT = /^(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gmu;

function graph(root, entry) {
  const sizes = new Map();
  const visit = (file) => {
    if (sizes.has(file)) return;
    const code = readFileSync(join(root, file), "utf8");
    sizes.set(file, code);
    for (const match of code.matchAll(IMPORT)) {
      const specifier = match[1] ?? match[2];
      if (specifier.startsWith("./")) visit(`dist/${specifier.slice(2)}`);
    }
  };
  visit(entry);
  return sizes;
}

function byModule(files) {
  const out = {};
  const add = (key, text) => { out[key] = (out[key] ?? 0) + Buffer.byteLength(text); };
  for (const [file, code] of files) {
    const marks = [...code.matchAll(/^\/\/ (src\/.*\S)[ \t]*$/gmu)];
    const exportAt = code.search(/^export \{[^}]*\};?\s*$/mu);
    const end = exportAt >= 0 ? exportAt : code.length;
    add("(imports)", code.slice(0, marks.length ? marks[0].index : end));
    marks.forEach((mark, index) => add(mark[1], code.slice(mark.index, index + 1 < marks.length ? marks[index + 1].index : end)));
    if (exportAt >= 0) add("(exports)", code.slice(exportAt));
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

const report = {};
for (const argument of process.argv.slice(2)) {
  const [label, root] = argument.split("=");
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const entries = {};
  const graphs = Object.fromEntries(Object.entries(manifest.exports).map(([name, target]) => [name, graph(root, target.import.replace(/^\.\//u, ""))]));
  const core = graphs["."];
  for (const [name, files] of Object.entries(graphs)) {
    const bytes = [...files.values()].reduce((sum, code) => sum + Buffer.byteLength(code), 0);
    const beyond = [...files].filter(([file]) => !core.has(file)).reduce((sum, [, code]) => sum + Buffer.byteLength(code), 0);
    entries[name] = { files: files.size, bytes, beyondCore: beyond, budget: BUDGETS[name] ?? null, headroomPercent: headroom(bytes, BUDGETS[name]) };
  }
  report[label] = { version: manifest.version, entries, coreByModule: byModule(core), package: packageSplit(root, manifest, new Set(core.keys())) };
}
// The growth from the first package to each later one, by the same split.
const labels = Object.keys(report);
for (const label of labels.slice(1)) {
  const [from, to] = [report[labels[0]].package, report[label].package];
  const growth = to.total - from.total;
  report[label].package.growthFrom = {
    label: labels[0],
    bytes: growth,
    split: Object.fromEntries(Object.keys(to.split).map((key) => {
      const bytes = to.split[key] - from.split[key];
      return [key, { bytes, percentOfGrowth: Number(((bytes / growth) * 100).toFixed(2)) }];
    }))
  };
}
process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
