/**
 * A version string names one byte sequence. artifacts/archives.json records
 * each carried archive: its version, SHA-256, size, file count and source
 * commit. On a clean checkout with full history, such as CI's
 * (actions/checkout with fetch-depth: 0), this check establishes that every
 * archive ever carried holds only its recorded bytes and is what its recorded
 * source commit builds:
 *
 * 1. Shape. In every commit reachable from HEAD, artifacts, where present, is
 *    a real directory whose entries are all regular files named README.md,
 *    archives.json, zodiacs-engine-<version>.tgz or
 *    zodiacs-engine-<version>.sha256, each <version> strict as in point 2: no
 *    symbolic link, subdirectory or other file. No two names in it, and no
 *    other top-level name and artifacts, are one name once default-ignorable
 *    characters are removed and the rest is NFKC-normalized and case-folded.
 * 2. Manifest. archives.json at HEAD is well formed, with one carried entry
 *    per file. It is append-only: every version of it committed anywhere in
 *    history is a prefix of HEAD's, entry for entry, and each commit's extends
 *    each of its parents'. Its superseded entries are exactly the ones pinned
 *    below. Every recorded version, and package.json's at HEAD, is a strict
 *    semantic version: no "v" prefix, no build metadata, and no numeric
 *    identifier above Number.MAX_SAFE_INTEGER, beyond which npm's semver.eq
 *    takes distinct numbers for one. No two carried versions, and no carried
 *    version and HEAD's under another spelling, are equal under semver.eq.
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
 * 6. Rebuild. When HEAD's version has a carried archive, HEAD is built and
 *    packed and must reproduce it byte for byte, so no later commit can change
 *    a packed file without a new version. With --rebuild-all, every entry is
 *    also rebuilt from its source commit.
 *
 * What it protects against: commits that repack, replace, remove or
 * re-version a carried archive, rewrite the manifest, hide such a change on a
 * merged side branch, carry a second archive under a version npm takes for an
 * existing one, or change a packed file under a version already carried; and,
 * when it runs in a working checkout, anything in that checkout beyond its git
 * objects: its files, its node_modules, the tools npm run puts on PATH from
 * it, a TMPDIR inside it, and hooks, grafts, replace refs and the commit-graph
 * file in its .git.
 *
 * How: it reads git objects only (git ls-tree, cat-file, rev-list, merge-base
 * and rev-parse, with hooks off and grafts, replace refs and the commit-graph
 * file ignored). Each rebuild writes the commit's tree from git objects into a
 * new temporary directory outside the checkout, with no node_modules or
 * package.json at or above it, installs that commit's locked dependencies
 * there with npm ci (the npm cache may supply them), and builds and packs with
 * npm run build and npm pack. git and npm are the first found on PATH outside
 * the checkout, never in a node_modules/.bin. Every process the check starts
 * runs with that PATH (the running Node's directory first) and without
 * NODE_OPTIONS, NODE_PATH or any npm_* variable, and git without any GIT_*
 * variable but the two that make it ignore grafts and replace refs. With
 * NODE_OPTIONS set, or options given to node itself, the check first restarts
 * itself in a new Node process without them, since code they name has already
 * run in the first one.
 *
 * What it does not protect against: history rewritten before CI sees it; a
 * squash or rebase merge, which rewrites the source commits and makes the
 * check fail, so merge with merge commits; a change to this script or to CI's
 * workflow, which review must catch; and whoever controls the machine that
 * runs it (its git, Node and npm, their system and user configuration, the git
 * object store, the environment), who can defeat any local check. npm run
 * reads the checkout's .npmrc before this script starts, and that file can
 * replace the command npm runs, so CI starts the script with node directly.
 *
 * Usage: node scripts/verify-archive-binding.mjs [--rebuild-all] [--root DIR]
 * DIR is the top of the work tree (by default, this script's repository).
 * --pinned-superseded FILE replaces the pinned list with a JSON array; it
 * exists for this script's tests on synthetic repositories, and CI never
 * passes it.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, chmodSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync,
  symlinkSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const METADATA = ["package.json", "README.md", "CHANGELOG.md", "LICENSE", "LICENSING.md", "NOTICE"];
const MANIFEST = "artifacts/archives.json";
const SELF = "scripts/verify-archive-binding.mjs";
/** SemVer 2.0.0 without build metadata and without a "v" prefix. */
const STRICT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/u;
const NUMERIC = /^\d+$/u;
/**
 * The one version form accepted: SemVer 2.0.0 without build metadata or a "v"
 * prefix, and no numeric identifier above Number.MAX_SAFE_INTEGER. npm's
 * semver compares numeric identifiers as JavaScript numbers, so above that
 * limit it takes distinct ones, such as 9007199254740992 and
 * 9007199254740993, for one.
 */
