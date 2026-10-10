// What 1.0.0 changes from 1.0.0-rc.2, on one machine: the values battery of
// 1.0.0-rc.1's record (../1.0.0-rc.1-20261006/tools/values.mjs, unchanged)
// on the carried 1.0.0-rc.2 archive and on this tree's build, each in its own
// process, compared byte for byte; every declaration file of the build
// against the archive's; and every JavaScript file of the build against the
// archive's once the content hashes in chunk names and the version string
// are set aside. Writes results/values-compare.txt, results/declarations.txt
// and results/javascript.txt beside this directory.
//
//   npm run build && node docs/evidence/1.0.0-20261011/tools/compare-rc2.mjs <scratch directory>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const scratch = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("usage: node compare-rc2.mjs <scratch directory>");
const root = resolve(new URL("../../../../", import.meta.url).pathname);
const out = resolve(new URL("../results/", import.meta.url).pathname);
const archive = join(root, "artifacts/zodiacs-engine-1.0.0-rc.2.tgz");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const today = new Date().toISOString().slice(0, 10);

rmSync(join(scratch, "rc2"), { recursive: true, force: true });
mkdirSync(join(scratch, "rc2"), { recursive: true });
execFileSync("tar", ["-xzf", archive, "-C", join(scratch, "rc2")]);
const rc2 = join(scratch, "rc2", "package");
symlinkSync(join(root, "node_modules"), join(rc2, "node_modules"));

const values = (dir) => execFileSync(process.execPath, [join(root, "docs/evidence/1.0.0-rc.1-20261006/tools/values.mjs"), dir], { maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] });
const before = values(rc2);
const after = values(root);
const lines = (bytes) => bytes.toString("utf8").split("\n").filter(Boolean).length;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "values-compare.txt"), [
  `# node ../1.0.0-rc.1-20261006/tools/values.mjs <package> > <run>.jsonl, unchanged, in its own process for each package; then compared; Node ${process.version}, ${process.platform}-${process.arch}, ${today}`,
  `1.0.0-rc.2, artifacts/zodiacs-engine-1.0.0-rc.2.tgz (SHA-256 ${sha256(readFileSync(archive))}), unpacked: ${lines(before)} lines, SHA-256 ${sha256(before)}`,
  `1.0.0, this tree's build: ${lines(after)} lines, SHA-256 ${sha256(after)}`,
  Buffer.compare(before, after) === 0 ? "the two runs are the same bytes" : "THE TWO RUNS DIFFER",
  "",
].join("\n"));

const declarations = readdirSync(join(root, "dist")).filter((file) => file.endsWith(".d.ts")).sort();
const differing = declarations.filter((file) => Buffer.compare(readFileSync(join(root, "dist", file)), readFileSync(join(rc2, "dist", file))) !== 0);
writeFileSync(join(out, "declarations.txt"), [
  `# each dist/*.d.ts of this tree's build against the same file of artifacts/zodiacs-engine-1.0.0-rc.2.tgz, unpacked; ${today}`,
  `${declarations.length - differing.length} of ${declarations.length} declaration files are 1.0.0-rc.2's byte for byte${differing.length ? `; differing: ${differing.join(", ")}` : ""}`,
  "",
].join("\n"));

const normalize = (text) => text.replace(/chunk-[A-Z0-9]{8}\.js/g, "chunk-HASH.js").replace(/"1\.0\.0(?:-rc\.2)?"/g, '"VERSION"');
const scripts = (dir) => readdirSync(join(dir, "dist")).filter((file) => file.endsWith(".js")).sort();
const built = scripts(root);
const carried = new Map(scripts(rc2).map((file) => [normalize(readFileSync(join(rc2, "dist", file), "utf8")), file]));
const unmatched = built.filter((file) => !carried.has(normalize(readFileSync(join(root, "dist", file), "utf8"))));
const holding = built.filter((file) => readFileSync(join(root, "dist", file), "utf8").includes('"1.0.0"'));
writeFileSync(join(out, "javascript.txt"), [
  `# each dist/*.js of this tree's build against the files of artifacts/zodiacs-engine-1.0.0-rc.2.tgz, unpacked, with chunk-XXXXXXXX.js names and the version string ("1.0.0", "1.0.0-rc.2") set aside; ${today}`,
  `${built.length} files built, ${scripts(rc2).length} carried; ${built.length - unmatched.length} built files equal a carried one${unmatched.length ? `; unmatched: ${unmatched.join(", ")}` : ""}`,
  `files holding "1.0.0": ${holding.join(", ")}`,
  "",
].join("\n"));
console.log(readFileSync(join(out, "values-compare.txt"), "utf8") + readFileSync(join(out, "declarations.txt"), "utf8") + readFileSync(join(out, "javascript.txt"), "utf8"));
