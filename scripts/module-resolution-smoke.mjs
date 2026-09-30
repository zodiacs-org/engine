import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

import { checkRootIsolation, staticGraph } from "./root-isolation.mjs";

const engine = await import("@zodiacs/engine");
const calc = await import("@zodiacs/engine/calc");
const crossings = await import("@zodiacs/engine/crossings");
const deltat = await import("@zodiacs/engine/deltat");
const geo = await import("@zodiacs/engine/geo");
const houses = await import("@zodiacs/engine/houses");
const receipt = await import("@zodiacs/engine/receipt");
const techniques = await import("@zodiacs/engine/techniques");
const timing = await import("@zodiacs/engine/timing");
const vedic = await import("@zodiacs/engine/vedic");
const window = await import("@zodiacs/engine/window");
const sky = await import("@zodiacs/engine/sky");
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
  "directLongitudes",
  "planetaryReturns"
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

// The techniques moved from Zodiacs.org are a separate entry point, absent from the root.
for (const name of [
  "solarReturnInstant",
  "mostRecentSolarReturnInstant",
  "lunarReturnInstant",
  "solarReturn",
  "lunarReturn",
  "compositeMidpoints",
  "compositeAspects",
  "compositeChart",
  "davisonChart",
  "davisonPlace",
  "moonIngresses",
  "moonAspects",
  "voidOfCourseWindows",
  "voidOfCourseAt",
  "aspectPatterns",
  "chartAspectPatterns",
  "patternContainment",
  "dignityFor",
  "dignitiesFor",
  "hasClassicalDignities",
  "dignityRulersAt",
  "essentialDignities",
  "mutualReceptions",
  "moonSignCandidates",
  "moonSignsBetween"
]) {
  assert.equal(typeof techniques[name], "function", `missing techniques export: ${name}`);
}
for (const name of Object.keys(techniques)) {
  assert.equal(name in engine, false, `techniques leaked into root: ${name}`);
}
for (const name of ["VOID_BODIES", "VOID_OF_COURSE_CONVENTION", "PATTERN_BODIES", "EGYPTIAN_TERMS", "CHALDEAN_FACES", "TRIPLICITY_LORDS", "EVERY_ZONE_OFFSETS"]) {
  assert.ok(Object.isFrozen(techniques[name]), `techniques ${name} must be frozen`);
}
// Worked examples the unit tests pin, checked again through the built package:
// Lilly's three receptions (Christian Astrology, 1647, p. 112), a grand trine,
// the site's composite case, the every-time-zone span of a date, and the
// Egyptian terms of Aries (Tetrabiblos I.20). See docs/techniques.md.
assert.deepEqual(techniques.mutualReceptions([{ body: "Sun", lon: 15 }, { body: "Mars", lon: 135 }]), [
  { a: "Sun", b: "Mars", aReceivesB: ["domicile"], bReceivesA: ["domicile"] }
]);
assert.deepEqual(
  techniques.mutualReceptions([{ body: "Venus", lon: 10 }, { body: "Sun", lon: 40 }], { dignities: ["triplicity"], sect: "day" }),
  [{ a: "Sun", b: "Venus", aReceivesB: ["triplicity"], bReceivesA: ["triplicity"] }]
);
assert.deepEqual(
  techniques.mutualReceptions([{ body: "Venus", lon: 23.5 }, { body: "Mars", lon: 75.5 }], { dignities: ["term"] }).map((row) => row.aReceivesB),
  [["term"]]
);
assert.throws(() => techniques.mutualReceptions([], { dignities: ["triplicity"] }), RangeError);
const trine = [{ body: "Mercury", lon: 0 }, { body: "Venus", lon: 120 }, { body: "Mars", lon: 240 }];
assert.deepEqual(
  techniques.aspectPatterns(trine, [
    { a: "Mercury", b: "Venus", type: "trine", orb: 0 },
    { a: "Mercury", b: "Mars", type: "trine", orb: 0 },
    { a: "Venus", b: "Mars", type: "trine", orb: 0 }
  ]).patterns.map((pattern) => pattern.id),
  ["grand-trine:Mercury,Venus,Mars"]
);
assert.deepEqual(techniques.compositeMidpoints([{ body: "Sun", lon: 359 }], [{ body: "Sun", lon: 1 }]), [{ body: "Sun", lon: 0 }]);
const untimed = techniques.moonSignCandidates("2000-04-11");
assert.deepEqual([untimed.from.toISOString(), untimed.to.toISOString()], ["2000-04-10T10:00:00.000Z", "2000-04-12T11:59:59.999Z"]);
assert.deepEqual(techniques.EGYPTIAN_TERMS.aries, [["Jupiter", 6], ["Venus", 12], ["Mercury", 20], ["Mars", 25], ["Saturn", 30]]);
assert.equal(techniques.VOID_OF_COURSE_CONVENTION.name, "last-exact-ptolemaic-aspect-to-sign-exit");

