// Compares two runs of values.mjs, call by call: the first release's lines
// against the second's, matched by id. Results are compared as values, with
// every number exact, and then as text, which shows where only the order of
// an object's keys moved. Arguments are compared after writing the first
// run's calc arguments in 1.0.0-rc.1's vocabulary (values.mjs, header), so the
// first run must be 0.1.1-rc.17's and the second 1.0.0-rc.1's.
//
//   node values-compare.mjs <0.1.1-rc.17's run> <1.0.0-rc.1's run>
import { readFileSync } from "node:fs";

const [firstPath, secondPath] = process.argv.slice(2);
if (!firstPath || !secondPath) {
  console.error("usage: node values-compare.mjs <first.jsonl> <second.jsonl>");
  process.exit(2);
}
const read = (path) => {
  const lines = new Map();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line) continue;
    const item = JSON.parse(line);
    if (lines.has(item.id)) throw new Error(`${path}: id ${item.id} twice`);
    lines.set(item.id, { item, line });
  }
  return lines;
};
const first = read(firstPath);
const second = read(secondPath);

/** A calc call's arguments in 1.0.0-rc.1's vocabulary: scales in lower case, and houses()' `houseSystem`. */
function vocabulary(args, id) {
  if (!id.startsWith("calc.")) return args;
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;
    const out = {};
    for (const [key, item] of Object.entries(node)) {
      out[key] = key === "scale" && typeof item === "string" && /^(UTC|UT1|TT)$/u.test(item) ? item.toLowerCase() : walk(item);
    }
    return out;
  };
  const out = walk(args);
  if (id.startsWith("calc.houses") && out[0] && "system" in out[0]) {
    const { system, ...rest } = out[0];
    out[0] = { ...rest, houseSystem: system };
  }
  return out;
}

/** Paths at which two JSON values differ, keys in any order. */
function differences(a, b, path = "") {
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b ? [] : [path || "/"];
  if (Array.isArray(a) !== Array.isArray(b)) return [path || "/"];
  if (Array.isArray(a) && a.length !== b.length) return [`${path}/length`];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((key) => (key in a && key in b ? differences(a[key], b[key], `${path}/${key}`) : [`${path}/${key}`]));
}
const at = (value, path) =>
  path === "/" ? value : path.split("/").slice(1).reduce((node, key) => (node === undefined || node === null ? undefined : node[key]), value);
const show = (value) => {
  const text = JSON.stringify(value);
  return text === undefined ? "absent" : text.length > 160 ? `${text.slice(0, 157)}...` : text;
};
const label = (id) => id.replace(/ #\d+$/u, "");

const ids = [...new Set([...first.keys(), ...second.keys()])];
const onlyFirst = ids.filter((id) => !second.has(id));
const onlySecond = ids.filter((id) => !first.has(id));
const both = ids.filter((id) => first.has(id) && second.has(id));
const differing = [];
const argsDiffering = [];
const orderOnly = [];
for (const id of both) {
  const a = first.get(id).item;
  const b = second.get(id).item;
  if (differences(vocabulary(a.args, id), b.args).length) argsDiffering.push(id);
  const diff = differences(a.result, b.result);
  if (diff.length) differing.push({ id, diff, a: a.result, b: b.result });
  else if (JSON.stringify(a.result) !== JSON.stringify(b.result)) orderOnly.push(id);
}

const labels = new Map();
for (const id of both) labels.set(label(id), (labels.get(label(id)) ?? 0) + 1);
console.log(`# values.mjs: ${first.size} calls in ${firstPath.split("/").pop()}, ${second.size} in ${secondPath.split("/").pop()}`);
console.log(`${both.length} calls in both, under ${labels.size} labels; results the same in ${both.length - differing.length}, of which ${orderOnly.length} with keys in another order; ${differing.length} differ.`);
console.log(`Arguments differing after the calc entry's renames: ${argsDiffering.length}${argsDiffering.length ? ` (${argsDiffering.slice(0, 5).join(", ")})` : ""}.`);
if (onlyFirst.length) console.log(`Only in the first (${onlyFirst.length}): ${onlyFirst.join(", ")}`);
if (onlySecond.length) console.log(`Only in the second (${onlySecond.length}): ${onlySecond.join(", ")}`);
if (orderOnly.length) {
  const counts = new Map();
  for (const id of orderOnly) counts.set(label(id), (counts.get(label(id)) ?? 0) + 1);
  console.log(`\n## Same values, keys in another order (${orderOnly.length})`);
  for (const [name, n] of counts) console.log(`- ${name}: ${n} of ${labels.get(name)}`);
}
console.log(`\n## Results that differ (${differing.length})`);
for (const { id, diff, a, b } of differing) {
  console.log(`- ${id}: ${diff.length} path(s)`);
  for (const path of diff.slice(0, 4)) console.log(`  ${path}: ${show(at(a, path))} -> ${show(at(b, path))}`);
  if (diff.length > 4) console.log(`  ... ${diff.length - 4} more`);
}
console.log(`\n## Calls compared, by label`);
for (const [name, n] of [...labels].sort((x, y) => x[0].localeCompare(y[0]))) console.log(`${name}: ${n}`);
