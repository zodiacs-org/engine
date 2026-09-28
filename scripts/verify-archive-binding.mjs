/**
 * A version string names one byte sequence. artifacts/archives.json records
 * each carried archive: its version, SHA-256, size, file count and source
 * commit. This check reads git objects only, never the working tree, and
 * needs full history (actions/checkout with fetch-depth: 0):
 *
 * 1. Shape. In every commit reachable from HEAD, artifacts, where present, is
 *    a real directory whose entries are all regular files named README.md,
 *    archives.json, zodiacs-engine-<version>.tgz or
 *    zodiacs-engine-<version>.sha256: no symbolic link, subdirectory or other
 *    file.
 * 2. Manifest. archives.json at HEAD is well formed, with one carried entry
 *    per file. It is append-only: every version of it committed anywhere in
 *    history is a prefix of HEAD's, entry for entry, and each commit's extends
 *    each of its parents'. Its superseded entries are exactly the ones pinned
 *    below.
 * 3. HEAD. Every archive in HEAD's tree has a carried entry whose digest,
 *    size and file count it matches; every carried entry's archive and receipt
 *    are in HEAD's tree, the receipt naming the recorded bytes; and
 *    artifacts/README.md names every recorded digest.
 * 4. History. In every commit each archive and receipt holds only its
 *    recorded bytes, a superseded entry's only in its pinned commit, and
 *    nothing ever committed under artifacts/ is missing from HEAD.
 * 5. Source. Each entry's source commit is in HEAD's history and names its
 *    version, the commit that introduces the archive is that source commit or
 *    a child of it, and the archive's packed package.json, README, CHANGELOG,
 *    LICENSE, LICENSING.md and NOTICE are byte-identical to that commit's.
 * 6. Rebuild. When HEAD's version has a carried archive, a clean worktree of
 *    HEAD is built and packed and must reproduce it byte for byte, so no later
 *    commit can change a packed file without a new version. With
 *    --rebuild-all, every entry is also rebuilt from its source commit.
 *
 * Merge with merge commits: a squash or rebase merge rewrites the source
 * commits, and this check then fails.
 *
 * Usage, after npm ci: node scripts/verify-archive-binding.mjs [--rebuild-all] [--root DIR]
 * --pinned-superseded FILE replaces the pinned list with a JSON array; it
 * exists for this script's tests on synthetic repositories, and CI never
 * passes it.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

/**
 * The only superseded archive: rc.11's first packing, replaced under the same
 * version before merge. Its bytes may appear in commit 00bdae79 and nowhere else.
 */
const PINNED_SUPERSEDED = [{
  version: "0.1.1-rc.11",
  file: "zodiacs-engine-0.1.1-rc.11.tgz",
  sha256: "13d637db21e3e444c783fd85832e4f61dfdb4b7777b2c84038ec887b47029c4e",
  bytes: 70676,
  files: 30,
  sourceCommit: "00bdae79a9256c2bba4294ed07af79e323c6cd66",
  onlyInCommit: "00bdae79a9256c2bba4294ed07af79e323c6cd66"
}];

const args = process.argv.slice(2);
const valueOf = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const root = resolve(valueOf("--root") ?? fileURLToPath(new URL("..", import.meta.url)));
const rebuildAll = args.includes("--rebuild-all");
const pinnedSuperseded = valueOf("--pinned-superseded")
  ? JSON.parse(readFileSync(resolve(valueOf("--pinned-superseded")), "utf8")) : PINNED_SUPERSEDED;
const BIG = 256 * 1024 * 1024;
const git = (...list) => execFileSync("git", list, { cwd: root, encoding: "utf8", maxBuffer: BIG, stdio: ["ignore", "pipe", "pipe"] });
const gitBytes = (...list) => execFileSync("git", list, { cwd: root, maxBuffer: BIG, stdio: ["ignore", "pipe", "pipe"] });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const METADATA = ["package.json", "README.md", "CHANGELOG.md", "LICENSE", "LICENSING.md", "NOTICE"];
const MANIFEST = "artifacts/archives.json";
const ALLOWED_PATH = /^artifacts\/(?:README\.md|archives\.json|zodiacs-engine-[0-9A-Za-z.+-]+\.(?:tgz|sha256))$/u;
const short = (commit) => commit.slice(0, 12);
const listed = (commits) => `${commits.slice(0, 8).map(short).join(", ")}${commits.length > 8 ? ", ..." : ""}`;

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
/** JSON with object keys sorted, so two entries compare by content alone. */
const canonical = (value) => JSON.stringify(value, (_key, item) => (item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : item));

