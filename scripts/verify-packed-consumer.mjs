import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const artifactArgument = process.argv[2];
assert(artifactArgument, "Usage: consumer:smoke /absolute/path/to/engine.tgz");
assert(isAbsolute(artifactArgument), "Pass the exact packed artifact as an absolute path.");
const artifact = realpathSync(artifactArgument);
const directory = mkdtempSync(join(tmpdir(), "zodiacs-engine-consumer-"));
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
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
assert(
  realpathSync(join(directory, "node_modules/@zodiacs/engine")).startsWith(realpathSync(directory))
);
for (const name of ["LICENSE", "LICENSING.md", "NOTICE"]) {
  assert(readFileSync(join(directory, "node_modules/@zodiacs/engine", name), "utf8").length > 0);
}
writeFileSync(
  join(directory, "consumer.ts"),
  `
import { natalChart, transits, synastry, moonPhase, positions, type Chart, type BirthInput, type ChartFlag, saturnReturn } from "@zodiacs/engine";
import { resolveBirth, createGeoNamesClient } from "@zodiacs/engine/geo";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope, natalReplayInput, redactNatalEnvelope } from "@zodiacs/engine/receipt";
const chart: Chart = natalChart(resolveBirth({date: "2000-02-29", time: "12:00", timeZone: "UTC", latitude: 0, longitude: 180}));
transits(chart, "2026-09-07T12:00:00Z");
synastry(chart, { utc: "2001-01-01", timeKnown: false });
moonPhase("2024-04-08T18:21:00Z");
positions(0);
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
run(process.execPath, [
  resolve(directory, "node_modules/typescript/bin/tsc"),
  "--strict",
  "--module",
  "nodenext",
  "--target",
  "ES2022",
  "--noEmit",
  "consumer.ts"
]);
writeFileSync(
  join(directory, "consumer.mjs"),
  `
import assert from "node:assert/strict";
import { natalChart, positions, transits, synastry, moonPhase, ENGINE_VERSION } from "@zodiacs/engine";
import { resolveBirth, createGeoNamesClient } from "@zodiacs/engine/geo";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope, natalReplayInput, redactNatalEnvelope } from "@zodiacs/engine/receipt";
globalThis.fetch = () => { throw new Error("Calculation attempted a network request"); };
const chart = natalChart({utc: "2001-12-21T00:00:00Z", latitude: 78.2232, longitude: 15.6267, houseSystem: "placidus"});
assert.equal(chart.houses.system, "whole");
assert(chart.flags.includes("polar-fallback"));
assert(((chart.angles.asc-chart.angles.mc+360)%360) < 180);
assert.equal(chart.houses.cusps[0], Math.floor(chart.angles.asc/30)*30);
assert.equal(positions("2000-02-29").length, 12);
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
console.log(JSON.stringify({version: ENGINE_VERSION, publicExamples: "passed", errors: "passed", optionalIsolation: "passed", geoRetry: "passed", geoSchemaRecovery: "passed", geoCacheMutationIsolation: "passed", natalEnvelope: "passed", redactedDiagnostic: "passed", typedFlagCompatibility: "passed", derivedEchoReplay: "passed", suppliedChartMetadata: "passed", flagRejections: "passed", scalarSnapshots: "passed", civilSettingsBeforeIntl: "passed"}));
`
);
const result = JSON.parse(run(process.execPath, ["consumer.mjs"]).trim());
console.log(
  JSON.stringify(
    {
      ...result,
      artifact,
      sha256: createHash("sha256").update(readFileSync(artifact)).digest("hex"),
      runtime: process.version,
      typescript: "5.9.3",
      directory,
      types: "passed"
    },
    null,
    2
  )
);
