/**
 * A version string names one byte sequence. This check enforces it twice:
 *
 * 1. History: every artifacts/*.tgz path ever committed still exists and has
 *    held one byte sequence in all history reachable from HEAD, apart from the
 *    rc.11 breach recorded in artifacts/README.md. Needs full history
 *    (actions/checkout with fetch-depth: 0).
 * 2. Source: when artifacts/zodiacs-engine-<version>.tgz exists for
 *    package.json's version, rebuild from this checkout, pack, and require the
 *    same bytes, with the .sha256 receipt beside it naming them. Without an
 *    archive for this version, report that and skip: a candidate's source
 *    commit precedes the commit that carries its archive.
 *
 * Usage, after npm ci: node scripts/verify-archive-binding.mjs
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const name = `zodiacs-engine-${version}.tgz`;
const carried = join(root, "artifacts", name);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** The one recorded breach: rc.11 was repacked under its version before merge (artifacts/README.md). */
const BREACHES = new Map([["artifacts/zodiacs-engine-0.1.1-rc.11.tgz", new Set([
  "13d637db21e3e444c783fd85832e4f61dfdb4b7777b2c84038ec887b47029c4e",
  "d88e0ff8db91e1183789763ad32feb2dac61716e35ad7676a943f7a1ad377862"
])]]);

function fail(file, message, details = []) {
  // One annotation for the workflow summary, then the particulars.
  console.error(`::error file=${file}::${message}`);
  for (const line of details) console.error(line);
  process.exitCode = 1;
}

// 1. History.
if (git("rev-parse", "--is-shallow-repository").trim() !== "false") {
  fail("artifacts", "The checkout is shallow, so archive history cannot be checked; fetch full history (fetch-depth: 0).");
} else {
  const paths = [...new Set(git("log", "--format=", "--name-only", "HEAD", "--", "artifacts").split("\n")
    .filter((path) => /^artifacts\/[^/]+\.tgz$/.test(path)))].sort();
  for (const path of paths) {
    if (!existsSync(join(root, path))) {
      fail(path, `${path} was carried and has since been removed; carried archives are never removed.`);
      continue;
    }
    const digests = new Set();
    for (const commit of git("rev-list", "HEAD", "--", path).split("\n").filter(Boolean)) {
      const present = git("ls-tree", "--name-only", commit, "--", path).trim() === path;
      if (present) digests.add(sha256(execFileSync("git", ["show", `${commit}:${path}`], { cwd: root, maxBuffer: 64 * 1024 * 1024 })));
    }
    const allowed = BREACHES.get(path);
    const extra = [...digests].filter((digest) => !allowed?.has(digest));
    if (digests.size > 1 && (allowed === undefined || extra.length > 0)) {
      fail(path, `${path} has held ${digests.size} different byte sequences in history; a version string names one.`,
        [...digests].map((digest) => `  ${digest}`));
    }
  }
  if (process.exitCode !== 1) {
    console.log(`${paths.length} carried archive paths each hold one byte sequence in history` +
      `${[...BREACHES.keys()].some((path) => paths.includes(path)) ? " (rc.11's recorded breach excepted)" : ""}.`);
  }
}

// 2. Source.
if (!existsSync(carried)) {
  console.log(`No archive artifacts/${name} is carried for ${version} yet; skipping the source binding check.`);
  process.exit();
}

const expected = readFileSync(carried);
const receiptPath = join(root, "artifacts", `zodiacs-engine-${version}.sha256`);
const receipt = existsSync(receiptPath) ? readFileSync(receiptPath, "utf8") : null;
if (receipt !== `${sha256(expected)}  ${name}\n`) {
  fail(`artifacts/${name}`, `artifacts/zodiacs-engine-${version}.sha256 does not name the carried archive's bytes.`, [
    `  carried archive sha256: ${sha256(expected)}`,
    `  receipt:                ${receipt === null ? "(missing)" : JSON.stringify(receipt)}`
  ]);
}

function files(directory) {
  const out = new Map();
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      else out.set(relative(directory, path), sha256(readFileSync(path)));
    }
  };
  walk(directory);
  return out;
}

const scratch = mkdtempSync(join(tmpdir(), "zodiacs-engine-binding-"));
try {
  const quiet = { cwd: root, stdio: ["ignore", "pipe", "pipe"] };
  execFileSync("npm", ["run", "build"], quiet);
  execFileSync("npm", ["pack", "--ignore-scripts", "--pack-destination", scratch], quiet);
  const rebuilt = readFileSync(join(scratch, name));
  if (rebuilt.equals(expected)) {
    console.log(`artifacts/${name} is byte-identical to a rebuild of this checkout on Node ${process.version}: ` +
      `sha256 ${sha256(rebuilt)}, ${rebuilt.length} bytes.`);
  } else {
    // Name every packed file that differs, so the mismatch can be traced.
    const unpacked = { carried: join(scratch, "carried"), rebuilt: join(scratch, "rebuilt") };
    for (const [key, archive] of [["carried", carried], ["rebuilt", join(scratch, name)]]) {
      mkdirSync(unpacked[key]);
      execFileSync("tar", ["-xzf", archive, "-C", unpacked[key]]);
    }
    const before = files(unpacked.carried);
    const after = files(unpacked.rebuilt);
    const differences = [...new Set([...before.keys(), ...after.keys()])].sort()
      .filter((path) => before.get(path) !== after.get(path))
      .map((path) => `  ${path}: carried ${before.get(path) ?? "(absent)"}, rebuilt ${after.get(path) ?? "(absent)"}`);
    fail(`artifacts/${name}`, `The carried archive for ${version} is not the archive this source builds. ` +
      "A version string must name one byte sequence: restore the source it was packed from, or bump the version and pack anew.", [
      `  carried: sha256 ${sha256(expected)}, ${expected.length} bytes`,
      `  rebuilt: sha256 ${sha256(rebuilt)}, ${rebuilt.length} bytes on Node ${process.version}`,
      ...(differences.length > 0 ? differences : ["  Every packed file matches; only the tar or gzip framing differs."])
    ]);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