// 0. Full history.
if (git("rev-parse", "--is-shallow-repository").trim() !== "false") {
  fail("artifacts", "The checkout is shallow, so archive history cannot be checked; fetch full history (fetch-depth: 0).");
  done();
}

// 1. Every commit reachable from HEAD, with no history simplification: the
//    shape of artifacts/ and what each file under it holds.
const commits = git("rev-list", "HEAD").split("\n").filter(Boolean);
const parents = new Map(git("rev-list", "--parents", "HEAD").split("\n").filter(Boolean)
  .map((line) => { const [commit, ...rest] = line.split(" "); return [commit, rest]; }));
const objectCache = new Map(); // object id -> tgz digest, receipt text, or parsed manifest
const trees = new Map(); // commit -> Map(path -> { object, content })
const shapeProblems = new Map(); // problem -> commits
for (const commit of commits) {
  const here = new Map();
  for (const record of git("ls-tree", "-r", "-t", "-z", commit, "--", "artifacts").split("\0").filter(Boolean)) {
    const tab = record.indexOf("\t");
    const [mode, type, object] = record.slice(0, tab).split(" ");
    const path = record.slice(tab + 1);
    let problem = null;
    if (path === "artifacts") {
      if (mode !== "040000" || type !== "tree") problem = `artifacts is not a directory (git mode ${mode}, ${type})`;
    } else if (!ALLOWED_PATH.test(path)) {
      problem = `${path} is not an archive, a receipt, archives.json or README.md (git mode ${mode}, ${type})`;
    } else if (mode !== "100644" || type !== "blob") {
      problem = `${path} is not a regular file (git mode ${mode}, ${type})`;
    }
    if (problem) {
      shapeProblems.set(problem, [...(shapeProblems.get(problem) ?? []), commit]);
      continue;
    }
    if (type !== "blob") continue;
    if (!objectCache.has(object)) {
      const bytes = gitBytes("cat-file", "blob", object);
      let content;
      if (path.endsWith(".tgz")) content = { digest: sha256(bytes), bytes };
      else if (path === MANIFEST) {
        try { content = { manifest: JSON.parse(bytes.toString("utf8")) }; } catch { content = { manifest: null }; }
      } else content = { text: bytes.toString("utf8") };
      objectCache.set(object, content);
    }
    here.set(path, { object, ...objectCache.get(object) });
  }
  trees.set(commit, here);
}
for (const [problem, where] of shapeProblems) {
  fail("artifacts", `${problem} in ${where.length} commit(s): ${listed(where)}.`);
}

// 2. The manifest at HEAD, and its history.
const head = commits[0];
const headTree = trees.get(head);
const headManifest = headTree.get(MANIFEST)?.manifest;
if (!headManifest || !Array.isArray(headManifest.archives) || headManifest.schema !== "zodiacs.engine-archives.v1") {
  fail(MANIFEST, `${MANIFEST} is missing from HEAD or is not a zodiacs.engine-archives.v1 manifest.`);
  done();
}
const entries = headManifest.archives;
const HEX40 = /^[0-9a-f]{40}$/u;
for (const entry of entries) {
  const valid = typeof entry.version === "string" && entry.file === `zodiacs-engine-${entry.version}.tgz` &&
    /^[0-9a-f]{64}$/u.test(entry.sha256) && Number.isInteger(entry.bytes) && Number.isInteger(entry.files) &&
    HEX40.test(entry.sourceCommit) && ((entry.status === "carried" && entry.onlyInCommit === undefined) ||
      (entry.status === "superseded" && HEX40.test(entry.onlyInCommit)));
  if (!valid) fail(MANIFEST, `Malformed manifest entry: ${JSON.stringify(entry)}`);
}
if (failures > 0) done();
const headEntries = entries.map(canonical);
const isPrefix = (shorter, longer) => shorter.length <= longer.length && shorter.every((entry, index) => entry === longer[index]);
const manifestProblems = new Map();
for (const commit of commits) {
  const manifest = trees.get(commit).get(MANIFEST)?.manifest;
  if (manifest === undefined) continue;
  const list = Array.isArray(manifest?.archives) ? manifest.archives.map(canonical) : null;
  const problems = [];
  if (list === null) problems.push(`${MANIFEST} is not a manifest`);
  else if (!isPrefix(list, headEntries)) problems.push(`${MANIFEST} is not a prefix of HEAD's (the manifest is append-only)`);
  for (const parent of parents.get(commit) ?? []) {
    const before = trees.get(parent)?.get(MANIFEST)?.manifest;
    if (before === undefined || list === null) continue;
    if (!Array.isArray(before?.archives) || !isPrefix(before.archives.map(canonical), list)) {
      problems.push(`${MANIFEST} drops or changes entries of its parent ${short(parent)}'s (the manifest is append-only)`);
    }
  }
  for (const problem of problems) manifestProblems.set(problem, [...(manifestProblems.get(problem) ?? []), commit]);
}
for (const [problem, where] of manifestProblems) fail(MANIFEST, `${problem}, in ${where.length} commit(s): ${listed(where)}.`);
const PINNED_FIELDS = ["version", "file", "sha256", "bytes", "files", "sourceCommit", "onlyInCommit"];
const pinnedKey = (entry) => canonical(Object.fromEntries(PINNED_FIELDS.map((field) => [field, entry[field]])));
const pinnedKeys = pinnedSuperseded.map(pinnedKey);
const superseded = entries.filter((item) => item.status === "superseded");
for (const entry of superseded) {
  if (!pinnedKeys.includes(pinnedKey(entry))) {
    fail(MANIFEST, `${entry.version} (${entry.sha256.slice(0, 12)}…) is a superseded entry that this script does not pin; ` +
      "superseded archives are pinned in scripts/verify-archive-binding.mjs, not added through the manifest.");
  }
}
const carried = new Map();
for (const entry of entries.filter((item) => item.status === "carried")) {
  if (carried.has(entry.file)) fail(MANIFEST, `${entry.file} has more than one carried entry.`);
  carried.set(entry.file, entry);
}
const receiptOf = (file) => file.replace(/\.tgz$/u, ".sha256");
const receiptText = (digest, file) => `${digest}  ${file}\n`;

