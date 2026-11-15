// Breaker, item 2: damage the shipped pack inside an installed copy of the package, in place.
//   node damage.mjs <install dir> <mode>
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
const [dir, mode] = process.argv.slice(2);
const dist = join(dir, "node_modules/@zodiacs/engine/dist");
const file = readdirSync(dist).filter((n) => n.endsWith(".js")).map((n) => join(dist, n)).sort((a, b) => statSync(b).size - statSync(a).size)[0];
const text = readFileSync(file, "utf8");
const m = /"([A-Za-z0-9+/=]{500000,})"/.exec(text);
if (!m) throw new Error(`no pack literal in ${file}`);
const b64 = m[1], at = m.index + 1;
const withPack = (s) => text.slice(0, at) + s + text.slice(at + b64.length);
const swap = (s, i) => s.slice(0, i) + (s[i] === "k" ? "m" : "k") + s.slice(i + 1);
const MODES = {
  "empty": () => withPack(""),
  "one-char-middle": () => withPack(swap(b64, Math.floor(b64.length * 0.5))),
  "one-char-first": () => withPack(swap(b64, 0)),
  "one-char-three-quarters": () => withPack(swap(b64, Math.floor(b64.length * 0.75))),
  "last-record": () => withPack(swap(b64, b64.length - 40)),
  "every-5000th-char": () => withPack(b64.split("").map((c, i) => (i % 5000 === 77 ? (c === "z" ? "y" : "z") : c)).join("")),
  "first-third-only": () => withPack(b64.slice(0, 4 * Math.floor(b64.length / 12))),
  "one-quad-short": () => withPack(b64.slice(0, -4)),
  "reversed": () => withPack(b64.replace(/=+$/, "").split("").reverse().join("")),
  "all-A": () => withPack("A".repeat(b64.length)),
  "not-base64": () => withPack("%%% not a pack %%%"),
  "doubled": () => withPack(b64.replace(/=+$/, "") + b64),
  "expected-digest-changed": () => {
    const sha = "51428874d9a47213abc0ff42cbcec65f338624eaa2d8831f0e6ddc3654bf1fa7";
    if (!text.includes(sha)) throw new Error("the expected digest is not in the chunk");
    return text.split(sha).join("f".repeat(64));
  }
};
if (!MODES[mode]) throw new Error(`modes: ${Object.keys(MODES).join(", ")}`);
writeFileSync(file, MODES[mode]());
console.log(`${mode}: ${file.split("/").pop()} ${text.length} -> ${statSync(file).size} bytes; literal ${b64.length} chars`);
