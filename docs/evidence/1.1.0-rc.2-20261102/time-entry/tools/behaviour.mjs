// T10 (../PREREGISTRATION.md, section 6): what the entry refuses and what it
// returns. Each of twelve calls must throw RangeError and none of four may
// throw; eclipticFrame(tt), its rows and its tilt, and tilt(tt), must be
// frozen; writing to a returned frame's rows must throw TypeError in strict
// code (this module) and be ignored otherwise (a sloppy-mode function), and
// eclipticOfDate at that TT must give the same value after the write as
// before.
//
// Control: `--site <time-basis.mjs>` runs the same calls on zodiacs.org's
// generated module (pinned by its SHA-256, loaded from a temporary copy), the
// raw functions: timeBasis(NaN) returns a record with NaN fields and
// eclipticOfDate(0, 0, 0, 0) a NaN latitude, without throwing, and its
// eclipticFrame(0) is not frozen, so the check must fail there.
//
//   node behaviour.mjs --package <dir> [--site <time-basis.mjs>] [--out <file>]
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { entry, finish, manifest, options } from "./load.mjs";

const SITE_SHA256 = "5857c888df07dd5a1695273797632ea8736f37a26aad2fe908b3d857d2333f40";
const opts = options();
if (!opts.package) throw new Error("--package is required");
let subject;
if (opts.site) {
  const bytes = readFileSync(opts.site);
  if (createHash("sha256").update(bytes).digest("hex") !== SITE_SHA256) throw new Error("the site module is not the pinned file");
  const work = mkdtempSync(join(tmpdir(), "time-entry-t10-"));
  try {
    writeFileSync(join(work, "time-basis.mjs"), bytes);
    subject = await import(pathToFileURL(join(work, "time-basis.mjs")).href);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
} else {
  subject = await entry(opts.package, "./time");
}
const t = subject;
const basis = t.timeBasis(0);
const outcome = (run) => {
  try {
    run();
    return "returned";
  } catch (error) {
    return error instanceof RangeError ? "RangeError" : `${error?.constructor?.name ?? typeof error}`;
  }
};
const refused = {
  "timeBasis(NaN)": () => t.timeBasis(Number.NaN),
  "timeBasis(Infinity)": () => t.timeBasis(Number.POSITIVE_INFINITY),
  "timeBasis(8.64e15 + 1)": () => t.timeBasis(8.64e15 + 1),
  'timeBasis(0, "UTC")': () => t.timeBasis(0, "UTC"),
  'timeBasis(0, "utc", NaN)': () => t.timeBasis(0, "utc", Number.NaN),
  'timeBasis(0, "utc", 1e10 + 1)': () => t.timeBasis(0, "utc", 1e10 + 1),
  "elapsedDays(b, b, NaN)": () => t.elapsedDays(basis, basis, Number.NaN),
  "tilt(NaN)": () => t.tilt(Number.NaN),
  "eclipticFrame(Infinity)": () => t.eclipticFrame(Number.POSITIVE_INFINITY),
  "meanEcliptic(eclipticFrame(0), NaN, 0, 0)": () => t.meanEcliptic(t.eclipticFrame(0), Number.NaN, 0, 0),
  "eclipticOfDate(0, 0, 0, 0)": () => t.eclipticOfDate(0, 0, 0, 0),
  "eclipticOfDate(1, 0, 0, NaN)": () => t.eclipticOfDate(1, 0, 0, Number.NaN)
};
const accepted = {
  "timeBasis(8.64e15)": () => t.timeBasis(8.64e15),
  'timeBasis(-8.64e15, "tt")': () => t.timeBasis(-8.64e15, "tt"),
  'timeBasis(0, "tt", -1e10)': () => t.timeBasis(0, "tt", -1e10),
  "timeBasis(0, undefined)": () => t.timeBasis(0, undefined)
};
const refusals = Object.fromEntries(Object.entries(refused).map(([call, run]) => [call, outcome(run)]));
const acceptances = Object.fromEntries(Object.entries(accepted).map(([call, run]) => [call, outcome(run)]));
const tt = 9_496.5;
const frame = t.eclipticFrame(tt);
const frozen = { frame: Object.isFrozen(frame), rows: Object.isFrozen(frame.rows), tilt: Object.isFrozen(frame.tilt), tiltResult: Object.isFrozen(t.tilt(tt)) };
const before = t.eclipticOfDate(0.36, -0.48, 0.8, tt);
const original = frame.rows[0];
const strictWrite = outcome(() => {
  "use strict";
  frame.rows[0] = 0;
});
const sloppyRead = new Function("rows", "rows[0] = 0; return rows[0];")(frame.rows);
const after = t.eclipticOfDate(0.36, -0.48, 0.8, tt);
const writes = { strict: strictWrite, sloppyIgnored: Object.is(sloppyRead, original), sameAfter: isDeepStrictEqual(before, after) };
const pass = Object.values(refusals).every((value) => value === "RangeError") && Object.values(acceptances).every((value) => value === "returned") &&
  Object.values(frozen).every(Boolean) && writes.strict === "TypeError" && writes.sloppyIgnored && writes.sameAfter;
await finish({
  check: "T10",
  tool: "behaviour.mjs",
  subject: opts.site ? "the site module (control)" : `${manifest(opts.package).name}@${manifest(opts.package).version}/time`,
  controlBehaved: opts.site ? !pass : null,
  refusals,
  acceptances,
  frozen,
  writes,
  node: process.version,
  pass
}, opts.out);
