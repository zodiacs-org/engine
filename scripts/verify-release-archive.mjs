/**
 * The archive a release publishes. Given a version, this checks in the work
 * tree that artifacts/archives.json has exactly one carried entry for it,
 * naming zodiacs-engine-<version>.tgz, and that the archive's size and SHA-256
 * are the entry's and its .sha256 receipt's. artifacts/, the archive and the
 * receipt must be a real directory and regular files, not symbolic links.
 *
 * The release workflow (.github/workflows/release.yml) runs it on a fresh
 * checkout twice: before the archive-binding check, and again in the job that
 * publishes, on the file npm is about to upload. It checks one entry only; the
 * binding check (scripts/verify-archive-binding.mjs) covers the manifest,
 * the history and the rebuild.
 *
 * Usage: node scripts/verify-release-archive.mjs <version> [--root DIR]
 * DIR is the top of the work tree (by default, this script's repository).
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// SemVer 2.0.0 without build metadata and without a "v" prefix.
const IDENTIFIER = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";
const STRICT_VERSION = new RegExp(
  `^(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-${IDENTIFIER}(?:\\.${IDENTIFIER})*)?$`
);

function fail(message) {
  console.error(`release archive: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
let root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const positional = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--root") {
    if (index + 1 >= args.length) fail("--root needs a directory");
    root = resolve(args[index + 1]);
    index += 1;
  } else {
    positional.push(args[index]);
  }
}
if (positional.length !== 1) fail("usage: node scripts/verify-release-archive.mjs <version> [--root DIR]");
const [version] = positional;
if (!STRICT_VERSION.test(version)) {
  fail(`${JSON.stringify(version)} is not a semantic version without a "v" prefix or build metadata`);
}

const artifacts = join(root, "artifacts");
const file = `zodiacs-engine-${version}.tgz`;
const receiptFile = `zodiacs-engine-${version}.sha256`;

// lstat, so that a symbolic link is seen as one and never followed.
function kind(path) {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) return "missing";
  if (stat.isSymbolicLink()) return "a symbolic link";
  if (stat.isDirectory()) return "a directory";
  if (stat.isFile()) return "a regular file";
  return "another kind of file";
}
const artifactsKind = kind(artifacts);
if (artifactsKind !== "a directory") fail(`artifacts/ must be a directory; it is ${artifactsKind}`);
for (const name of ["archives.json", file, receiptFile]) {
  const found = kind(join(artifacts, name));
  if (found !== "a regular file") fail(`artifacts/${name} must be a regular file; it is ${found}`);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(artifacts, "archives.json"), "utf8"));
} catch (error) {
  fail(`artifacts/archives.json is not valid JSON: ${error.message}`);
}
if (!Array.isArray(manifest?.archives)) fail("artifacts/archives.json has no archives list");
const entries = manifest.archives.filter((entry) => entry?.version === version && entry?.status === "carried");
if (entries.length !== 1) {
  fail(`artifacts/archives.json has ${entries.length} carried entries for ${version}; publishing needs exactly one`);
}
const [entry] = entries;
if (entry.file !== file) fail(`the carried entry for ${version} names ${JSON.stringify(entry.file)}, not ${file}`);
if (!/^[0-9a-f]{64}$/.test(entry.sha256 ?? "")) fail(`the carried entry for ${version} has no SHA-256`);

const bytes = readFileSync(join(artifacts, file));
const digest = createHash("sha256").update(bytes).digest("hex");
if (bytes.length !== entry.bytes) fail(`${file} is ${bytes.length} bytes; the manifest records ${entry.bytes}`);
if (digest !== entry.sha256) fail(`${file} has SHA-256 ${digest}; the manifest records ${entry.sha256}`);
if (readFileSync(join(artifacts, receiptFile), "utf8") !== `${entry.sha256}  ${file}\n`) {
  fail(`${receiptFile} is not the receipt "${entry.sha256}  ${file}" and a newline`);
}

console.log(`release archive: artifacts/${file}, ${bytes.length} bytes, SHA-256 ${digest}, matches its carried entry and receipt`);
