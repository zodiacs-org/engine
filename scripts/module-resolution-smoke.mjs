import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

import { checkRootIsolation, staticGraph } from "./root-isolation.mjs";

const engine = await import("@zodiacs/engine");
const crossings = await import("@zodiacs/engine/crossings");
const deltat = await import("@zodiacs/engine/deltat");
const geo = await import("@zodiacs/engine/geo");
const receipt = await import("@zodiacs/engine/receipt");
const timing = await import("@zodiacs/engine/timing");
const vedic = await import("@zodiacs/engine/vedic");
const internal = await import("@zodiacs/engine/internal");
const internalMath = await import("@zodiacs/engine/internal/math");

for (const name of [
  "positions",
  "progressedInstant",
  "progressedBodies",
  "natalChart",
  "transits",
  "synastry",
  "moonPhase",
  "saturnReturn",
  "createAspectPolicy",
  "findConfiguredAspects",
  "chartDeclinations",
  "eclipticToEquatorial",
  "findDeclinationAspects"
]) {
  assert.equal(typeof engine[name], "function", `missing root export: ${name}`);
}

// The Vedic API is its own entry; none of it is in the root.
for (const name of [
  "ayanamsa",
  "userAyanamsa",
  "siderealLongitude",
  "declareSiderealLongitude",
  "siderealChart",
  "nakshatraOf",
  "vargaOf",
  "kpLordsOf",
  "vimshottariDasha",
  "dashaSubperiods",
  "vimshottariAt",
  "yoginiDasha",
  "ashtottariDasha"
]) {
  assert.equal(typeof vedic[name], "function", `missing vedic export: ${name}`);
  assert.equal(name in engine, false, `vedic leaked into root: ${name}`);
}
for (const name of ["AYANAMSAS", "NAKSHATRAS", "VARGAS", "KP_SUBS", "YOGINIS", "DASHA_YEAR_DAYS"]) {
  assert.ok(Object.isFrozen(vedic[name]), `vedic ${name} must be frozen`);
  assert.equal(name in engine, false, `vedic leaked into root: ${name}`);
}
assert.equal(vedic.KP_SUBS.length, 249);

// The timing techniques are a separate entry point, absent from the root.
for (const name of [
  "annualProfection",
  "profectionAt",
  "profectionYear",
  "firdaria",
  "firdariaAt",
  "firdariaPeriods",
  "firdariaSequence",
  "releasingPeriods",
  "releasingAt",
  "zodiacalReleasing",
  "zodiacalReleasingAt",
  "solarArc",
  "solarArcDirections",
  "directLongitudes"
]) {
  assert.equal(typeof timing[name], "function", `missing timing export: ${name}`);
  assert.equal(name in engine, false, `timing leaked into root: ${name}`);
}
for (const name of Object.keys(timing)) {
  assert.equal(name in engine, false, `timing leaked into root: ${name}`);
}

// Hellenistic timing: worked examples the unit tests pin, checked again
// through the built package (Valens IV.11; Birchfield's Table 2; Valens IV.10
// on the 255th day of Mercury's period, whose fourth level is Taurus until
// 5 hours before the day ends and Gemini after; Saunders's 42°20′ arc). See
// docs/evidence/timing-hellenistic-2026-09-28/README.md.
assert.deepEqual(timing.annualProfection("virgo", 34), {
  age: 34,
  origin: { point: null, lon: null, sign: "virgo" },
  sign: "cancer",
  ruler: "Moon",
  house: 11
});
assert.deepEqual(
  timing.firdariaPeriods("night", { variant: "bonatti" }).map((period) => period.endAge),
  [9, 20, 32, 39, 42, 44, 54, 62, 75]
);
assert.throws(() => timing.firdariaPeriods("night", { variant: "unknown" }), RangeError);
for (const [days, fourth] of [[1304.5, "taurus"], [1305, "gemini"]]) {
  assert.deepEqual(
    timing.releasingAt("pisces", "2000-01-01", new Date(Date.parse("2000-01-01") + days * 86_400_000)).periods.map((period) => period.sign),
    ["pisces", "gemini", "scorpio", fourth]
  );
}
// Saunders, "Solar Arc Directions" (1996), p. 3, Figure 1: Christopher Reeve (1952-2004), true SA 42°20′.
assert(Math.abs(timing.solarArc("1952-09-25T07:12:00Z", "1995-05-26T06:02:46Z").arc - (42 + 20 / 60)) < 1 / 60);
for (const name of ["TRADITIONAL_RULERS", "VALENS_MINOR_YEARS", "FIRDARIA_YEARS", "RELEASING_UNIT_DAYS", "PROFECTION_MONTH_CONVENTIONS"]) {
  assert.ok(Object.isFrozen(timing[name]), `${name} must be frozen`);
}