// House positions, co-ascendants and speeds are their own entry, absent from the root.
assert.deepEqual(Object.keys(houses).sort(), ["SIDEREAL_RATE", "coAscendants", "housePosition", "houseSpeeds"]);
for (const name of Object.keys(houses)) {
  assert.equal(name in engine, false, `houses leaked into root: ${name}`);
}
assert.equal(houses.SIDEREAL_RATE, 360.98564736629);
{
  const input = { gastHours: 0.5, latitude: 55, longitude: 0, obliquity: 23.4392911 };
  const angles = engine.computeAngles(input);
  const cusps = engine.computeHouses("regiomontanus", input, angles).houses.cusps;
  cusps.forEach((cusp, index) => {
    const position = houses.housePosition("regiomontanus", input, { lon: cusp });
    assert(Math.abs(((position - 1 - index + 18) % 12) - 6) < 1e-9, `regiomontanus cusp ${index + 1} is not at its house`);
  });
  assert.equal(houses.coAscendants(input).equatorialAscendant, engine.eastPointOf(input));
  assert.equal(houses.houseSpeeds("placidus", input).cusps.length, 12);
}
// Planetary returns are in the timing entry: an invented chart's Jupiter,
// direct, retrograde and direct over its natal degree in 2037-38 (as JPL
// Horizons has it; src/timing/fixtures/planetary-returns-horizons.json).
{
  const jupiter = timing.planetaryReturns({ utc: "2025-10-26T23:39:00Z" }, "Jupiter", "2037-08-01", "2038-07-31");
  assert.equal(jupiter.status, "complete");
  assert.deepEqual(jupiter.returns.map((row) => [row.retrograde, row.pass]), [[false, 1], [true, 1], [false, 1]]);
}
// Rise, set, transits and planetary hours are their own entry, absent from the
// root. A worked example the unit tests pin is checked again through the built
// package (docs/sky.md).
for (const name of ["skyEvents", "skyEventsOn", "planetaryHours", "planetaryHourAt"]) {
  assert.equal(typeof sky[name], "function", `missing sky export: ${name}`);
  assert.equal(name in engine, false, `sky leaked into root: ${name}`);
}
for (const name of ["PLANETARY_DAY_RULERS", "SKY_RADII_KM"]) assert.ok(Object.isFrozen(sky[name]), `${name} must be frozen`);
assert.equal(sky.CHALDEAN_ORDER, timing.CHALDEAN_ORDER, "one Chaldean order for the sky and timing entries");
{
  // Heindel (1919): latitude 40, a Thursday in December, Mars from 1:32 to 2:18 P.M.
  const { hour } = sky.planetaryHourAt({ latitude: 40, longitude: -75 }, "2025-12-18T19:00:00Z", { utcOffsetMinutes: -300 });
  assert.equal(hour.ruler, "Mars");
  assert.ok(Math.abs(hour.start.getTime() - Date.parse("2025-12-18T18:32:00Z")) <= 300_000);
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

// The uniform calculation API is its own entry point: the root neither
// re-exports it nor loads its code (checked on the build graph below).
for (const name of ["calc", "houses", "events", "chart"]) {
  assert.equal(typeof calc[name], "function", `missing calc export: ${name}`);
  assert.equal(name in engine, false, `calc leaked into root: ${name}`);
}
const sun = calc.calc({ body: "Sun", time: "2020-01-01" });
assert.equal(sun.status, "ok");
assert.equal(sun.lon, engine.positions("2020-01-01")[0].lon);
assert.equal(calc.calc({ body: "Moon", time: "2020-01-01", zodiac: { sidereal: "lahiri" } }).reason, "not-in-this-version");

// Birth-time windows are their own entry, so the root entry does not grow.
assert.equal(typeof window.birthWindow, "function", "missing window export: birthWindow");
assert.equal(window.WINDOW_VERIFICATION, "sampled at one-second resolution");
assert.ok(Object.isFrozen(window.WINDOW_RATE_BOUNDS), "window rate bounds must be frozen");
assert.equal(new window.WindowBudgetError().name, "WindowBudgetError");
for (const name of ["birthWindow", "WINDOW_RATE_BOUNDS", "WINDOW_VERIFICATION", "MAX_WINDOW_MS", "WindowBudgetError"]) {
  assert.equal(name in engine, false, `window leaked into the root entry: ${name}`);
}

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
// The houses entry is one file: it imports nothing, the root's modules included.
checkSelfContained("houses-extra");
assert(!/^(?:import|export)\s[^;]*?\bfrom\s*["']/mu.test(readFileSync(new URL("../dist/houses-extra.js", import.meta.url), "utf8")),
  "the houses entry imports a module");
checkSelfContained("crossings");
checkSelfContained("deltat");
// The core entry reaches no zone history and loads nothing lazily; its one
// dependency is the ephemeris.
checkSelfContained("index", ["astronomy-engine"]);

// The root imports no subpath: no module of an opt-in entry (timing, Vedic,
// geo, calc, window, techniques, houses or sky), and no zone history, is in
// its static graph (OPT_IN_SOURCE in scripts/root-isolation.mjs). That script
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
for (const [entry, own] of [
  ["timing", /^src\/timing\//u],
  ["vedic", /^src\/vedic\//u],
  ["geo", /^src\/geo\//u],
  ["calc", /^src\/calc-[a-z]+\.ts$/u],
  ["window", /^src\/window-ranges\.ts$/u],
  ["techniques", /^src\/techniques\//u],
  ["houses-extra", /^src\/houses-extra\.ts$/u],
  ["sky", /^src\/sky\//u]
]) {
  const graph = staticGraph({ metafile, read: readBuilt, entryOutput: `dist/${entry}.js`, entrySource: `src/${entry}.ts` });
  for (const reading of [graph.sources, graph.held, graph.marked]) {
    assert(reading.some((source) => own.test(source)), `the ${entry} entry's own modules are not listed or marked`);
  }
}

// The geo entry reaches the zone histories only through dynamic imports, one
// per shard file. Since ./techniques shares the local-time code, that code,
// and so the imports, can sit in a chunk of the geo entry's static graph.
const outputsOf = (entry) =>
  staticGraph({ metafile, read: readBuilt, entryOutput: `dist/${entry}.js`, entrySource: `src/${entry}.ts` }).outputs;
const lazy = outputsOf("geo").flatMap((file) =>
  [...readBuilt(file).matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu)].map((match) => match[1])
);
assert.equal(lazy.length, 16, "the geo entry should load 16 zone-history shards lazily");
assert(lazy.every((specifier) => /^\.\/tzdb-2025c-\d{2}-[A-Za-z0-9]+\.js$/u.test(specifier)));
for (const entry of ["geo", "techniques"]) {
  for (const file of outputsOf(entry)) assert(!/(?:^|\/)tzdb-[^/]*$/u.test(file), `zone-history shard in the static ${entry} graph`);
}
console.log(
  "@zodiacs/engine export smoke test passed; receipt, crossings and deltat graphs have no external imports, " +
    `the core graph (${root.sources.length} source modules in the build's module list, ${root.marked.length} marked in ` +
    `${root.outputs.length} files) reaches no module of an opt-in entry and no zone history, ` +
    "and the geo entry loads its 16 shards lazily"
);
