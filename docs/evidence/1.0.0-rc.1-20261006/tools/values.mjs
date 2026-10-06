// One battery of calls over the public functions of the twelve entry points,
// run on one package, for comparing two releases' values
// (values-compare.mjs). It prints a JSON line per call: an id, the
// arguments and the result, numbers written exactly (-0, NaN and the
// infinities by name), a Date as its ISO string, a Set or a Map as its
// entries, and a thrown error as its class and message. The constants each
// entry exports are printed too.
//
// The inputs are synthetic: instants generated across 1800 to 2200 and
// places on a grid, never a person's birth data. They are the same for both
// packages, written in each one's vocabulary where 1.0.0-rc.1 renamed
// something (the calc entry's time scales and houses()' `houseSystem`); a
// calc receipt's request is then written in 1.0.0-rc.1's, and the strings
// that name a release (the engine's version and the calc receipt's schema)
// are replaced with placeholders, so that what remains to differ is values.
//
// Each package must run in its own process: each installs its ΔT model in
// astronomy-engine when it is imported.
//
//   node values.mjs <package directory> > values.jsonl
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
if (!root) {
  console.error("usage: node values.mjs <package directory>");
  process.exit(2);
}
const load = (name) => import(pathToFileURL(join(root, "dist", `${name}.js`)).href);
const engine = await load("index");
const calcEntry = await load("calc");
const crossings = await load("crossings");
const deltat = await load("deltat");
const geo = await load("geo");
const housesEntry = await load("houses-extra");
const receipt = await load("receipt");
const sky = await load("sky");
const techniques = await load("techniques");
const timing = await load("timing");
const vedic = await load("vedic");
const windowEntry = await load("window");

const VERSION = engine.ENGINE_VERSION;
// 0.1.1-rc.17 wrote calc's scales in capitals and took houses()' `system`.
const OLD = VERSION.startsWith("0.");
const scale = (name) => (OLD ? name.toUpperCase() : name);
const CALC_SCHEMA = calcEntry.CALC_RECEIPT_SCHEMA;

/** JSON with every number exact and the engine's own release strings replaced. */
function encode(value) {
  return JSON.stringify(value, function replacer(key, item) {
    const raw = this[key];
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? { invalidDate: true } : raw.toISOString();
    if (typeof item === "number") {
      if (Object.is(item, -0)) return "-0";
      if (!Number.isFinite(item)) return String(item);
      return item;
    }
    if (typeof item === "string") {
      if (item === VERSION) return "<engine version>";
      if (item === CALC_SCHEMA) return "<calc receipt schema>";
      // A serialized record names the version inside its text.
      return item.replaceAll(JSON.stringify(VERSION), '"<engine version>"');
    }
    if (item instanceof Set) return { set: [...item] };
    if (item instanceof Map) return { map: [...item] };
    if (typeof item === "function") return `<function ${item.name}>`;
    return item;
  });
}

let count = 0;
const calls = new Map();
/** Prints a call's line; its id is its label and its place among the calls of that label. */
function print(label, args, result) {
  const n = (calls.get(label) ?? 0) + 1;
  calls.set(label, n);
  count += 1;
  process.stdout.write(`${encode({ id: `${label} #${n}`, args, result })}\n`);
  return result.value;
}
const thrown = (error) => ({ threw: error?.constructor?.name ?? typeof error, message: String(error?.message ?? error) });
/** Calls fn(...args) and prints its result, or the error it throws. */
function call(label, fn, ...args) {
  try {
    return print(label, args, { value: fn(...args) });
  } catch (error) {
    return print(label, args, thrown(error));
  }
}
async function callAsync(label, fn, ...args) {
  try {
    return print(label, args, { value: await fn(...args) });
  } catch (error) {
    return print(label, args, thrown(error));
  }
}

/** A calc request written in 0.1.1-rc.17's vocabulary where it differs. */
function calcTime(time) {
  return time && typeof time === "object" && !(time instanceof Date) && "scale" in time
    ? { ...time, scale: scale(time.scale) }
    : time;
}
/** A calc receipt's request as 1.0.0-rc.1 writes it: scales in lower case, and houses()' `houseSystem`. */
function newRequest(result) {
  const request = result?.receipt?.request;
  if (!OLD || !request) return result;
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object" || node instanceof Date) return node;
    const out = {};
    for (const [key, item] of Object.entries(node)) {
      out[key] = key === "scale" && typeof item === "string" && /^(UTC|UT1|TT)$/u.test(item) ? item.toLowerCase() : walk(item);
    }
    return out;
  };
  // The renamed field keeps its place among the request's keys.
  const rewritten = Object.fromEntries(Object.entries(walk(request)).map(([key, item]) => [key === "system" ? "houseSystem" : key, item]));
  return { ...result, receipt: { ...result.receipt, request: rewritten } };
}

// Synthetic instants, from 1801 to 2199, and places on a grid.
const INSTANTS = Array.from(
  { length: 12 },
  (_, k) => new Date(Date.UTC(1801 + 36 * k, (k * 5) % 12, 1 + ((k * 7) % 28), (k * 5) % 24, (k * 13) % 60, (k * 17) % 60))
);
const PLACES = [
  { latitude: -45.5, longitude: -71.25 },
  { latitude: 0, longitude: 0 },
  { latitude: 12.25, longitude: 77.5 },
  { latitude: 51.5, longitude: -0.125 },
  { latitude: 64.75, longitude: 25.5 },
  { latitude: 68.5, longitude: -149.75 }
];
const SYSTEMS = engine.HOUSE_SYSTEMS;
const day = (date) => date.toISOString().slice(0, 10);
const plus = (date, days) => new Date(date.getTime() + days * 86_400_000);

// --- Constants: every exported value that is not a function.
const ENTRIES = { engine, calc: calcEntry, crossings, deltat, geo, houses: housesEntry, receipt, sky, techniques, timing, vedic, window: windowEntry };
for (const [name, module] of Object.entries(ENTRIES)) {
  for (const key of Object.keys(module).sort()) {
    if (typeof module[key] !== "function") call(`const ${name}.${key}`, () => module[key]);
  }
}

