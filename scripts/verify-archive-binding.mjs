/**
 * A version string names one byte sequence. artifacts/archives.json records
 * each carried archive: its version, SHA-256, size, file count and source
 * commit. This check, on full history (actions/checkout with fetch-depth: 0):
 *
 * 1. Manifest: every artifacts/*.tgz at HEAD has one carried entry whose digest,
 *    size and file count it matches, with a .sha256 receipt naming its bytes,
 *    and artifacts/README.md names every recorded digest.
 * 2. History: every commit reachable from HEAD is read, with no history
 *    simplification, so a rewrite on a merged side branch is seen. A carried
 *    archive or receipt may only ever hold its recorded bytes, except that a
 *    superseded entry's bytes may appear in exactly its onlyInCommit, and no
 *    archive or receipt ever committed may be missing at HEAD.
 * 3. Source: every entry's source commit is in history, names the version, and
 *    introduces the archive itself or is the parent of the commit that does. The
 *    packed package.json, README, CHANGELOG, LICENSE, LICENSING.md and NOTICE are
 *    byte-identical to that commit's.
 * 4. Rebuild: when an archive is carried for package.json's version, a rebuild
 *    of this checkout must reproduce its bytes; before it is committed, this
 *    step reports a skip. With --rebuild-all, every entry is rebuilt from its
 *    source commit in a temporary worktree and must reproduce its bytes.
 *
 * Usage, after npm ci: node scripts/verify-archive-binding.mjs [--rebuild-all] [--root DIR]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const root = resolve(rootIndex >= 0 ? args[rootIndex + 1] : fileURLToPath(new URL("..", import.meta.url)));
const rebuildAll = args.includes("--rebuild-all");
const BIG = 256 * 1024 * 1024;
const git = (...list) => execFileSync("git", list, { cwd: root, encoding: "utf8", maxBuffer: BIG, stdio: ["ignore", "pipe", "pipe"] });
const gitBytes = (...list) => execFileSync("git", list, { cwd: root, maxBuffer: BIG, stdio: ["ignore", "pipe", "pipe"] });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const METADATA = ["package.json", "README.md", "CHANGELOG.md", "LICENSE", "LICENSING.md", "NOTICE"];

let failures = 0;
function fail(file, message, details = []) {
  // One annotation for the workflow summary, then the particulars.
  console.error(`::error file=${file}::${message}`);
  for (const line of details) console.error(`  ${line}`);
  failures += 1;
}
function done() {
  if (failures > 0) {
    console.error(`${failures} archive binding failure${failures === 1 ? "" : "s"}.`);
    process.exit(1);
  }
  process.exit(0);
}

/** Regular files of an npm-packed .tgz: path -> bytes. */
function unpack(archive) {
  const tar = gunzipSync(archive);
  const files = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, length) => header.subarray(start, start + length).toString("utf8").replace(/\0.*$/su, "");
    const size = Number.parseInt(field(124, 12).trim() || "0", 8);
    // Only POSIX ustar headers (npm's) carry a name prefix at offset 345.
    const prefix = header.subarray(257, 263).toString("latin1") === "ustar\0" ? field(345, 155) : "";
    const name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
    const type = field(156, 1);
    if (type === "0" || type === "") files.set(name, tar.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}
/** unpack, or null for bytes that are not a gzip-compressed tar. */
function readable(archive) {
  try { return unpack(archive); } catch { return null; }
}

// 0. Full history.
if (git("rev-parse", "--is-shallow-repository").trim() !== "false") {
  fail("artifacts", "The checkout is shallow, so archive history cannot be checked; fetch full history (fetch-depth: 0).");
  done();
}

