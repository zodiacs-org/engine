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
// Made stricter after review 2 (the amendment of 2026-11-04, "review 2: C6's
// tool holds each allowed change to its rule"), which found that any changed
// `version` under a path naming "engine" counted as (iii), the ephemeris's
// version included, with no count and no value checked; that any new basis
// string counted as (iv); and that a `band` key added anywhere counted as (i).
// Now:
// (i)   a `band` key may be added only where a result carries one (R5): at
//       cases.N.result.band of a computed calc(), houses() or chart() result,
//       null exactly where a calc() result's `speeds` is null, and at
//       cases.N.result.events.M.band of each event a computed events() result
//       finds; and every such place must have gained one;
// (iii) exactly 27 `version` strings at cases.N.result.receipt.engine.version
//       and 3 `engineVersion` strings at cases.N.result.chart.engineVersion
//       must change, each to the version in the package's package.json; any
//       other version string that changes, `receipt.engine.ephemeris.version`
//       among them, is a difference of its own;
// (iv)  exactly six bases must change, the position and the speed bound's of
//       the three mean-point cases, each from MEASURED_BASIS to
//       MEAN_POINTS_BASIS (position) or MEAN_POINTS_SPEED_BASIS (speed), read
//       from src/calc-bounds.ts, with what follows the constant (the
//       ayanamsa's part, in the sidereal case) unchanged.
// (ii) is as before: an array named `conventions` whose new form is the old
// one with `time-band:first-order` appended.
//
//   node fixture-diff.mjs --base <a253973's fixture> --fixture <regenerated fixture> [--package <root>] [--control] --out <c6.json>
//   node fixture-diff.mjs --base <a253973's fixture> [--package <root>] --selftest
//
// The base is read from the engine's git objects by name, without walking a
// tree: `git -C <checkout> cat-file -p a253973:src/fixtures/calc-roundtrip.json`.
// --package names the checkout whose package.json and src/calc-bounds.ts give
// the version and the bases (default: the checkout this tool is in).
// --control also runs the comparison on copies of the regenerated fixture,
// each of which must fail: one longitude changed in its last place and one key
// added (both reported); one engine version string set to another version;
// one receipt's ephemeris version changed; one mean point's basis given
// another text; and a band key added to a refused result. --selftest compares
// the base with a copy of it changed in exactly the four allowed ways, built
// here, which must pass.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { finish, options } from "./load.mjs";

const args = options();
if (!args.base || !(args.fixture || args.selftest)) {
  throw new Error("usage: node fixture-diff.mjs --base <file> --fixture <file> [--package <root>] [--control] --out <file>");
}
const root = resolve(args.package ?? join(fileURLToPath(new URL(".", import.meta.url)), "../../../../.."));
const VERSION = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const boundsSource = readFileSync(join(root, "src/calc-bounds.ts"), "utf8");
/** A string constant of src/calc-bounds.ts, as its JSON-quoted text there gives it. */
const constant = (name) => {
  const found = new RegExp(`^export const ${name} = (".*");$`, "mu").exec(boundsSource);
  if (!found) throw new Error(`src/calc-bounds.ts declares no string constant ${name}`);
  return JSON.parse(found[1]);
};
const MEASURED_BASIS = constant("MEASURED_BASIS");
const MEAN_POINTS_BASIS = constant("MEAN_POINTS_BASIS");
const MEAN_POINTS_SPEED_BASIS = constant("MEAN_POINTS_SPEED_BASIS");
const MEAN_POINTS = new Set(["Black Moon Lilith", "Mean South Node", "Mean Node"]);
const BAND_ID = "time-band:first-order";
const BANDED = new Set(["calc", "houses", "chart"]);