// --- Root entry.
const charts = [];
for (const [i, utc] of INSTANTS.entries()) {
  for (const [j, place] of PLACES.entries()) {
    for (const houseSystem of SYSTEMS) {
      if ((i + j) % 3 !== 0 && houseSystem !== "placidus" && houseSystem !== "whole") continue;
      const chart = call("engine.natalChart", engine.natalChart, { utc, ...place, houseSystem });
      if (houseSystem === "placidus" && chart) charts.push(chart);
    }
  }
  call("engine.natalChart no time", engine.natalChart, { utc, timeKnown: false });
  call("engine.natalChart tt", engine.natalChart, { utc, timeScale: "tt", ...PLACES[3] });
  call("engine.natalChart ut1", engine.natalChart, { utc, timeScale: "ut1", ...PLACES[2] });
  call("engine.natalChart deltaT", engine.natalChart, { utc, deltaT: 60, ...PLACES[1], timeScale: "ut1" });
  call("engine.positions", engine.positions, utc);
  call("engine.moonPhase", engine.moonPhase, utc);
  call("engine.outsideReferenceSpan", engine.outsideReferenceSpan, utc);
}
for (let k = 0; k + 1 < charts.length; k += 5) {
  const [a, b] = [charts[k], charts[k + 1]];
  call("engine.transits", engine.transits, a, b.input?.utc ?? INSTANTS[3]);
  call("engine.synastry", engine.synastry, a, b);
  call("engine.chartDeclinations", engine.chartDeclinations, a);
  call("engine.chartPoints", engine.chartPoints, a);
  call("engine.saturnReturn", engine.saturnReturn, a);
  call("engine.progressedBodies", engine.progressedBodies, INSTANTS[k % 12], plus(INSTANTS[k % 12], 365.25 * 30));
  call("engine.progressedInstant", engine.progressedInstant, INSTANTS[k % 12], plus(INSTANTS[k % 12], 365.25 * 30));
  call("engine.findAspects", engine.findAspects, a.bodies);
  call("engine.findInterAspects", engine.findInterAspects, a.bodies, b.bodies);
  call("engine.summarizePair", engine.summarizePair, a.bodies, b.bodies);
  call("engine.elementBalance", engine.elementBalance, a.bodies);
  call("engine.modalityBalance", engine.modalityBalance, a.bodies);
  const policy = engine.createAspectPolicy();
  call("engine.findConfiguredAspects", engine.findConfiguredAspects, a.bodies.map((body) => ({ body: body.body, lon: body.lon, speed: body.speed })), policy);
  const narrow = engine.createAspectPolicy({ bodies: ["Sun", "Moon", "Mars", "Venus"], stationaryRelativeSpeed: 0.01 });
  call("engine.findConfiguredAspects narrow", engine.findConfiguredAspects, a.bodies.map((body) => ({ body: body.body, lon: body.lon, speed: body.speed })), narrow);
}
for (const body of ["Sun", "Moon", "Mars", "Saturn", "Pluto"]) {
  for (const [k, target] of [0, 97.5, 211.25].entries()) {
    const from = INSTANTS[4 + k];
    const crossingsFound = call("engine.findLongitudeCrossings", engine.findLongitudeCrossings, body, target, from, plus(from, body === "Moon" ? 60 : 800));
    call("engine.searchLongitudeCrossings", engine.searchLongitudeCrossings, body, target, from, plus(from, body === "Moon" ? 60 : 800), { stepDays: body === "Moon" ? 0.5 : 2 });
    if (crossingsFound) call("engine.groupIntoSeasons", engine.groupIntoSeasons, crossingsFound, 30);
  }
}
for (let ut = -73_000; ut <= 73_000; ut += 3_650.5) {
  call("engine.deltaT", engine.deltaT, ut);
  call("engine.deltaTAt", engine.deltaTAt, ut);
}
for (let k = 0; k < 24; k += 1) {
  const input = { gastHours: (k * 1.37) % 24, latitude: -66 + k * 5.75, longitude: -180 + k * 15.5, obliquity: 23.4392911 + (k - 12) * 0.002 };
  const angles = call("engine.computeAngles", engine.computeAngles, input);
  for (const name of ["alcabitiusCusps", "campanusCusps", "kochCusps", "placidusCusps", "regiomontanusCusps", "topocentricCusps", "vertexOf"]) {
    call(`engine.${name}`, engine[name], input, angles);
  }
  for (const name of ["equalCusps", "equalMcCusps", "porphyryCusps", "vehlowCusps"]) call(`engine.${name}`, engine[name], angles);
  for (const name of ["meridianCusps", "morinusCusps", "eastPointOf", "ramcOf"]) call(`engine.${name}`, engine[name], input);
  call("engine.wholeSignCusps", engine.wholeSignCusps, angles.asc);
  for (const system of SYSTEMS) call("engine.computeHouses", engine.computeHouses, system, input, angles);
  const lon = k * 15.37;
  call("engine.antiscion", engine.antiscion, lon);
  call("engine.contraAntiscion", engine.contraAntiscion, lon);
  call("engine.midpoint", engine.midpoint, lon, 359 - lon * 1.3);
  call("engine.separation", engine.separation, lon, 359 - lon * 1.3);
  call("engine.normalizeLongitude", engine.normalizeLongitude, lon * 37 - 400);
  call("engine.degreeInSign", engine.degreeInSign, lon);
  call("engine.signForLongitude", engine.signForLongitude, lon);
  call("engine.signIndexForLongitude", engine.signIndexForLongitude, lon);
  call("engine.sectOf", engine.sectOf, lon, (lon * 3) % 360);
  call("engine.matchAspect", engine.matchAspect, "Sun", lon, "Moon", (lon + 118.5) % 360);
  call("engine.aspectMotion", engine.aspectMotion, { lon, speed: 1 }, { lon: (lon + 89) % 360, speed: 0.1 * k - 1 }, 90);
  call("engine.eclipticToEquatorial", engine.eclipticToEquatorial, lon, k - 12, 23.44);
  call("engine.declinationOf", engine.declinationOf, lon, (k - 12) / 3, 23.44);
  const centuries = (k - 12) / 6;
  call("engine.meanObliquity", engine.meanObliquity, centuries);
  call("engine.lunarMeanArguments", engine.lunarMeanArguments, centuries);
  call("engine.meanNodeLongitude", engine.meanNodeLongitude, centuries, 0.002 * k);
  call("engine.meanApogee", engine.meanApogee, centuries, 0.002 * k);
  call("engine.houseOf", engine.houseOf, lon, engine.equalCusps(angles));
  call("engine.declinationOrb", engine.declinationOrb, "Sun", k % 2 ? "Moon" : "Mars");
}
for (const system of SYSTEMS) call("engine.isPolarUndefinedHouseSystem", engine.isPolarUndefinedHouseSystem, system);
{
  const chart = charts[0];
  const bodies = chart.bodies.map((body) => ({ body: body.body, lon: body.lon, lat: body.lat }));
  call("engine.declinationsForBodies", engine.declinationsForBodies, bodies, 23.44);
  call("engine.findDeclinationAspects", engine.findDeclinationAspects, bodies, 23.44);
  call("engine.hellenisticLots", engine.hellenisticLots, { ascendant: 101.5, sun: 15.25, moon: 222.75, mercury: 30.5, venus: 340.125, mars: 75, jupiter: 190.5, saturn: 280.25 }, "day");
  call("engine.hellenisticLots night", engine.hellenisticLots, { ascendant: 101.5, sun: 15.25, moon: 222.75, mercury: 30.5, venus: 340.125, mars: 75, jupiter: 190.5, saturn: 280.25 }, "night");
}

