// T7 (../PREREGISTRATION.md, section 6): the references the repository
// already carries, through @zodiacs/engine/time's public functions. Each
// reference is read by name from the checkout and refused unless its SHA-256
// is section 4's pin. No download; pyerfa is not needed (the ERFA values are
// the committed fixture's).
//
// T7a: for each of the 28 changes of conformance/sources/l2/Leap_Second.dat
//   (IERS Bulletin C 72), timeBasis at 0h UTC gives the new TAI - UTC and,
//   1 ms before, the previous one; TT - UTC is TAI - UTC + 32.184 s within
//   1e-6 s; listed until 2027-06-28 and not from it: 58 checks, counted as
//   rc.15's docs/evidence/rc15-20260929/leap-seconds.mjs counts them.
// T7b: at 0h UTC of each row, ut1MinusUtc.seconds is within 0.00079 s
//   (UT1_DATA.bound) of each of the 19,997 finals2000A.all values and within
//   0.00066 s of each of the 367 EOP 20 C04 values, parsed as
//   src/time-scale.test.ts parses them.
// T7c: at K4, tilt's Δψ and Δε within 1e-10″ of the fixture, its mean
//   obliquity within 1e-9″ and its equation of the equinoxes within 5e-5″;
//   eclipticOfDate turns the five directions of V within 5e-6″ of the
//   fixture's matrix (the angle of src/nutation.test.ts).
//
// Controls: leap (Leap_Second.dat's last value read as 36), ut1 (every
// reference value 1 ms larger), tilt (tilt(tt + 1), a day later); each must
// fail.
//
//   node independent.mjs --package <dir> --repo <engine checkout> [--control leap|ut1|tilt] [--out <file>]
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { entry, finish, manifest, options } from "./load.mjs";

const PINS = {
  "conformance/sources/l2/Leap_Second.dat": "6cb6f5d4b819f2e568e25db4b0b26d89dedf031fdffb18bc94d40f4e94e268d7",
  "scripts/time-scale-sources/finals2000A-20260924-ut1.csv.gz": "b741c4e051866897a60c54f870ef08f329b7f177655f46baa7c92a0a5badb6e1",
  "scripts/time-scale-sources/eopc04-1972.txt": "e85f6211d216b8dc1988fddef6da9c079c522e1e4830fda3ac9a4639fe317d55",
  "src/fixtures/nutation-erfa.json": "2719dd382310ca5514db0577fc4b3607e99edd941111f0f872957125b4713604"
};
const opts = options();
if (!opts.package || !opts.repo) throw new Error("--package and --repo are required");
const control = opts.control;
if (control !== undefined && !["leap", "ut1", "tilt"].includes(control)) throw new Error(`unknown control ${control}`);
const reference = (path) => {
  const bytes = readFileSync(join(opts.repo, path));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== PINS[path]) throw new Error(`${path} has SHA-256 ${digest}, not the pin ${PINS[path]}`);
  return bytes;
};
const time = await entry(opts.package, "./time");
const DAY = 86_400_000;
const MJD_UNIX = 40_587;
/** Counts a failure and keeps the first 20 as examples. */
const failure = (record, item) => {
  record.count += 1;
  if (record.examples.length < 20) record.examples.push(item);
};

// T7a.
const leapRows = reference("conformance/sources/l2/Leap_Second.dat").toString("utf8").split("\n")
  .filter((line) => /^\s+\d+\.0\s/u.test(line))
  .map((line) => line.trim().split(/\s+/u).map(Number))
  .map(([mjd, , , , value]) => ({ mjd, value }));
if (control === "leap") leapRows.at(-1).value = 36;
const leapFailures = { count: 0, examples: [] };
let leapChecks = 0;
leapRows.forEach(({ mjd, value }, index) => {
  const at = (mjd - MJD_UNIX) * DAY;
  const after = time.timeBasis(at);
  leapChecks += 1;
  const ttMinusUtc = after.deltaT.seconds + after.timeScale.ut1MinusUtc.seconds;
  if (after.timeScale.leapSeconds?.taiMinusUtc !== value || Math.abs(ttMinusUtc - (value + 32.184)) > 1e-6) {
    failure(leapFailures, { at: new Date(at).toISOString(), expected: value, got: after.timeScale.leapSeconds, ttMinusUtc });
  }
  if (index > 0) {
    const before = time.timeBasis(at - 1);
    leapChecks += 1;
    if (before.timeScale.leapSeconds?.taiMinusUtc !== leapRows[index - 1].value) {
      failure(leapFailures, { at: new Date(at - 1).toISOString(), expected: leapRows[index - 1].value, got: before.timeScale.leapSeconds });
    }
  }
});
const expiry = Date.parse("2027-06-28T00:00:00Z");
for (const [label, ms, want] of [["before expiry", expiry - 1, { taiMinusUtc: 37, listed: true }], ["at expiry", expiry, { taiMinusUtc: 37, listed: false }],
  ["2026-06-28", Date.parse("2026-06-28T00:00:00Z"), { taiMinusUtc: 37, listed: true }]]) {
  leapChecks += 1;
  const got = time.timeBasis(ms).timeScale.leapSeconds;
  if (JSON.stringify(got) !== JSON.stringify(want)) failure(leapFailures, { label, got, want });
}
const t7a = { changes: leapRows.length, checks: leapChecks, failures: leapFailures.count, firstFailures: leapFailures.examples,
  pass: leapRows.length === 28 && leapChecks === 58 && leapFailures.count === 0 };

