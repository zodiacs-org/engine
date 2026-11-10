import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, readlink, realpath, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const calendarDirectory = fileURLToPath(new URL("..", import.meta.url));
const repositoryDirectory = path.resolve(calendarDirectory, "..");
const cacheParent = path.join(calendarDirectory, ".cache");
const defaultCache = path.join(cacheParent, "events-source");
const sourceLink = "../../../src";
const maximumBytes = 2_000_000;
const sourcePaths = ["aspects", "context", "eclipses", "engine", "longitude", "query", "root", "search", "stations", "types", "void"]
  .map(name => `events/src/${name}.ts`);
const expectedPaths = [...sourcePaths, "events/README.md", "events/LIMITATIONS.md", "events/QUERY.md", "LICENSE"];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", ["--no-optional-locks", "-C", repositoryDirectory, ...args], {
  maxBuffer: maximumBytes, stdio: ["ignore", "pipe", "pipe"]
});
const objectId = (...args) => git("rev-parse", "--verify", ...args).toString("utf8").trim();

async function statOrNull(target) {
  try { return await lstat(target); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function directory(target, check) {
  const stat = await statOrNull(target);
  if (stat === null) {
    if (check) throw new Error(`Missing events cache directory: ${target}`);
    await mkdir(target);
  } else if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Events cache directory must not be a link: ${target}`);
  }
}

function validateManifest(manifest) {
  if (manifest.schema !== "zodiacs-calendar-events-source/1" ||
      manifest.repository !== "https://github.com/zodiacs-org/engine" ||
      manifest.branch !== "origin/infra/events" ||
      ![manifest.commit, manifest.engineTree, manifest.enginePackageBlob].every(value => /^[0-9a-f]{40}$/u.test(value)) ||
      !Array.isArray(manifest.files) || manifest.files.length !== expectedPaths.length) {
    throw new Error("Invalid events source manifest.");
  }
  const paths = new Set();
  for (const file of manifest.files) {
    if (!file || !expectedPaths.includes(file.path) || paths.has(file.path) ||
        !/^[0-9a-f]{40}$/u.test(file.blob) || !/^[0-9a-f]{64}$/u.test(file.sha256) ||
        !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes >= maximumBytes) {
      throw new Error("Invalid events source file record.");
    }
    paths.add(file.path);
  }
}

/**
 * Read pinned git objects into an ignored cache; never fetch or write git metadata.
 * Alternate cache directories must be direct children of calendar/.cache for tests.
 * Existing files are immutable: corruption is reported instead of silently edited.
 */
export async function prepareEvents({ check = false, cacheDirectory = defaultCache } = {}) {
  if (typeof check !== "boolean" || typeof cacheDirectory !== "string") {
    throw new TypeError("Invalid events preparation options.");
  }
  const cache = path.resolve(cacheDirectory);
  if (path.dirname(cache) !== path.resolve(cacheParent)) {
    throw new Error("Events cache must be a direct child of calendar/.cache.");
  }
  const manifestBytes = await readFile(new URL("../events-source.json", import.meta.url));
  if (manifestBytes.length >= maximumBytes) throw new Error("Events manifest is too large.");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  validateManifest(manifest);
  if (objectId(`${manifest.commit}^{commit}`) !== manifest.commit ||
      objectId(`${manifest.commit}:src`) !== manifest.engineTree ||
      objectId(`${manifest.commit}:package.json`) !== manifest.enginePackageBlob) {
    throw new Error("Events source commit does not match its engine compatibility pin.");
  }
  // Relative imports use the live parent sources. Refuse a different source revision
  // or tracked local modifications before creating or trusting an extraction.
  if (objectId("HEAD:src") !== manifest.engineTree ||
      objectId("HEAD:package.json") !== manifest.enginePackageBlob) {
    throw new Error("Parent engine source or package metadata differs from the events pin.");
  }
  try { git("diff", "--no-ext-diff", "--quiet", manifest.commit, "--", "src", "package.json"); }
  catch { throw new Error("Parent engine has changes relative to the events source pin."); }

  const files = [];
  for (const file of manifest.files) {
    if (objectId(`${manifest.commit}:${file.path}`) !== file.blob) {
      throw new Error(`Events source blob does not match the pin: ${file.path}`);
    }
    const bytes = git("cat-file", "blob", file.blob);
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) {
      throw new Error(`Events source bytes do not match the pin: ${file.path}`);
    }
    files.push({ relative: file.path, bytes });
  }
  files.push({ relative: "events-source.json", bytes: manifestBytes });
  await directory(cacheParent, check);
  await directory(cache, check);
  await directory(path.join(cache, "events"), check);
  await directory(path.join(cache, "events", "src"), check);
  const missing = [];
  for (const file of files) {
    const target = path.join(cache, file.relative);
    const stat = await statOrNull(target);
    if (stat === null) {
      if (check) throw new Error(`Missing pinned events cache file: ${file.relative}`);
      missing.push({ target, bytes: file.bytes });
    } else if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.bytes.length ||
        !file.bytes.equals(await readFile(target))) {
      throw new Error(`Pinned events cache file changed: ${file.relative}. Remove the generated cache and prepare it again.`);
    }
  }
  const link = path.join(cache, "src");
  const linkStat = await statOrNull(link);
  if (linkStat === null) {
    if (check) throw new Error("Missing events cache engine source link.");
  } else if (!linkStat.isSymbolicLink() || await readlink(link) !== sourceLink ||
      await realpath(link) !== await realpath(path.join(repositoryDirectory, "src"))) {
    throw new Error("Events cache engine source link differs from its relative source target.");
  }
  // A stray .js file can shadow a pinned .ts module's relative .js imports.
  const allowed = new Set([...files.map(file => file.relative), "src", "events", "events/src"]);
  for (const parent of ["", "events", "events/src"]) {
    for (const entry of await readdir(path.join(cache, parent))) {
      const relative = parent ? `${parent}/${entry}` : entry;
      if (!allowed.has(relative)) throw new Error(`Unexpected events cache entry: ${relative}`);
    }
  }
  // Validate the complete existing cache before writing any missing file.
  for (const file of missing) await writeFile(file.target, file.bytes, { flag: "wx" });
  if (linkStat === null) await symlink(sourceLink, link, "dir");
  return Object.freeze({ cacheDirectory: cache, commit: manifest.commit, engineTree: manifest.engineTree });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some(argument => argument !== "--check") || process.argv.length > 3) {
      throw new Error("Usage: node scripts/prepare-events.mjs [--check]");
    }
    const result = await prepareEvents({ check: process.argv.includes("--check") });
    process.stdout.write(`Verified events source ${result.commit} in ${result.cacheDirectory}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