// --- ./calc
const calcTimes = [INSTANTS[1], INSTANTS[6].toISOString(), { iso: INSTANTS[9].toISOString(), deltaT: 75 }, { jd: 2_451_545.25, scale: "tt" }, { jd: 2_400_000.75, scale: "ut1" }, { jd: 2_488_069.5, scale: "utc" }];
for (const time of calcTimes) {
  for (const body of calcEntry.CALC_BODIES) {
    for (const frame of calcEntry.CALC_FRAMES) {
      call("calc.calc", (request) => newRequest(calcEntry.calc(request)), { body, time: calcTime(time), frame });
    }
  }
}
for (const center of ["geocentric", "heliocentric", "barycentric", { topocentric: { latitude: 51.5, longitude: -0.125, height: 35 } }]) {
  for (const correction of ["apparent", "astrometric", "geometric"]) {
    for (const body of ["Moon", "Mars", "Jupiter", "Pluto"]) {
      call("calc.calc center", (request) => newRequest(calcEntry.calc(request)), {
        body,
        time: calcTime(calcTimes[3]),
        center,
        flags: { correction, speeds: true, cartesian: true, deflection: correction === "apparent" }
      });
    }
  }
}
for (const ayanamsa of calcEntry.CALC_AYANAMSAS) {
  for (const body of ["Sun", "Moon", "Saturn", "Mean Node"]) {
    for (const time of [calcTimes[0], calcTimes[3]]) {
      call("calc.calc sidereal", (request) => newRequest(calcEntry.calc(request)), { body, time: calcTime(time), zodiac: { sidereal: ayanamsa } });
    }
  }
}
for (const epoch of [INSTANTS[2].toISOString(), { jd: 2_415_020.5, scale: "tt" }, { jd: 2_000_000.5, scale: "tt" }]) {
  for (const model of ["engine", "newcomb", "iau1976"]) {
    call("calc.calc user ayanamsa", (request) => newRequest(calcEntry.calc(request)), {
      body: "Sun",
      time: calcTime(calcTimes[0]),
      zodiac: { sidereal: { epoch: calcTime(epoch), value: 22.5, model } }
    });
  }
  call("calc.calc linear ayanamsa", (request) => newRequest(calcEntry.calc(request)), {
    body: "Moon",
    time: calcTime(calcTimes[1]),
    zodiac: { sidereal: { epoch: calcTime(epoch), value: 22.5, rate: 50.29 } }
  });
}
for (const place of PLACES) {
  for (const houseSystem of SYSTEMS) {
    const request = OLD ? { time: calcTime(calcTimes[1]), place, system: houseSystem } : { time: calcTime(calcTimes[1]), place, houseSystem };
    call("calc.houses", (input) => newRequest(calcEntry.houses(input)), request);
  }
  const sidereal = OLD
    ? { time: calcTime(calcTimes[3]), place, system: "placidus", zodiac: { sidereal: "lahiri" } }
    : { time: calcTime(calcTimes[3]), place, houseSystem: "placidus", zodiac: { sidereal: "lahiri" } };
  call("calc.houses sidereal", (input) => newRequest(calcEntry.houses(input)), sidereal);
  call("calc.chart", (input) => newRequest(calcEntry.chart(input)), { time: calcTime(calcTimes[2]), place, houseSystem: "koch" });
  call("calc.chart sidereal", (input) => newRequest(calcEntry.chart(input)), { time: calcTime(calcTimes[0]), place, zodiac: { sidereal: "true-chitra" } });
}
call("calc.chart no time", (input) => newRequest(calcEntry.chart(input)), { time: calcTime(calcTimes[1]), timeKnown: false });
for (const body of ["Sun", "Moon", "Mercury", "Mean Node", "Black Moon Lilith"]) {
  call("calc.events", (input) => newRequest(calcEntry.events(input)), {
    kind: "longitude-crossing",
    body,
    longitude: 123.5,
    from: calcTime(calcTimes[1]),
    to: new Date(INSTANTS[6].getTime() + 400 * 86_400_000).toISOString()
  });
  call("calc.events sidereal", (input) => newRequest(calcEntry.events(input)), {
    kind: "longitude-crossing",
    body,
    longitude: 300,
    from: calcTime(calcTimes[1]),
    to: new Date(INSTANTS[6].getTime() + 400 * 86_400_000).toISOString(),
    zodiac: { sidereal: "krishnamurti" }
  });
}

