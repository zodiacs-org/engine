import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8"
});
const report = JSON.parse(output)[0];
assert(report, "npm pack returned no report");

const files = report.files.map((entry) => entry.path).sort();
const required = [
  "CHANGELOG.md",
  "LICENSE",
  "LICENSING.md",
  "NOTICE",
  "README.md",
  "dist/calc.d.ts",
  "dist/calc.js",
  "dist/crossings.d.ts",
  "dist/crossings.js",
  "dist/deltat.d.ts",
  "dist/deltat.js",
  "dist/geo.d.ts",
  "dist/geo.js",
  "dist/houses-extra.d.ts",
  "dist/houses-extra.js",
  "dist/receipt.d.ts",
  "dist/receipt.js",
  "dist/techniques.d.ts",
  "dist/techniques.js",
  "dist/sky.d.ts",
  "dist/sky.js",
  "dist/timing.d.ts",
  "dist/timing.js",
  "dist/vedic.d.ts",
  "dist/vedic.js",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/internal-math.d.ts",
  "dist/internal-math.js",
  "dist/internal.d.ts",
  "dist/internal.js",
  "dist/window.d.ts",
  "dist/window.js",
  "package.json"
];
for (const file of required) {
  assert(files.includes(file), `packed package is missing ${file}`);
}

for (const file of files) {
  assert(!file.includes("node_modules"), `dependency leaked into package: ${file}`);
  assert(!file.includes("src/"), `source file leaked into package: ${file}`);
  assert(!file.includes("data/"), `data file leaked into package: ${file}`);
  assert(!file.endsWith(".map"), `source map leaked into package: ${file}`);
}

// Sizes. From 0.1.1-rc.15 the package is gated by budgets rather than by one
// unpacked total: one for each entry point's own import graph, one for the
// zone histories, and a stated cap on the whole package.
//
// An entry's import graph is the JavaScript a plain `import` of it loads: its
// file under dist/ and every chunk it imports, statically and transitively.
// astronomy-engine, the one dependency, is not counted, and neither are
// declarations, which no runtime loads. The root entry (".") is the core: a
// consumer that imports only it loads only its graph, because the root
// imports no subpath (scripts/module-resolution-smoke.mjs checks that it
// reaches no timing, Vedic or geo module and no zone history).
//
// Each budget is 0.1.1-rc.15's measured graph as first cut, stated beside
// it, with headroom from 4.96 per cent of that size (the root) to 11.32 per
// cent (/receipt). docs/evidence/rc15-20260929/sizes.json gives later
// measurements and each one's headroom. A budget is raised only in a
// candidate whose CHANGELOG says so, with the reason; never in passing.
const ENTRY_BUDGETS = {
  // rc.14: 81,712 bytes. rc.15: 95,273. Of the 13,561 bytes more, 10,294 are
  // the time basis every chart now needs (the leap-second and IERS UT1
  // tables, 5,300, and src/time-scale.ts, 4,994), 1,069 its use in the
  // ephemeris and the API, 655 the Placidus bisection, and 1,543 the imports
  // and exports of the chunks the new entry points share with the root
  // (docs/evidence/rc15-20260929/sizes.json).
  ".": 100_000,
  "./crossings": 10_000, // rc.15: 9,410
  "./deltat": 5_500, // rc.15: 4,968
  // rc.15: 31,672, the zone histories not included (below). With ./techniques
  // 32,136: the local-time code moves to a chunk the two entries share, and
  // geo.js re-exports it.
  "./geo": 35_000,
  // Unreleased (feature-houses-extra): 13,606, one file that imports no other
  // module, the root's included, so that its graph cannot grow with the core
  // (docs/evidence/houses-extra-2026-09-29/).
  "./houses": 15_000,
  "./internal": 60_000, // rc.15: 56,961
  "./internal/math": 20_000, // rc.15: 18,165
  "./receipt": 70_000, // rc.15: 62,880
  // Returns, composite and Davison charts, the void-of-course Moon, aspect
  // patterns, dignities and Moon-sign candidates, moved from Zodiacs.org:
  // 141,745 as first built, with the core's graph and the local-time chunk
  // it shares with ./geo (docs/evidence/techniques-2026-09-29/); 5.8 per
  // cent of headroom.
  "./techniques": 150_000,
  // Unreleased: rise, set, transit and planetary hours, 83,184 bytes, of which
  // 15,832 are beyond the core's graph; it reaches the ephemeris chunk for the
  // engine's clock (onChartClock), and so the core modules that chunk imports.
  "./sky": 92_000,
  "./timing": 120_000, // rc.15: 112,485, the core's graph included; with planetary returns (unreleased) 114,646
  "./vedic": 120_000 // rc.15: 114,106, the core's graph included
};

