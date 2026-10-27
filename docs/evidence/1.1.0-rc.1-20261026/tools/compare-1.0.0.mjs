// What 1.1.0-rc.1 changes from 1.0.0, on one machine: the values battery of
// 1.0.0-rc.1's record (../../1.0.0-rc.1-20261006/tools/values.mjs, unchanged)
// on the carried 1.0.0 archive and on this tree's build, each in its own
// process, compared line by line. A line that differs is set beside 1.0.0's
// with what this candidate adds to a natal envelope taken out (the feature
// `convention-ids`, the set's `conventionIds` and the receipt's
// `conventionIds`), wherever an envelope appears in it, as an object or as
// serialized text, and NATAL_RECEIPT_CONVENTION_SETS with its first set, this
// candidate's, taken out. Every declaration file of the build is compared with the
// archive's, and every JavaScript file once the content hashes in chunk
// names and the version string are set aside. Writes results/values-compare.txt,
// results/declarations.txt and results/javascript.txt beside this directory.
//
//   npm run build && node docs/evidence/1.1.0-rc.1-20261026/tools/compare-1.0.0.mjs <scratch directory>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const scratch = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("usage: node compare-1.0.0.mjs <scratch directory>");
const root = resolve(new URL("../../../../", import.meta.url).pathname);
const out = resolve(new URL("../results/", import.meta.url).pathname);
const archive = join(root, "artifacts/zodiacs-engine-1.0.0.tgz");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const today = new Date().toISOString().slice(0, 10);

rmSync(join(scratch, "one-zero"), { recursive: true, force: true });
mkdirSync(join(scratch, "one-zero"), { recursive: true });
execFileSync("tar", ["-xzf", archive, "-C", join(scratch, "one-zero")]);
const carried = join(scratch, "one-zero", "package");
symlinkSync(join(root, "node_modules"), join(carried, "node_modules"));

const values = (dir) => execFileSync(process.execPath, [join(root, "docs/evidence/1.0.0-rc.1-20261006/tools/values.mjs"), dir], { maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] });
const before = values(carried);
const after = values(root);
const split = (bytes) => bytes.toString("utf8").split("\n").filter(Boolean);

/** A value with what this candidate adds to a natal envelope taken out, wherever an envelope is in it. */
function asOneZero(value) {
  if (typeof value === "string" && value.startsWith('{"') && value.includes('"zodiacs.natal-envelope.draft-v1"')) {
    try {
      return JSON.stringify(asOneZero(JSON.parse(value)));
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map(asOneZero);
  if (value === null || typeof value !== "object") return value;
  const copy = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, asOneZero(entry)]));
  if (copy.schema === "zodiacs.natal-envelope.draft-v1" && Array.isArray(copy.requiredFeatures))
    copy.requiredFeatures = copy.requiredFeatures.filter((feature) => feature !== "convention-ids");
  if (copy.schema === "zodiacs.calculation-receipt.draft-v1") {
    delete copy.conventionIds;
    if (copy.conventions && typeof copy.conventions === "object") delete copy.conventions.conventionIds;
  }
  return copy;
}