// --- ./crossings: the search over a synthetic longitude, and over the root's.
const synthetic = (body, date) => {
  const days = date.getTime() / 86_400_000;
  const rate = body === "fast" ? 13.2 : 0.9856;
  return (((rate * days + 7 * Math.sin(days / 29.5)) % 360) + 360) % 360;
};
for (const body of ["fast", "slow"]) {
  for (const target of [0, 45.5, 359.75]) {
    const from = INSTANTS[5];
    const to = plus(from, body === "fast" ? 90 : 1200);
    call("crossings.findLongitudeCrossingsWith", crossings.findLongitudeCrossingsWith, synthetic, body, target, from, to);
    call("crossings.searchLongitudeCrossingsWith", crossings.searchLongitudeCrossingsWith, synthetic, body, target, from, to, { stepDays: 1, maxSamples: 5_000 });
    call("crossings.searchLongitudeCrossingsWith budget", crossings.searchLongitudeCrossingsWith, synthetic, body, target, from, to, { stepDays: 0.01, maxSamples: 50 });
  }
}

// --- ./deltat
for (let ut = -800_000; ut <= 800_000; ut += 12_345.5) {
  call("deltat.deltaT", deltat.deltaT, ut);
  call("deltat.deltaTAt", deltat.deltaTAt, ut);
}

// --- ./geo
const prepared = new Set();
/** Loads a zone's history before 1970, once. */
async function prepare(date, timeZone) {
  if (Number(date.slice(0, 4)) >= 1970 || prepared.has(`${timeZone} ${date}`)) return;
  prepared.add(`${timeZone} ${date}`);
  await callAsync("geo.prepareLocalTime", geo.prepareLocalTime, date, timeZone);
}
for (const zone of ["Europe/London", "America/New_York", "Asia/Kolkata", "Australia/Sydney", "Europe/Paris", "America/Sao_Paulo", "Africa/Cairo", "Pacific/Auckland"]) {
  for (const [k, utc] of INSTANTS.entries()) {
    await prepare(day(utc), zone);
    call("geo.zoneOffsetAt", geo.zoneOffsetAt, zone, utc.getTime());
    call("geo.offsetAt", geo.offsetAt, zone, utc.getTime());
    const time = `${String((k * 5) % 24).padStart(2, "0")}:${String((k * 13) % 60).padStart(2, "0")}`;
    call("geo.resolveLocalToUtc", geo.resolveLocalToUtc, day(utc), time, zone, { longitude: 10.5 });
    call("geo.resolveLocalBirth", geo.resolveLocalBirth, { date: day(utc), time, timeZone: zone, latitude: 40.25, longitude: -3.5, houseSystem: "regiomontanus" });
    call("geo.resolveBirth", geo.resolveBirth, { date: day(utc), time, timeZone: zone, latitude: -33.75, longitude: 151.25 });
  }
}
// Daylight-saving gaps and folds, synthetic times at the 2021 transitions.
for (const [zone, date, time] of [
  ["Europe/London", "2021-03-28", "01:30"],
  ["Europe/London", "2021-10-31", "01:30"],
  ["America/New_York", "2021-03-14", "02:30"],
  ["America/New_York", "2021-11-07", "01:30"],
  ["Australia/Sydney", "2021-10-03", "02:30"],
  ["Australia/Sydney", "2021-04-04", "02:30"]
]) {
  call("geo.resolveLocalToUtc dst", geo.resolveLocalToUtc, date, time, zone);
  call("geo.resolveLocalBirth dst", geo.resolveLocalBirth, { date, time, timeZone: zone, latitude: 45, longitude: 7 });
}
for (const country of ["GB", "US", "SE", "RU", "FR", "GR", "JP", "IT", "DE", "XX"]) {
  call("geo.gregorianAdoption", geo.gregorianAdoption, country);
  for (const date of ["1582-10-20", "1700-03-01", "1752-09-20", "1918-02-20", "1923-03-10"]) {
    call("geo.calendarNote", geo.calendarNote, date, "gregorian", country);
    call("geo.calendarNote julian", geo.calendarNote, date, "julian", country);
  }
}
for (const date of ["1582-10-15", "1700-02-28", "1752-09-14", "1900-02-28", "2000-02-29", "1800-12-31"]) {
  call("geo.gregorianToJulian", geo.gregorianToJulian, date);
  call("geo.julianToGregorian", geo.julianToGregorian, date);
}
// A Julian date in Great Britain before 1752.
const julianDate = "1740-05-03";
call("geo.resolveLocalToUtc julian", geo.resolveLocalToUtc, julianDate, "10:00", "Europe/London", { calendar: "julian", country: "GB", longitude: -0.125 });

// --- ./houses
for (let k = 0; k < 18; k += 1) {
  const input = { gastHours: (k * 1.91) % 24, latitude: -64 + k * 7.5, longitude: -170 + k * 19.25, obliquity: 23.437 + (k - 9) * 0.003 };
  call("houses.coAscendants", housesEntry.coAscendants, input);
  for (const system of SYSTEMS) {
    call("houses.houseSpeeds", housesEntry.houseSpeeds, system, input);
    call("houses.housePosition", housesEntry.housePosition, system, input, { lon: (k * 41.3) % 360, lat: (k % 7) - 3 });
  }
}

// --- ./receipt
const envelopes = [];
for (const chart of charts.slice(0, 18)) {
  const envelope = call("receipt.createNatalEnvelope", receipt.createNatalEnvelope, chart);
  const text = call("receipt.serializeNatalEnvelope", receipt.serializeNatalEnvelope, envelope);
  envelopes.push(text);
  call("receipt.parseNatalEnvelope", receipt.parseNatalEnvelope, text);
  call("receipt.natalReplayInput", receipt.natalReplayInput, envelope);
  call("receipt.redactNatalEnvelope", receipt.redactNatalEnvelope, envelope);
}
{
  const local = geo.resolveLocalBirth({ date: day(INSTANTS[5]), time: "06:45", timeZone: "Europe/Paris", latitude: 48.75, longitude: 2.25 });
  const chart = engine.natalChart(local.birth);
  const envelope = call("receipt.createNatalEnvelope context", receipt.createNatalEnvelope, chart, { sourceInstant: new Date(chart.input.utc).toISOString().replace("Z", "+00:00"), extensions: { note: "synthetic" } });
  const text = call("receipt.serializeNatalEnvelope context", receipt.serializeNatalEnvelope, envelope);
  envelopes.push(text);
  call("receipt.parseNatalEnvelope context", receipt.parseNatalEnvelope, text);
}
// The serialized envelopes, for receipts-cross.mjs, with the version a placeholder.
call("receipt.envelopes", () => envelopes);

