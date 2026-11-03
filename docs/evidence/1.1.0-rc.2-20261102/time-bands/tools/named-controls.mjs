// The controls of the named regression tests (../PREREGISTRATION.md, section
// 6, "Named regression tests, in npm test, and their controls", as the
// amendment of 2026-11-03, review 1, changes them). Every new named test is
// run once against a deliberately wrong timeBands (the TT band d on every UTC
// input, C1's control a) and once against bands without the topocentric w
// (C1's control d); the tests those two variants reach must fail under them,
// and each test neither reaches must fail under its own control. Each control
// is an exact edit of a copy of the source, which must match once; then the
// real source must pass every named test.
//
//   node named-controls.mjs --repo <checkout> --work <dir outside the checkout> --out <named.json>
//
// The work directory gets copies of the checkout's src/, scripts/ and api/
// directories (named, never the checkout as a whole), its manifest, its
// tsconfig files and conformance/results/summary.json, with node_modules
// linked; it is emptied first. Vitest runs there one control at a time.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { finish, options } from "./load.mjs";

const args = options();
if (!args.repo || !args.work) throw new Error("usage: node named-controls.mjs --repo <checkout> --work <dir> --out <file>");
const repo = resolve(args.repo);
const work = resolve(args.work);
if (work.startsWith(`${repo}/`) || work === repo) throw new Error("the work directory must be outside the checkout");

const TESTS = {
  rows: "the time bands give every row of R1",
  seams: "the time bands step where the time basis steps, at each seam of T3, a millisecond either side",
  same: "the time bands are the same from a TimeBasis, a Chart, a calc instant and a natal result",
  zeros: "the time bands are exactly 0 where R3 makes them 0",
  range: "the time bands throw RangeError for a record without a time scale",
  nullBand: "bands from the time basis are null without speeds and present otherwise",
  radians: "bands from the time basis are in arcseconds under units: radians",
  whole: "bands from the time basis give whole-sign cusps 0, and the cusps where Placidus or Koch falls back to whole signs",
  ttTerm: "bands from the time basis add each angle's and cusp's rate on TT, UT1 held, times the TT band",
  sidereal: "bands from the time basis give sidereal angles and cusps the tropical ones' rate on UT1, and on TT the sidereal longitude's",
  topocentric: "bands from the time basis bound a topocentric position at or above its partials on TT and UT1 from pinned evaluations",
  eventsCharts: "bands from the time basis carry the events' and the charts' bands",
  id: "bands from the time basis name time-band:first-order last in every receipt whose result carries a band"
};

/** Each control: its edits (file, the text, its replacement) and the named tests that must fail under it. */
const CONTROLS = {
  "a: the TT band d on every UTC input": {
    edits: [["src/time-bands.ts", 'return { tt: basis === "iers" ? 0 : basis === "pinned" ? u : Math.hypot(u, d), ut1: u };', "return { tt: d, ut1: u };"]],
    mustFail: ["rows", "seams", "zeros", "eventsCharts"]
  },
  "d: the topocentric bands without w": {
    edits: [["src/calc.ts", "      const w = v && (v / (now.dist! * (1 - 1e-3))) * RAD * 3600;", "      const w = 0;"]],
    mustFail: ["topocentric"]
  },
  "the calc instant's record given timeScale.input tt": {
    edits: [["src/calc.ts", "    deltaT: basis.deltaT,\n    timeScale: basis.timeScale\n  };", '    deltaT: basis.deltaT,\n    timeScale: { ...basis.timeScale, input: "tt" as const }\n  };']],
    mustFail: ["same"]
  },
  "a timeBands that returns zeros for a record without a time scale": {
    edits: [["src/time-bands.ts", "  const { input, basis, ut1MinusUtc } = Object(timeScale) as Partial<TimeScale>;", "  if (timeScale === undefined || timeScale === null) return { tt: 0, ut1: 0 };\n  const { input, basis, ut1MinusUtc } = Object(timeScale) as Partial<TimeScale>;"]],
    mustFail: ["range"]
  },
  "a calc() that gives a zero band without speeds": {
    edits: [["src/calc.ts", "    let band: CalcTimeBand | null = null;", "    let band: CalcTimeBand | null = { time: bands, lon: 0, lat: 0, dist: 0 };"]],
    mustFail: ["nullBand"]
  },
  "bands left in radians": {
    edits: [["src/calc.ts", "        lon: (Math.abs(speeds.lon) / 24 + across) * tt + across * ut1,\n        lat: (Math.abs(speeds.lat) / 24 + w) * tt + w * ut1,", "        lon: (Math.abs(speeds.lon * k) / 24 + across) * tt + across * ut1,\n        lat: (Math.abs(speeds.lat * k) / 24 + w) * tt + w * ut1,"]],
    mustFail: ["radians"]
  },
  "whole-sign cusp bands set to the ascendant's": {
    edits: [["src/calc.ts", 'cusps: system === "whole" ? Array<number>(12).fill(0) : cusps', 'cusps: system === "whole" ? Array<number>(12).fill(asc!) : cusps']],
    mustFail: ["whole"]
  },
  "the angle bands without their rate on TT (b11c5e8's)": {
    edits: [["src/calc.ts", "onUt1.map((rate, index) => rate * bands.ut1 + (onTt ? onTt[index]! * bands.tt : 0));", "onUt1.map((rate) => rate * bands.ut1);"]],
    mustFail: ["ttTerm", "sidereal", "eventsCharts"]
  },
  "sidereal angle bands whose rate on TT leaves out the ayanamsa's (the tropical ones')": {
    edits: [["src/calc.ts", "      less: definition === null ? 0 : ayanamsaAt(definition, moved).true", "      less: 0"]],
    mustFail: ["ttTerm", "sidereal"]
  },
  "the id left out of events()'s receipt": {
    edits: [["src/calc.ts", '        [...positionIds(body, "ecliptic-true-of-date", "geocentric", "apparent", zodiac), "search:scan-and-bisect"]\n      )', '        [...positionIds(body, "ecliptic-true-of-date", "geocentric", "apparent", zodiac), "search:scan-and-bisect"],\n        undefined,\n        false\n      )']],
    mustFail: ["id"]
  }
};

