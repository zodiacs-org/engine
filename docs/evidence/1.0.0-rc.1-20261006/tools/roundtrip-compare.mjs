// Compares the calc entry's round-trip fixture (src/fixtures/calc-roundtrip.json)
// of 0.1.1-rc.17 with this candidate's, case by case. rc.17's cases are first
// written in 1.0.0-rc.1's vocabulary, the breaking changes the CHANGELOG
// lists: a time scale in lower case, houses()' `system` as `houseSystem`, the
// receipt's schema `zodiacs.calc-receipt.v1`, and the engine's version. The
// two cases are then compared as values, keys in any order, numbers exactly.
//
//   node roundtrip-compare.mjs <rc.17 fixture> <this fixture>
import { readFileSync } from "node:fs";

const [oldPath, newPath] = process.argv.slice(2);
if (!oldPath || !newPath) {
  console.error("usage: node roundtrip-compare.mjs <rc.17 fixture> <this fixture>");
  process.exit(2);
}
const read = (path) => JSON.parse(readFileSync(path, "utf8")).cases;
const OLD_VERSION = "0.1.1-rc.17";
const NEW_VERSION = "1.0.0-rc.1";
const SCALES = { UTC: "utc", UT1: "ut1", TT: "tt" };

/** A request in 1.0.0-rc.1's vocabulary: scales in lower case, and houses()' field renamed. */
function request(value, fn) {
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;
    const out = {};
    for (const [key, item] of Object.entries(node)) {
      out[key] = key === "scale" && typeof item === "string" && item in SCALES ? SCALES[item] : walk(item);
    }
    return out;
  };
  const out = walk(value);
  if (fn === "houses" && out && typeof out === "object" && "system" in out) {
    out.houseSystem = out.system;
    delete out.system;
  }
  return out;
}

/** rc.17's case written as 1.0.0-rc.1 would write it, but for its values. */
function rewrite(item) {
  const out = structuredClone(item);
  out.request = request(out.request, out.function);
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if ((key === "version" || key === "engineVersion") && value === OLD_VERSION) node[key] = NEW_VERSION;
      else if (key === "schema" && value === "zodiacs.calc-receipt.draft-v1") node[key] = "zodiacs.calc-receipt.v1";
      else if (key === "request" && node !== out) node[key] = request(value, out.function);
      else walk(value);
    }
  };
  walk(out);
  return out;
}

/** Paths at which two values differ; numbers compared with Object.is. */
function differences(a, b, path = "") {
  if (typeof a === "number" && typeof b === "number") return Object.is(a, b) ? [] : [path];
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b ? [] : [path];
  if (Array.isArray(a) !== Array.isArray(b)) return [path];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((key) =>
    key in a && key in b ? differences(a[key], b[key], `${path}/${key}`) : [`${path}/${key}`]
  );
}

const before = read(oldPath);
const after = read(newPath);
let same = 0;
console.log(`# ${before.length} cases in rc.17's fixture, ${after.length} in this one; cases numbered from 0`);
for (let index = 0; index < after.length; index += 1) {
  const next = after[index];
  const label = `${next.function} ${JSON.stringify(next.request)}`;
  if (index >= before.length) {
    console.log(`case ${index}: new, ${label} -> ${next.result.status}${next.result.reason ? ` ${next.result.reason}` : ""}`);
    continue;
  }
  const diff = differences(rewrite(before[index]), next);
  if (diff.length === 0) {
    same += 1;
    continue;
  }
  const old = before[index].result;
  console.log(
    `case ${index}: differs at ${diff.length} path(s), ${diff.slice(0, 6).join(", ")}${diff.length > 6 ? ", ..." : ""}; ` +
      `rc.17 ${old.status}${old.reason ? ` ${old.reason}` : ""}, now ${next.result.status}${next.result.reason ? ` ${next.result.reason}` : ""}; ${label}`
  );
}
console.log(`${same} of rc.17's ${before.length} cases the same in this vocabulary`);