// --- ./sky
const observers = [{ latitude: 51.5, longitude: -0.125 }, { latitude: -33.875, longitude: 151.25, height: 40 }, { latitude: 69.75, longitude: 18.875 }, { latitude: 0.5, longitude: -78.5, height: 2800 }];
for (const observer of observers) {
  for (const utc of [INSTANTS[3], INSTANTS[6], INSTANTS[8]]) {
    for (const body of ["Sun", "Moon", "Venus", "Saturn"]) {
      call("sky.skyEventsOn", sky.skyEventsOn, body, observer, day(utc), { utcOffsetMinutes: 60 });
      call("sky.skyEvents", sky.skyEvents, body, observer, utc, plus(utc, 3), { limb: "centre", refraction: "none" });
    }
    call("sky.planetaryHours", sky.planetaryHours, observer, day(utc));
    call("sky.planetaryHourAt", sky.planetaryHourAt, observer, plus(utc, 0.3));
  }
  // Midsummer and midwinter days, where the far-north observer's Sun neither rises nor sets.
  for (const date of ["2021-06-21", "2021-12-21"]) {
    call("sky.skyEventsOn solstice", sky.skyEventsOn, "Sun", observer, date);
    call("sky.planetaryHours solstice", sky.planetaryHours, observer, date);
  }
}

// --- ./techniques
for (let k = 0; k + 1 < charts.length; k += 4) {
  const [a, b] = [charts[k], charts[k + 1]];
  const after = plus(new Date(a.input.utc), 365.25 * 20 + k);
  call("techniques.chartAspectPatterns", techniques.chartAspectPatterns, a);
  call("techniques.compositeChart", techniques.compositeChart, a, b);
  call("techniques.compositeMidpoints", techniques.compositeMidpoints, a.bodies.map((x) => ({ body: x.body, lon: x.lon })), b.bodies.map((x) => ({ body: x.body, lon: x.lon })));
  call("techniques.davisonChart", techniques.davisonChart, a, b, { place: "great-circle", houseSystem: "equal" });
  call("techniques.davisonPlace", techniques.davisonPlace, { latitude: 12.5, longitude: 170 }, { latitude: -40.25, longitude: -175.5 }, "coordinates");
  call("techniques.davisonPlace great circle", techniques.davisonPlace, { latitude: 12.5, longitude: 170 }, { latitude: -40.25, longitude: -175.5 }, "great-circle");
  call("techniques.davisonPlace default", techniques.davisonPlace, { latitude: 12.5, longitude: 170 }, { latitude: -40.25, longitude: -175.5 });
  call("techniques.solarReturn", techniques.solarReturn, a, after, { selection: "nearest", location: { latitude: 30.5, longitude: 31.25 } });
  call("techniques.solarReturn most recent", techniques.solarReturn, a, after, { selection: "most-recent", houseSystem: "whole" });
  call("techniques.lunarReturn", techniques.lunarReturn, a, after);
  const sun = a.bodies.find((x) => x.body === "Sun").lon;
  const moon = a.bodies.find((x) => x.body === "Moon").lon;
  call("techniques.solarReturnInstant", techniques.solarReturnInstant, sun, after);
  call("techniques.mostRecentSolarReturnInstant", techniques.mostRecentSolarReturnInstant, sun, after);
  call("techniques.lunarReturnInstant", techniques.lunarReturnInstant, moon, after);
  call("techniques.mutualReceptions", techniques.mutualReceptions, a.bodies.map((x) => ({ body: x.body, lon: x.lon })));
  const patterns = call("techniques.aspectPatterns", techniques.aspectPatterns, a.bodies.map((x) => ({ body: x.body, lon: x.lon })), a.aspects.map((x) => ({ a: x.a, b: x.b, type: x.type, orb: x.orb })));
  if (patterns) call("techniques.patternContainment", techniques.patternContainment, patterns.patterns);
  call("techniques.compositeAspects", techniques.compositeAspects, a.bodies.map((x) => ({ body: x.body, lon: x.lon })));
}
for (const utc of INSTANTS.slice(3, 10)) {
  call("techniques.voidOfCourseAt", techniques.voidOfCourseAt, utc);
  call("techniques.voidOfCourseAt traditional", techniques.voidOfCourseAt, utc, { bodies: "traditional" });
  call("techniques.voidOfCourseWindows", techniques.voidOfCourseWindows, utc, plus(utc, 9));
  call("techniques.moonAspects", techniques.moonAspects, utc, plus(utc, 4));
  call("techniques.moonIngresses", techniques.moonIngresses, utc, plus(utc, 20));
  call("techniques.moonSignsBetween", techniques.moonSignsBetween, utc, plus(utc, 5));
  call("techniques.moonSignCandidates", techniques.moonSignCandidates, day(utc), { timeZone: "Asia/Kolkata" });
  call("techniques.moonSignCandidates longitude", techniques.moonSignCandidates, day(utc), { timeZone: "America/Chicago", longitude: -100 });
}
for (const planet of ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "North Node"]) {
  call("techniques.hasClassicalDignities", techniques.hasClassicalDignities, planet);
  for (const sign of engine.SIGN_SLUGS ?? engine.SIGN_NAMES) {
    call("techniques.dignitiesFor", techniques.dignitiesFor, planet, sign);
    call("techniques.dignityFor", techniques.dignityFor, planet, sign);
  }
}
for (let lon = 0.25; lon < 360; lon += 7.75) {
  call("techniques.dignityRulersAt", techniques.dignityRulersAt, lon);
  for (const planet of ["Sun", "Moon", "Saturn"]) call("techniques.essentialDignities", techniques.essentialDignities, planet, lon, lon < 180 ? "day" : "night");
}