for (const name of [
  "createNatalEnvelope",
  "parseNatalEnvelope",
  "serializeNatalEnvelope",
  "natalReplayInput",
  "redactNatalEnvelope"
]) {
  assert.equal(typeof receipt[name], "function", `missing receipt export: ${name}`);
  assert.equal(name in engine, false, `receipt leaked into root: ${name}`);
}

// One crossing solver: the root entry re-exports the crossings entry's
// functions, and the ephemeris-bound wrappers stay in the root.
for (const name of ["findLongitudeCrossingsWith", "searchLongitudeCrossingsWith"]) {
  assert.equal(typeof crossings[name], "function", `missing crossings export: ${name}`);
  assert.equal(engine[name], crossings[name], `root and crossings entry disagree: ${name}`);
}
for (const name of ["findLongitudeCrossings", "searchLongitudeCrossings"]) {
  assert.equal(typeof engine[name], "function", `missing root export: ${name}`);
  assert.equal(name in crossings, false, `ephemeris-bound solver in the crossings entry: ${name}`);
}

// The ΔT model is one module: the root re-exports the dependency-free entry.
for (const name of ["deltaT", "deltaTAt", "DELTA_T_MODEL", "DELTA_T_TABLE"]) {
  assert.ok(name in deltat, `missing deltat export: ${name}`);
  assert.equal(engine[name], deltat[name], `root and deltat entry disagree: ${name}`);
}
assert.ok(Object.isFrozen(deltat.DELTA_T_TABLE), "the ΔT table must be frozen");

// The spans: REFERENCE_SPAN is where positions were compared, EPHEMERIS_SPAN
// where astronomy-engine can evaluate at all; outside it every calculation refuses.
assert.ok(Object.isFrozen(engine.REFERENCE_SPAN) && Object.isFrozen(engine.EPHEMERIS_SPAN), "the spans must be frozen");
assert.deepEqual(engine.EPHEMERIS_SPAN.daysFromJ2000, { from: -730000, to: 730000 });
assert.throws(() => engine.positions("4000-01-01"), (error) => error instanceof RangeError && /outside the ephemeris span/u.test(error.message));
assert.equal(engine.SUN_BOUND_LATITUDE, 0.001);
assert.equal("chartBodyDeclinations" in engine, false, "the chart-only declination helper leaked into the root entry");

assert.equal(engine.PROGRESSION_DAYS_PER_YEAR, 365.2422);
assert.equal(engine.progressedInstant("2019-12-31", "2020-12-30T05:48:46.080Z").toISOString(), "2020-01-01T00:00:00.000Z");
assert.deepEqual(engine.progressedBodies("2019-12-31", "2020-12-30T05:48:46.080Z"), engine.positions("2020-01-01"));

for (const name of [
  "resolveLocalToUtc",
  "resolveLocalBirth",
  "resolveBirth",
  "prepareLocalTime",
  "offsetAt",
  "zoneOffsetAt",
  "createGeoNamesClient",
  "calendarNote",
  "gregorianAdoption",
  "julianToGregorian",
  "gregorianToJulian"
]) {
  assert.equal(typeof geo[name], "function", `missing geo export: ${name}`);
  assert.equal(name in engine, false, `geo leaked into the core entry: ${name}`);
}
assert.equal(geo.TZDB.version, "2025c");
assert.equal(geo.GREGORIAN_ADOPTION.length, 18);
assert.deepEqual(geo.gregorianAdoption("NL"), {
  code: "NL", country: "Netherlands", region: "Holland", firstGregorian: "1583-01-01", lastJulian: "1582-12-21",
  sources: ["tzdb"], note: geo.gregorianAdoption("NL").note
});
assert.deepEqual(Object.keys(geo.GREGORIAN_ADOPTION_SOURCES), ["tzdb", "grotefend-1891", "grotefend-1898"]);
assert.equal(
  geo.resolveLocalToUtc("1917-10-25", "12:00", "Etc/GMT-3", { calendar: "julian" }).utc.toISOString(),
  "1917-11-07T09:00:00.000Z"
);
await geo.prepareLocalTime("1947-07-01", "Europe/Stockholm");
assert.equal(geo.resolveLocalToUtc("1947-07-01", "12:00", "Europe/Stockholm").offsetMinutes, 60);
for (const name of ["bodyLongitude", "longitudeSpeed", "computeBodies", "computeChart"]) {
  assert.equal(typeof internal[name], "function", `missing internal site export: ${name}`);
}
assert.equal(typeof internalMath.computeAngles, "function");
assert.equal(typeof internalMath.findAspects, "function");
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(engine.ENGINE_VERSION, manifest.version);
assert.equal(internalMath.ENGINE_VERSION, manifest.version);
assert.equal("computeChart" in internalMath, false, "ephemeris leaked into internal math entry");

