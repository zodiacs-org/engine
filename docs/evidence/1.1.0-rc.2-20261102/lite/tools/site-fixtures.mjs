// Check L6 (../PREREGISTRATION.md, section 3): the engine's site-parity
// corpora for composite and dignities (scripts/techniques-parity-check.mjs,
// checkComposite and checkDignities) pass with @zodiacs/engine/lite's
// functions, as with @zodiacs/engine/techniques', on the fixtures that hold
// the site's outputs (src/techniques/fixtures/site-parity/, generated from
// site commit 67cccac5). The control: the same check on a copy of the
// composite fixture in which one case holds the site's output with one
// composite longitude changed in its last bit must fail, and on that case
// only.
//
//   node site-fixtures.mjs --package <root> [--out report.json]
//
// The fixtures and the check are read from this checkout, by name; the
// functions from the package under test.
import { readFileSync } from "node:fs";
import { CHECKOUT, entry, finish, manifest, options } from "./load.mjs";

const args = options();
if (!args.package) throw new Error("usage: node site-fixtures.mjs --package <root> [--out report.json]");
const { checkComposite, checkDignities } = await import(new URL("scripts/techniques-parity-check.mjs", CHECKOUT).href);
const { compositeCorpus, compositeProjection, digest32 } = await import(new URL("scripts/techniques-parity-corpus.mjs", CHECKOUT).href);
const fixture = (name) => JSON.parse(readFileSync(new URL(`src/techniques/fixtures/site-parity/${name}.json`, CHECKOUT), "utf8"));
const lite = await entry(args.package, "./lite");
const techniques = await entry(args.package, "./techniques");
const composite = fixture("composite");
const dignities = fixture("dignities");

const summary = (results) => results.map(({ corpus, cases, agree, disagreements }) => ({ corpus, cases, agree, disagreeing: disagreements.map((row) => row.index) }));
const runs = {
  lite: [...summary(checkComposite(lite, composite)), ...summary(checkDignities(lite, dignities))],
  techniques: [...summary(checkComposite(techniques, composite)), ...summary(checkDignities(techniques, dignities))]
};

// The control: case `index` of the composite fixture made from the site's
// points with the first longitude moved by one unit in the last place.
const corpus = compositeCorpus();
const index = corpus.findIndex(({ a, b }) => lite.compositeMidpoints(a, b).length > 0);
const points = lite.compositeMidpoints(corpus[index].a, corpus[index].b).map((point) => ({ ...point }));
const aspects = lite.compositeAspects(lite.compositeMidpoints(corpus[index].a, corpus[index].b));
const bits = new Float64Array([points[0].lon]);
new BigInt64Array(bits.buffer)[0] += 1n;
const moved = points[0].lon;
points[0].lon = bits[0];
const copy = structuredClone(composite);
copy.cases[index] = [points.length, aspects.length, digest32(compositeProjection(points, aspects))];
const control = summary(checkComposite(lite, copy));

const agreesAll = (rows) => rows.every((row) => row.disagreeing.length === 0);
finish({
  check: "L6",
  package: manifest(args.package).version,
  fixtures: { siteCommit: composite.meta?.siteCommit ?? null, composite: composite.cases.length, dignities: dignities.cases.length },
  node: process.version,
  runs,
  control: { case: index, longitude: [moved, points[0].lon], result: control, behaved: control.length === 1 && control[0].disagreeing.length === 1 && control[0].disagreeing[0] === index },
  pass: agreesAll(runs.lite) && agreesAll(runs.techniques) && control.length === 1 && control[0].disagreeing.length === 1 && control[0].disagreeing[0] === index
}, args.out);
