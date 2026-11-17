/*
 * The outside oracle for the move from tzdata 2025c to 2026f: zic compiles
 * each release's data, zdump reads every compiled name. Nothing here reads
 * the engine, its generated shards or the generator's intermediate files.
 *
 * Each release is compiled twice, with the call scripts/build-tz-shards.mjs
 * makes (`zic -d DIR FILES`, no -b):
 *
 * - "pinned": the main data files and `backzone`, with `backward`'s Zone and
 *   Rule lines (2026d moved EST5EDT, CST6CDT, MST7MDT and PST8PDT there) and
 *   those of its Link lines whose name neither backzone nor the main files
 *   define, so that zic itself resolves each name as the generator does
 *   (backzone's zone, then the main data's zone, then a link);
 * - "default": the main data files with `backward`, tzdb's default build,
 *   which Intl carries.
 *
 * For every compiled name it writes `zdump -v -c 1800,1970` (the history
 * before 1970) and `zdump -v -c 1970,2038` (used only to tell which names the
 * generator must mark host-legal: those whose pinned and default builds
 * differ from 1970 on), and prints each dump's SHA-256.
 *
 *   node docs/evidence/tzdb-2026f-20261117/oracle.mjs --zic ZIC --zdump ZDUMP \
 *     --tzdata tzdata2025c.tar.gz --tzdata tzdata2026f.tar.gz --out DIR
 *
 * Needs tar. The dumps are not committed; README.md records their digests.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAIN = ["africa", "antarctica", "asia", "australasia", "europe", "northamerica", "southamerica", "etcetera"];

function args() {
  const out = { tzdata: [] };
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    if (flag === "--tzdata") out.tzdata.push(resolve(value));
    else if (flag === "--zic" || flag === "--zdump" || flag === "--out") out[flag.slice(2)] = resolve(value);
    else throw new Error(`oracle: unknown argument ${flag}`);
  }
  if (!out.zic || !out.zdump || !out.out || out.tzdata.length === 0) throw new Error("oracle: --zic, --zdump, --out and --tzdata are required");
  return out;
}

/** Strips comments and splits a data line into fields, as zic does for the lines this script sorts. */
const fieldsOf = (line) => line.replace(/#.*/, "").trim().split(/\s+/).filter(Boolean);
const isZone = (fields) => /^z(?:o(?:ne?)?)?$/i.test(fields[0] ?? "");
const isLink = (fields) => /^l(?:i(?:nk?)?)?$/i.test(fields[0] ?? "");

/** Every name a file defines: its zones and its links. */
function defined(text) {
  const names = new Set();
  for (const line of text.split("\n")) {
    const fields = fieldsOf(line);
    if (isZone(fields)) names.add(fields[1]);
    if (isLink(fields)) names.add(fields[2]);
  }
  return names;
}

export function compileForm(data, form, work, zic) {
  const out = join(work, form);
  const inputs = [...MAIN.map((file) => join(data, file))];
  if (form === "default") {
    inputs.push(join(data, "backward"));
  } else {
    const taken = new Set([...MAIN, "backzone"].flatMap((file) => [...defined(readFileSync(join(data, file), "utf8"))]));
    const kept = readFileSync(join(data, "backward"), "utf8")
      .split("\n")
      .filter((line) => {
        const fields = fieldsOf(line);
        return !isLink(fields) || !taken.has(fields[2]);
      });
    writeFileSync(join(work, "backward.pinned"), kept.join("\n"));
    inputs.push(join(data, "backzone"), join(work, "backward.pinned"));
  }
  execFileSync(zic, ["-d", out, ...inputs], { stdio: ["ignore", "ignore", "pipe"] });
  const names = [];
  const walk = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(directory, entry.name), name);
      else names.push(name);
    }
  };
  walk(out, "");
  return { dir: out, names: names.sort() };
}

/** zdump over every name, each line's absolute path replaced by the name. */
function dump(zdump, tree, window) {
  return tree.names
    .map((name) => {
      const path = join(tree.dir, name);
      const text = execFileSync(zdump, ["-v", "-c", window, path], { encoding: "utf8", maxBuffer: 1 << 26 });
      return text
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          if (!line.startsWith(`${path}  `)) throw new Error(`oracle: zdump line not understood: ${line}`);
          return `${name}  ${line.slice(path.length + 2)}`;
        })
        .join("\n");
    })
    .join("\n") + "\n";
}

/** Extracts a tzdata tarball into a new directory under `work` and returns it with the release's version. */
export function extract(tarball, work) {
  const data = join(work, "data");
  mkdirSync(data);
  execFileSync("tar", ["-xzf", tarball, "-C", data]);
  return { data, version: readFileSync(join(data, "version"), "utf8").trim() };
}

function main() {
  const { tzdata, zic, zdump: zdumpPath, out } = args();
  mkdirSync(out, { recursive: true });
  const sha = (text) => createHash("sha256").update(text).digest("hex");
  for (const tarball of tzdata) {
    const work = mkdtempSync(join(tmpdir(), "tzdb-oracle-"));
    try {
      const { data, version } = extract(tarball, work);
      console.log(`tzdata ${version}: ${tarball} sha256 ${sha(readFileSync(tarball))}`);
      for (const form of ["pinned", "default"]) {
        const tree = compileForm(data, form, work, zic);
        for (const [label, window] of [["1800-1970", "1800,1970"], ["1970-2038", "1970,2038"]]) {
          const text = dump(zdumpPath, tree, window);
          const file = join(out, `${version}-${form}-${label}.zdump`);
          writeFileSync(file, text);
          console.log(`  ${version} ${form} ${label}: ${tree.names.length} names, ${text.split("\n").length - 1} lines, sha256 ${sha(text)}`);
        }
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