/** Every difference between two parsed fixtures, each classified (i) to (iv), or "other", with why. */
function differences(base, fixture) {
  const found = [];
  const walk = (a, b, path, context) => {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (path.at(-1) === "conventions" && b.length === a.length + 1 && b.at(-1) === BAND_ID && a.every((id, k) => id === b[k])) {
        found.push({ path: path.join("."), kind: "ii" });
        return;
      }
      if (a.length !== b.length) {
        found.push({ path: path.join("."), kind: "other", why: "an array's length changed", base: a.length, fixture: b.length });
        return;
      }
      a.forEach((value, k) => walk(value, b[k], [...path, k], context));
      return;
    }
    if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const where = [...path, key];
        if (!(key in a)) {
          found.push({ path: where.join("."), kind: key === "band" ? "band" : "other", why: key === "band" ? undefined : "a key added", value: b[key] });
          continue;
        }
        if (!(key in b)) {
          found.push({ path: where.join("."), kind: "other", why: "a key removed" });
          continue;
        }
        walk(a[key], b[key], where, { ...context, body: a.body ?? context.body });
      }
      return;
    }
    if (Object.is(a, b)) return;
    const p = path.join(".");
    // (iii): the receipt's engine version and the chart's engineVersion, at their own paths only.
    if (/^cases\.\d+\.result\.receipt\.engine\.version$/u.test(p) || /^cases\.\d+\.result\.chart\.engineVersion$/u.test(p)) {
      const ok = b === VERSION;
      found.push({ path: p, kind: ok ? "iii" : "other", why: ok ? undefined : `a version changed to ${JSON.stringify(b)}, not the package's ${VERSION}`, base: a, fixture: b });
      return;
    }
    // (iv): a mean-point case's position or speed basis, from MEASURED_BASIS to its constant, the rest unchanged.
    const bound = /^cases\.\d+\.result\.bounds\.(position|speed)\.basis$/u.exec(p);
    if (bound && MEAN_POINTS.has(context.body)) {
      const want = bound[1] === "position" ? MEAN_POINTS_BASIS : MEAN_POINTS_SPEED_BASIS;
      const ok = typeof a === "string" && a.startsWith(MEASURED_BASIS) && b === want + a.slice(MEASURED_BASIS.length);
      found.push({ path: p, kind: ok ? "iv" : "other", why: ok ? undefined : "a mean point's basis is not its constant of src/calc-bounds.ts", base: a, fixture: b });
      return;
    }
    found.push({ path: p, kind: "other", why: "a value changed", base: a, fixture: b });
  };
  walk(base, fixture, [], {});
  // (i): the band keys, against the places the fixture's results carry one.
  const places = new Map();
  fixture.cases.forEach((entry, n) => {
    const result = entry.result;
    if (result?.status !== "ok") return;
    if (BANDED.has(entry.function)) places.set(`cases.${n}.result.band`, entry.function === "calc" ? (result.speeds === null ? "null" : "object") : "object");
    if (entry.function === "events") result.events.forEach((_, m) => places.set(`cases.${n}.result.events.${m}.band`, "object"));
  });
  for (const f of found.filter((each) => each.kind === "band")) {
    const want = places.get(f.path);
    const got = f.value === null ? "null" : typeof f.value === "object" ? "object" : typeof f.value;
    f.kind = want !== undefined && want === got ? "i" : "other";
    if (f.kind === "other") f.why = want === undefined ? "a band key where no result carries one" : `a band that is ${got} where it must be ${want}`;
    places.delete(f.path);
  }
  for (const path of places.keys()) found.push({ path, kind: "other", why: "a result that carries a band and gained none" });
  return found;
}

function summary(found) {
  const kinds = { i: 0, ii: 0, iii: 0, iv: 0, other: 0 };
  for (const f of found) kinds[f.kind] += 1;
  return kinds;
}

/** The verdict on a set of differences: nothing else, and exactly the 27 + 3 version strings and the six bases. */
function verdict(found) {
  const kinds = summary(found);
  const versions = found.filter((f) => f.kind === "iii");
  const counts = {
    version: versions.filter((f) => f.path.endsWith(".version")).length,
    engineVersion: versions.filter((f) => f.path.endsWith(".engineVersion")).length
  };
  const bases = found.filter((f) => f.kind === "iv");
  const pass = kinds.other === 0 && counts.version === 27 && counts.engineVersion === 3 && bases.length === 6 &&
    new Set(bases.map((f) => f.path.split(".").slice(0, 2).join("."))).size === 3;
  return { pass, kinds, counts, bases: bases.map((f) => f.path) };
}

const base = JSON.parse(readFileSync(args.base, "utf8"));

