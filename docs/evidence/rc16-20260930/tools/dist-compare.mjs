/*
 * Which JavaScript files of two builds differ once the chunks' hashed names
 * and the version string are set aside. Each file is named by its entry's
 * name, or, for a shared chunk, by the source modules the build marks in it
 * (`// src/...`); its text has every `chunk-XXXXXXXX.js` name replaced by
 * `chunk.js` and both versions by `VERSION`, and is then compared byte for
 * byte. Used to show that the builds the rc.16 reruns measured (704cadc's)
 * compute what the source commit's build computes.
 *
 *   node docs/evidence/rc16-20260930/tools/dist-compare.mjs <dist A> <dist B> <version A> <version B>
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [a, b, versionA, versionB] = process.argv.slice(2);
function files(dir, version) {
  const out = new Map();
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".js")).sort()) {
    const text = readFileSync(join(dir, name), "utf8").replace(/chunk-[A-Z0-9]{8}\.js/gu, "chunk.js").replaceAll(version, "VERSION");
    const modules = [...text.matchAll(/^\/\/ (src\/\S+)$/gmu)].map((match) => match[1]);
    const key = name.startsWith("chunk-") ? `chunk of ${[...new Set(modules)].join(", ")}` : name;
    if (out.has(key)) throw new Error(`two files named ${key}`);
    out.set(key, { digest: createHash("sha256").update(text).digest("hex"), modules: [...new Set(modules)] });
  }
  return out;
}
const left = files(a, versionA);
const right = files(b, versionB);
const report = { files: [left.size, right.size], same: [], differ: [], onlyFirst: [], onlySecond: [] };
for (const [key, file] of left) {
  const other = right.get(key);
  if (!other) report.onlyFirst.push(key);
  else if (other.digest === file.digest) report.same.push(key);
  else report.differ.push({ file: key, modules: file.modules });
}
for (const key of right.keys()) if (!left.has(key)) report.onlySecond.push(key);
console.log(JSON.stringify({ ...report, same: report.same.length }, null, 1));
