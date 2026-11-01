// The engine's side of checks C1, C1b, C2, C3 and C5 (../PREREGISTRATION.md,
// section 6): the results of `@zodiacs/engine/calc` for one corpus, written
// as JSON with only the fields the references read. Each record names the
// checks it is for. The references (bands.py, horizons.py, angles.py) read
// this file and nothing of the engine.
//
//   node dump.mjs --package <root> --corpus T0|E0|T1|T2|T3|E --out <file.json>
//
// For an instant corpus: an anchor record (calc of the Sun on the corpus
// time), then the five input forms of section 5 from that record, and in each
// form the positions, houses and charts the checks name. For E (and E0,
// T0's window): every window's events. A refusal is recorded with its reason,
// never dropped.
import { CORPORA, SITES, forms } from "./corpora.mjs";
import { entry, finish, manifest, options } from "./load.mjs";

const args = options();
if (!args.package || !args.corpus || !CORPORA[args.corpus]) throw new Error("usage: node dump.mjs --package <root> --corpus T0|E0|T1|T2|T3|E --out <file>");
const { calc, events, houses, chart, CALC_BODIES } = await entry(args.package, "./calc");
const corpus = args.corpus;

const SYSTEMS = ["whole", "placidus", "porphyry", "equal", "equal-mc", "vehlow", "koch", "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian"];
const TOPOCENTRIC = ["Sun", "Moon", "Mars", "Jupiter", "Pluto"];
const HORIZONS_BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

/** A position's fields the references read. */
function position(checks, entryId, form, request) {
  const result = calc(request);
  if (result.status !== "ok") return { kind: "position", checks, entry: entryId, form, request, refused: result.reason };
  return {
    kind: "position",
    checks,
    entry: entryId,
    form,
    request,
    lon: result.lon,
    lat: result.lat,
    dist: result.dist,
    speeds: result.speeds,
    speedBound: result.bounds.speed?.value ?? null,
    band: result.band,
    instant: result.receipt.instants[0],
    conventions: result.receipt.conventions
  };
}

function housesRecord(checks, entryId, form, request) {
  const result = houses(request);
  if (result.status !== "ok") return { kind: "houses", checks, entry: entryId, form, request, refused: result.reason };
  return {
    kind: "houses",
    checks,
    entry: entryId,
    form,
    request,
    system: result.system,
    flags: result.flags,
    armc: result.armc,
    obliquity: result.obliquity,
    asc: result.angles.asc,
    mc: result.angles.mc,
    vertex: result.vertex,
    eastPoint: result.eastPoint,
    cusps: result.cusps,
    band: result.band,
    instant: result.receipt.instants[0],
    conventions: result.receipt.conventions
  };
}

function chartRecord(checks, entryId, form, request) {
  const result = chart(request);
  if (result.status !== "ok") return { kind: "chart", checks, entry: entryId, form, request, refused: result.reason };
  return {
    kind: "chart",
    checks,
    entry: entryId,
    form,
    request,
    bodies: result.chart.bodies.map(({ body, lon, speed }) => ({ body, lon, speed })),
    angles: result.chart.angles && { asc: result.chart.angles.asc, mc: result.chart.angles.mc },
    band: result.band,
    instant: result.receipt.instants[0],
    conventions: result.receipt.conventions
  };
}

const records = [];
if (corpus === "E" || corpus === "E0") {
  for (const window of CORPORA[corpus]()) {
    const request = { kind: "longitude-crossing", body: window.body, longitude: window.longitude, from: window.from, to: window.to, ...(window.zodiac ? { zodiac: window.zodiac } : {}) };
    const result = events(request);
    if (result.status !== "ok") {
      records.push({ kind: "events", checks: ["C1", "C5"], entry: window.id, request, refused: result.reason });
      continue;
    }
    records.push({ kind: "events", checks: ["C1", "C5"], entry: window.id, request, events: result.events, instants: result.receipt.instants, conventions: result.receipt.conventions });
  }
} else {
  for (const item of CORPORA[corpus]()) {
    const anchor = calc({ body: "Sun", time: item.time });
    if (anchor.status !== "ok") {
      records.push({ kind: "anchor", entry: item.id, time: item.time, refused: anchor.reason });
      continue;
    }
    const instant = anchor.receipt.instants[0];
    records.push({ kind: "anchor", entry: item.id, time: item.time, instant });
    for (const [form, time] of Object.entries(forms(item, instant))) {
      // C1: every body calc accepts at the geocentric center, apparent, in two frames; Mars and Jupiter heliocentric
      // (astrometric) and barycentric (geometric); five bodies topocentric (apparent) at S1, S2 and S6.
      for (const body of CALC_BODIES) {
        if (body === "Earth") continue;
        for (const frame of ["ecliptic-true-of-date", "equatorial-icrs"]) {
          const checks = corpus === "T1" && frame === "equatorial-icrs" && HORIZONS_BODIES.includes(body) ? ["C1", "C2"] : ["C1"];
          records.push(position(checks, item.id, form, { body, time, frame }));
        }
      }
      for (const body of ["Mars", "Jupiter"]) {
        records.push(position(["C1"], item.id, form, { body, time, center: "heliocentric", flags: { correction: "astrometric" } }));
        records.push(position(["C1"], item.id, form, { body, time, center: "barycentric", flags: { correction: "geometric" } }));
      }
      for (const site of ["S1", "S2", "S6"]) {
        for (const body of TOPOCENTRIC) records.push(position(["C1"], item.id, form, { body, time, center: { topocentric: SITES[site] } }));
      }
      // C2, on T1 only: the rest of the ten bodies' geocentric apparent and geometric cases in the two ICRS frames.
      if (corpus === "T1") {
        for (const body of HORIZONS_BODIES) {
          records.push(position(["C2"], item.id, form, { body, time, frame: "ecliptic-icrs" }));
          for (const frame of ["equatorial-icrs", "ecliptic-icrs"]) {
            records.push(position(["C2"], item.id, form, { body, time, frame, flags: { correction: "geometric" } }));
          }
        }
      }
      // C1: houses() at S1 (its band.time); chart() at S1 and without a place.
      const place = (site) => ({ latitude: SITES[site].latitude, longitude: SITES[site].longitude });
      records.push(chartRecord(["C1"], item.id, form, { time, place: place("S1") }));
      records.push(chartRecord(["C1"], item.id, form, { time }));
      if (corpus === "T1") {
        records.push(housesRecord(["C1"], item.id, form, { time, place: place("S1") }));
        continue;
      }
      // C3 (on T2, T3 and T0): every system at S1 to S5, a Lahiri copy at S1, and S7's Placidus and Koch.
      for (const site of ["S1", "S2", "S3", "S4", "S5"]) {
        for (const houseSystem of SYSTEMS) {
          const checks = site === "S1" && houseSystem === "whole" ? ["C1", "C3"] : ["C3"];
          records.push(housesRecord(checks, item.id, form, { time, place: place(site), houseSystem }));
        }
      }
      for (const houseSystem of SYSTEMS) records.push(housesRecord(["C3"], item.id, form, { time, place: place("S1"), houseSystem, zodiac: { sidereal: "lahiri" } }));
      for (const houseSystem of ["placidus", "koch"]) records.push(housesRecord(["C3"], item.id, form, { time, place: place("S7"), houseSystem }));
    }
  }
}

const package_ = manifest(args.package);
const report = {
  check: `dump ${corpus}`,
  pass: true,
  records: records.length,
  engine: { name: package_.name, version: package_.version },
  node: process.version,
  corpus,
  refused: records.filter((record) => record.refused).length,
  data: records
};
finish(report, args.out);