function prepare() {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, "conformance", "results"), { recursive: true });
  for (const dir of ["src", "scripts", "api"]) cpSync(join(repo, dir), join(work, dir), { recursive: true });
  for (const file of ["package.json", "tsconfig.json", "tsconfig.base.json", "tsconfig.build.json", "tsconfig.typecheck.json"]) cpSync(join(repo, file), join(work, file));
  cpSync(join(repo, "conformance", "results", "summary.json"), join(work, "conformance", "results", "summary.json"));
  symlinkSync(join(repo, "node_modules"), join(work, "node_modules"));
}

const reset = () => {
  for (const file of ["src/time-bands.ts", "src/calc.ts"]) cpSync(join(repo, file), join(work, file));
};

/** The named tests' outcomes under the work directory's current source. */
function run(label) {
  const out = join(work, `vitest-${label.replace(/[^a-z0-9]+/giu, "-")}.json`);
  const pattern = `^(${Object.values(TESTS).map((t) => t.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|")})$`;
  try {
    execFileSync(join(work, "node_modules", ".bin", "vitest"), ["run", "--reporter=json", `--outputFile=${out}`, "-t", pattern, "src/time-bands.test.ts", "src/calc.test.ts"], { cwd: work, stdio: "ignore" });
  } catch {
    // A failing test exits non-zero; the outcomes are in the report.
  }
  const report = JSON.parse(readFileSync(out, "utf8"));
  const outcomes = {};
  for (const file of report.testResults) for (const test of file.assertionResults) if (test.status === "passed" || test.status === "failed") outcomes[test.fullName] = test.status;
  return Object.fromEntries(Object.entries(TESTS).map(([key, name]) => [key, outcomes[name] ?? "not run"]));
}

prepare();
const controls = {};
for (const [name, control] of Object.entries(CONTROLS)) {
  reset();
  for (const [file, old, replacement] of control.edits) {
    const path = join(work, file);
    const text = readFileSync(path, "utf8");
    if (text.split(old).length !== 2) throw new Error(`${name}: the text to replace in ${file} does not occur once`);
    writeFileSync(path, text.replace(old, replacement));
  }
  const outcomes = run(name);
  const required = control.mustFail.every((key) => outcomes[key] === "failed");
  controls[name] = { failed: required, mustFail: control.mustFail.map((key) => TESTS[key]), outcomes };
}
reset();
const real = run("real");
finish({
  check: "named tests' controls",
  pass: Object.values(real).every((outcome) => outcome === "passed"),
  records: Object.keys(TESTS).length,
  real,
  controls
}, args.out);
