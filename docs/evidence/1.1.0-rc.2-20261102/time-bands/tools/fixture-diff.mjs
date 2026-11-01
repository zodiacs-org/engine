// Check C6 of ../PREREGISTRATION.md (section 6), with its control: the parsed
// difference between engine main a253973's calc round-trip fixture and the one
// commit X regenerates on x86-64 holds only (i) the added `band` keys, (ii)
// `time-band:first-order` added to `conventions` arrays, (iii) the 30 engine
// version strings (27 `version`, 3 `engineVersion`), and (iv) the `basis` of
// the position and speed bounds of the three mean-point cases (Black Moon
// Lilith 1850, Mean South Node 1987, Mean Node 2077 sidereal); nothing else.
// F-89's check E6 states the same rule. Every other value must be the same,
// number for number.
//
//   node fixture-diff.mjs --base <a253973's fixture> --fixture <regenerated fixture> [--control] --out <c6.json>
//   node fixture-diff.mjs --base <a253973's fixture> --selftest
//
// The base is read from the engine's git objects by name, without walking a
// tree: `git -C <checkout> cat-file -p a253973:src/fixtures/calc-roundtrip.json`.
// --control also runs the comparison on a copy of the regenerated fixture with
// one longitude changed in its last place and one key added, which must report
// both. --selftest compares the base with a copy of it changed in exactly the
// four allowed ways, built here, which must give no other difference.
import { readFileSync } from "node:fs";

import { finish, options } from "./load.mjs";

const args = options();
if (!args.base || !(args.fixture || args.selftest)) throw new Error("usage: node fixture-diff.mjs --base <file> --fixture <file> [--control] --out <file>");
const MEAN_POINTS = new Set(["Black Moon Lilith", "Mean South Node", "Mean Node"]);
const BAND_ID = "time-band:first-order";

/** Every difference between two parsed fixtures, each classified (i) to (iv), or "other". */
function differences(base, fixture) {
  const found = [];
  const walk = (a, b, path, context) => {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (path.at(-1) === "conventions" && b.length === a.length + 1 && b.at(-1) === BAND_ID && a.every((id, k) => id === b[k])) {
        found.push({ path: path.join("."), kind: "ii" });
        return;
      }
      if (a.length !== b.length) {
        found.push({ path: path.join("."), kind: "other", base: a.length, fixture: b.length });
        return;
      }
      a.forEach((value, k) => walk(value, b[k], [...path, k], context));
      return;
    }
    if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const where = [...path, key];
        if (!(key in a)) {
          found.push({ path: where.join("."), kind: key === "band" ? "i" : "other", added: true });
          continue;
        }
        if (!(key in b)) {
          found.push({ path: where.join("."), kind: "other", removed: true });
          continue;
        }
        walk(a[key], b[key], where, { ...context, body: a.body ?? context.body });
      }
      return;
    }
    if (Object.is(a, b)) return;
    const key = path.at(-1);
    const bound = path.includes("bounds") && (path.includes("position") || path.includes("speed"));
    const kind =
      (key === "version" && path.includes("engine")) || key === "engineVersion"
        ? "iii"
        : key === "basis" && bound && MEAN_POINTS.has(context.body)
          ? "iv"
          : "other";
    found.push({ path: path.join("."), kind, base: a, fixture: b });
  };
  walk(base, fixture, [], {});
  return found;
}

function summary(found) {
  const kinds = { i: 0, ii: 0, iii: 0, iv: 0, other: 0 };
  for (const f of found) kinds[f.kind] += 1;
  return kinds;
}

const base = JSON.parse(readFileSync(args.base, "utf8"));
if (args.selftest) {
  const copy = JSON.parse(JSON.stringify(base));
  for (const c of copy.cases) {
    if (c.result.status !== "ok") continue;
    c.result.band = { time: { tt: 0, ut1: 0 } };
    c.result.receipt.conventions.push(BAND_ID);
    c.result.receipt.engine.version = "1.1.0-rc.2";
    if (c.result.chart) c.result.chart.engineVersion = "1.1.0-rc.2";
    if (MEAN_POINTS.has(c.result.body)) {
      c.result.bounds.position.basis = "a new basis";
      if (c.result.bounds.speed) c.result.bounds.speed.basis = "a new basis";
    }
  }
  const kinds = summary(differences(base, copy));
  process.stdout.write(`C6 selftest: ${JSON.stringify(kinds)}\n`);
  process.exit(kinds.other === 0 && kinds.i === 27 && kinds.ii === 27 && kinds.iii === 30 && kinds.iv > 0 ? 0 : 1);
}
const fixture = JSON.parse(readFileSync(args.fixture, "utf8"));
const found = differences(base, fixture);
const kinds = summary(found);
const versions = found.filter((f) => f.kind === "iii");
const report = {
  check: "C6",
  pass: kinds.other === 0,
  records: fixture.cases.length,
  differences: kinds,
  versions: { version: versions.filter((f) => f.path.endsWith(".version")).length, engineVersion: versions.filter((f) => f.path.endsWith(".engineVersion")).length, to: [...new Set(versions.map((f) => f.fixture))] },
  meanPointBases: [...new Set(found.filter((f) => f.kind === "iv").map((f) => f.path.split(".").slice(0, 2).join(".")))],
  other: found.filter((f) => f.kind === "other").slice(0, 20)
};
if (args.control) {
  // One longitude changed in its last place and one key added.
  const copy = JSON.parse(JSON.stringify(fixture));
  const position = copy.cases.find((c) => c.function === "calc" && c.result.status === "ok");
  const lon = position.result.lon;
  const last = lon + Math.abs(lon) * Number.EPSILON;
  position.result.lon = last === lon ? lon + Number.MIN_VALUE : last;
  copy.cases[0].result.addedByTheControl = true;
  const reported = differences(base, copy).filter((f) => f.kind === "other");
  const both = reported.some((f) => f.path.endsWith(".result.lon")) && reported.some((f) => f.path.endsWith(".addedByTheControl"));
  report.controls = { "one longitude in its last place and one added key": { failed: both, problems: reported.length, reported: reported.map((f) => f.path) } };
}
finish(report, args.out);