// --- ./timing
for (let k = 0; k < charts.length; k += 4) {
  const natal = charts[k];
  const birth = natal.input?.utc ?? INSTANTS[k % 12];
  const later = plus(new Date(birth), 365.25 * 33.3);
  call("timing.firdaria", timing.firdaria, natal, { cycles: 2 });
  call("timing.firdariaAt", timing.firdariaAt, natal, later, { variant: "bonatti" });
  call("timing.profectionAt", timing.profectionAt, natal, later, { months: "thirteenths" });
  call("timing.profectionYear", timing.profectionYear, natal, 33, { point: "Moon" });
  call("timing.solarArc", timing.solarArc, birth, later);
  call("timing.solarArcDirections", timing.solarArcDirections, natal, later);
  call("timing.zodiacalReleasing", timing.zodiacalReleasing, natal, "Lot of Spirit", later, plus(later, 800), { levels: 2 });
  call("timing.zodiacalReleasingAt", timing.zodiacalReleasingAt, natal, "Lot of Fortune", later, { years: "julian-365.25" });
  call("timing.releasingAt", timing.releasingAt, "leo", birth, later);
  call("timing.releasingPeriods", timing.releasingPeriods, 200.5, birth, later, plus(later, 400), { levels: 3 });
  call("timing.planetaryReturns", timing.planetaryReturns, natal, k % 8 ? "Mars" : "Saturn", later, plus(later, 3000));
}
for (const sect of ["day", "night"]) {
  call("timing.firdariaPeriods", timing.firdariaPeriods, sect);
  call("timing.firdariaSequence", timing.firdariaSequence, sect, { variant: "bonatti" });
}
for (let age = 0; age < 40; age += 7) {
  call("timing.annualProfection", timing.annualProfection, "scorpio", age);
  call("timing.annualProfection number", timing.annualProfection, 123.25, age);
}
call("timing.directLongitudes", timing.directLongitudes, [{ name: "Sun", lon: 10.5 }, { name: "Moon", lon: 355.25 }], 33.125);

// --- ./vedic
for (const utc of INSTANTS) {
  for (const name of vedic.AYANAMSAS ? Object.keys(vedic.AYANAMSAS) : calcEntry.CALC_AYANAMSAS) {
    call("vedic.ayanamsa", vedic.ayanamsa, name, utc);
  }
  call("vedic.ayanamsa tt", vedic.ayanamsa, "lahiri", utc, { timeScale: "tt" });
  call("vedic.ayanamsa deltaT", vedic.ayanamsa, "lahiri", utc, { timeScale: "ut1", deltaT: 64 });
}
for (const [k, epoch] of [INSTANTS[4], INSTANTS[4].toISOString(), { julianDateTT: 2_415_020.5 }, new Date(-50_000_000_000_000)].entries()) {
  const definition = call("vedic.userAyanamsa", vedic.userAyanamsa, { name: `synthetic-${k}`, epoch, value: 23.25, model: k % 2 ? "newcomb" : "engine" });
  const linear = call("vedic.userAyanamsa linear", vedic.userAyanamsa, { epoch, value: 23.25, rate: 50.2388475 });
  for (const utc of [INSTANTS[2], INSTANTS[10]]) {
    if (definition) call("vedic.ayanamsa user", vedic.ayanamsa, definition, utc);
    if (linear) call("vedic.ayanamsa linear", vedic.ayanamsa, linear, utc);
  }
}
for (const [k, chart] of charts.slice(0, 12).entries()) {
  const name = Object.keys(vedic.AYANAMSAS)[k % 9];
  const sidereal = call("vedic.siderealChart", vedic.siderealChart, chart, name);
  call("vedic.siderealChart birth", vedic.siderealChart, chart.input ?? { utc: INSTANTS[k] }, "lahiri");
  const value = vedic.ayanamsa("lahiri", chart.input?.utc ?? INSTANTS[k]);
  const moon = call("vedic.siderealLongitude", vedic.siderealLongitude, chart.bodies.find((x) => x.body === "Moon").lon, value);
  if (!moon) continue;
  call("vedic.nakshatraOf", vedic.nakshatraOf, moon);
  call("vedic.kpLordsOf", vedic.kpLordsOf, moon);
  for (const varga of ["D1", "D2", "D3", "D4", "D7", "D9", "D10", "D12", "D16", "D20", "D24", "D27", "D30", "D40", "D45", "D60"]) {
    call("vedic.vargaOf", vedic.vargaOf, moon, varga);
    if (varga === "D2" || varga === "D3") call("vedic.vargaOf cyclic", vedic.vargaOf, moon, varga, "cyclic");
  }
  const dasha = call("vedic.vimshottariDasha", vedic.vimshottariDasha, moon, { yearLength: ["julian", "tropical", "savana"][k % 3] });
  call("vedic.vimshottariAt", vedic.vimshottariAt, moon, plus(new Date(chart.input?.utc ?? INSTANTS[k]), 365.25 * 41.5), { levels: 1 + (k % 5) });
  call("vedic.yoginiDasha", vedic.yoginiDasha, moon, { cycles: 2 });
  call("vedic.ashtottariDasha", vedic.ashtottariDasha, moon);
  if (dasha?.mahadashas?.[2]) call("vedic.dashaSubperiods", vedic.dashaSubperiods, dasha.mahadashas[2]);
  const declared = call("vedic.declareSiderealLongitude", vedic.declareSiderealLongitude, (moon.lon + 13.5) % 360, { ayanamsa: "lahiri", at: chart.input?.utc ?? INSTANTS[k] });
  if (declared) call("vedic.nakshatraOf declared", vedic.nakshatraOf, declared);
}

// --- ./window
for (const [k, place] of PLACES.entries()) {
  const at = INSTANTS[(k * 2 + 1) % 12];
  call("window.birthWindow", windowEntry.birthWindow, { at, minutes: 30, ...place, houseSystem: SYSTEMS[k % SYSTEMS.length] });
  call("window.birthWindow range", windowEntry.birthWindow, { start: at, end: plus(at, 0.125), ...place });
  call("window.birthWindow rounding", windowEntry.birthWindow, { rounding: { recorded: at, minutes: 15, mode: k % 2 ? "down" : "nearest" }, ...place });
}

