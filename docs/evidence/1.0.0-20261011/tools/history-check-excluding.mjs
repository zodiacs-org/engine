// docs/evidence/rc15-20260929/rebuilt/history-check.mjs, with one change for
// 1.0.0: a path the owner has ruled must never be opened, read or searched is
// left out everywhere the check reads. Its diffs, binary contents, added path
// and tree entry are excluded with a git pathspec, and an archive member of
// that name is skipped when a gzip archive is unpacked; the output names the
// exclusion. Everything else is the committed tool's.
//
// Searches the commits of a range, and the tree of its last commit, for
// people's birth data that must not be published. For each commit it reads
// every line the commit adds against each of its parents, the contents of
// every binary file it adds or changes (gzip archives decompressed, and a tar
// inside read member by member), the paths it adds and its message; with
// --staged, the index's changes against HEAD too, as one more entry. It then
// reads every file of the last commit's tree in the same way.
//
// The patterns come from a file kept outside the repository, because they are
// the birth data searched for. Each line is "<label>\t<kind>\t<regular
// expression>": the label names a person; kind "data" is a birth date, time,
// place or chart detail, and kind "name" the person's name. The output gives
// labels, counts, commits and file paths only: no matched line and no
// pattern.
//
// An optional second file, also kept outside the repository, lists the
// published worked examples that CONTRIBUTING.md allows, as "<label>\t<name
// pattern>\t<birth data pattern>\t<citation patterns, joined by " && ">":
// the output lists the files of the tree that name each and the files that
// hold its birth data, and whether each of the latter also holds every part
// of its citation.
//
//   node history-check-excluding.mjs <range> <patterns file> [<examples file>] [--staged]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const EXCLUDED = ["docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py"];
const EXCLUDED_NAMES = new Set(EXCLUDED.map((path) => path.split("/").at(-1)));
const PATHSPEC = ["--", ".", ...EXCLUDED.map((path) => `:(exclude,top)${path}`)];
const excluded = (path) => EXCLUDED.includes(path) || EXCLUDED_NAMES.has(path.split("/").at(-1));

const args = process.argv.slice(2);
const staged = args.includes("--staged");
const [range, patternsFile, examplesFile] = args.filter((arg) => arg !== "--staged");
if (!range || !patternsFile) throw new Error("usage: node history-check-excluding.mjs <range> <patterns file> [<examples file>] [--staged]");

const git = (...command) => execFileSync("git", command, { maxBuffer: 1 << 30 });
const gitText = (...command) => git(...command).toString("utf8");
const EMPTY_TREE = gitText("hash-object", "-t", "tree", "/dev/null").trim();

const rows = (file) => readFileSync(file, "utf8").split("\n").filter((line) => line.trim() && !line.startsWith("#")).map((line) => line.split("\t"));
const patterns = rows(patternsFile).map(([label, kind, source]) => {
  if (!["data", "name"].includes(kind) || !source) throw new Error(`bad pattern line for ${label}`);
  return { label, kind, regex: new RegExp(source, "u") };
});
const labels = [...new Set(patterns.map((pattern) => pattern.label))];
const examples = examplesFile
  ? rows(examplesFile).map(([label, name, data, citation]) => ({
      label,
      name: new RegExp(name, "u"),
      data: new RegExp(data, "u"),
      citation: citation.split(" && ").map((part) => new RegExp(part, "u"))
    }))
  : [];

let skippedMembers = 0;

/** A tar's members but the excluded, each name and its contents; null when the bytes are not a ustar archive. */
function tarText(data) {
  if (data.length < 512 || data.toString("latin1", 257, 262) !== "ustar") return null;
  const parts = [];
  for (let offset = 0; offset + 512 <= data.length;) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, length) => header.toString("latin1", start, start + length).replace(/\0.*$/su, "");
    const prefix = field(345, 155);
    const name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const body = data.subarray(offset + 512, offset + 512 + size);
    if (excluded(name)) skippedMembers += 1;
    else parts.push(name, body.toString(body.toString("utf8").includes("�") ? "latin1" : "utf8"));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return parts.join("\n");
}

