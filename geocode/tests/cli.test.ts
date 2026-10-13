import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadAtlasTimeProvider } from "../src/atlas-time.js";
import { buildGeoNamesIndex } from "../src/build-index.js";
import { createGeocoder, createPlaceLookup, parsePlaceDataset } from "../src/index.js";
import type { GeocodeRequest, PlaceDataset, PlaceRecord } from "../src/index.js";

const project = fileURLToPath(new URL("../", import.meta.url));
const command = join(project, "bin", "geocode.mjs");
const networkGuard = fileURLToPath(new URL("./fixtures/no-network.mjs", import.meta.url));
let suiteDirectory: string;
let unrelatedCwd: string;
let indexDirectory: string;
let standaloneFile: string;
let syntheticFile: string;
let brokenJsonFile: string;
let failedIntl: string;
let dataset: PlaceDataset;

function syntheticPlace(id: string, timeZone: string | null): PlaceRecord {
  return {
    id: `synthetic:${id}`, name: id, asciiName: id, aliases: [],
    countryCode: "ZQ", countryName: "Invented Country", regionCode: "01", regionName: "Invented Region",
    latitude: 12, longitude: 34, elevationMeters: null, demElevationMeters: null,
    population: null, timeZone
  };
}

beforeAll(async () => {
  await mkdir(join(project, ".tmp"), { recursive: true });
  suiteDirectory = await mkdtemp(join(project, ".tmp", "cli-tests-"));
  unrelatedCwd = join(suiteDirectory, "unrelated working directory");
  await mkdir(unrelatedCwd);
  indexDirectory = join(suiteDirectory, "sample index");
  const receipt = JSON.parse(await readFile(join(project, "data", "sample-receipt.json"), "utf8")) as {
    outputs: Array<{ file: string; sha256: string }>;
  };
  function source(file: string) {
    return {
      path: join(project, "data", file), url: "https://download.geonames.org/export/dump/",
      expectedSha256: receipt.outputs.find((entry) => entry.file === file)!.sha256
    };
  }
  const manifest = await buildGeoNamesIndex({
    places: source("geonames-sample.tsv"), countries: source("country-info-sample.tsv"),
    admin1: source("admin1-sample.tsv"), outputDirectory: indexDirectory, maxShardBytes: 8_000
  });
  const places: PlaceRecord[] = [];
  for (const shard of manifest.shards) {
    places.push(...parsePlaceDataset(JSON.parse(await readFile(join(indexDirectory, shard.file), "utf8")) as unknown).places);
  }
  dataset = parsePlaceDataset({ schemaVersion: 1, provenance: manifest.provenance, places });
  standaloneFile = join(suiteDirectory, "standalone.json");
  await writeFile(standaloneFile, JSON.stringify(dataset));
  syntheticFile = join(suiteDirectory, "synthetic.json");
  await writeFile(syntheticFile, JSON.stringify({
    schemaVersion: 1,
    provenance: { dataset: "synthetic", license: "MIT", attribution: "Invented CLI test places", sources: [] },
    places: [
      syntheticPlace("missing-zone", null), syntheticPlace("unknown-zone", "Invented/Unavailable"),
      { ...syntheticPlace("hyphen-name", "Etc/UTC"), name: "-Amber Harbour", asciiName: "-Amber Harbour" }
    ]
  }));
  brokenJsonFile = join(suiteDirectory, "broken.json");
  await writeFile(brokenJsonFile, "{not JSON}");
  failedIntl = join(suiteDirectory, "failed-intl.mjs");
  await writeFile(failedIntl, 'Intl.DateTimeFormat = function () { throw new Error("Synthetic provider failure"); };\n');
});

afterAll(async () => {
  if (suiteDirectory) await rm(suiteDirectory, { recursive: true, force: true });
});

function run(args: readonly string[], preload?: string) {
  const result = spawnSync(process.execPath, [
    "--import", networkGuard, ...(preload ? ["--import", preload] : []), command, ...args
  ], {
    cwd: unrelatedCwd, encoding: "utf8", timeout: 20_000,
    env: { ...process.env, NODE_OPTIONS: "", TZ: "Pacific/Honolulu", TSX_DISABLE_CACHE: "1" }
  });
  if (result.error) throw result.error;
  expect(result.signal).toBeNull();
  return result;
}