// The optional codec must remain a browser-safe data boundary, and the
// crossing solver must stay free of the ephemeris. Inspect the controlled ESM
// build graph, including shared chunks, without importing the core graph as
// evidence that each entry is isolated.
function checkSelfContained(entry, allowed = []) {
  const visited = new Set();
  const visit = (url) => {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    assert(!/\/tzdb-[^/]*$/u.test(url.pathname), `zone-history shard in the static ${entry} graph`);
    const code = readFileSync(url, "utf8");
    assert(!/\bimport\s*\(/u.test(code), `dynamic import in ${entry} build`);
    for (const match of code.matchAll(/\b(?:from\s*|import\s*)["']([^"']+)["']/gu)) {
      const specifier = match[1];
      if (allowed.includes(specifier)) continue;
      assert(specifier.startsWith("./"), `external dependency in ${entry} build: ${specifier}`);
      const dependency = new URL(specifier, url);
      assert(dependency.href.startsWith(new URL("../dist/", import.meta.url).href));
      visit(dependency);
    }
  };
  visit(new URL(`../dist/${entry}.js`, import.meta.url));
}
checkSelfContained("receipt");
checkSelfContained("crossings");
checkSelfContained("deltat");
// The core entry reaches no zone history and loads nothing lazily; its one
// dependency is the ephemeris.
checkSelfContained("index", ["astronomy-engine"]);

// The root imports no subpath: no module of the timing, Vedic or geo entries,
// and no zone history, is in its static graph. scripts/root-isolation.mjs
// reads the graph from the build's own module list (dist/metafile-esm.json,
// which `npm run build` writes and which must match dist/ byte for byte) and
// from every `// src/...` marker the build writes, whatever the extension.
const distUrl = new URL("../dist/", import.meta.url);
const readBuilt = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const metafile = JSON.parse(readFileSync(new URL("metafile-esm.json", distUrl), "utf8"));
const builtFiles = readdirSync(distUrl).filter((name) => name.endsWith(".js")).map((name) => `dist/${name}`);
const root = checkRootIsolation({ metafile, files: builtFiles, read: readBuilt });
for (const reading of [root.sources, root.held, root.marked]) {
  assert(reading.includes("src/api.ts") && reading.includes("src/ephemeris.ts"), "the build no longer lists or marks its modules' sources");
}
for (const [entry, own] of [["timing", /^src\/timing\//u], ["vedic", /^src\/vedic\//u], ["geo", /^src\/geo\//u]]) {
  const graph = staticGraph({ metafile, read: readBuilt, entryOutput: `dist/${entry}.js`, entrySource: `src/${entry}.ts` });
  for (const reading of [graph.sources, graph.held, graph.marked]) {
    assert(reading.some((source) => own.test(source)), `the ${entry} entry's own modules are not listed or marked`);
  }
}

// The geo entry reaches the zone histories only through dynamic imports, one
// per shard file.
const geoCode = readFileSync(new URL("../dist/geo.js", import.meta.url), "utf8");
const lazy = [...geoCode.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu)].map((match) => match[1]);
assert.equal(lazy.length, 16, "the geo entry should load 16 zone-history shards lazily");
assert(lazy.every((specifier) => /^\.\/tzdb-2025c-\d{2}-[A-Za-z0-9]+\.js$/u.test(specifier)));
console.log(
  "@zodiacs/engine export smoke test passed; receipt, crossings and deltat graphs have no external imports, " +
    `the core graph (${root.sources.length} source modules in the build's module list, ${root.marked.length} marked in ` +
    `${root.outputs.length} files) reaches no timing, Vedic or geo module and no zone history, ` +
    "and the geo entry loads its 16 shards lazily"
);
