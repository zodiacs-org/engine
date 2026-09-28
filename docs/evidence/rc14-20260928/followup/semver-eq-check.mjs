// The archive check's npmEqual against npm's own semver.eq. The check is a
// command, not a module, so its version functions are taken from its source
// text. For seeded pairs of versions, valid and invalid (prefixes, build
// metadata, leading zeros, white space, numeric identifiers about 2^53),
// npmEqual must give what semver.eq gives, false where semver throws; and no
// two distinct versions that the check accepts as strict may be semver.eq.
//
// usage: node semver-eq-check.mjs <scripts/verify-archive-binding.mjs> <semver package directory>...
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const [script, ...semvers] = process.argv.slice(2);
const source = readFileSync(script, "utf8");
const between = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
const { npmEqual, strictVersion } = new Function([
  between("const STRICT_VERSION = ", "\n"),
  between("const NUMERIC = ", "\n"),
  between("function strictVersion", "/** A version as npm's semver 7 parses it"),
  between("/** A version as npm's semver 7 parses it", "/** README.md, archives.json"),
  "return { npmEqual, strictVersion };"
].join("\n"))();

// mulberry32, so every run draws the same pairs.
function random(seed) {
  let state = seed >>> 0;
  return (n) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}
const ids = ["0", "1", "2", "10", "01", "rc", "RC", "alpha", "a1", "1a", "-", "x-y", "9007199254740990", "9007199254740991",
  "9007199254740992", "9007199254740993", "18014398509481985", "99999999999999999999"];
const mains = ["0", "1", "2", "01", "9007199254740991", "9007199254740992"];
const fixed = [["0.0.1", "0.0.1+evil"], ["0.0.1", "v0.0.1"], ["0.1.1-rc.14", "0.1.1-rc.14+evil"], ["0.0.1-9007199254740992", "0.0.1-9007199254740993"],
  ["0.0.1-9007199254740991", "0.0.1-9007199254740992"], ["0.0.1-9007199254740992.1", "0.0.1-9007199254740993.2"], ["0.0.1-RC.1", "0.0.1-rc.1"]];
for (const directory of semvers) {
  const semver = createRequire(join(directory, "package.json"))(directory);
  const version = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).version;
  const draw = random(20260928);
  const make = () => {
    const main = [mains[draw(mains.length)], draw(2), draw(2)].join(".");
    const prerelease = draw(3) === 0 ? "" : `-${Array.from({ length: 1 + draw(3) }, () => ids[draw(ids.length)]).join(".")}`;
    const build = draw(4) === 0 ? (draw(2) ? `+b${draw(3)}` : "+") : "";
    return `${["", "", "", "v", "=", " ", "V"][draw(7)]}${main}${prerelease}${build}${draw(10) === 0 ? " " : ""}`;
  };
  const pairs = [...fixed, ...Array.from({ length: 200000 }, () => { const a = make(); return [a, draw(4) === 0 ? a : make()]; })];
  let equal = 0;
  const mismatches = [];
  const strictCollisions = [];
  for (const [a, b] of pairs) {
    let expected;
    try { expected = semver.eq(a, b); } catch { expected = false; }
    if (expected) equal += 1;
    if (npmEqual(a, b) !== expected) mismatches.push([a, b, expected]);
    if (expected && a !== b && strictVersion(a) && strictVersion(b)) strictCollisions.push([a, b]);
  }
  console.log(`semver ${version}: ${pairs.length} pairs, ${equal} equal under semver.eq; npmEqual differs on ${mismatches.length}; ` +
    `distinct strict versions equal under semver.eq: ${strictCollisions.length}`);
  for (const [a, b] of fixed) {
    let expected;
    try { expected = semver.eq(a, b); } catch { expected = "throws"; }
    console.log(`  semver.eq(${JSON.stringify(a)}, ${JSON.stringify(b)}) = ${expected}; strict: ${strictVersion(a)}, ${strictVersion(b)}`);
  }
  for (const [a, b, expected] of mismatches.slice(0, 5)) console.log(`  differs: ${JSON.stringify(a)} ${JSON.stringify(b)} semver.eq ${expected}`);
}
