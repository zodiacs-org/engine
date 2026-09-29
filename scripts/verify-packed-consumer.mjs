import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

// astronomy-engine 2.1.19 ships ESM in a package without "type": "module"; plain
// Node loads it as ESM only from 20.19.0 on the 20 line and from 22.7.0 on.
const [major, minor] = process.versions.node.split(".").map(Number);
if (!((major === 20 && minor >= 19) || (major === 22 && minor >= 7) || major > 22)) {
  console.error(`Node ${process.version} is outside @zodiacs/engine's supported range (^20.19.0 || >=22.7.0): ` +
    "it would load astronomy-engine's ESM as CommonJS. Use Node 20.19.0, 22.7.0 or later.");
  process.exit(1);
}
const artifactArgument = process.argv[2];
assert(artifactArgument, "Usage: consumer:smoke /absolute/path/to/engine.tgz");
assert(isAbsolute(artifactArgument), "Pass the exact packed artifact as an absolute path.");
const artifact = realpathSync(artifactArgument);
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
// The consumer lives in a fresh temporary directory, removed however the check ends.
const directory = mkdtempSync(join(tmpdir(), "zodiacs-engine-consumer-"));
let report;
try {
// Module resolution walks up the directory tree, so a node_modules above the
// consumer would leak packages into it. Refuse such a location outright.
for (let parent = dirname(directory); ; parent = dirname(parent)) {
  assert(!existsSync(join(parent, "node_modules")),
    `${join(parent, "node_modules")} lies above the temporary consumer; set TMPDIR to a directory with no node_modules above it.`);
  if (dirname(parent) === parent) break;
}
const run = (command, args) =>
  execFileSync(command, args, {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000
  });
writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
// This creates a real consumer dependency tree, with no workspace aliases or
// links. Ignore lifecycle scripts; neither this ESM package nor tsc needs one.
run("npm", [
  "install",
  "--ignore-scripts",
  "--no-audit",
  "--no-fund",
  artifact,
  "typescript@5.9.3"
]);
const installed = JSON.parse(
  readFileSync(join(directory, "node_modules/@zodiacs/engine/package.json"), "utf8")
);
assert.equal(installed.version, manifest.version);
assert.equal(installed.license, "MIT AND CC-BY-4.0");
assert.deepEqual(installed.engines, { node: "^20.19.0 || >=22.7.0" });
assert(
  realpathSync(join(directory, "node_modules/@zodiacs/engine")).startsWith(realpathSync(directory))
);
for (const name of ["LICENSE", "LICENSING.md", "NOTICE"]) {
  assert(readFileSync(join(directory, "node_modules/@zodiacs/engine", name), "utf8").length > 0);
}
writeFileSync(
  join(directory, "consumer.ts"),
  `
import { natalChart, transits, synastry, moonPhase, positions, progressedInstant, progressedBodies, PROGRESSION_DAYS_PER_YEAR, type BodyPosition, type DateInput, type Chart, type BirthInput, type ChartFlag, saturnReturn } from "@zodiacs/engine";
import { chartDeclinations, createAspectPolicy, findConfiguredAspects, eclipticToEquatorial, type AspectPolicy, type ChartDeclinations, type ConfiguredAspectResult } from "@zodiacs/engine";
import { EPHEMERIS_SPAN, SUN_BOUND_LATITUDE, type DeclinationRow } from "@zodiacs/engine";
import { resolveBirth, createGeoNamesClient } from "@zodiacs/engine/geo";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope, natalReplayInput, redactNatalEnvelope } from "@zodiacs/engine/receipt";
import { findLongitudeCrossingsWith, searchLongitudeCrossingsWith, type CrossingSearchResult, type LongitudeCrossing } from "@zodiacs/engine/crossings";
const degreePerDay = (_body: string, date: Date) => (date.getTime() / 86_400_000) % 360;
const passes: LongitudeCrossing[] = findLongitudeCrossingsWith(degreePerDay, "Sun", 1.5, new Date(0), new Date(4 * 86_400_000), 1);
const search: CrossingSearchResult = searchLongitudeCrossingsWith(degreePerDay, "Sun", 1.5, new Date(0), new Date(4 * 86_400_000), {stepDays: 1, maxSamples: 2});
if (search.status === "refused") { const none: [] = search.crossings; void none; }
void passes;
const chart: Chart = natalChart(resolveBirth({date: "2000-02-29", time: "12:00", timeZone: "UTC", latitude: 0, longitude: 180}));
const declinations: ChartDeclinations = chartDeclinations(chart);
const configured: ConfiguredAspectResult = findConfiguredAspects(chart.bodies, createAspectPolicy({aspects: [{type: "quincunx", orb: {applying: 2, separating: 1, stationary: 0.5}}], bodyOrbs: {Moon: 1}}));
const rightAscension: number | null = eclipticToEquatorial(90, 5, 23.4).ra;
const arithmetic: AspectPolicy["conventions"]["arithmetic"] = configured.policy.conventions.arithmetic;
void declinations; void configured; void rightAscension; void arithmetic;
const margin: DeclinationRow["boundMarginArcsec"] = declinations.rows[0].boundMarginArcsec;
const spanStart: -730000 = EPHEMERIS_SPAN.daysFromJ2000.from;
const spanScale: "TT" = EPHEMERIS_SPAN.timeScale;
const sunLatitude: number = SUN_BOUND_LATITUDE;
void margin; void spanStart; void spanScale; void sunLatitude;
transits(chart, "2026-09-07T12:00:00Z");
synastry(chart, { utc: "2001-01-01", timeKnown: false });
moonPhase("2024-04-08T18:21:00Z");
positions(0);
const progressionBirth: DateInput = new Date("2019-12-31T00:00:00Z");
const progressionAt: Date = progressedInstant(progressionBirth, "2020-12-30T05:48:46.080Z");
const progressionRows: BodyPosition[] = progressedBodies(progressionBirth, Date.parse("2020-12-30T05:48:46.080Z"));
const progressionYear: number = PROGRESSION_DAYS_PER_YEAR;
void progressionAt; void progressionRows; void progressionYear;
const places: ReturnType<typeof createGeoNamesClient> = createGeoNamesClient({baseUrl: "https://example.test/cities"});
void places;
const typedFlags: readonly ChartFlag[] = ["dst-gap", "dst-fold", "lmt", "no-time", "polar-fallback"];
const echoed: BirthInput = {utc: "2000-02-29T08:30:00Z", timeKnown: false, flags: [typedFlags[3]]};
const echoChart: Chart = natalChart(echoed);
saturnReturn(echoed);
synastry(echoChart, chart);
const encoded = serializeNatalEnvelope(createNatalEnvelope(chart));
const parsed = parseNatalEnvelope(encoded);
if (parsed.ok) { natalChart(natalReplayInput(parsed.envelope)); redactNatalEnvelope(parsed.envelope); }
`
);
// An explicit project: "types": [] keeps @types packages in parent directories
// out of the check, so only the packed declarations and TypeScript's own
// default library (ES2022 with DOM) are in scope.
writeFileSync(
  join(directory, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: { strict: true, module: "nodenext", moduleResolution: "nodenext", target: "ES2022", noEmit: true, types: [] },
    files: ["consumer.ts"]
  }, null, 2)
);
run(process.execPath, [resolve(directory, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"]);
writeFileSync(
  join(directory, "consumer.mjs"),
  `
import assert from "node:assert/strict";
import { natalChart, positions, transits, synastry, moonPhase, progressedInstant, progressedBodies, PROGRESSION_DAYS_PER_YEAR, ENGINE_VERSION } from "@zodiacs/engine";
import { chartDeclinations, createAspectPolicy, findConfiguredAspects, eclipticToEquatorial, declinationsForBodies, findDeclinationAspects } from "@zodiacs/engine";
import { EPHEMERIS_SPAN, SUN_BOUND_LATITUDE } from "@zodiacs/engine";
import { resolveBirth, createGeoNamesClient } from "@zodiacs/engine/geo";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope, natalReplayInput, redactNatalEnvelope } from "@zodiacs/engine/receipt";
import { findLongitudeCrossingsWith, searchLongitudeCrossingsWith } from "@zodiacs/engine/crossings";
import { searchLongitudeCrossings } from "@zodiacs/engine";
globalThis.fetch = () => { throw new Error("Calculation attempted a network request"); };
const chart = natalChart({utc: "2001-12-21T00:00:00Z", latitude: 78.2232, longitude: 15.6267, houseSystem: "placidus"});
assert.equal(chart.houses.system, "whole");
assert(chart.flags.includes("polar-fallback"));
assert(((chart.angles.asc-chart.angles.mc+360)%360) < 180);
assert.equal(chart.houses.cusps[0], Math.floor(chart.angles.asc/30)*30);
assert.equal(positions("2000-02-29").length, 12);
assert.equal(PROGRESSION_DAYS_PER_YEAR, 365.2422);
assert.equal(progressedInstant("2019-12-31", "2020-12-30T05:48:46.080Z").toISOString(), "2020-01-01T00:00:00.000Z");
assert.deepEqual(progressedBodies("2019-12-31", "2020-12-30T05:48:46.080Z"), positions("2020-01-01"));
assert.throws(() => progressedBodies("2020-01-01", "2023-02-29"), RangeError);
assert(Math.abs(progressedInstant(0, -365.2422 * 86_400_000).getTime() + 86_400_000) <= 1);
const configuredPolicy = createAspectPolicy({bodies: ["Mars", "Saturn"], aspects: [{type: "quincunx", orb: {applying: 2, separating: 0.5, stationary: 0}}], bodyOrbs: {Mars: 1}});
const configured = findConfiguredAspects([{body: "Mars", lon: 0, speed: 0}, {body: "Saturn", lon: 149, speed: 1}], configuredPolicy);
assert.equal(configured.aspects.length, 1);
assert.equal(configured.aspects[0].motion, "applying");
assert.equal(configured.aspects[0].maximumOrb, 1);
assert(Object.isFrozen(configured.policy.aspects[0].orb));
assert(Object.isFrozen(configured.aspects[0]));
const declinations = chartDeclinations(chart);
assert.equal(declinations.rows.length, chart.bodies.length);
assert.equal(declinations.utc, chart.input.utc.toISOString());
assert.deepEqual(declinations.deltaT, chart.deltaT);
assert.equal(declinations.receiptScope, "not-included-in-natal-receipt");
assert.equal(chartDeclinations({...chart.input, deltaT: 1000}).deltaT.seconds, 1000);
assert.deepEqual(chartDeclinations(chart), declinations);
assert(Math.abs(eclipticToEquatorial(90, 5, 23.4).dec - 28.4) < 1e-12);
assert.equal(declinationsForBodies([{body: "Synthetic", lon: 90, lat: 5}], 23.4).rows[0].outOfBounds, true);
// Exact binary decisions: 8 + 2^-50 is outside an 8° conjunction; 6.3 − 314 + 360 − 45 is exactly the double 7.3.
assert.equal(findConfiguredAspects([{body: "Mars", lon: 7.6999999999999895, speed: 1}, {body: "Saturn", lon: 359.7, speed: 0}], createAspectPolicy()).aspects.length, 0);
assert.equal(findConfiguredAspects([{body: "Jupiter", lon: 6.3, speed: 0}, {body: "Sun", lon: 314, speed: 0}], createAspectPolicy({bodies: ["Jupiter", "Sun"], aspects: [{type: "semisquare", orb: 7.3}]})).aspects[0].orb, 7.3);
assert.equal(createAspectPolicy().conventions.arithmetic, "exact-binary64;reported-orb-rounded-half-even");
assert.equal(findDeclinationAspects([{body: "A", lon: 0, lat: 0.1}, {body: "B", lon: 10, lat: 1.1}], 0).length, 0);
// By convention the Sun is not flagged while its latitude is within SUN_BOUND_LATITUDE; its margin is still
// reported. At this solstice the engine puts it 0.19" beyond the bound, where the real Sun is 0.59" inside.
const solstice = chartDeclinations({utc: "2024-06-20T20:51:00Z", latitude: 10, longitude: 20, houseSystem: "placidus"});
const solsticeSun = solstice.rows.find((row) => row.body === "Sun");
assert(Math.abs(solsticeSun.lat) <= SUN_BOUND_LATITUDE);
assert(solsticeSun.boundMarginArcsec > 0 && solsticeSun.boundMarginArcsec < 1);
assert.equal(solsticeSun.outOfBounds, false);
for (const row of solstice.rows.filter((item) => item.body !== "Sun")) {
  assert.equal(row.boundMarginArcsec, (Math.abs(row.dec) - solstice.trueObliquity) * 3600);
  assert.equal(row.outOfBounds, row.boundMarginArcsec > 0);
}
assert.equal(declinationsForBodies([{body: "Sun", lon: 90, lat: 8}], 23.4).rows[0].outOfBounds, true);
// Far from J2000 the ephemeris's own solar latitude passes 0.001°; the chart's Sun is still not flagged.
const farSun = chartDeclinations({utc: "2600-06-21T00:50:56Z", timeKnown: false}).rows.find((row) => row.body === "Sun");
assert(Math.abs(farSun.lat) > SUN_BOUND_LATITUDE && farSun.boundMarginArcsec > 0);
assert.equal(farSun.outOfBounds, false);
// Longitude separations are reduced exactly modulo 360 and rounded once.
assert.equal(findDeclinationAspects([{body: "A", lon: -0.1, lat: 0}, {body: "B", lon: 0.2, lat: 0}], 23.4)[0].separation, 0.30000000000000004);
assert.equal(findDeclinationAspects([{body: "A", lon: -1e-20, lat: 0}, {body: "B", lon: 0, lat: 0}], 23.4)[0].separation, 1e-20);
// Outside astronomy-engine's tabulated years every calculation refuses at once.
assert.deepEqual(EPHEMERIS_SPAN.daysFromJ2000, {from: -730000, to: 730000});
assert.throws(() => positions("4000-01-01"), {name: "RangeError", message: /^The instant is outside the ephemeris span/});
assert.throws(() => natalChart({utc: "0001-01-01"}), {name: "RangeError", message: /^The instant is outside the ephemeris span/});
for (const label of [" Mars", "Mars\\u0000", "x".repeat(200)]) {
  assert.throws(() => declinationsForBodies([{body: label, lon: 0, lat: 0}], 23.4), RangeError);
  assert.throws(() => createAspectPolicy({bodies: [label]}), RangeError);
}
assert.throws(() => progressedBodies(8.64e15, 8.64e15), RangeError);
assert.throws(() => positions(-8.64e15), RangeError);
assert.equal(transits(chart, "2026-09-07T12:00:00Z").positions.length, 12);
assert(synastry(chart, {utc: "2000-01-01", timeKnown: false}).aspects.length > 0);
assert(moonPhase("2024-04-08T18:21:00Z").illumination < 0.001);
const unknown = natalChart(resolveBirth({date: "2000-02-29", timeZone: "UTC", timeKnown: false}));
assert.equal(unknown.angles, null);
assert.equal(unknown.houses, null);
assert(unknown.flags.includes("no-time"));
assert.throws(() => natalChart({utc: "2023-02-29T12:00:00Z"}), RangeError);
assert.throws(() => natalChart({utc: "2000-01-01T12:00:00"}), RangeError);
assert.throws(() => natalChart({utc: "2000-01-01", houseSystem: "unsupported"}), RangeError);
for (const name of ["react", "@zodiacs/sdk"]) {
  assert.throws(() => import.meta.resolve(name), {code: "ERR_MODULE_NOT_FOUND"});
}
let indexRequests = 0;
let shardRequests = 0;
const places = createGeoNamesClient({baseUrl: "https://example.test/cities", fetch: async (url) => {
  if (url.endsWith("/index.json")) {
    indexRequests += 1;
    return indexRequests === 1 ? new Response("Unavailable", {status: 503}) : Response.json({version: 1, source: "Synthetic", count: 1, tz: ["UTC"], admin1: ["Synthetic"], countries: ["Synthetic"], shards: ["n"]});
  }
  assert(url.endsWith("/n.json"));
  shardRequests += 1;
  return shardRequests === 1 ? new Response("{invalid") : Response.json([["New Test City", 0, 0, 0, 1000, 2000, 0, 100]]);
}});
await assert.rejects(places.preload(), {message: "GeoNames fetch failed: 503"});
await assert.rejects(places.searchCities("new"), SyntaxError);
const [first, concurrent] = await Promise.all([places.searchCities("new"), places.searchCities("new t")]);
assert.equal(first[0].name, "New Test City");
assert.equal(first[0].timeZone, "UTC");
assert.deepEqual(first, concurrent);
await places.preload();
await places.searchCities("new");
assert.equal(indexRequests, 2);
assert.equal(shardRequests, 2);
let schemaIndexRequests = 0;
let schemaShardRequests = 0;
const schemaPlaces = createGeoNamesClient({baseUrl: "https://example.test/cities", fetch: async (url) => {
  if (url.endsWith("/index.json")) {
    schemaIndexRequests += 1;
    return Response.json(schemaIndexRequests === 1 ? {error: "Temporary HTTP-200 envelope"} :
      {version: 1, source: "Synthetic", count: 1, tz: ["UTC"], admin1: [""], countries: ["Synthetic"], shards: ["n"]});
  }
  assert(url.endsWith("/n.json"));
  schemaShardRequests += 1;
  return Response.json([["New Test City", 0, schemaShardRequests === 1 ? "__proto__" : 0, 0, 1000, 2000, 0, 100]]);
}});
const schemaFailures = await Promise.allSettled([schemaPlaces.preload(), schemaPlaces.preload()]);
for (const failure of schemaFailures) {
  assert.equal(failure.status, "rejected");
  assert(failure.reason instanceof TypeError);
  assert.equal(failure.reason.message, "Invalid GeoNames index data.");
}
assert.equal(schemaFailures[0].reason, schemaFailures[1].reason);
assert.equal(schemaIndexRequests, 1);
await assert.rejects(schemaPlaces.searchCities("new"), {name: "TypeError", message: "Invalid GeoNames shard data."});
const [schemaFirst, schemaConcurrent] = await Promise.all([schemaPlaces.searchCities("new"), schemaPlaces.searchCities("new t")]);
assert.equal(schemaFirst[0].admin1, "");
assert.equal(schemaFirst[0].timeZone, "UTC");
assert.deepEqual(schemaFirst, schemaConcurrent);
const mutableMetadata = await schemaPlaces.preload();
mutableMetadata.timeZones[0] = "Synthetic/Mutation";
mutableMetadata.shards.length = 0;
assert.deepEqual((await schemaPlaces.preload()).timeZones, ["UTC"]);
assert.deepEqual(await schemaPlaces.searchCities("new"), schemaFirst);
assert.equal(schemaIndexRequests, 2);
assert.equal(schemaShardRequests, 2);
const envelope = createNatalEnvelope(chart, {extensions: {syntheticSecret: "PRIVATE_DIAGNOSTIC_SENTINEL"}});
const encoded = serializeNatalEnvelope(envelope);
const parsed = parseNatalEnvelope(encoded);
assert.equal(parsed.ok, true);
const replayInput = natalReplayInput(parsed.envelope);
assert.equal(replayInput.houseSystem, "placidus");
const replayed = natalChart(replayInput);
assert.deepEqual(replayed.bodies, chart.bodies);
assert.deepEqual(replayed.angles, chart.angles);
assert.deepEqual(replayed.houses, chart.houses);
assert.deepEqual(replayed.flags, chart.flags);
assert.equal(parsed.envelope.extensions.syntheticSecret, "PRIVATE_DIAGNOSTIC_SENTINEL");
const diagnostic = JSON.stringify(redactNatalEnvelope(parsed.envelope));
for (const secret of ["PRIVATE_DIAGNOSTIC_SENTINEL", "2001-12-21", ENGINE_VERSION, "78.2232", "15.6267"]) assert(!diagnostic.includes(secret));
const explicitReference = natalChart(resolveBirth({date: "2000-02-29", time: "08:30", timeZone: "UTC", timeKnown: false}));
const unknownEnvelope = createNatalEnvelope(explicitReference);
assert.equal(unknownEnvelope.receipt.reference, "supplied-instant");
assert.equal(unknownEnvelope.receipt.instant, "2000-02-29T08:30:00.000Z");
assert.equal(natalChart(natalReplayInput(unknownEnvelope)).houses, null);
const echoedUnknown = natalChart({utc: "2000-02-29T08:30:00Z", timeKnown: false, flags: ["no-time", "lmt", "no-time", "lmt"]});
assert.deepEqual(echoedUnknown.input.flags, ["lmt"]);
assert.deepEqual(echoedUnknown.flags, ["lmt", "no-time"]);
const echoedPolar = natalChart({...chart.input, flags: ["polar-fallback", "polar-fallback"]});
assert.deepEqual(echoedPolar.input.flags, []);
assert.deepEqual(echoedPolar.flags, ["polar-fallback"]);
for (const value of [echoedUnknown, echoedPolar]) {
  const parsedEcho = parseNatalEnvelope(serializeNatalEnvelope(createNatalEnvelope(value)));
  assert.equal(parsedEcho.ok, true);
  assert.deepEqual(natalChart(natalReplayInput(parsedEcho.envelope)), value);
}
assert.equal(createNatalEnvelope(echoedUnknown).receipt.instant, "2000-02-29T08:30:00.000Z");
assert.equal(synastry(echoedPolar, echoedUnknown).a, echoedPolar);
const legacy = {...echoedPolar, input: {...echoedPolar.input, flags: ["polar-fallback"]}, flags: ["polar-fallback", "polar-fallback"]};
const normalized = synastry(legacy, echoedUnknown).a;
assert.notEqual(normalized, legacy);
assert.equal(normalized.bodies, legacy.bodies);
assert.equal(normalized.angles, legacy.angles);
assert.equal(normalized.houses, legacy.houses);
assert.equal(normalized.aspects, legacy.aspects);
assert.deepEqual(normalized.input.flags, []);
assert.deepEqual(legacy.flags, ["polar-fallback", "polar-fallback"]);
assert.throws(() => synastry({...echoedPolar, flags: []}, echoedUnknown), RangeError);
let hooks = 0;
const accessorFlags = ["lmt"];
Object.defineProperty(accessorFlags, "0", {get() { hooks++; return "lmt"; }});
for (const flags of [["PRIVATE_FLAG_SENTINEL"], ["dst-gap", "dst-fold"], ["no-time"], ["polar-fallback"], "lmt", new Set(["lmt"]), [null], Array(1), accessorFlags, Array(65).fill("lmt")]) {
  assert.throws(() => natalChart({utc: "2000-01-01", flags}), (error) => error instanceof RangeError && !error.message.includes("PRIVATE_FLAG_SENTINEL"));
}
assert.equal(hooks, 0);
const iterableFlags = ["lmt"];
iterableFlags[Symbol.iterator] = () => { throw new Error("Custom iterator called"); };
assert.deepEqual(natalChart({utc: "2000-01-01", flags: iterableFlags}).flags, ["lmt"]);
let latitudeReads = 0;
const captured = natalChart({utc: "2000-01-01", get latitude() { return ++latitudeReads === 1 ? 0 : 999; }, longitude: 0});
assert.equal(latitudeReads, 1);
assert.equal(captured.input.latitude, 0);
const originalFormatter = Intl.DateTimeFormat;
let intlCalls = 0;
try {
  Intl.DateTimeFormat = function() { intlCalls++; throw new Error("Invalid settings reached Intl"); };
  for (const settings of [{latitude: 91, longitude: 0}, {houseSystem: null}, {timeKnown: null}, {time: null}]) {
    assert.throws(() => resolveBirth({date: "2000-01-01", time: "12:00", timeZone: "UTC", ...settings}), RangeError);
  }
} finally { Intl.DateTimeFormat = originalFormatter; }
assert.equal(intlCalls, 0);
assert.equal(parseNatalEnvelope("{" ).ok, false);
assert.equal(parseNatalEnvelope(" ".repeat(65537)).ok, false);
const degreePerDay = (_body, date) => (date.getTime() / 86_400_000) % 360;
assert.deepEqual(findLongitudeCrossingsWith(degreePerDay, "Sun", 1.5, new Date(0), new Date(4 * 86_400_000), 1).map((crossing) => crossing.retrograde), [false]);
assert.deepEqual(searchLongitudeCrossingsWith(degreePerDay, "Sun", 1.5, new Date(0), new Date(4 * 86_400_000), {stepDays: 1, maxSamples: 2}), {status: "refused", reason: "sample-budget", samples: 0, maxSamples: 2, crossings: []});
assert.equal(searchLongitudeCrossings("Moon", 0, new Date("2000-01-01"), new Date("2007-02-13"), {stepDays: 0.25}).crossings.length, 95);
console.log(JSON.stringify({version: ENGINE_VERSION, configuredAspects: "passed", exactAspectBoundaries: "passed", chartDeclinations: "passed", sunConvention: "passed", boundMargin: "passed", exactSeparation: "passed", ephemerisSpan: "passed", metadata: "passed", bodyLabels: "passed", ephemerisRangeErrors: "passed", crossings: "passed", publicExamples: "passed", errors: "passed", optionalIsolation: "passed", geoRetry: "passed", geoSchemaRecovery: "passed", geoCacheMutationIsolation: "passed", natalEnvelope: "passed", redactedDiagnostic: "passed", typedFlagCompatibility: "passed", derivedEchoReplay: "passed", suppliedChartMetadata: "passed", flagRejections: "passed", scalarSnapshots: "passed", civilSettingsBeforeIntl: "passed"}));
`
);
const result = JSON.parse(run(process.execPath, ["consumer.mjs"]).trim());
report = {
  ...result,
  artifact,
  sha256: createHash("sha256").update(readFileSync(artifact)).digest("hex"),
  runtime: process.version,
  typescript: "5.9.3",
  typeRoots: "none (types: [])",
  directory,
  types: "passed"
};
} finally {
  rmSync(directory, { recursive: true, force: true });
}
console.log(JSON.stringify({ ...report, directoryRemoved: !existsSync(directory) }, null, 2));