// --- Options and paths the sections above leave out, and instants outside
// 1801 to 2199.
{
  const natal = charts[3];
  const bodies = natal.bodies.map((body) => ({ body: body.body, lon: body.lon, lat: body.lat }));
  const from = INSTANTS[7];
  call("calc.calc radians", (request) => newRequest(calcEntry.calc(request)), { body: "Venus", time: calcTime(calcTimes[1]), flags: { units: "radians", cartesian: true } });
  call("calc.events steps", (input) => newRequest(calcEntry.events(input)), { kind: "longitude-crossing", body: "Venus", longitude: 10, from: from.toISOString(), to: plus(from, 600).toISOString(), stepDays: 2, maxSamples: 5_000 });
  call("calc.events sample budget", (input) => newRequest(calcEntry.events(input)), { kind: "longitude-crossing", body: "Venus", longitude: 10, from: from.toISOString(), to: plus(from, 600).toISOString(), stepDays: 0.5, maxSamples: 20 });
  call("engine.findLongitudeCrossings step", engine.findLongitudeCrossings, "Mercury", 45, from, plus(from, 400), 0.5);
  call("engine.searchLongitudeCrossings budget", engine.searchLongitudeCrossings, "Mercury", 45, from, plus(from, 400), { maxSamples: 30 });
  const policy = { orb: 1.25, luminaryOrb: 1.75 };
  call("engine.declinationOrb policy", engine.declinationOrb, "Sun", "Mars", policy);
  call("engine.declinationsForBodies policy", engine.declinationsForBodies, bodies, 23.44, policy);
  call("engine.findDeclinationAspects policy", engine.findDeclinationAspects, bodies, 23.44, policy);
  call("engine.summarizePair top", engine.summarizePair, natal.bodies, charts[4].bodies, 3);
  call("engine.createAspectPolicy", engine.createAspectPolicy, { bodies: ["Sun", "Moon", "Mercury"], stationaryRelativeSpeed: 0.02 });
  call("timing.planetaryReturns options", timing.planetaryReturns, natal, "Jupiter", from, plus(from, 5000), { stepDays: 4, maxSamples: 10_000 });
  call("timing.planetaryReturns budget", timing.planetaryReturns, natal, "Jupiter", from, plus(from, 5000), { maxSamples: 10 });
  call("sky.skyEvents budget", sky.skyEvents, "Moon", observers[0], from, plus(from, 3), { maxSamples: 3 });
  call("sky.skyEventsOn budget", sky.skyEventsOn, "Moon", observers[0], day(from), { maxSamples: 3 });
  const value = vedic.ayanamsa("lahiri", natal.input.utc);
  const moon = vedic.siderealLongitude(natal.bodies.find((x) => x.body === "Moon").lon, value);
  for (const yearLength of ["julian", "tropical", "savana"]) {
    call("vedic.vimshottariAt year", vedic.vimshottariAt, moon, plus(new Date(natal.input.utc), 365.25 * 30), { levels: 3, yearLength });
    call("vedic.yoginiDasha year", vedic.yoginiDasha, moon, { yearLength, cycles: 1 });
    call("vedic.ashtottariDasha year", vedic.ashtottariDasha, moon, { yearLength });
  }
  const own = vedic.userAyanamsa({ name: "synthetic-chart", epoch: INSTANTS[5], value: 23.5, model: "iau1976" });
  call("vedic.siderealChart user ayanamsa", vedic.siderealChart, natal, own);
  call("techniques.lunarReturn options", techniques.lunarReturn, natal, plus(new Date(natal.input.utc), 9000), { location: { latitude: -12.5, longitude: 130.75 }, houseSystem: "porphyry" });
  call("techniques.moonAspects traditional", techniques.moonAspects, from, plus(from, 3), { bodies: "traditional" });
  call("techniques.voidOfCourseWindows traditional", techniques.voidOfCourseWindows, from, plus(from, 6), { bodies: "traditional" });
  call("techniques.mutualReceptions options", techniques.mutualReceptions, natal.bodies.map((x) => ({ body: x.body, lon: x.lon })), { dignities: ["domicile", "exaltation", "triplicity"], sect: "night" });
  // Receipts with contexts: a local resolution in a daylight-saving gap and
  // fold, local mean time, a Julian date, provenance, and charts on TT, UT1,
  // a pinned ΔT and at the poles.
  const contexts = [];
  for (const [date, time, timeZone, extra] of [
    ["2021-03-14", "02:30", "America/New_York", {}],
    ["2021-11-07", "01:30", "America/New_York", {}],
    [day(INSTANTS[0]), "10:00", "Europe/London", { longitude: -0.125 }],
    [julianDate, "10:00", "Europe/London", { longitude: -0.125, calendar: "julian", country: "GB" }],
    [day(INSTANTS[4]), "05:45", "Asia/Kolkata", { longitude: 88.25 }]
  ]) {
    await prepare(date, timeZone);
    const local = geo.resolveLocalBirth({ date, time, timeZone, latitude: 45.25, longitude: 7.5, ...extra });
    contexts.push([engine.natalChart(local.birth), { reference: local.reference, localResolution: local.resolution.localResolution }]);
  }
  contexts.push([charts[5], { provenance: { source: { repository: "https://example.invalid/engine", commit: "0123456789abcdef0123456789abcdef01234567" } } }]);
  contexts.push([engine.natalChart({ utc: INSTANTS[11], timeScale: "tt", latitude: 10, longitude: 20 }), {}]);
  contexts.push([engine.natalChart({ utc: INSTANTS[1], timeScale: "ut1", latitude: 10, longitude: 20 }), {}]);
  contexts.push([engine.natalChart({ utc: INSTANTS[6], timeScale: "ut1", deltaT: 57.25, latitude: 10, longitude: 20 }), {}]);
  contexts.push([engine.natalChart({ utc: INSTANTS[6], latitude: 80.5, longitude: 20, houseSystem: "koch" }), {}]);
  contexts.push([engine.natalChart({ utc: INSTANTS[6], timeKnown: false }), {}]);
  for (const [chart, context] of contexts) {
    const envelope = call("receipt.createNatalEnvelope contexts", receipt.createNatalEnvelope, chart, context);
    if (!envelope) continue;
    const text = call("receipt.serializeNatalEnvelope contexts", receipt.serializeNatalEnvelope, envelope);
    envelopes.push(text);
    call("receipt.parseNatalEnvelope contexts", receipt.parseNatalEnvelope, text);
  }
  call("receipt.envelopes all", () => envelopes);
  // Instants outside 1801 to 2199: the root and the techniques compute there,
  // with the outside-reference-span flag; calc refuses them.
  for (const utc of [new Date(Date.UTC(1650, 2, 3, 4, 5)), new Date(Date.UTC(1799, 11, 31, 23)), new Date(Date.UTC(2250, 6, 7, 8, 9)), new Date(Date.UTC(3500, 0, 1))]) {
    call("engine.natalChart far", engine.natalChart, { utc, latitude: 41.5, longitude: 12.5, houseSystem: "regiomontanus" });
    call("engine.positions far", engine.positions, utc);
    call("calc.calc far", (request) => newRequest(calcEntry.calc(request)), { body: "Mars", time: utc.toISOString() });
    call("vedic.ayanamsa far", vedic.ayanamsa, "lahiri", utc);
    call("techniques.voidOfCourseAt far", techniques.voidOfCourseAt, utc);
  }
}

