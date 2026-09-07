import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

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

console.log(
  `@zodiacs/engine package contents passed (${files.length} files, ${report.unpackedSize} bytes unpacked)`
);
