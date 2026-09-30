// Why the true node moves by up to 0.035″ from rc.14 outside 1972–2027-10-02,
// where both versions read the instant as UT1 on the same ΔT model and every
// other position agrees within 0.000003″ (rc14-comparison.json).
//
// The engine takes the true node from the Moon's orbital angular momentum,
// r × v, with astronomy-engine's GeoMoonState, whose velocity is a numerical
// derivative: the difference of two positions at time.AddDays(∓1e-5), 0.864 s
// apart, divided by 2e-5 day. AddDays works on UT, so each sample's TT is
// formed through the ΔT function installed at that moment. rc.14 left the ΔT
// model installed; rc.15 installs the instant's own ΔT as a constant for each
// sample (src/ephemeris.ts, timeOf). The central TT is the same to the bit; the
// two samples' times differ in their last bits.
//
// Far from J2000 that is enough to move the node by hundredths of an
// arcsecond. The script shows it two ways at the chart of rc14-comparison.json
// with the largest node difference before 1972:
//
// - rc.14's path and rc.15's give the same central TT and nodes 0.035″ apart;
// - with a constant ΔT 1 to 200 µs larger, which moves the true node by less
//   than 0.00002″ (it moves less than 2° a day), the node scatters by several
//   hundredths of an arcsecond: numerical noise, which grows with the distance
//   from J2000 (the same scan at three other instants).
//
// A likely mechanism, consistent with these sizes but not traced line by line:
// the Moon's series reduce arguments of some thousands of revolutions at a
// century or more from J2000, so each position carries rounding of about
// 1e-12 rad, and a difference over 0.864 s amplifies it some 10^5 times; the
// node, set by the orbit's small (5°) inclination, magnifies the component
// out of the orbital plane further. The difference is the precision of the
// numerical velocity, not a change of model.
//
//   npm run build && node docs/evidence/rc15-20260929/node-velocity.mjs [out.json]
import { writeFileSync } from "node:fs";
import * as A from "astronomy-engine";

const { deltaT } = await import(new URL("../../../dist/deltat.js", import.meta.url).href);
const RAD = 180 / Math.PI;
const utOf = (iso) => (Date.parse(iso) - Date.UTC(2000, 0, 1, 12)) / 86_400_000;

/** The engine's true node (src/ephemeris.ts, trueNodeLongitude) with a given ΔT function installed. */
function sample(ut, fn) {
  A.SetDeltaTFunction(fn);
  try {
    const time = A.MakeTime(ut);
    const state = A.GeoMoonState(time);
    const h = new A.Vector(state.y * state.vz - state.z * state.vy, state.z * state.vx - state.x * state.vz,
      state.x * state.vy - state.y * state.vx, time);
    const ecliptic = A.RotateVector(A.Rotation_EQJ_ECT(time), h);
    return { tt: time.tt, node: Math.atan2(ecliptic.x, -ecliptic.y) * RAD };
  } finally {
    A.SetDeltaTFunction(deltaT);
  }
}

/** The node's scatter under constant ΔT raised by 1 to 200 µs, in arcseconds. */
function scatter(iso) {
  const ut = utOf(iso);
  const seconds = deltaT(ut);
  const base = sample(ut, () => seconds).node;
  const changes = Array.from({ length: 200 }, (_, k) => (sample(ut, () => seconds + (k + 1) * 1e-6).node - base) * 3600);
  const mean = changes.reduce((sum, x) => sum + x, 0) / changes.length;
  const sd = Math.sqrt(changes.reduce((sum, x) => sum + (x - mean) ** 2, 0) / changes.length);
  return { instant: iso, shifts: changes.length, maxAbsArcsec: Number(Math.max(...changes.map(Math.abs)).toPrecision(3)), sdArcsec: Number(sd.toPrecision(3)) };
}

// 1850-01-01 plus 662 steps of 11 days 7 h 13 min (rc14-comparison.mjs).
const at = "1870-06-26T01:26:00.000Z";
const ut = utOf(at);
const seconds = deltaT(ut);
const rc14 = sample(ut, deltaT);
const rc15 = sample(ut, () => seconds);
const report = {
  instant: at,
  deltaTSeconds: seconds,
  centralTtIdentical: rc14.tt === rc15.tt,
  rc14MinusRc15Arcsec: Number(((rc14.node - rc15.node) * 3600).toPrecision(4)),
  physicalBoundOver200MicrosecondsArcsec: 2 * 3600 * 200e-6 / 86_400,
  scatter: ["1600-06-15T00:00:00.000Z", at, "2000-01-01T12:00:00.000Z", "2100-06-01T00:00:00.000Z"].map(scatter),
  node: process.version
};
const text = `${JSON.stringify(report, null, 1)}\n`;
if (process.argv[2]) writeFileSync(process.argv[2], text);
process.stdout.write(text);
