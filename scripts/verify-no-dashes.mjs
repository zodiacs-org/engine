// No en dash (U+2013) and no em dash (U+2014) in the documents this script
// names, from 3.0.0: the house rule for prose (AGENTS.md), held by CI.
//
//   node scripts/verify-no-dashes.mjs
//
// It reads README.md, CHANGELOG.md, LICENSING.md, NOTICE, docs/calc.md,
// skills/zodiacs-compute/SKILL.md, tools/wheel/README.md and every PARKED.md
// in the repository, each that exists. CHANGELOG.md is read down to its first
// entry for a version that artifacts/archives.json carries an archive of:
// that entry and the ones below it are what earlier archives shipped, and the
// rule does not rewrite them; the entries above it, the ones still to be cut,
// are read. Every other file is read whole. A file it names that does not
// exist is not an error, so that it can name the files of jobs not merged
// yet; PARKED.md files are found by git, which lists the ones committed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DOCUMENTS = Object.freeze([
  "README.md",
  "CHANGELOG.md",
  "LICENSING.md",
  "NOTICE",
  "docs/calc.md",
  "skills/zodiacs-compute/SKILL.md",
  "tools/wheel/README.md"
]);
const DASH = /[\u2013\u2014]/gu;

/** The part of CHANGELOG.md the rule reads: the lines above the first heading of a version in `carried`. */
export function activeChangelog(text, carried) {
  const lines = text.split("\n");
  const first = lines.findIndex((line) => {
    const version = /^## +v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)\b/u.exec(line)?.[1];
    return version !== undefined && carried.includes(version);
  });
  return first === -1 ? lines : lines.slice(0, first);
}

/** Each dash in `lines`, as `file:line:column: the line`. */
export function dashesIn(file, lines) {
  const found = [];
  lines.forEach((line, index) => {
    for (const match of line.matchAll(DASH)) {
      found.push(`${file}:${index + 1}:${match.index + 1}: U+${match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, "0")} in "${line.trim().slice(0, 100)}"`);
    }
  });
  return found;
}

function main() {
  const carried = JSON.parse(readFileSync(`${ROOT}artifacts/archives.json`, "utf8")).archives.map((entry) => entry.version);
  const parked = execFileSync("git", ["ls-files", "--", "PARKED.md", "**/PARKED.md"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const files = [...DOCUMENTS, ...parked].filter((file) => existsSync(`${ROOT}${file}`));
  const found = [];
  let lines = 0;
  for (const file of files) {
    const text = readFileSync(`${ROOT}${file}`, "utf8");
    const read = file === "CHANGELOG.md" ? activeChangelog(text, carried) : text.split("\n");
    lines += read.length;
    found.push(...dashesIn(file, read));
  }
  if (found.length > 0) {
    console.error(`no-dashes failed: ${found.length} en or em dash${found.length === 1 ? "" : "es"} (use a comma, a colon, a full stop, parentheses, or "to" for a range):\n${found.join("\n")}`);
    process.exit(1);
  }
  console.log(`no-dashes passed: no en or em dash in ${lines} lines of ${files.join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