/** The base changed in exactly the four allowed ways, as commit X's regeneration should change it. */
function allowed(from) {
  const copy = structuredClone(from);
  for (const entry of copy.cases) {
    const result = entry.result;
    if (result.status !== "ok") continue;
    if (BANDED.has(entry.function)) result.band = entry.function === "calc" && result.speeds === null ? null : { time: { tt: 0, ut1: 0 } };
    if (entry.function === "events") for (const event of result.events) event.band = { utc: 0, ut1: 0 };
    if (result.band !== null || entry.function === "events") result.receipt.conventions.push(BAND_ID);
    result.receipt.engine.version = VERSION;
    if (result.chart) result.chart.engineVersion = VERSION;
    if (MEAN_POINTS.has(result.body)) {
      for (const [kind, want] of [["position", MEAN_POINTS_BASIS], ["speed", MEAN_POINTS_SPEED_BASIS]]) {
        const bound = result.bounds[kind];
        if (bound) bound.basis = want + bound.basis.slice(MEASURED_BASIS.length);
      }
    }
  }
  return copy;
}

if (args.selftest) {
  const outcome = verdict(differences(base, allowed(base)));
  process.stdout.write(`C6 selftest: ${JSON.stringify(outcome)}\n`);
  process.exit(outcome.pass && outcome.kinds.i === 28 && outcome.kinds.ii === 26 ? 0 : 1);
}
const fixture = JSON.parse(readFileSync(args.fixture, "utf8"));
const found = differences(base, fixture);
const outcome = verdict(found);
const versions = found.filter((f) => f.kind === "iii");
const report = {
  check: "C6",
  pass: outcome.pass,
  records: fixture.cases.length,
  package: { version: VERSION },
  differences: outcome.kinds,
  versions: { ...outcome.counts, from: [...new Set(versions.map((f) => f.base))], to: [...new Set(versions.map((f) => f.fixture))] },
  meanPointBases: outcome.bases,
  bands: found.filter((f) => f.kind === "i").map((f) => f.path),
  other: found.filter((f) => f.kind === "other").slice(0, 20)
};
if (args.control) {
  /** A copy of the regenerated fixture changed by `change`; the comparison must fail on it. */
  const control = (change, judge) => {
    const copy = structuredClone(fixture);
    change(copy);
    const changed = differences(base, copy);
    const result = verdict(changed);
    const reported = changed.filter((f) => f.kind === "other").map((f) => `${f.path}: ${f.why}`);
    return { failed: !result.pass && judge(reported), problems: reported.length, reported };
  };
  const firstPosition = (copy) => copy.cases.find((c) => c.function === "calc" && c.result.status === "ok");
  report.controls = {
    "one longitude in its last place and one added key": control((copy) => {
      const position = firstPosition(copy).result;
      const lon = position.lon;
      const last = lon + Math.abs(lon) * Number.EPSILON;
      position.lon = last === lon ? lon + Number.MIN_VALUE : last;
      copy.cases[0].result.addedByTheControl = true;
    }, (reported) => reported.some((f) => f.endsWith(".result.lon: a value changed")) && reported.some((f) => f.includes(".addedByTheControl: "))),
    "one engine version string set to another version": control((copy) => {
      firstPosition(copy).result.receipt.engine.version = "1.1.0-rc.3";
    }, (reported) => reported.some((f) => f.includes(".receipt.engine.version: a version changed"))),
    "one receipt's ephemeris version changed": control((copy) => {
      firstPosition(copy).result.receipt.engine.ephemeris.version = `${firstPosition(copy).result.receipt.engine.ephemeris.version}-changed`;
    }, (reported) => reported.some((f) => f.includes(".receipt.engine.ephemeris.version: a value changed"))),
    "one mean point's basis given another text": control((copy) => {
      const lilith = copy.cases.find((c) => c.result.body === "Black Moon Lilith").result;
      lilith.bounds.speed.basis = lilith.bounds.position.basis;
    }, (reported) => reported.some((f) => f.includes(".bounds.speed.basis: a mean point's basis"))),
    "a band key added to a refused result": control((copy) => {
      copy.cases.find((c) => c.result.status === "refused").result.band = null;
    }, (reported) => reported.some((f) => f.endsWith(".result.band: a band key where no result carries one")))
  };
}
finish(report, args.out);
