// How far replaying an rc.14 receipt moves its result, and how to reproduce
// it exactly. The carried 0.1.1-rc.14 archive (installed) writes a natal
// receipt for synthetic UTC instants from 1972-01-01 to 2027-10-02, every 11
// days and 7 h 13 min, at nine synthetic places from 0° to 65° N and S,
// Placidus houses; this build parses each and replays it:
//
// - as natalReplayInput gives it, a UTC request: rc.14 read the instant as
//   UT1 (conventions "ut1-read-as-utc"), this build reads it as UTC, so the
//   sidereal time moves by (UT1 - UTC) x 1.00273781 x 15"/s and the positions
//   by the change of ΔT;
// - on UT1 with the recorded ΔT pinned (`timeScale: "ut1"`, `deltaT`), which
//   reads the instant and ΔT as rc.14 did.
//
// Statistics only. Angles and cusps are compared where both builds give
// Placidus.
//
//   node receipt-replay.mjs <rc.14 package directory> <this package directory> [out.json]
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [rc14Root, candidateRoot, out] = process.argv.slice(2);
const load = (root, entry) => import(pathToFileURL(join(root, "dist", entry)).href);
const rc14 = { engine: await load(rc14Root, "index.js"), receipt: await load(rc14Root, "receipt.js") };
const candidate = { engine: await load(candidateRoot, "index.js"), receipt: await load(candidateRoot, "receipt.js") };
if (rc14.engine.ENGINE_VERSION !== "0.1.1-rc.14") throw new Error(`not rc.14: ${rc14.engine.ENGINE_VERSION}`);

const LATITUDES = [0, 30, -30, 45, -45, 55, 60, -60, 65];
const circle = (x, y) => Math.abs(((((y - x) % 360) + 540) % 360) - 180) * 3600;
const step = 11 * 86_400_000 + (7 * 60 + 13) * 60_000;
const report = {
  rc14: rc14.engine.ENGINE_VERSION,
  candidate: candidate.engine.ENGINE_VERSION,
  instants: "1972-01-01T00:00Z to 2027-10-02, every 11 d 7 h 13 min",
  latitudes: LATITUDES,
  receipts: 0,
  refused: 0,
  maxUt1MinusUtcSeconds: 0,
  asUtc: { byLatitude: {}, bodies: {} },
  onUt1WithRecordedDeltaT: { angles: 0, cusps: 0, bodies: {}, speeds: {} }
};
const bump = (bucket, key, value) => {
  if (!(bucket[key] >= value)) bucket[key] = value;
};
let index = 0;
for (let ms = Date.UTC(1972, 0, 1); ms <= Date.UTC(2027, 9, 2); ms += step) {
  for (const latitude of LATITUDES) {
    index += 1;
    const longitude = ((index * 37) % 360) - 180;
    const birth = { utc: new Date(ms), latitude, longitude, houseSystem: "placidus" };
    const recorded = rc14.engine.natalChart(birth);
    const parsed = candidate.receipt.parseNatalEnvelope(rc14.receipt.serializeNatalEnvelope(rc14.receipt.createNatalEnvelope(recorded)));
    report.receipts += 1;
    if (!parsed.ok) {
      report.refused += 1;
      continue;
    }
    const request = candidate.receipt.natalReplayInput(parsed.envelope);
    const replay = candidate.engine.natalChart(request);
    const exact = candidate.engine.natalChart({ ...request, timeScale: "ut1", deltaT: parsed.envelope.result.deltaT.seconds });
    report.maxUt1MinusUtcSeconds = Math.max(report.maxUt1MinusUtcSeconds, Math.abs(replay.timeScale.ut1MinusUtc?.seconds ?? 0));
    const stats = (report.asUtc.byLatitude[latitude] ??= {});
    const sameSystem = (chart) => chart.houses.system === recorded.houses.system;
    bump(stats, "mc", circle(recorded.angles.mc, replay.angles.mc));
    if (sameSystem(replay)) {
      bump(stats, "asc", circle(recorded.angles.asc, replay.angles.asc));
      recorded.houses.cusps.forEach((cusp, k) => bump(stats, "cusps", circle(cusp, replay.houses.cusps[k])));
    }
    recorded.bodies.forEach((body, k) => {
      bump(report.asUtc.bodies, body.body, circle(body.lon, replay.bodies[k].lon));
      bump(report.onUt1WithRecordedDeltaT.bodies, body.body, circle(body.lon, exact.bodies[k].lon));
      bump(report.onUt1WithRecordedDeltaT.speeds, body.body, Math.abs(exact.bodies[k].speed - body.speed));
    });
    bump(report.onUt1WithRecordedDeltaT, "angles", Math.max(circle(recorded.angles.asc, exact.angles.asc), circle(recorded.angles.mc, exact.angles.mc)));
    if (sameSystem(exact)) recorded.houses.cusps.forEach((cusp, k) => bump(report.onUt1WithRecordedDeltaT, "cusps", circle(cusp, exact.houses.cusps[k])));
  }
}
// Every figure is a largest value: four significant digits, rounded up, so it stays a bound.
const up = (value) => {
  if (value === 0 || !Number.isFinite(value)) return value;
  const scale = 10 ** (3 - Math.floor(Math.log10(value)));
  return Number((Math.ceil(Number((value * scale).toPrecision(12))) / scale).toPrecision(4));
};
const round = (object) => {
  for (const [key, value] of Object.entries(object)) {
    if (typeof value === "number") object[key] = up(value);
    else if (value && typeof value === "object") round(value);
  }
};
round(report.asUtc);
round(report.onUt1WithRecordedDeltaT);
// The sidereal time moves by exactly (UT1 - UTC) x 1.00273781191135448 x 15"/s.
report.siderealTimeShiftArcsecAtMostOverTheseInstants = up(report.maxUt1MinusUtcSeconds * 1.00273781191135448 * 15);
report.maxUt1MinusUtcSeconds = up(report.maxUt1MinusUtcSeconds);
const text = `${JSON.stringify(report, null, 1)}\n`;
if (out) writeFileSync(out, text);
process.stdout.write(text);