// 3. HEAD's tree.
for (const [path, content] of headTree) {
  if (!path.endsWith(".tgz")) continue;
  const file = path.slice("artifacts/".length);
  const entry = carried.get(file);
  if (!entry) {
    fail(path, `${path} is carried without a carried entry in ${MANIFEST}.`);
    continue;
  }
  const unpacked = readable(content.bytes);
  if (unpacked === null) {
    fail(path, `${path} is not a gzip-compressed tar archive.`);
    continue;
  }
  if (content.digest !== entry.sha256 || content.bytes.length !== entry.bytes || unpacked.size !== entry.files) {
    fail(path, `${path} does not match its manifest entry.`, [
      `carried:  sha256 ${content.digest}, ${content.bytes.length} bytes, ${unpacked.size} files`,
      `recorded: sha256 ${entry.sha256}, ${entry.bytes} bytes, ${entry.files} files`
    ]);
  }
}
for (const entry of carried.values()) {
  if (!headTree.has(`artifacts/${entry.file}`)) fail(`artifacts/${entry.file}`, `artifacts/${entry.file} is recorded as carried but HEAD does not hold it.`);
  const text = headTree.get(`artifacts/${receiptOf(entry.file)}`)?.text ?? null;
  if (text !== receiptText(entry.sha256, entry.file)) {
    fail(`artifacts/${receiptOf(entry.file)}`, `The receipt for ${entry.version} at HEAD does not name its recorded bytes.`,
      [`expected: ${JSON.stringify(receiptText(entry.sha256, entry.file))}`, `found:    ${text === null ? "(missing)" : JSON.stringify(text)}`]);
  }
}
const readme = headTree.get("artifacts/README.md")?.text ?? "";
for (const entry of entries) {
  if (!readme.includes(entry.sha256)) fail("artifacts/README.md", `artifacts/README.md at HEAD does not list ${entry.version} (${entry.sha256}).`);
}

// 4. History: recorded bytes only, and nothing removed.
const everCommitted = new Set();
for (const here of trees.values()) for (const path of here.keys()) everCommitted.add(path);
for (const path of [...everCommitted].sort()) {
  if (!headTree.has(path)) fail(path, `${path} was committed and is missing from HEAD; nothing under artifacts/ is ever removed.`);
}
function allowed(commit, path, content) {
  const file = path.slice("artifacts/".length).replace(/\.sha256$/u, ".tgz");
  const matches = (digest) => (path.endsWith(".tgz") ? content.digest === digest : content.text === receiptText(digest, file));
  const entry = carried.get(file);
  if (entry && matches(entry.sha256)) return true;
  return superseded.some((item) => item.file === file && item.onlyInCommit === commit && matches(item.sha256));
}
const reported = new Set();
for (const commit of commits) {
  for (const [path, content] of trees.get(commit)) {
    if (!/\.(?:tgz|sha256)$/u.test(path)) continue;
    const value = path.endsWith(".tgz") ? content.digest : content.text;
    if (allowed(commit, path, content) || reported.has(`${path} ${value}`)) continue;
    reported.add(`${path} ${value}`);
    const where = commits.filter((other) => {
      const there = trees.get(other).get(path);
      return there && (path.endsWith(".tgz") ? there.digest : there.text) === value;
    });
    fail(path, `${path} held bytes its manifest entry does not allow; a version string names one byte sequence.`, [
      `${path.endsWith(".tgz") ? `sha256 ${value}` : `receipt ${JSON.stringify(value)}`} in ${where.length} commit(s): ${listed(where)}`
    ]);
  }
}