function strictVersion(version) {
  const match = typeof version === "string" ? STRICT_VERSION.exec(version) : null;
  if (match === null) return false;
  const numbers = [match[1], match[2], match[3], ...(match[4] ?? "").split(".").filter((id) => NUMERIC.test(id))];
  return numbers.every((id) => Number(id) <= Number.MAX_SAFE_INTEGER);
}
/** A version as npm's semver 7 parses it, or null where semver throws on it. */
const NPM_VERSION = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][a-zA-Z0-9-]*))*))?(?:\+[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*)?$/u;
function npmVersion(version) {
  const match = typeof version === "string" && version.length <= 256 ? NPM_VERSION.exec(version.trim()) : null;
  if (match === null) return null;
  const main = [match[1], match[2], match[3]].map(Number);
  if (main.some((part) => part > Number.MAX_SAFE_INTEGER)) return null;
  // Numeric identifiers below Number.MAX_SAFE_INTEGER become numbers; the rest stay strings.
  const prerelease = (match[4] ?? "").split(".").filter(Boolean)
    .map((id) => (NUMERIC.test(id) && Number(id) < Number.MAX_SAFE_INTEGER ? Number(id) : id));
  return { main, prerelease };
}
/**
 * Whether npm's semver.eq(a, b) holds, computed as semver 7 computes it, and
 * false where semver cannot parse either version. Two identifiers that are
 * both numeric compare as JavaScript numbers, and the first pair that differs
 * as strings decides the prerelease, so above Number.MAX_SAFE_INTEGER it can
 * take distinct versions for one.
 */
function npmEqual(a, b) {
  const [x, y] = [npmVersion(a), npmVersion(b)];
  if (x === null || y === null || x.main.some((part, index) => part !== y.main[index])) return false;
  if (x.prerelease.length === 0 || y.prerelease.length === 0) return x.prerelease.length === y.prerelease.length;
  for (let index = 0; ; index += 1) {
    const [p, q] = [x.prerelease[index], y.prerelease[index]];
    if (p === undefined || q === undefined) return p === q;
    if (p === q) continue;
    return NUMERIC.test(String(p)) && NUMERIC.test(String(q)) && Number(p) === Number(q);
  }
}
/** README.md, archives.json, or an archive or receipt named for a strict version. */
function allowedPath(path) {
  if (path === "artifacts/README.md" || path === "artifacts/archives.json") return true;
  const match = /^artifacts\/zodiacs-engine-(.+)\.(?:tgz|sha256)$/u.exec(path);
  return match !== null && strictVersion(match[1]);
}
/**
 * A name as a case-insensitive or normalizing file system may take it:
 * default-ignorable characters (such as U+200C) removed, NFKC-normalized and
 * case-folded.
 */
const folded = (name) => name.replace(/\p{Default_Ignorable_Code_Point}/gu, "").normalize("NFKC").toUpperCase().toLowerCase().normalize("NFKC");
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
/** Report a problem that stops the check before it reads anything, and stop. */
function refuse(message, details = []) {
  fail(SELF, message, details);
  return done();
}

// Where the check runs. Nothing the checkout holds beyond its git objects may
// decide the verdict.
const realOrResolved = (path) => { try { return realpathSync(path); } catch { return resolve(path); } };
/** Whether path is directory or inside it. */
const within = (path, directory) => {
  const rest = relative(directory, path);
  return rest === "" || (rest !== ".." && !rest.startsWith(`..${sep}`) && !isAbsolute(rest));
};
let checkout = null;
try { checkout = realpathSync(root); } catch { refuse(`${root} does not exist.`); }
if (within(realOrResolved(process.execPath), checkout)) refuse(`Node itself (${process.execPath}) is inside the checkout.`);
const BIN_DIRECTORY = /[\\/]node_modules[\\/]\.bin[\\/]?$/u;
const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
/**
 * PATH without relative entries, node_modules/.bin directories (npm run adds
 * the checkout's and its ancestors') or anything inside the checkout, with the
 * running Node's directory first, so child processes find this Node.
 */
const SAFE_PATH = [dirname(process.execPath), ...(process.env[pathKey] ?? "").split(delimiter)]
  .filter((entry) => entry !== "" && isAbsolute(entry) && !BIN_DIRECTORY.test(entry) && !within(realOrResolved(entry), checkout))
  .filter((entry, index, list) => list.indexOf(entry) === index);
/** The first executable name on SAFE_PATH whose real location is outside the checkout. */
function locate(name) {
  const names = process.platform === "win32"
    ? [name, ...(process.env.PATHEXT ?? ".EXE;.CMD").split(";").filter(Boolean).map((extension) => `${name}${extension}`)] : [name];
  for (const directory of SAFE_PATH) {
    for (const candidate of names) {
      const path = join(directory, candidate);
      try {
        accessSync(path, constants.X_OK);
        if (statSync(path).isFile() && !within(realpathSync(path), checkout)) return path;
      } catch { /* not here */ }
    }
  }
  return refuse(`No ${name} was found on PATH outside the checkout. The check runs git and npm only from directories outside ` +
    "the checkout, and never from a node_modules/.bin.");
}
/**
 * The environment of every process the check starts: SAFE_PATH, and no
 * NODE_OPTIONS, NODE_PATH, npm_* variable (npm run passes the checkout's npm
 * configuration through those) or GIT_* variable, but for git the two that
 * make it ignore grafts and replace refs.
 */
const CHILD_ENV = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => !/^(?:npm_|git_)/iu.test(key) && !/^(?:NODE_OPTIONS|NODE_PATH|INIT_CWD|PATH)$/iu.test(key)));
CHILD_ENV[pathKey] = SAFE_PATH.join(delimiter);
// Code that NODE_OPTIONS or node's own options name has run in this process
// before this line (npm run turns a node-options setting in any .npmrc into
// NODE_OPTIONS), so the check itself runs in a new Node process without them.
if ((process.env.NODE_OPTIONS ?? "").trim() !== "" || process.execArgv.length > 0) {
  const dropped = [...process.execArgv, ...((process.env.NODE_OPTIONS ?? "").trim() ? [`NODE_OPTIONS=${process.env.NODE_OPTIONS}`] : [])];
  console.log(`Running the check in a new Node process without ${dropped.join(" ")}.`);
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], { stdio: "inherit", env: CHILD_ENV });
  process.exit(child.status ?? 1);
}
const GIT = locate("git");
const NPM = locate("npm");
const GIT_ENV = { ...CHILD_ENV, GIT_GRAFT_FILE: devNull, GIT_NO_REPLACE_OBJECTS: "1" };
/**
 * git with no hooks, whatever the checkout's configuration names, and without
 * its commit-graph file, which could give other parents than the commits have.
 */