// --- The changes of behaviour that 1.0.0-rc.1's CHANGELOG lists, called the
// same way on both packages, so that each shows as a difference: input that
// rc.17 accepted and 1.0.0-rc.1 refuses, the tables it freezes, and the
// refused day's reason.
const moon = vedic.siderealLongitude(123.4, vedic.ayanamsa("lahiri", INSTANTS[6]));
call("changed: calc scale in capitals", (request) => calcEntry.calc(request), { body: "Sun", time: { jd: 2_451_545, scale: "TT" } });
call("changed: calc houses system", (request) => calcEntry.houses(request), { time: INSTANTS[6].toISOString(), place: PLACES[3], system: "koch" });
call("changed: deltaT not finite", deltat.deltaT, Number.NaN);
call("changed: deltaTAt not finite", engine.deltaTAt, Number.POSITIVE_INFINITY);
call("changed: davisonPlace latitude", techniques.davisonPlace, { latitude: 95, longitude: 10 }, { latitude: 10, longitude: 20 });
call("changed: davisonPlace convention", techniques.davisonPlace, { latitude: 5, longitude: 10 }, { latitude: 10, longitude: 20 }, "midpoint");
call("changed: calendarNote date", geo.calendarNote, "1700-02-30", "gregorian", "GB");
call("changed: calendarNote calendar", geo.calendarNote, "1700-03-01", "hebrew", "GB");
call("changed: ayanamsa unknown option", vedic.ayanamsa, "lahiri", INSTANTS[6], { timescale: "tt" });
call("changed: userAyanamsa bare epoch", vedic.userAyanamsa, { epoch: 2_451_545, value: 23.25 });
call("changed: userAyanamsa unknown option", vedic.userAyanamsa, { epoch: INSTANTS[3], value: 23.25, modle: "newcomb" });
call("changed: vimshottariDasha unknown option", vedic.vimshottariDasha, moon, { yearlength: "savana" });
call("changed: declareSiderealLongitude unknown key", vedic.declareSiderealLongitude, 100, { ayanamsa: "lahiri", when: INSTANTS[6] });
call("changed: crossing search unknown option", crossings.searchLongitudeCrossingsWith, synthetic, "slow", 10, INSTANTS[5], plus(INSTANTS[5], 400), { stepdays: 1 });
call("changed: planetaryHours sample budget", sky.planetaryHours, observers[0], day(INSTANTS[6]), { maxSamples: 3 });
call("changed: root crossing window, string ends", engine.findLongitudeCrossings, "Sun", 90, INSTANTS[7].toISOString(), plus(INSTANTS[7], 400).toISOString());
call("changed: root crossing window, number ends", engine.searchLongitudeCrossings, "Sun", 90, INSTANTS[7].getTime(), plus(INSTANTS[7], 400).getTime());
call("changed: calendarNote country", geo.calendarNote, "1918-02-14", "julian", 42);
call("changed: a Julian date that resolves past 9999", (input) => geo.resolveLocalBirth(input).resolution.calendarNote, {
  date: "9999-12-31", time: "12:00", timeZone: "Etc/GMT", calendar: "julian", country: "GB", latitude: 51.5, longitude: -0.125
});
call("changed: signForLongitude frozen", () => Object.isFrozen(engine.signForLongitude(100)));
call("changed: matchAspect definition frozen", () => Object.isFrozen(engine.matchAspect("Sun", 10, "Moon", 130).definition));
for (const [name, value] of Object.entries({
  ASPECTS: engine.ASPECTS,
  ASPECT_TYPES: engine.ASPECT_TYPES,
  SIGNS: engine.SIGNS,
  SIGN_NAMES: engine.SIGN_NAMES,
  ELEMENTS: engine.ELEMENTS,
  MODALITIES: engine.MODALITIES,
  HOUSE_SYSTEMS: engine.HOUSE_SYSTEMS,
  POLAR_UNDEFINED_HOUSE_SYSTEMS: engine.POLAR_UNDEFINED_HOUSE_SYSTEMS,
  LOTS: engine.LOTS,
  CALC_BODIES: calcEntry.CALC_BODIES,
  CALC_AYANAMSAS: calcEntry.CALC_AYANAMSAS,
  CALC_FRAMES: calcEntry.CALC_FRAMES
})) {
  call(`changed: ${name} frozen`, () => Object.isFrozen(value) && [value].concat(Array.isArray(value) ? value : []).every((item) => typeof item !== "object" || Object.isFrozen(item)));
}

// Last, because it changes ASPECT_BODIES for as long as it runs: rc.17's
// aspects read the set, and 1.0.0-rc.1's do not.
call("changed: ASPECT_BODIES not read", () => {
  const before = engine.findAspects(charts[0].bodies).length;
  engine.ASPECT_BODIES.delete("Sun");
  try {
    return [before, engine.findAspects(charts[0].bodies).length];
  } finally {
    engine.ASPECT_BODIES.add("Sun");
  }
});

console.error(`values.mjs: ${count} calls on ${VERSION}`);