const old = split(before);
const now = split(after);
let same = 0;
const added = new Map();
const other = [];
for (let index = 0; index < Math.max(old.length, now.length); index += 1) {
  if (old[index] === now[index]) {
    same += 1;
    continue;
  }
  const id = JSON.parse(now[index] ?? old[index]).id;
  const line = now[index] === undefined ? undefined : asOneZero(JSON.parse(now[index]));
  // The list of sets gains this candidate's at its front.
  if (line && id === "const receipt.NATAL_RECEIPT_CONVENTION_SETS #1") line.result.value = line.result.value.slice(1);
  if (old[index] !== undefined && line !== undefined && JSON.stringify(line) === old[index]) {
    added.set(id, (added.get(id) ?? 0) + 1);
  } else other.push(id);
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "values-compare.txt"), [
  `# node ../../1.0.0-rc.1-20261006/tools/values.mjs <package> > <run>.jsonl, unchanged, in its own process for each package; then compared line by line; Node ${process.version}, ${process.platform}-${process.arch}, ${today}`,
  `1.0.0, artifacts/zodiacs-engine-1.0.0.tgz (SHA-256 ${sha256(readFileSync(archive))}), unpacked: ${old.length} lines, SHA-256 ${sha256(before)}`,
  `1.1.0-rc.1, this tree's build: ${now.length} lines, SHA-256 ${sha256(after)}`,
  `${same} lines are the same bytes`,
  `${[...added.values()].reduce((sum, count) => sum + count, 0)} lines differ only by what 1.1.0-rc.1 adds to a natal envelope or to the list of sets: ${[...added].map(([id, count]) => `${id} (${count})`).join(", ")}`,
  other.length ? `${other.length} OTHER LINES DIFFER: ${other.join(", ")}` : "no other line differs",
  "",
].join("\n"));

const declarations = readdirSync(join(root, "dist")).filter((file) => file.endsWith(".d.ts")).sort();
const oldDeclarations = new Set(readdirSync(join(carried, "dist")).filter((file) => file.endsWith(".d.ts")));
const differing = declarations.filter((file) => !oldDeclarations.has(file) || Buffer.compare(readFileSync(join(root, "dist", file)), readFileSync(join(carried, "dist", file))) !== 0);
writeFileSync(join(out, "declarations.txt"), [
  `# each dist/*.d.ts of this tree's build against the same file of artifacts/zodiacs-engine-1.0.0.tgz, unpacked; ${today}`,
  `${declarations.length - differing.length} of ${declarations.length} declaration files are 1.0.0's byte for byte; differing or new: ${differing.join(", ") || "none"}`,
  `1.0.0's not in the build: ${[...oldDeclarations].filter((file) => !declarations.includes(file)).join(", ") || "none"}`,
  "",
].join("\n"));

const normalize = (text) => text.replace(/chunk-[A-Z0-9]{8}\.js/g, "chunk-HASH.js").replace(/"1\.(?:0\.0|1\.0-rc\.1)"/g, '"VERSION"');
const scripts = (dir) => readdirSync(join(dir, "dist")).filter((file) => file.endsWith(".js")).sort();
const built = scripts(root);
const oldScripts = new Map(scripts(carried).map((file) => [normalize(readFileSync(join(carried, "dist", file), "utf8")), file]));
const unmatched = built.filter((file) => !oldScripts.has(normalize(readFileSync(join(root, "dist", file), "utf8"))));
// A chunk's name is a hash of its content, and the build writes a file's
// imports in the order of their names, so a file whose chunks were renamed
// can hold the same lines in another order.
const sorted = (text) => normalize(text).split("\n").sort().join("\n");
const oldSorted = new Set(scripts(carried).map((file) => sorted(readFileSync(join(carried, "dist", file), "utf8"))));
const reordered = unmatched.filter((file) => oldSorted.has(sorted(readFileSync(join(root, "dist", file), "utf8"))));
writeFileSync(join(out, "javascript.txt"), [
  `# each dist/*.js of this tree's build against the files of artifacts/zodiacs-engine-1.0.0.tgz, unpacked, with chunk-XXXXXXXX.js names and the version string ("1.0.0", "1.1.0-rc.1") set aside; ${today}`,
  `${built.length} files built, ${scripts(carried).length} carried; ${built.length - unmatched.length} built files equal a carried one`,
  `${reordered.length} hold a carried one's lines in another order: ${reordered.join(", ") || "none"}`,
  `the other ${unmatched.length - reordered.length}: ${unmatched.filter((file) => !reordered.includes(file)).join(", ") || "none"}`,
  "",
].join("\n"));
console.log(readFileSync(join(out, "values-compare.txt"), "utf8") + readFileSync(join(out, "declarations.txt"), "utf8") + readFileSync(join(out, "javascript.txt"), "utf8"));