const GIT_ARGS = ["-c", `core.hooksPath=${devNull}`, "-c", "core.commitGraph=false"];
const gitRun = (list, options = {}) => execFileSync(GIT, [...GIT_ARGS, ...list],
  { cwd: root, maxBuffer: BIG, stdio: ["ignore", "pipe", "pipe"], env: GIT_ENV, ...options });
const git = (...list) => gitRun(list, { encoding: "utf8" });
const gitBytes = (...list) => gitRun(list);
let toplevel = null;
try { toplevel = realpathSync(git("rev-parse", "--show-toplevel").trim()); } catch { /* reported below */ }
if (toplevel !== checkout) refuse(`${root} is not the top of a git work tree.`);
// Rebuilds run in the temporary directory, where npm and Node consult every
// ancestor: npm run puts each node_modules/.bin on PATH, Node resolves modules
// from each node_modules, and npm takes a package.json above for a workspace root.
const TEMPORARY = realOrResolved(tmpdir());
if (within(TEMPORARY, checkout)) refuse(`The temporary directory ${TEMPORARY} (TMPDIR) is inside the checkout; set TMPDIR to a directory outside it.`);
for (let directory = TEMPORARY; ; directory = dirname(directory)) {
  for (const name of ["node_modules", "package.json"]) {
    if (existsSync(join(directory, name))) {
      refuse(`${join(directory, name)} lies at or above the temporary directory ${TEMPORARY} (TMPDIR), where a rebuild would ` +
        "find it; set TMPDIR to a directory with no node_modules or package.json above it.");
    }
  }
  if (dirname(directory) === directory) break;
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
const noteShape = (problem, commit) => shapeProblems.set(problem, [...(shapeProblems.get(problem) ?? []), commit]);
for (const commit of commits) {
  const here = new Map();
  // A case-insensitive or normalizing checkout would write such a name's files into artifacts/.
  for (const name of git("ls-tree", "-z", "--name-only", commit).split("\0").filter(Boolean)) {
    if (name !== "artifacts" && folded(name) === "artifacts") {
      noteShape(`${JSON.stringify(name)} is not artifacts but is one name with it once case-folded and normalized`, commit);
    }
  }
  const seen = new Map(); // folded path -> path
  for (const record of git("ls-tree", "-r", "-t", "-z", commit, "--", "artifacts").split("\0").filter(Boolean)) {
    const tab = record.indexOf("\t");
    const [mode, type, object] = record.slice(0, tab).split(" ");
    const path = record.slice(tab + 1);
    let problem = null;
    if (seen.has(folded(path))) noteShape(`${path} and ${seen.get(folded(path))} are one name once case-folded and normalized`, commit);
    seen.set(folded(path), path);
    if (path === "artifacts") {
      if (mode !== "040000" || type !== "tree") problem = `artifacts is not a directory (git mode ${mode}, ${type})`;
    } else if (!allowedPath(path)) {
      problem = `${path} is not README.md, archives.json, or an archive or receipt named for a strict semantic version (git mode ${mode}, ${type})`;
    } else if (mode !== "100644" || type !== "blob") {
      problem = `${path} is not a regular file (git mode ${mode}, ${type})`;
    }
    if (problem) {
      noteShape(problem, commit);
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
// Versions: strict, and no two that npm would take for one.
const STRICT_RULE = 'not a strict semantic version (SemVer 2.0.0 with no "v" prefix, no build metadata and no numeric ' +
  "identifier above 9007199254740991)";
for (const entry of entries) {
  if (!strictVersion(entry.version)) fail(MANIFEST, `The recorded version ${JSON.stringify(entry.version)} is ${STRICT_RULE}.`);
}
let headVersion = null;
try { headVersion = JSON.parse(git("cat-file", "blob", "HEAD:package.json")).version; } catch { /* reported below */ }
if (!strictVersion(headVersion)) fail("package.json", `The version in package.json at HEAD, ${JSON.stringify(headVersion)}, is ${STRICT_RULE}.`);
const carriedVersions = [...new Set(entries.filter((item) => item.status === "carried").map((item) => item.version))];
carriedVersions.forEach((version, index) => {
  for (const other of carriedVersions.slice(index + 1)) {
    if (npmEqual(version, other)) {
      fail(MANIFEST, `The carried versions ${version} and ${other} are equal as npm compares versions (semver.eq); ` +
        "a version string names one byte sequence.");
    }
  }
});
for (const version of carriedVersions) {
  if (version !== headVersion && npmEqual(version, headVersion)) {
    fail("package.json", `The version in package.json at HEAD, ${headVersion}, and the carried ${version} are equal as npm ` +
      "compares versions (semver.eq), so HEAD must be that version or another one.");
  }
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
  try { sourceVersion = JSON.parse(git("cat-file", "blob", `${entry.sourceCommit}:package.json`)).version; } catch { /* reported below */ }
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
    try { inSource = gitBytes("cat-file", "blob", `${entry.sourceCommit}:${name}`); } catch { /* missing */ }
    if (!inArchive || !inSource || !inArchive.equals(inSource)) {
      fail(path, `${label} packs a ${name} that is not byte-identical to its source commit's.`);
    }
  }
}

// 6. Rebuilds, each of a commit's tree written from git objects into a new
//    temporary directory, outside the checkout.
const quiet = { stdio: ["ignore", "pipe", "pipe"], maxBuffer: BIG, env: CHILD_ENV };
const lastLines = (error) => String(error?.stderr ?? error?.message ?? error).trim().split("\n").slice(-3);
/**
 * Write commit's tree into directory from git objects alone, as a checkout
 * would with no hooks, filters, attributes or sparse patterns: regular files
 * with mode 644 or 755, symbolic links as links, submodules as empty
 * directories.
 */
function materialize(commit, directory) {
  const entries = git("ls-tree", "-r", "-z", "--full-tree", commit).split("\0").filter(Boolean).map((record) => {
    const tab = record.indexOf("\t");
    const [mode, type, object] = record.slice(0, tab).split(" ");
    return { mode, type, object, path: record.slice(tab + 1) };
  });
  const blobs = entries.filter((entry) => entry.type === "blob");
  const batch = blobs.length === 0 ? Buffer.alloc(0)
    : gitRun(["cat-file", "--batch"], { input: `${blobs.map((entry) => entry.object).join("\n")}\n`, stdio: ["pipe", "pipe", "pipe"] });
  let offset = 0;
  for (const entry of entries) {
    const parts = entry.path.split("/");
    if (parts.some((part) => part === "" || part === "." || part === ".." || part.toLowerCase() === ".git")) {
      throw new Error(`${short(commit)} holds the path ${JSON.stringify(entry.path)}, which a checkout would not write.`);
    }
    const target = join(directory, ...parts);
    mkdirSync(dirname(target), { recursive: true });
    if (entry.type === "commit") {
      mkdirSync(target, { recursive: true });
      continue;
    }
    if (entry.type !== "blob") throw new Error(`${short(commit)} holds ${entry.path} as a ${entry.type}.`);
    const newline = batch.indexOf(0x0a, offset);
    const [object, type, size] = batch.subarray(offset, newline).toString("latin1").split(" ");
    if (object !== entry.object || type !== "blob") throw new Error(`git cat-file gave ${object} ${type} for ${entry.object}.`);
    const bytes = batch.subarray(newline + 1, newline + 1 + Number(size));
    offset = newline + 1 + Number(size) + 1;
    if (entry.mode === "120000") symlinkSync(bytes.toString("utf8"), target);
    else {
      writeFileSync(target, bytes);
      chmodSync(target, entry.mode === "100755" ? 0o755 : 0o644);
    }
  }
}
/** The packed bytes of a directory, or null after reporting why it could not be built. */
function rebuild(directory, version, path) {
  const scratch = mkdtempSync(join(TEMPORARY, "zodiacs-engine-pack-"));
  try {
    execFileSync(NPM, ["run", "build"], { cwd: directory, ...quiet });
    const [report] = JSON.parse(execFileSync(NPM, ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch],
      { cwd: directory, encoding: "utf8", ...quiet }));
    return readFileSync(join(scratch, report.filename));
  } catch (error) {
    fail(path, `The ${version} source could not be rebuilt and packed.`, lastLines(error));
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
  const parent = mkdtempSync(join(TEMPORARY, "zodiacs-engine-rebuild-"));
  const tree = join(parent, "tree");
  try {
    try {
      materialize(commit, tree);
    } catch (error) {
      fail(path, `The tree of ${where} could not be written from git objects.`, lastLines(error));
      return;
    }
    // The commit's own locked toolchain, installed afresh (the npm cache may
    // supply the packages); nothing comes from the checkout's node_modules.
    if (existsSync(join(tree, "package-lock.json"))) {
      try {
        execFileSync(NPM, ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: tree, ...quiet });
      } catch (error) {
        fail(path, `The locked dependencies of ${where} could not be installed.`, lastLines(error));
        return;
      }
    }
    compare(path, label, expected, rebuild(tree, version, path), where);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

const current = strictVersion(headVersion) ? carried.get(`zodiacs-engine-${headVersion}.tgz`) : undefined;
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

if (failures === 0) {
  console.log(`${entries.length} recorded archives (${carried.size} carried, ${superseded.length} superseded) and their receipts ` +
    `hold only their recorded bytes across ${commits.length} commits, and each is bound to its source commit.`);
}
done();