// 1. Manifest and HEAD.
const manifestPath = join(root, "artifacts", "archives.json");
if (!existsSync(manifestPath)) {
  fail("artifacts/archives.json", "The archive manifest is missing.");
  done();
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const entries = Array.isArray(manifest.archives) ? manifest.archives : [];
const HEX40 = /^[0-9a-f]{40}$/u;
for (const entry of entries) {
  const valid = typeof entry.version === "string" && entry.file === `zodiacs-engine-${entry.version}.tgz` &&
    /^[0-9a-f]{64}$/u.test(entry.sha256) && Number.isInteger(entry.bytes) && Number.isInteger(entry.files) &&
    HEX40.test(entry.sourceCommit) && ((entry.status === "carried" && entry.onlyInCommit === undefined) ||
      (entry.status === "superseded" && HEX40.test(entry.onlyInCommit)));
  if (!valid) fail("artifacts/archives.json", `Malformed manifest entry: ${JSON.stringify(entry)}`);
}
if (failures > 0) done();
const carried = new Map();
for (const entry of entries.filter((item) => item.status === "carried")) {
  if (carried.has(entry.file)) fail("artifacts/archives.json", `${entry.file} has more than one carried entry.`);
  carried.set(entry.file, entry);
}
const superseded = entries.filter((item) => item.status === "superseded");
const receiptOf = (file) => file.replace(/\.tgz$/u, ".sha256");
const receiptText = (digest, file) => `${digest}  ${file}\n`;

const headFiles = git("ls-tree", "--name-only", "HEAD", "--", "artifacts/").split("\n").filter(Boolean);
for (const path of headFiles.filter((item) => item.endsWith(".tgz"))) {
  const file = path.slice("artifacts/".length);
  const entry = carried.get(file);
  if (!entry) {
    fail(path, `${path} is carried without a carried entry in artifacts/archives.json.`);
    continue;
  }
  const bytes = readFileSync(join(root, path));
  const unpacked = readable(bytes);
  if (unpacked === null) {
    fail(path, `${path} is not a gzip-compressed tar archive.`);
    continue;
  }
  const count = unpacked.size;
  if (sha256(bytes) !== entry.sha256 || bytes.length !== entry.bytes || count !== entry.files) {
    fail(path, `${path} does not match its manifest entry.`, [
      `carried:  sha256 ${sha256(bytes)}, ${bytes.length} bytes, ${count} files`,
      `recorded: sha256 ${entry.sha256}, ${entry.bytes} bytes, ${entry.files} files`
    ]);
  }
}
for (const entry of carried.values()) {
  const archive = join(root, "artifacts", entry.file);
  const receipt = join(root, "artifacts", receiptOf(entry.file));
  if (!existsSync(archive)) fail(`artifacts/${entry.file}`, `artifacts/${entry.file} is recorded as carried but is missing.`);
  const text = existsSync(receipt) ? readFileSync(receipt, "utf8") : null;
  if (text !== receiptText(entry.sha256, entry.file)) {
    fail(`artifacts/${receiptOf(entry.file)}`, `The receipt for ${entry.version} does not name its recorded bytes.`,
      [`expected: ${JSON.stringify(receiptText(entry.sha256, entry.file))}`, `found:    ${text === null ? "(missing)" : JSON.stringify(text)}`]);
  }
}
const readme = existsSync(join(root, "artifacts", "README.md")) ? readFileSync(join(root, "artifacts", "README.md"), "utf8") : "";
for (const entry of entries) {
  if (!readme.includes(entry.sha256)) fail("artifacts/README.md", `artifacts/README.md does not list ${entry.version} (${entry.sha256}).`);
}

// 2. History, with no simplification: every reachable commit, every artifacts path.
const commits = git("rev-list", "HEAD").split("\n").filter(Boolean);
const parents = new Map(git("rev-list", "--parents", "HEAD").split("\n").filter(Boolean)
  .map((line) => { const [commit, ...rest] = line.split(" "); return [commit, rest]; }));
const blobDigest = new Map();
const contentAt = new Map(); // commit -> Map(path -> digest or receipt text)
for (const commit of commits) {
  const here = new Map();
  for (const line of git("ls-tree", "-r", commit, "--", "artifacts/").split("\n").filter(Boolean)) {
    const [meta, path] = line.split("\t");
    const blob = meta.split(" ")[2];
    if (!/^artifacts\/[^/]+\.(?:tgz|sha256)$/u.test(path)) continue;
    if (!blobDigest.has(blob)) {
      const bytes = gitBytes("cat-file", "blob", blob);
      blobDigest.set(blob, path.endsWith(".tgz") ? sha256(bytes) : bytes.toString("utf8"));
    }
    here.set(path, blobDigest.get(blob));
  }
  contentAt.set(commit, here);
}
const everCommitted = new Set(git("log", "--full-history", "--format=", "--name-only", "HEAD", "--", "artifacts")
  .split("\n").filter((path) => /^artifacts\/[^/]+\.(?:tgz|sha256)$/u.test(path)));
for (const here of contentAt.values()) for (const path of here.keys()) everCommitted.add(path);
for (const path of [...everCommitted].sort()) {
  if (!existsSync(join(root, path))) fail(path, `${path} was committed and has since been removed; carried archives and receipts are never removed.`);
}
function allowed(commit, path, content) {
  const file = path.slice("artifacts/".length).replace(/\.sha256$/u, ".tgz");
  const matches = (digest) => (path.endsWith(".tgz") ? content === digest : content === receiptText(digest, file));
  const entry = carried.get(file);
  if (entry && matches(entry.sha256)) return true;
  return superseded.some((item) => item.file === file && item.onlyInCommit === commit && matches(item.sha256));
}
const reported = new Set();
for (const commit of commits) {
  for (const [path, content] of contentAt.get(commit)) {
    if (allowed(commit, path, content) || reported.has(`${path} ${content}`)) continue;
    reported.add(`${path} ${content}`);
    const where = commits.filter((other) => contentAt.get(other).get(path) === content).map((other) => other.slice(0, 12));
    fail(path, `${path} held bytes its manifest entry does not allow; a version string names one byte sequence.`, [
      `${path.endsWith(".tgz") ? `sha256 ${content}` : `receipt ${JSON.stringify(content)}`} in ${where.length} commit(s): ${where.slice(0, 8).join(", ")}${where.length > 8 ? ", ..." : ""}`
    ]);
  }
}

// 3. Source binding.
const isAncestor = (commit) => {
  try { git("merge-base", "--is-ancestor", commit, "HEAD"); return true; } catch { return false; }
};
for (const entry of entries) {
  const path = `artifacts/${entry.file}`;
  const label = `${entry.version} (${entry.sha256.slice(0, 12)}…)`;
  if (!isAncestor(entry.sourceCommit)) {
    fail(path, `The source commit of ${label}, ${entry.sourceCommit}, is not in the history of HEAD.`);
    continue;
  }
  let sourceVersion = null;
  try { sourceVersion = JSON.parse(git("show", `${entry.sourceCommit}:package.json`)).version; } catch { /* reported below */ }
  if (sourceVersion !== entry.version) {
    fail(path, `The source commit of ${label} is version ${sourceVersion ?? "(no package.json)"}, not ${entry.version}.`);
  }
  const holders = commits.filter((commit) => contentAt.get(commit).get(path) === entry.sha256);
  const introducers = holders.filter((commit) => !(parents.get(commit) ?? []).some((parent) => contentAt.get(parent)?.get(path) === entry.sha256));
  for (const commit of introducers) {
    if (commit !== entry.sourceCommit && !(parents.get(commit) ?? []).includes(entry.sourceCommit)) {
      fail(path, `${label} was introduced by ${commit.slice(0, 12)}, which is neither its source commit nor a child of it.`);
    }
  }
  if (holders.length === 0) {
    fail(path, `${label} never appears in the history of HEAD.`);
    continue;
  }
  const packed = readable(gitBytes("show", `${holders[0]}:${path}`));
  if (packed === null) {
    fail(path, `${label} is not a gzip-compressed tar archive.`);
    continue;
  }
  for (const name of METADATA) {
    const inArchive = packed.get(`package/${name}`);
    let inSource = null;
    try { inSource = gitBytes("show", `${entry.sourceCommit}:${name}`); } catch { /* missing */ }
    if (!inArchive || !inSource || !inArchive.equals(inSource)) {
      fail(path, `${label} packs a ${name} that is not byte-identical to its source commit's.`);
    }
  }
}

// 4. Rebuilds.
const quiet = { stdio: ["ignore", "pipe", "pipe"], maxBuffer: BIG };
const dependencyLock = (text) => {
  const lock = JSON.parse(text);
  const packages = { ...lock.packages };
  delete packages[""];
  return JSON.stringify({ lockfileVersion: lock.lockfileVersion, packages });
};
/** The packed bytes of directory, or null after reporting why it could not be built. */
function rebuild(directory, version, path) {
  const scratch = mkdtempSync(join(tmpdir(), "zodiacs-engine-pack-"));
  try {
    execFileSync("npm", ["run", "build"], { cwd: directory, ...quiet });
    execFileSync("npm", ["pack", "--ignore-scripts", "--pack-destination", scratch], { cwd: directory, ...quiet });
    return readFileSync(join(scratch, `zodiacs-engine-${version}.tgz`));
  } catch (error) {
    const detail = String(error?.stderr ?? error?.message ?? error).trim().split("\n").slice(-3);
    fail(path, `The ${version} source could not be rebuilt and packed.`, detail);
    return null;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
function compare(path, label, expected, rebuilt, where) {
  if (rebuilt === null) return;
  if (rebuilt.equals(expected)) {
    console.log(`${label} is byte-identical to a rebuild of ${where} on Node ${process.version}: sha256 ${sha256(rebuilt)}, ${rebuilt.length} bytes.`);
    return;
  }
  const before = readable(expected) ?? new Map();
  const after = readable(rebuilt) ?? new Map();
  const differing = [...new Set([...before.keys(), ...after.keys()])].sort()
    .filter((name) => !(before.get(name) && after.get(name) && before.get(name).equals(after.get(name))))
    .map((name) => `${name}: recorded ${before.has(name) ? sha256(before.get(name)) : "(absent)"}, rebuilt ${after.has(name) ? sha256(after.get(name)) : "(absent)"}`);
  fail(path, `${label} is not the archive ${where} builds. Restore the source it was packed from, or bump the version and pack anew.`, [
    `recorded: sha256 ${sha256(expected)}, ${expected.length} bytes`,
    `rebuilt:  sha256 ${sha256(rebuilt)}, ${rebuilt.length} bytes on Node ${process.version}`,
    ...(differing.length > 0 ? differing : ["Every packed file matches; only the tar or gzip framing differs."])
  ]);
}

const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const current = carried.get(`zodiacs-engine-${version}.tgz`);
if (!rebuildAll) {
  if (current && existsSync(join(root, "artifacts", current.file))) {
    const path = `artifacts/${current.file}`;
    compare(path, path, readFileSync(join(root, path)), rebuild(root, version, path), "this checkout");
  } else {
    console.log(`No archive artifacts/zodiacs-engine-${version}.tgz is carried for ${version} yet; skipping the rebuild of this checkout.`);
  }
} else {
  const lockHere = dependencyLock(readFileSync(join(root, "package-lock.json"), "utf8"));
  for (const entry of entries) {
    const path = `artifacts/${entry.file}`;
    const label = `${entry.version} (${entry.sha256.slice(0, 12)}…)`;
    const holder = commits.find((commit) => contentAt.get(commit).get(path) === entry.sha256);
    if (!holder || !isAncestor(entry.sourceCommit)) continue; // already reported
    const parent = mkdtempSync(join(tmpdir(), "zodiacs-engine-rebuild-"));
    const tree = join(parent, "tree");
    try {
      git("worktree", "add", "--detach", tree, entry.sourceCommit);
      try {
        // The locked toolchain is reused only when the source commit locks the same dependency tree.
        if (dependencyLock(readFileSync(join(tree, "package-lock.json"), "utf8")) === lockHere) {
          symlinkSync(join(root, "node_modules"), join(tree, "node_modules"), "dir");
        } else {
          execFileSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: tree, ...quiet });
        }
        compare(path, label, gitBytes("show", `${holder}:${path}`), rebuild(tree, entry.version, path), `source commit ${entry.sourceCommit.slice(0, 12)}`);
      } finally {
        git("worktree", "remove", "--force", tree);
      }
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }
  git("worktree", "prune");
}

if (failures === 0) {
  console.log(`${entries.length} recorded archives (${carried.size} carried, ${superseded.length} superseded) and their receipts ` +
    `hold only their recorded bytes across ${commits.length} commits, and each is bound to its source commit.`);
}
done();
