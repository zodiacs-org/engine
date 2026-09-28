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
  "dist/crossings.d.ts",
  "dist/crossings.js",
  "dist/deltat.d.ts",
  "dist/deltat.js",
  "dist/geo.d.ts",
  "dist/geo.js",
  "dist/receipt.d.ts",
  "dist/receipt.js",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/internal-math.d.ts",
  "dist/internal-math.js",
  "dist/internal.d.ts",
  "dist/internal.js",
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
assert(
  report.unpackedSize < 300_000,
  `package is unexpectedly large: ${report.unpackedSize} bytes unpacked`
);

// The licence expression covers the code (MIT) and the ΔT values (CC BY 4.0),
// and the packed licensing files say the same.
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("package.json"));
const LICENSE_EXPRESSION = "MIT AND CC-BY-4.0";
assert.equal(manifest.license, LICENSE_EXPRESSION, "package.json license must cover the MIT code and the CC BY 4.0 ΔT values");
assert(read("LICENSING.md").includes(`SPDX licence expression: \`${LICENSE_EXPRESSION}\``), "LICENSING.md must state the package's SPDX expression");
assert(read("LICENSE").startsWith("MIT License"), "LICENSE must be the MIT licence");
const notice = read("NOTICE");
for (const phrase of ["Table S15", "Creative Commons Attribution 4.0 International (CC BY 4.0)", "@zodiacs/engine/deltat", "shared chunk under dist/"]) {
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
  assert(read(name).includes("shared chunk under `dist/`"), `${name} must say the ΔT values are in a shared chunk under dist/`);
}
assert(read("README.md").includes(LICENSE_EXPRESSION), "README.md must state the licence expression");
// The shipped text refers to the separate earlier package without naming it.
for (const file of files) {
  assert(!read(file).includes("@zodiacs/sdk"), `${file} names the separate earlier package`);
}
// astronomy-engine's ESM is loaded as ESM by plain Node only from 20.19.0 and 22.7.0.
assert.equal(manifest.engines?.node, "^20.19.0 || >=22.7.0", "package.json engines must name the Node versions that load astronomy-engine");

console.log(
  `@zodiacs/engine package contents passed (${files.length} files, ${report.unpackedSize} bytes unpacked; ` +
    `license ${manifest.license}; node ${manifest.engines.node})`
);
