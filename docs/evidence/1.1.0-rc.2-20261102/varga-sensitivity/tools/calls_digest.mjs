/*
 * Not a check, and it runs no engine: for each corpus of the varga
 * sensitivity (F2, F3, F3b and F4), the SHA-256 of the JSON of every call
 * that `callsOf` builds, and the points the calls name, under two loaders:
 * the load.mjs beside this file, and the one given with --before. It shows
 * which corpora's calls a change to the loader changes (PREREGISTRATION.md,
 * section 13, 2026-11-04: G-V4's interruption and the loader).
 *
 *   node calls_digest.mjs --before PATH [--out FILE]
 *
 * PATH is the earlier load.mjs (for that amendment, the file at 47df12f, read
 * with `git show 47df12f:<this folder>/load.mjs`). Synthetic births only.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FOLDER, options } from "./load.mjs";

const args = options(process.argv.slice(2), ["--before", "--out"]);
if (typeof args.get("--before") !== "string") throw new Error("Give --before PATH, the earlier load.mjs.");
const loaders = {
  before: resolve(args.get("--before")),
  after: fileURLToPath(new URL("./load.mjs", import.meta.url))
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const corpora = [["F2", "births.json"], ["F3", "seams.json"], ["F3b", "seams-f3b.json"], ["F4", "births-erfa.json"]];
const out = { tool: "calls_digest.mjs", node: process.version, loaders: {}, corpora: [] };
const built = {};
for (const [label, path] of Object.entries(loaders)) {
  const { callsOf } = await import(pathToFileURL(path).href);
  out.loaders[label] = { sha256: sha256(readFileSync(path)) };
  built[label] = Object.fromEntries(corpora.map(([name, file]) => {
    const calls = callsOf(JSON.parse(readFileSync(resolve(FOLDER, file), "utf8")), name);
    const points = new Map();
    for (const call of calls) {
      const key = JSON.stringify(call.options?.points ?? null);
      points.set(key, (points.get(key) ?? 0) + 1);
    }
    return [name, { calls: calls.length, sha256: sha256(JSON.stringify(calls)), points: Object.fromEntries(points) }];
  }));
}
for (const [name, file] of corpora) {
  const before = built.before[name];
  const after = built.after[name];
  out.corpora.push({ corpus: name, file, fileSha256: sha256(readFileSync(resolve(FOLDER, file))), before, after, same: before.sha256 === after.sha256 });
}
const text = `${JSON.stringify(out, null, 2)}\n`;
if (typeof args.get("--out") === "string") writeFileSync(args.get("--out"), text);
process.stdout.write(text);