/** A blob's text: gzip archives decompressed, a tar read member by member, other bytes read as Latin-1 when not UTF-8 text. */
function textOf(bytes) {
  let data = bytes;
  if (data.length > 2 && data[0] === 0x1f && data[1] === 0x8b) {
    try { data = gunzipSync(data); } catch { /* searched as it is */ }
  }
  const tar = tarText(data);
  if (tar !== null) return tar;
  const utf8 = data.toString("utf8");
  return utf8.includes("�") ? data.toString("latin1") : utf8;
}

/** Counts, per label and kind, the lines of `text` that match; `where` collects the places. */
function scan(text, place, found) {
  for (const line of text.split("\n")) {
    for (const pattern of patterns) {
      if (!pattern.regex.test(line)) continue;
      const key = `${pattern.label}\u0000${pattern.kind}`;
      const entry = found.get(key) ?? { lines: 0, places: new Set() };
      entry.lines += 1;
      entry.places.add(place);
      found.set(key, entry);
    }
  }
}

/** What one change adds: its added lines, binary blobs, added paths; `blob(path)` reads the new side. */
function scanChange(diffArgs, blob, message) {
  const found = new Map();
  const diff = gitText("diff", "--no-color", "--no-ext-diff", "--no-renames", "--no-textconv", "-U0", ...diffArgs, ...PATHSPEC);
  let file = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) file = line === "+++ /dev/null" ? null : line.slice(6);
    else if (line.startsWith("+") && file) scan(line.slice(1), file, found);
  }
  const numstat = gitText("diff", "--no-color", "--no-renames", "--numstat", "--diff-filter=AMT", "-z", ...diffArgs, ...PATHSPEC).split("\0").filter(Boolean);
  let binaries = 0;
  for (const entry of numstat) {
    const [added, removed, path] = entry.split("\t");
    if (added === "-" && removed === "-" && !excluded(path)) {
      binaries += 1;
      scan(textOf(blob(path)), `${path} (contents)`, found);
    }
  }
  const status = gitText("diff", "--no-color", "--no-renames", "--name-status", "-z", ...diffArgs, ...PATHSPEC).split("\0");
  let paths = 0;
  for (let i = 0; i + 1 < status.length; i += 2) {
    if (status[i] === "A" && !excluded(status[i + 1])) {
      paths += 1;
      scan(status[i + 1], "(path)", found);
    }
  }
  if (message !== null) scan(message, "(message)", found);
  return { found, binaries, paths };
}

const commits = gitText("rev-list", "--reverse", range).split("\n").filter(Boolean);
const entries = [];
for (const commit of commits) {
  const parents = gitText("rev-list", "--parents", "-n", "1", commit).trim().split(" ").slice(1);
  const message = gitText("log", "-1", "--format=%B", commit);
  const subject = gitText("log", "-1", "--format=%s", commit).trim();
  const results = (parents.length ? parents : [EMPTY_TREE]).map((parent, index) =>
    scanChange([parent, commit], (path) => git("cat-file", "blob", `${commit}:${path}`), index === 0 ? message : null));
  entries.push({ name: `${commit.slice(0, 7)} ${subject}`, results, parents: parents.length });
}
if (staged) {
  entries.push({ name: "(the index against HEAD: the commit being made)", results: [scanChange(["--cached", "HEAD"], (path) => git("show", `:${path}`), null)], parents: 1 });
}

