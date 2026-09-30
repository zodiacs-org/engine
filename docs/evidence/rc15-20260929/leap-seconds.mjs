// The engine's leap seconds, through its public API, against IERS Bulletin C:
// conformance/sources/l2/Leap_Second.dat, "Updated through IERS Bulletin 72
// issued in July 2026", which the repository already carries for the L2
// arbiter. For every change in the file, a chart one millisecond before 0h
// UTC of that day must report the previous TAI − UTC and one at 0h the new
// one, with TT − UTC = TAI − UTC + 32.184 s. The engine's own list is IERS's
// leap-seconds.list updated 2026-07-06 through Bulletin C 72, which expires
// 2027-06-28 as the bulletin says; the first cut of rc.15 shipped tzdata
// 2025c's, which expired 2026-06-28. So until 2027-06-28 the engine must say
// its value is listed, and after it carry 37 s and say it is no longer listed.
//
//   npm run build && node docs/evidence/rc15-20260929/leap-seconds.mjs [out.json]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const engine = await import(new URL("../../../dist/index.js", import.meta.url).href);
const path = new URL("../../../conformance/sources/l2/Leap_Second.dat", import.meta.url);
const bytes = readFileSync(path);
const rows = bytes.toString("utf8").split("\n")
  .filter((line) => /^\s+\d+\.0\s/.test(line))
  .map((line) => line.trim().split(/\s+/).map(Number))
  .map(([mjd, , , , value]) => ({ mjd, value }));
const DAY = 86_400_000;
const MJD_UNIX = 40_587;
const basisAt = (ms) => engine.natalChart({ utc: new Date(ms), timeKnown: false });
const failures = [];
let checked = 0;
rows.forEach(({ mjd, value }, index) => {
  const at = (mjd - MJD_UNIX) * DAY;
  const after = basisAt(at);
  checked += 1;
  const tt = after.deltaT.seconds + after.timeScale.ut1MinusUtc.seconds;
  if (after.timeScale.leapSeconds?.taiMinusUtc !== value || Math.abs(tt - (value + 32.184)) > 1e-6) {
    failures.push({ at: new Date(at).toISOString(), expected: value, got: after.timeScale.leapSeconds, ttMinusUtc: tt });
  }
  if (index > 0) {
    const before = basisAt(at - 1);
    checked += 1;
    if (before.timeScale.leapSeconds?.taiMinusUtc !== rows[index - 1].value) {
      failures.push({ at: new Date(at - 1).toISOString(), expected: rows[index - 1].value, got: before.timeScale.leapSeconds });
    }
  }
});
// Listed to the expiry, 2027-06-28; after it the last value, carried, and flagged.
const expiry = Date.parse("2027-06-28T00:00:00Z");
const beforeExpiry = basisAt(expiry - 1).timeScale.leapSeconds;
const afterExpiry = basisAt(expiry).timeScale.leapSeconds;
const firstCutExpiry = basisAt(Date.parse("2026-06-28T00:00:00Z")).timeScale.leapSeconds;
for (const [label, got, want] of [["before expiry", beforeExpiry, { taiMinusUtc: 37, listed: true }],
  ["at expiry", afterExpiry, { taiMinusUtc: 37, listed: false }], ["2026-06-28", firstCutExpiry, { taiMinusUtc: 37, listed: true }]]) {
  checked += 1;
  if (JSON.stringify(got) !== JSON.stringify(want)) failures.push({ label, got, want });
}
const report = {
  reference: "conformance/sources/l2/Leap_Second.dat (IERS Bulletin C, through Bulletin 72, July 2026)",
  referenceSha256: createHash("sha256").update(bytes).digest("hex"),
  engineVersion: engine.ENGINE_VERSION,
  changes: rows.length,
  lastChange: { mjd: rows.at(-1).mjd, taiMinusUtc: rows.at(-1).value },
  checks: checked,
  failures: failures.length,
  firstFailures: failures.slice(0, 20),
  node: process.version
};
const text = `${JSON.stringify(report, null, 1)}\n`;
if (process.argv[2]) writeFileSync(process.argv[2], text);
process.stdout.write(text);
process.exitCode = failures.length ? 1 : 0;