function normal(args: readonly string[], status = 0, preload?: string): unknown {
  const result = run(args, preload);
  expect(result.status, result.stderr).toBe(status);
  expect(result.stderr).toBe("");
  expect(result.stdout.endsWith("\n")).toBe(true);
  // One JSON document, with no progress logging mixed into stdout.
  return JSON.parse(result.stdout) as unknown;
}

function failure(args: readonly string[], code: string, status: number, preload?: string) {
  const result = run(args, preload);
  expect(result.status, result.stderr).toBe(status);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr) as unknown).toEqual({ error: { code, message: expect.any(String) } });
  expect(result.stderr).not.toContain("\n    at ");
  return result;
}

function serialized(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

// Every query/date pairing here is invented and unrelated to a person's birth.
// Native resolver comparisons establish CLI parity, not independent accuracy.
describe("offline geocode CLI", () => {
  it("installs a working network guard before the command starts", () => {
    const result = spawnSync(process.execPath, ["--import", networkGuard, "--input-type=module", "-e", `
      import { request } from 'node:https';
      import { connect } from 'node:net';
      import { lookup } from 'node:dns';
      for (const action of [() => fetch('https://example.invalid/'),
        () => request('https://example.invalid/'), () => connect(443, 'example.invalid'),
        () => lookup('example.invalid', () => {})]) {
        try { action(); process.exit(9); }
        catch (error) { if (error.message !== 'Network disabled by geocode CLI test') throw error; }
      }
      process.stdout.write('blocked');
    `], { cwd: unrelatedCwd, encoding: "utf8", timeout: 20_000, env: { ...process.env, NODE_OPTIONS: "" } });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("blocked");
    expect(result.stderr).toBe("");
  });

  it.each([[], ["--help"], ["-h"], ["lookup", "--help"], ["lookup", "-h"], ["tz", "--help"], ["tz", "-h"]].map((args) => [args] as const))(
    "prints usable help without an index: %j", (args) => {
      const result = run(args);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("geocode");
      expect(result.stdout).toContain("--index");
    }
  );

  it.each(["directory", "manifest", "dataset"])("reads a local %s from an unrelated working directory", (kind) => {
    const selected = kind === "directory" ? indexDirectory : kind === "manifest" ? join(indexDirectory, "manifest.json") : standaloneFile;
    const result = normal(["lookup", "Paris, Ile-de-France, France", "--index", relative(unrelatedCwd, selected), "--json"]);
    expect(result).toEqual({
      ...createPlaceLookup(dataset).lookup("Paris, Ile-de-France, France"), provenance: dataset.provenance
    });
  });

  it("defaults to JSON and keeps ambiguity when only one candidate is requested", () => {
    expect(normal(["lookup", "Springfield", "--index", indexDirectory, "--limit", "1"], 4)).toMatchObject({
      status: "ambiguous", total: 3, truncated: true,
      candidates: [{ place: { id: "geonames:4409896" } }], provenance: dataset.provenance
    });
    expect(normal(["lookup", "Springfield", "--index", indexDirectory, "--country", "United States", "--region", "IL"])).toMatchObject({
      status: "unique", total: 1, candidates: [{ place: { id: "geonames:4250542" } }]
    });
  });

  it("accepts equals options and a terminator before a query beginning with a hyphen", () => {
    expect(normal(["lookup", `--index=${syntheticFile}`, "--country=ZQ", "--region=01", "--limit=1", "--", "-Amber Harbour"])).toMatchObject({
      status: "unique", candidates: [{ place: { id: "synthetic:hyphen-name", name: "-Amber Harbour" } }]
    });
    expect(normal(["tz", `--index=${indexDirectory}`, "--place-id=geonames:1283240", "--date=2000-01-01", "--time=08:30"])).toMatchObject({
      status: "time-result", selection: "explicit-id", time: { provider: "iana", status: "ok" }
    });
  });

  it.each(["sa\u0303o paulo, br", "東京, JP", "Longyearbyen, Svalbard, SJ", "McMurdo Station, AQ"])(
    "preserves Unicode and polar records for %s", (query) => {
      expect(normal(["lookup", query, "--index", indexDirectory])).toEqual({
        ...createPlaceLookup(dataset).lookup(query), provenance: dataset.provenance
      });
    }
  );

  it("reports no match without substituting another place", () => {
    expect(normal(["lookup", "Invented Undiscovered Harbour", "--index", indexDirectory], 3)).toMatchObject({
      status: "no-match", candidates: [], total: 0, truncated: false, provenance: dataset.provenance
    });
  });

  it("preserves place selection failures and their separate statuses", () => {
    const suffix = ["--index", indexDirectory, "--date", "2000-01-01", "--time", "12:00"];
    expect(normal(["tz", "Springfield", "--limit", "1", ...suffix], 4)).toMatchObject({
      status: "ambiguous-place", place: null, time: null, lookup: { status: "ambiguous", total: 3, truncated: true }
    });
    expect(normal(["tz", "Invented Undiscovered Harbour", ...suffix], 3)).toMatchObject({ status: "no-match", time: null });
    expect(normal(["tz", "--place-id", "geonames:999999999999999", ...suffix], 3)).toMatchObject({
      status: "unknown-place", lookup: null, place: null, time: null
    });
  });

  it("accepts exact ID selection and preserves a date-only request", () => {
    expect(normal(["tz", "--place-id", "geonames:4250542", "--index", indexDirectory, "--date", "2000-02-29"], 0, failedIntl)).toMatchObject({
      status: "date-only", input: { kind: "date-only", date: "2000-02-29" },
      selection: "explicit-id", place: { id: "geonames:4250542" }, lookup: null, time: null
    });
    expect(normal(["tz", "Springfield", "--country", "US", "--region", "IL", "--index", indexDirectory, "--date", "2000-02-29"])).toMatchObject({
      status: "date-only", selection: "unique-match", place: { id: "geonames:4250542" }, time: null
    });
  });

  it.each([
    ["Brest", "1891-03-20", "12:00", "atlas", "ok", 0],
    ["New York, US", "1918-03-31", "02:30", "atlas", "nonexistent", 4],
    ["New York, US", "1918-10-27", "01:30", "atlas", "ambiguous", 4],
    ["New York, US", "2024-03-10", "02:30", "iana", "nonexistent", 4],
    ["New York, US", "2024-11-03", "01:30", "iana", "ambiguous", 4],
    ["Kathmandu, NP", "2000-01-01", "08:30", "iana", "ok", 0],
    ["Kolkata, IN", "2000-01-01", "08:30", "iana", "ok", 0],
    ["Waitangi, NZ", "2000-01-01", "08:30", "iana", "ok", 0],
    ["Paris, FR", "1920-01-01", "12:00", "iana", "ok", 0]
  ] as const)("preserves %s %s %s with provider %s and status %s", async (query, date, time, provider, status, exit) => {
    const request: GeocodeRequest = { query, date, time };
    const result = normal(["tz", query, "--index", indexDirectory, "--date", date, "--time", time], exit,
      provider === "atlas" ? failedIntl : undefined);
    expect(result).toMatchObject({ status: "time-result", time: { provider, status } });
    const expected = await createGeocoder(dataset, loadAtlasTimeProvider()).resolve(request);
    expect(result).toEqual(serialized(expected));
    if (query === "Brest") {
      expect(result).toMatchObject({ time: { resolution: { instants: [expect.objectContaining({
        uncertainty: expect.objectContaining({ flag: "uncertain" })
      })] } } });
    }
  });

  it.each([["missing-zone", "missing-timezone"], ["unknown-zone", "unsupported-timezone"]])(
    "returns unavailable for %s without assigning an offset", (id, reason) => {
      const result = normal(["tz", "--place-id", `synthetic:${id}`, "--index", syntheticFile,
        "--date", "2000-01-01", "--time", "12:00"], 5);
      expect(result).toMatchObject({ status: "time-result", time: { provider: "iana", status: "unavailable", reason } });
      expect(result).not.toHaveProperty("time.resolution");
      expect(result).not.toHaveProperty("time.offsetMinutes");
    }
  );

  it.each([
    ["unsupported"], ["lookup"], ["tz"], ["lookup", "Paris"], ["tz", "Paris"],
    ["lookup", "Paris", "--unknown"], ["lookup", "Paris", "--json", "--json"],
    ["lookup", "-h", "--help"], ["lookup", "-h", "-h"],
    ["lookup", "Paris", "--country=FR", "--country", "FR"],
    ["lookup", "Paris", "--json=true"],
    ["lookup", "Paris", "--country", "FR", "--country", "FR"],
    ["lookup", "Paris", "--index", "somewhere", "--index", "somewhere"],
    ["lookup", "Paris", "--country"], ["lookup", "Paris", "--country", "--json"],
    ["lookup", "Paris", "--index"], ["lookup", "Paris", "--index", ""],
    ["lookup", "Paris", "--index", "https://example.invalid/index.json"],
    ["lookup", "Paris", "another query"], ["lookup", "Paris", "--date", "2000-01-01"],
    ["lookup", "Paris", "--time", "12:00"], ["lookup", "--place-id", "geonames:2988507"],
    ["tz", "Paris", "--time", "12:00"], ["tz", "Paris", "--date", "2000-01-01", "--time"],
    ["tz", "Paris", "--place-id", "geonames:2988507", "--date", "2000-01-01"],
    ["tz", "--place-id", "geonames:2988507", "--country", "FR", "--date", "2000-01-01"],
    ["tz", "--place-id", "geonames:2988507", "--limit", "1", "--date", "2000-01-01"]
  ].map((args) => [args] as const))("rejects command syntax without polluting stdout: %j", (args) => {
    // Preserve explicit missing-index cases, but exercise every other grammar
    // rejection with an otherwise valid index option.
    const complete = args.length <= 2 || args.includes("--index") ? args : [...args, "--index", indexDirectory];
    failure(complete, "invalid-input", 2);
  });

  it.each(["PRIVATE-query\n", "x".repeat(513), "Paris,,France"])("rejects malformed query case %# on a valid index", (query) => {
    failure(["lookup", query, "--index", indexDirectory], "invalid-input", 2);
  });

  it.each(["", " synthetic:missing-zone", "synthetic:missing-zone\n"])("rejects malformed place ID case %# on a valid index", (id) => {
    failure(["tz", "--place-id", id, "--index", syntheticFile, "--date", "2000-01-01"], "invalid-input", 2);
  });

  it.each([
    ["--country", ""], ["--country", "!!!"], ["--region", "\n"], ["--region", "x".repeat(513)],
    ["--limit", "0"], ["--limit", "101"], ["--limit", "1.5"], ["--limit", "1e1"],
    ["--limit", "Infinity"], ["--limit", "0x10"], ["--limit", "-1"]
  ])("rejects malformed lookup options: %j", (option, value) => {
    const index = option === "--limit" ? join(suiteDirectory, "does-not-exist") : indexDirectory;
    failure(["lookup", "Paris", "--index", index, option!, value!], "invalid-input", 2);
  });

  it.each(["1900-02-29", "2000-04-31", "2000-1-1", "2000-01-01T00:00:00Z"])(
    "rejects malformed civil date %s before loading an index", (date) => {
      failure(["tz", "Absent", "--index", join(suiteDirectory, "does-not-exist"), "--date", date], "invalid-input", 2);
    }
  );

  it.each(["24:00", "12:60", "1:00", "12:00Z", "12:00:00", "12:00+01:00"])(
    "rejects malformed civil time %s before loading an index", (time) => {
      failure(["tz", "Absent", "--index", join(suiteDirectory, "does-not-exist"), "--date", "2000-01-01", "--time", time], "invalid-input", 2);
    }
  );

  it("distinguishes index failures from provider failures", () => {
    for (const index of [join(suiteDirectory, "does-not-exist"), brokenJsonFile]) {
      failure(["lookup", "Paris", "--index", index], "index-error", 1);
    }
    failure(["tz", "Kathmandu", "--index", indexDirectory, "--date", "2000-01-01", "--time", "12:00"],
      "resolution-error", 1, failedIntl);
  });

  it("does not echo submitted queries, filesystem paths or provider exception values in stderr", () => {
    const privateQuery = "PRIVATE-SYNTHETIC-query\n";
    const query = failure(["lookup", privateQuery, "--index", indexDirectory], "invalid-input", 2);
    expect(query.stderr).not.toContain("PRIVATE-SYNTHETIC-query");
    const privatePath = join(suiteDirectory, "PRIVATE-SYNTHETIC-index-path");
    const index = failure(["lookup", "Paris", "--index", privatePath], "index-error", 1);
    expect(index.stderr).not.toContain(privatePath);
    expect(index.stderr).not.toContain("PRIVATE-SYNTHETIC-index-path");
    const provider = failure(["tz", "Kathmandu", "--index", indexDirectory, "--date", "2000-01-01", "--time", "12:00"],
      "resolution-error", 1, failedIntl);
    expect(provider.stderr).not.toContain("Synthetic provider failure");
    expect(provider.stderr).not.toContain(failedIntl);
  });
});
