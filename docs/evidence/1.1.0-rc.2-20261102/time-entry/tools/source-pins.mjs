// T6 (../PREREGISTRATION.md, sections 4 and 6): the entry's sources, byte for
// byte. At a commit, `git rev-parse <commit>:<path>` must give the six blobs
// of section 4; the working tree's copy of each must be that blob (git's blob
// id computed here) with the pinned SHA-256; the text of meanObliquity in
// src/houses.ts and of normalizeLongitude in src/signs.ts, from the line that
// begins `export function <name>` to the first line that is exactly `}`, each
// line ending with a newline, must hash to its pin, read from working-tree
// files that are the commit's blobs; and package-lock.json, also the commit's
// blob, must name tsup 8.5.1, esbuild 0.27.7 and TypeScript 5.9.3. It runs git
// only as rev-parse on these named paths.
//
// Controls: `--control types` adds src/types.ts with a253973's blob as its pin
// (the version bump changed it), and `--control frame-byte` compares a copy of
// src/frame.ts with one byte appended; either must fail.
//
//   node source-pins.mjs --repo <engine checkout> --commit <rev> [--control types|frame-byte] [--out <file>]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { finish, options } from "./load.mjs";

const SOURCES = [
  ["src/time-scale.ts", "f7db33bb6390ad5766cad33400c5001e30f4352f", "6358ab9f119f55e367b7a8cb601c0ed2a6fa0a1b083a8e48b2aa59cd96c7b9d6"],
  ["src/time-scale-data.ts", "5615b94de7dd4f84c850e404ee7bff55a8c865ba", "44c6b80db298e55a050b59cb75975ba2059abb775b16b849022ee5a5849280a0"],
  ["src/deltat.ts", "38192fa5dc4f1f947d6b18e2179b2418e6ce68cf", "2ce7e227bdf0e75bc2401793b8b09ed4113d80d8845376fbec7d0129c12f8b27"],
  ["src/reference-span.ts", "9d607a3dcb5ceaabfe31d198681d75b857276c31", "5bce5a05494448a5740027c078527ab4fb7b0c02f71ff83465c01fd085a4d996"],
  ["src/nutation.ts", "e25e9e2928d983fad78aa81c5cc4a84cbf419400", "c11af594d4e8ad64e0a7ff1097505063c70812d2da84e14a6c0280d4841e62b0"],
  ["src/frame.ts", "6657c7ee2c399620bc3ed84bcf55f1a95b077b99", "98d0bee44839b23d3ec64dac470e31ab8e366c6907d325a4259f8f37285a7c50"]
];
const FUNCTIONS = [
  ["src/houses.ts", "meanObliquity", "34119d1f24d214feb94f6a5d401bbdfcc3e4662067250c3058af4c3bf2734777"],
  ["src/signs.ts", "normalizeLongitude", "c515faf25565b74111049e7a2ab15c6a1019c81f4099212e5b832bb4d818e99e"]
];
const TOOLS = { tsup: "8.5.1", esbuild: "0.27.7", typescript: "5.9.3" };
/** The tree of section 4, a253973, whose src/types.ts the control takes as its pin. */
const PINNED_TREE = "a2539735f99fe38f9623cd1101de96b8c5cdf0f0";

const opts = options();
if (!opts.repo || !opts.commit) throw new Error("--repo and --commit are required");
const control = opts.control;
if (control !== undefined && !["types", "frame-byte"].includes(control)) throw new Error(`unknown control ${control}`);
const git = (...args) => execFileSync("git", ["-C", opts.repo, ...args], { encoding: "utf8" }).trim();
const blobAt = (rev, path) => git("rev-parse", `${rev}:${path}`);
const blobOf = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const working = (path) => readFileSync(join(opts.repo, path));
const commit = git("rev-parse", "--verify", `${opts.commit}^{commit}`);

const results = [];
for (const [path, blob, digest] of SOURCES) {
  let bytes = working(path);
  if (control === "frame-byte" && path === "src/frame.ts") bytes = Buffer.concat([bytes, Buffer.from("\n")]);
  const atCommit = blobAt(commit, path);
  results.push({ path, pinnedBlob: blob, blobAtCommit: atCommit, workingBlob: blobOf(bytes), workingSha256: sha256(bytes),
    pass: atCommit === blob && blobOf(bytes) === blob && sha256(bytes) === digest });
}
if (control === "types") {
  const path = "src/types.ts";
  const pinned = blobAt(PINNED_TREE, path);
  const atCommit = blobAt(commit, path);
  results.push({ path, pinnedBlob: pinned, blobAtCommit: atCommit, workingBlob: blobOf(working(path)), pass: atCommit === pinned });
}
const functionText = (text, name) => {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`export function ${name}`));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index >= start && line === "}");
  return end < 0 ? null : lines.slice(start, end + 1).map((line) => `${line}\n`).join("");
};
for (const [path, name, digest] of FUNCTIONS) {
  const bytes = working(path);
  const text = functionText(bytes.toString("utf8"), name);
  const atCommit = blobAt(commit, path);
  results.push({ path, function: name, workingIsCommit: blobOf(bytes) === atCommit, sha256: text === null ? null : sha256(text),
    pass: blobOf(bytes) === atCommit && text !== null && sha256(text) === digest });
}
const lockBytes = working("package-lock.json");
const lock = JSON.parse(lockBytes.toString("utf8"));
const versions = Object.fromEntries(Object.keys(TOOLS).map((name) => [name, lock.packages[`node_modules/${name}`]?.version ?? null]));
results.push({ path: "package-lock.json", workingIsCommit: blobOf(lockBytes) === blobAt(commit, "package-lock.json"), versions,
  pass: blobOf(lockBytes) === blobAt(commit, "package-lock.json") && Object.entries(TOOLS).every(([name, version]) => versions[name] === version) });

const pass = results.every((result) => result.pass);
await finish({
  check: "T6",
  tool: "source-pins.mjs",
  commit,
  control: control ?? null,
  controlBehaved: control ? !pass : null,
  results,
  node: process.version,
  pass
}, opts.out);