// 5. Source binding.
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
  const holders = commits.filter((commit) => trees.get(commit).get(path)?.digest === entry.sha256);
  const introducers = holders.filter((commit) => !(parents.get(commit) ?? []).some((parent) => trees.get(parent)?.get(path)?.digest === entry.sha256));
  for (const commit of introducers) {
    if (commit !== entry.sourceCommit && !(parents.get(commit) ?? []).includes(entry.sourceCommit)) {
      fail(path, `${label} was introduced by ${short(commit)}, which is neither its source commit nor a child of it.`);
    }
  }
  if (holders.length === 0) {
    fail(path, `${label} never appears in the history of HEAD.`);
    continue;
  }
  const packed = readable(trees.get(holders[0]).get(path).bytes);
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

// 6. Rebuilds, each in a clean temporary worktree of a commit.
const quiet = { stdio: ["ignore", "pipe", "pipe"], maxBuffer: BIG };
/** The locked dependency tree of a directory's package-lock.json, or null without one. */
function dependencyLock(directory) {
  const path = join(directory, "package-lock.json");
  if (!existsSync(path)) return null;
  const lock = JSON.parse(readFileSync(path, "utf8"));
  const packages = { ...lock.packages };
  delete packages[""];
  return JSON.stringify({ lockfileVersion: lock.lockfileVersion, packages });
}
// Used only to decide whether the installed toolchain can be reused; what is
// verified comes from git objects.
const installedLock = dependencyLock(root);
/** The packed bytes of a worktree, or null after reporting why it could not be built. */
function rebuild(directory, version, path) {
  const scratch = mkdtempSync(join(tmpdir(), "zodiacs-engine-pack-"));
  try {
    execFileSync("npm", ["run", "build"], { cwd: directory, ...quiet });
    const [report] = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch],
      { cwd: directory, encoding: "utf8", ...quiet }));
    return readFileSync(join(scratch, report.filename));
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
function rebuildAt(commit, version, path, label, expected, where) {
  const parent = mkdtempSync(join(tmpdir(), "zodiacs-engine-rebuild-"));
  const tree = join(parent, "tree");
  try {
    git("worktree", "add", "--detach", tree, commit);
    try {
      // The installed toolchain is reused only when the commit locks the same dependency tree.
      const lock = dependencyLock(tree);
      if (lock !== null && lock === installedLock && existsSync(join(root, "node_modules"))) {
        symlinkSync(join(root, "node_modules"), join(tree, "node_modules"), "dir");
      } else if (lock !== null) {
        execFileSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: tree, ...quiet });
      }
      compare(path, label, expected, rebuild(tree, version, path), where);
    } finally {
      git("worktree", "remove", "--force", tree);
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

let headVersion = null;
try { headVersion = JSON.parse(git("show", "HEAD:package.json")).version; } catch { /* no package at HEAD */ }
const current = headVersion === null ? undefined : carried.get(`zodiacs-engine-${headVersion}.tgz`);
if (current && headTree.get(`artifacts/${current.file}`)?.bytes) {
  const path = `artifacts/${current.file}`;
  rebuildAt(head, headVersion, path, path, headTree.get(path).bytes, `HEAD (${short(head)})`);
} else {
  console.log(`No archive artifacts/zodiacs-engine-${headVersion}.tgz is carried for ${headVersion} yet; skipping the rebuild of HEAD.`);
}
if (rebuildAll) {
  for (const entry of entries) {
    const path = `artifacts/${entry.file}`;
    const label = `${entry.version} (${entry.sha256.slice(0, 12)}…)`;
    const holder = commits.find((commit) => trees.get(commit).get(path)?.digest === entry.sha256);
    if (!holder || !isAncestor(entry.sourceCommit)) continue; // already reported
    rebuildAt(entry.sourceCommit, entry.version, path, label, trees.get(holder).get(path).bytes, `source commit ${short(entry.sourceCommit)}`);
  }
}
git("worktree", "prune");

if (failures === 0) {
  console.log(`${entries.length} recorded archives (${carried.size} carried, ${superseded.length} superseded) and their receipts ` +
    `hold only their recorded bytes across ${commits.length} commits, and each is bound to its source commit.`);
}
done();
