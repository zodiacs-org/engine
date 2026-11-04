// T5 (../PREREGISTRATION.md, section 6): @zodiacs/engine/time against the
// candidate's own natalChart, value for value: identity, not accuracy. Over
// K1 and the first 2,000 instants of K2a, timeBasis(ms, "utc") must give
// natalChart({ utc, timeKnown: false })'s deltaT and timeScale
// (isDeepStrictEqual), and astronomy-engine's vectors, taken as the site's
// generator takes them (its ΔT held at basis.deltaT.seconds, time made at
// basis.ut1Days, GeoVector(body, time, true) for the Sun and eight planets,
// GeoMoon, the node from GeoMoonState through eclipticFrame and
// meanEcliptic), turned by the entry, must give each of the chart's 12
// bodies' longitudes (Object.is).
//
// Controls: a, astronomy-engine's own Ecliptic() (its five-term nutation) in
// place of eclipticOfDate, so longitudes must differ at most instants; b,
// natalChart given a deltaT 1 ms off the basis, so every record must differ.
//
//   node natal-parity.mjs --package <dir> [--control a|b] [--out <file>]
import { isDeepStrictEqual } from "node:util";

import { k1, k2 } from "./corpora.mjs";
import { astronomy, entry, finish, manifest, options } from "./load.mjs";

const opts = options();
if (!opts.package) throw new Error("--package is required");
const control = opts.control;
if (control !== undefined && !["a", "b"].includes(control)) throw new Error(`unknown control ${control}`);
const time = await entry(opts.package, "./time");
const root = await entry(opts.package, ".");
const { deltaT } = await entry(opts.package, "./deltat");
const { module: Astronomy, version: astronomyVersion } = await astronomy(opts.package);

const RAD = 180 / Math.PI;
const PLANETS = ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const lonOf = (vector, at) => (control === "a" ? Astronomy.Ecliptic(vector).elon : time.eclipticOfDate(vector.x, vector.y, vector.z, at.tt).lon);
// The site generator's longitudes (site main 9a67f761, scripts/build-time-basis.mjs), with the entry's functions.
const longitudes = (basis) => {
  const seconds = basis.deltaT.seconds;
  Astronomy.SetDeltaTFunction(() => seconds);
  try {
    const at = Astronomy.MakeTime(basis.ut1Days);
    const out = new Map();
    for (const name of PLANETS) out.set(name, lonOf(Astronomy.GeoVector(Astronomy.Body[name], at, true), at));
    out.set("Moon", lonOf(Astronomy.GeoMoon(at), at));
    const state = Astronomy.GeoMoonState(at);
    const frame = time.eclipticFrame(at.tt);
    const [x, y] = time.meanEcliptic(
      frame,
      state.y * state.vz - state.z * state.vy,
      state.z * state.vx - state.x * state.vz,
      state.x * state.vy - state.y * state.vx
    );
    const node = ((Math.atan2(x, -y) * RAD + frame.tilt.dpsi / 3600) % 360 + 360) % 360;
    out.set("North Node", node);
    out.set("South Node", ((node + 180) % 360 + 360) % 360);
    return out;
  } finally {
    Astronomy.SetDeltaTFunction(deltaT);
  }
};

const instants = [...k1(), ...k2().k2a.slice(0, 2000)];
let records = 0;
let recordDifferences = 0;
let bodies = 0;
let longitudeDifferences = 0;
let instantsWithLongitudeDifferences = 0;
const examples = [];
for (const ms of instants) {
  const basis = time.timeBasis(ms, "utc");
  const input = { utc: new Date(ms), timeKnown: false };
  if (control === "b") input.deltaT = basis.deltaT.seconds + 0.001;
  const chart = root.natalChart(input);
  records += 1;
  if (!isDeepStrictEqual(basis.deltaT, chart.deltaT) || !isDeepStrictEqual(basis.timeScale, chart.timeScale)) {
    recordDifferences += 1;
    if (examples.length < 20) examples.push({ ms, what: "record" });
  }
  const framed = longitudes(basis);
  let differs = false;
  for (const body of chart.bodies) {
    bodies += 1;
    if (!Object.is(framed.get(body.body), body.lon)) {
      longitudeDifferences += 1;
      differs = true;
      if (examples.length < 20) examples.push({ ms, body: body.body, ours: framed.get(body.body), chart: body.lon });
    }
  }
  if (differs) instantsWithLongitudeDifferences += 1;
}

const pass = recordDifferences === 0 && longitudeDifferences === 0 && records === 16_765 && bodies === 201_180;
const behaved = {
  a: () => instantsWithLongitudeDifferences > records / 2,
  b: () => recordDifferences === records
};
await finish({
  check: "T5",
  tool: "natal-parity.mjs",
  package: { name: manifest(opts.package).name, version: manifest(opts.package).version },
  astronomyEngine: astronomyVersion,
  control: control ?? null,
  controlBehaved: control ? behaved[control]() : null,
  counts: { records, longitudes: bodies },
  differences: { records: recordDifferences, longitudes: longitudeDifferences, instantsWithLongitudeDifferences },
  examples,
  node: process.version,
  pass
}, opts.out);