// T7b.
const shift = control === "ut1" ? 0.001 : 0;
const finals = gunzipSync(reference("scripts/time-scale-sources/finals2000A-20260924-ut1.csv.gz")).toString("utf8").trim().split("\n").slice(1)
  .map((line) => {
    const [mjd, date, flag, value] = line.split(",");
    return { mjd: Number(mjd), date, flag, value: Number(value) + shift };
  });
const c04 = reference("scripts/time-scale-sources/eopc04-1972.txt").toString("latin1").split("\n")
  .filter((line) => line.trim() && !line.startsWith("#"))
  .map((line) => line.trim().split(/\s+/u))
  .map((fields) => ({ mjd: Number(fields[4]), value: Number(fields[7]) + shift }));
const worstOf = (rows, bound) => {
  let worst = 0;
  const failures = { count: 0, examples: [] };
  for (const { mjd, value } of rows) {
    const got = time.timeBasis((mjd - MJD_UNIX) * DAY).timeScale.ut1MinusUtc.seconds;
    const off = Math.abs(got - value);
    worst = Math.max(worst, off);
    if (!(off <= bound)) failure(failures, { mjd, reference: value, got, off });
  }
  return { rows: rows.length, bound, worst, failures: failures.count, firstFailures: failures.examples };
};
const t7b = { finals: worstOf(finals, 0.00079), c04: worstOf(c04, 0.00066) };
t7b.pass = t7b.finals.rows === 19_997 && t7b.c04.rows === 367 && t7b.finals.failures === 0 && t7b.c04.failures === 0;

// T7c.
const erfa = JSON.parse(reference("src/fixtures/nutation-erfa.json").toString("utf8"));
const { tolerance } = erfa;
const RAD = 180 / Math.PI;
const DIRECTIONS = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.36, -0.48, 0.8], [-0.6, 0.64, -0.48]];
const unit = (lon, lat) => [Math.cos(lat / RAD) * Math.cos(lon / RAD), Math.cos(lat / RAD) * Math.sin(lon / RAD), Math.sin(lat / RAD)];
const worst = { dpsi: 0, deps: 0, mobl: 0, ee: 0, rotation: 0 };
for (const epoch of erfa.epochs) {
  const t = time.tilt(control === "tilt" ? epoch.tt + 1 : epoch.tt);
  worst.dpsi = Math.max(worst.dpsi, Math.abs(t.dpsi - epoch.dpsi));
  worst.deps = Math.max(worst.deps, Math.abs(t.deps - epoch.deps));
  worst.mobl = Math.max(worst.mobl, Math.abs(t.mobl * 3600 - epoch.epsA));
  worst.ee = Math.max(worst.ee, Math.abs(t.ee - epoch.ee2000B));
  const m = epoch.eclipticOfDate;
  for (const [x, y, z] of DIRECTIONS) {
    const expected = [0, 1, 2].map((row) => m[3 * row] * x + m[3 * row + 1] * y + m[3 * row + 2] * z);
    const { lon, lat } = time.eclipticOfDate(x, y, z, epoch.tt);
    const actual = unit(lon, lat);
    const cross = Math.hypot(
      actual[1] * expected[2] - actual[2] * expected[1],
      actual[2] * expected[0] - actual[0] * expected[2],
      actual[0] * expected[1] - actual[1] * expected[0]
    );
    const dot = actual[0] * expected[0] + actual[1] * expected[1] + actual[2] * expected[2];
    worst.rotation = Math.max(worst.rotation, Math.atan2(cross, dot) * RAD * 3600);
  }
}
const t7c = {
  epochs: erfa.epochs.length, worstArcsec: worst,
  tolerances: { dpsi: tolerance.nutationArcsec, deps: tolerance.nutationArcsec, mobl: tolerance.meanObliquityArcsec, ee: tolerance.equationOfEquinoxesArcsec,
    rotation: tolerance.rotationArcsec },
  pass: erfa.epochs.length === 101 && worst.dpsi <= tolerance.nutationArcsec && worst.deps <= tolerance.nutationArcsec &&
    worst.mobl <= tolerance.meanObliquityArcsec && worst.ee <= tolerance.equationOfEquinoxesArcsec && worst.rotation <= tolerance.rotationArcsec
};

const pass = t7a.pass && t7b.pass && t7c.pass;
const behaved = { leap: () => !t7a.pass, ut1: () => !t7b.pass, tilt: () => worst.dpsi > tolerance.nutationArcsec };
await finish({
  check: "T7",
  tool: "independent.mjs",
  package: { name: manifest(opts.package).name, version: manifest(opts.package).version },
  references: PINS,
  control: control ?? null,
  controlBehaved: control ? behaved[control]() : null,
  t7a, t7b, t7c,
  node: process.version,
  pass
}, opts.out);