const last = commits.at(-1);
const treeFound = new Map();
const exampleFiles = new Map(examples.map((example) => [example.label, { named: [], data: [] }]));
const allTreeFiles = gitText("ls-tree", "-r", "-z", "--name-only", last).split("\0").filter(Boolean);
const treeFiles = allTreeFiles.filter((path) => !excluded(path));
for (const path of treeFiles) {
  const text = textOf(git("cat-file", "blob", `${last}:${path}`));
  scan(text, path, treeFound);
  // A citation may run over lines of a comment: line breaks and comment marks read as spaces.
  const joined = text.replace(/\s*\n\s*(?:\/\/+|\*+|#+)?\s*/gu, " ");
  for (const example of examples) {
    const files = exampleFiles.get(example.label);
    if (example.name.test(text)) files.named.push(path);
    if (example.data.test(text)) files.data.push(`${path} (${example.citation.every((part) => part.test(joined)) ? "cited" : "NOT CITED"})`);
  }
}

const out = [];
const counts = (found, kind) => labels.map((label) => [label, found.get(`${label}\u0000${kind}`)]).filter(([, entry]) => entry);
out.push(`# node history-check-excluding.mjs ${range} <patterns> ${examplesFile ? "<examples> " : ""}${staged ? "--staged" : ""}`.trimEnd());
out.push(`# ${new Date().toISOString().slice(0, 10)}, git ${gitText("--version").trim().split(" ")[2]}, Node ${process.version}`);
out.push("");
out.push(`Excluded, never read, by the owner's rule: ${EXCLUDED.join(", ")}, in every commit, the index and the tree, and any archive member of that name. Nothing below covers it.`);
out.push("");
out.push(`Labels searched (${patterns.filter((p) => p.kind === "data").length} data patterns and ${patterns.filter((p) => p.kind === "name").length} name patterns, kept outside the repository):`);
for (const label of labels) out.push(`  ${label}`);
out.push("");
out.push(`Commits: ${entries.length}${staged ? ", the last of them the index" : ""}. For each, the lines it adds, the contents of the binary files it adds or changes, the paths it adds and its message:`);
let dataInHistory = 0;
for (const entry of entries) {
  out.push(`- ${entry.name}${entry.parents > 1 ? ` (a merge, read against each of its ${entry.parents} parents)` : ""}`);
  const data = entry.results.flatMap((result) => counts(result.found, "data"));
  const names = entry.results.flatMap((result) => counts(result.found, "name"));
  const binaries = entry.results.reduce((sum, result) => sum + result.binaries, 0);
  const paths = entry.results.reduce((sum, result) => sum + result.paths, 0);
  out.push(`    binary files read: ${binaries}; paths added: ${paths}`);
  if (data.length === 0) out.push("    birth data: none");
  for (const [label, found] of data) {
    dataInHistory += found.lines;
    out.push(`    BIRTH DATA: ${label}: ${found.lines} lines, in ${[...found.places].sort().join(", ")}`);
  }
  for (const [label, found] of names) out.push(`    name only: ${label}: ${found.lines} lines, in ${[...found.places].sort().join(", ")}`);
}
out.push("");
out.push(`The tree of ${last.slice(0, 7)}, ${treeFiles.length} files of ${allTreeFiles.length} (the excluded left out), gzip archives decompressed:`);
const treeData = counts(treeFound, "data");
if (treeData.length === 0) out.push("  birth data: none");
for (const [label, found] of treeData) out.push(`  BIRTH DATA: ${label}: ${found.lines} lines, in ${[...found.places].sort().join(", ")}`);
for (const [label, found] of counts(treeFound, "name")) out.push(`  name only: ${label}: ${found.lines} lines, in ${[...found.places].sort().join(", ")}`);
if (examples.length) {
  out.push("");
  out.push("The published worked examples that CONTRIBUTING.md allows: the files of that tree that name each, and those that hold its birth data (cited: the file also holds every part of the citation):");
  for (const example of examples) {
    const files = exampleFiles.get(example.label);
    out.push(`- ${example.label}`);
    out.push(`    named in ${files.named.length} files: ${files.named.join(", ")}`);
    out.push(`    birth data in ${files.data.length} files:`);
    for (const file of files.data) out.push(`      ${file}`);
  }
}
out.push("");
out.push(`Archive members skipped as excluded: ${skippedMembers}.`);
out.push(`Birth data found: ${dataInHistory} lines added in the commits, ${treeData.reduce((sum, [, found]) => sum + found.lines, 0)} lines in the tree.`);
console.log(out.join("\n"));
if (dataInHistory > 0 || treeData.length > 0) process.exitCode = 1;