/** The dist/ files an entry loads statically, with their bytes. */
function importGraph(entry) {
  const sizes = new Map();
  const visit = (file) => {
    if (sizes.has(file)) return;
    assert(files.includes(file), `${file} is imported but not packed`);
    const code = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    sizes.set(file, Buffer.byteLength(code));
    // Static imports and re-exports, as the build writes them: a statement at
    // the start of a line. Dynamic import() calls (the zone histories) are not
    // part of the graph.
    for (const match of code.matchAll(/^(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gmu)) {
      const specifier = match[1] ?? match[2];
      if (specifier === "astronomy-engine") continue;
      assert(specifier.startsWith("./"), `${file} imports ${specifier}`);
      visit(`dist/${specifier.slice(2)}`);
    }
  };
  visit(entry);
  return sizes;
}

const exported = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).exports;
assert.deepEqual(Object.keys(exported).sort(), Object.keys(ENTRY_BUDGETS).sort(),
  "every entry point in package.json exports needs a budget here, and every budget an entry point");
const graphs = Object.fromEntries(Object.entries(exported).map(([name, target]) => {
  const sizes = importGraph(target.import.replace(/^\.\//u, ""));
  return [name, { files: sizes.size, bytes: [...sizes.values()].reduce((sum, size) => sum + size, 0), sizes }];
}));
for (const [name, graph] of Object.entries(graphs)) {
  assert(graph.bytes <= ENTRY_BUDGETS[name],
    `the ${name} entry's import graph is ${graph.bytes} bytes, over its budget of ${ENTRY_BUDGETS[name]}`);
}

// The zone histories before 1970: tzdb data, not code, loaded only by
// @zodiacs/engine/geo and only on request (prepareLocalTime), one of 16 files
// per call, so no core or post-1970 consumer ever downloads them. They have a
// budget of their own, sized for this tzdb release with room for the next
// (rc.15: 189,144 bytes), so that they cannot hide growth in the code.
const SHARD = /^dist\/tzdb-\d{4}[a-z]-\d{2}-[A-Za-z0-9]+\.js$/;
const SHARD_COUNT = 16;
const SHARD_BUDGET = 200_000;
const shards = report.files.filter((entry) => SHARD.test(entry.path));
const shardBytes = shards.reduce((sum, entry) => sum + entry.size, 0);
assert.equal(shards.length, SHARD_COUNT, `expected ${SHARD_COUNT} zone-history shards, found ${shards.length}`);
assert(
  files.every((file) => SHARD.test(file) || !file.startsWith("dist/tzdb-")),
  "an unexpected tzdb file is in the package"
);
assert(shardBytes < SHARD_BUDGET, `zone-history shards are unexpectedly large: ${shardBytes} bytes`);

// The whole package. Until rc.14 one cap, 300,000 bytes unpacked, bounded
// everything; rc.14 was 282,469. rc.15 as first cut was 634,490, 352,021
// more (docs/evidence/rc15-20260929/sizes.json): 274,897 bytes (78.09 per
// cent of the growth) of JavaScript that only the opt-in entry points load,
// 189,144 of them /geo's zone histories; 48,380 (13.75 per cent) of
// declarations, which no runtime loads; 15,183 (4.32 per cent) of README,
// CHANGELOG, licences and manifest; and 13,561 (3.86 per cent) of the root's
// own graph, 11,363 of them the time basis, which the root's budget above
// holds. Code that imports only the root loads only that graph. The cap is
// 700,000 bytes, with room for the documentation of the next candidate.
const TOTAL_CAP = 700_000;
assert(report.unpackedSize <= TOTAL_CAP, `package is unexpectedly large: ${report.unpackedSize} bytes unpacked, over ${TOTAL_CAP}`);

// The licence expression covers the code (MIT) and the ΔT values (CC BY 4.0),
// and the packed licensing files say the same.
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
/** A file's text with each run of white space made one space, so rewrapping cannot hide a phrase. */
const prose = (name) => read(name).replace(/\s+/gu, " ");
const manifest = JSON.parse(read("package.json"));
const LICENSE_EXPRESSION = "MIT AND CC-BY-4.0";
assert.equal(manifest.license, LICENSE_EXPRESSION, "package.json license must cover the MIT code and the CC BY 4.0 ΔT values");
assert(read("LICENSING.md").includes(`SPDX licence expression: \`${LICENSE_EXPRESSION}\``), "LICENSING.md must state the package's SPDX expression");
assert(read("LICENSE").startsWith("MIT License"), "LICENSE must be the MIT licence");
const notice = prose("NOTICE");
for (const phrase of ["Table S15", "Creative Commons Attribution 4.0 International (CC BY 4.0)", "@zodiacs/engine/deltat",
  "shared chunk under dist/", "dist/deltat.js re-exports"]) {
  assert(notice.includes(phrase), `NOTICE must carry the ΔT attribution (${phrase})`);
}
// NOTICE, LICENSING.md and the README say where the values are: in one shared
// chunk that dist/deltat.js re-exports, not in dist/deltat.js itself. Check the
// build still puts them there, without naming the chunk's hashed file name.
const holders = files.filter((file) => file.endsWith(".js") && read(file).includes('"zodiacs-deltat/1"'));
assert(holders.length === 1 && /^dist\/chunk-[^/]+\.js$/u.test(holders[0]),
  `the ΔT model must be in exactly one shared chunk under dist/, as NOTICE says; found it in ${holders.join(", ") || "no file"}`);
assert(read("dist/deltat.js").includes(`./${holders[0].slice("dist/".length)}`), "dist/deltat.js must re-export the chunk that holds the ΔT model");
for (const name of ["LICENSING.md", "README.md"]) {
  assert(prose(name).includes("shared chunk under `dist/`"), `${name} must say the ΔT values are in a shared chunk under dist/`);
  assert(prose(name).includes("`dist/deltat.js` re-exports"), `${name} must say that dist/deltat.js re-exports that chunk`);
}
assert(read("README.md").includes(LICENSE_EXPRESSION), "README.md must state the licence expression");
// The shipped text refers to the separate earlier package without naming it.
for (const file of files) {
  assert(!read(file).includes("@zodiacs/sdk"), `${file} names the separate earlier package`);
}
// astronomy-engine's ESM is loaded as ESM by plain Node only from 20.19.0 and 22.7.0.
assert.equal(manifest.engines?.node, "^20.19.0 || >=22.7.0", "package.json engines must name the Node versions that load astronomy-engine");

/** Bytes an entry's graph holds beyond the core's: what importing it adds to an app that imports the root. */
const beyondCore = (graph) =>
  [...graph.sizes].filter(([file]) => !graphs["."].sizes.has(file)).reduce((sum, [, size]) => sum + size, 0);
const budgets = Object.entries(graphs)
  .map(([name, graph]) => `${name} ${graph.bytes} of ${ENTRY_BUDGETS[name]}` + (name === "." ? "" : ` (${beyondCore(graph)} beyond the core's)`))
  .join(", ");
console.log(
  `@zodiacs/engine package contents passed (${files.length} files, ${report.unpackedSize} bytes unpacked of ${TOTAL_CAP}; ` +
    `import graphs: ${budgets}; zone histories ${shardBytes} of ${SHARD_BUDGET} in ${shards.length} files; ` +
    `license ${manifest.license}; node ${manifest.engines.node})`
);
