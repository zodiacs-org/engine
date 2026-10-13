import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildGeoNamesIndex } from "../src/build-index.js";
import { parsePlaceDataset } from "../src/dataset.js";
import type { PlaceRecord } from "../src/types.js";

interface SampleReceipt {
  schemaVersion: number;
  license: string;
  licenseUrl: string;
  attribution: string;
  upstream: Array<{
    file: string;
    url: string;
    sha256: string;
    archiveMember?: string;
    memberSha256?: string;
    selectedKeys: string[];
  }>;
  outputs: Array<{ file: string; sha256: string; bytes: number; rows: number }>;
}

const project = fileURLToPath(new URL("../", import.meta.url));
const data = join(project, "data");
const receipt = JSON.parse(readFileSync(join(data, "sample-receipt.json"), "utf8")) as SampleReceipt;
const sampleFiles = ["geonames-sample.tsv", "admin1-sample.tsv", "country-info-sample.tsv"] as const;
const selectedIds = [
  "184745", "1275004", "1283240", "1850147", "2078025", "2729907", "2973783", "2988507",
  "3030300", "3448439", "4032804", "4250542", "4409896", "4951788", "5128581", "13664897"
];

function rows(file: string): string[][] {
  return readFileSync(join(data, file), "utf8").split(/\r?\n/u).filter(Boolean).map((row) => row.split("\t"));
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function nullableNumber(value: string): number | null {
  return value === "" ? null : Number(value);
}

const rawPlaces = rows("geonames-sample.tsv");
let temporaryDirectory: string;
let builtPlaces: readonly PlaceRecord[];

beforeAll(async () => {
  await mkdir(join(project, ".tmp"), { recursive: true });
  temporaryDirectory = await mkdtemp(join(project, ".tmp", "sample-test-"));
  const outputDirectory = join(temporaryDirectory, "index");
  function source(file: typeof sampleFiles[number]) {
    const entry = receipt.outputs.find((output) => output.file === file)!;
    return {
      path: join(data, file),
      // This is the source publisher; the local selection receipt identifies each input.
      url: "https://download.geonames.org/export/dump/",
      expectedSha256: entry.sha256
    };
  }
  const manifest = await buildGeoNamesIndex({
    places: source("geonames-sample.tsv"),
    admin1: source("admin1-sample.tsv"),
    countries: source("country-info-sample.tsv"),
    outputDirectory,
    maxShardBytes: 8_000
  });
  const places: PlaceRecord[] = [];
  for (const shard of manifest.shards) {
    const bytes = await readFile(join(outputDirectory, shard.file));
    expect(bytes.byteLength).toBe(shard.bytes);
    expect(sha256(bytes)).toBe(shard.sha256);
    const dataset = parsePlaceDataset(JSON.parse(bytes.toString("utf8")) as unknown);
    expect(dataset.provenance).toEqual(manifest.provenance);
    expect(dataset.places).toHaveLength(shard.count);
    places.push(...dataset.places);
  }
  expect(places).toHaveLength(manifest.count);
  builtPlaces = places;
});

afterAll(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("attributed GeoNames sample", () => {
  it("binds every committed raw sample to the receipt's exact bytes, digest and row count", () => {
    expect(receipt.schemaVersion).toBe(1);
    expect(receipt.license).toBe("CC-BY-4.0");
    expect(receipt.licenseUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(receipt.attribution).toContain("https://www.geonames.org/");
    expect(receipt.outputs.map((output) => output.file).sort()).toEqual([...sampleFiles].sort());
    for (const file of sampleFiles) {
      const bytes = readFileSync(join(data, file));
      const output = receipt.outputs.find((entry) => entry.file === file)!;
      expect(bytes.byteLength).toBe(output.bytes);
      expect(bytes.byteLength).toBeLessThan(2_000_000);
      expect(sha256(bytes)).toBe(output.sha256);
      expect(rows(file)).toHaveLength(output.rows);
      for (const row of rows(file)) expect(row).toHaveLength(file === "admin1-sample.tsv" ? 4 : 19);
    }
    for (const source of receipt.upstream) {
      expect(source.url).toBe(`https://download.geonames.org/export/dump/${source.file}`);
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/u);
      if (source.archiveMember) expect(source.memberSha256).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it("matches the explicit place selection and both metadata subsets to upstream receipt keys", () => {
    const placeKeys = receipt.upstream.filter((source) => source.archiveMember).flatMap((source) => source.selectedKeys);
    expect(placeKeys.sort((a, b) => Number(a) - Number(b))).toEqual(selectedIds);
    expect(rawPlaces.map((row) => row[0])).toEqual(selectedIds);
    expect(new Set(placeKeys).size).toBe(placeKeys.length);
    for (const [file, input] of [
      ["admin1-sample.tsv", "admin1CodesASCII.txt"],
      ["country-info-sample.tsv", "countryInfo.txt"]
    ]) {
      expect(rows(file!).map((row) => row[0])).toEqual(receipt.upstream.find((source) => source.file === input)!.selectedKeys);
    }
    expect(builtPlaces.map((place) => place.id)).toEqual(selectedIds.map((id) => `geonames:${id}`));
  });

  it("preserves the source coordinates, names, timezone identifiers and distinct height fields", () => {
    const countries = new Map(rows("country-info-sample.tsv").map((row) => [row[0], row[4]]));
    const regions = new Map(rows("admin1-sample.tsv").map((row) => [row[0], row[1]]));
    expect(builtPlaces).toEqual(rawPlaces.map((row) => ({
      id: `geonames:${row[0]}`,
      name: row[1],
      asciiName: row[2],
      aliases: row[3] === "" ? [] : [...new Set(row[3]!.split(","))].sort(),
      countryCode: row[8],
      countryName: countries.get(row[8]),
      regionCode: row[10] || null,
      regionName: regions.get(`${row[8]}.${row[10]}`) ?? null,
      latitude: Number(row[4]),
      longitude: Number(row[5]),
      population: nullableNumber(row[14]!),
      elevationMeters: nullableNumber(row[15]!),
      demElevationMeters: nullableNumber(row[16]!),
      timeZone: row[17] || null
    })));
    expect(builtPlaces.some((place) => place.elevationMeters === null && place.demElevationMeters !== null)).toBe(true);
    const kathmandu = builtPlaces.find((place) => place.id === "geonames:1283240")!;
    expect(kathmandu.elevationMeters).not.toBe(kathmandu.demElevationMeters);
    expect(builtPlaces.some((place) => place.aliases.some((alias) => /[^\u0000-\u007f]/u.test(alias)))).toBe(true);
  });

  it("supplies known-city and ambiguous-name fixtures for invented lookup scenarios", () => {
    expect(builtPlaces.map((place) => place.name)).toEqual(expect.arrayContaining([
      "Paris", "Brest", "Strasbourg", "New York City", "Kathmandu", "Kolkata", "Adelaide", "São Paulo", "Tokyo", "Nairobi"
    ]));
    expect(builtPlaces.filter((place) => place.name === "Springfield").map((place) => [place.countryCode, place.regionCode])).toEqual([
      ["US", "IL"], ["US", "MO"], ["US", "MA"]
    ]);
    const zones = new Map(builtPlaces.map((place) => [place.name, place.timeZone]));
    expect(zones.get("Kathmandu")).toBe("Asia/Kathmandu");
    expect(zones.get("Kolkata")).toBe("Asia/Kolkata");
    expect(zones.get("Adelaide")).toBe("Australia/Adelaide");
    expect(zones.get("Waitangi")).toBe("Pacific/Chatham");
    expect(builtPlaces.find((place) => place.name === "Longyearbyen")).toMatchObject({ timeZone: "Arctic/Longyearbyen" });
    expect(builtPlaces.find((place) => place.name === "Longyearbyen")!.latitude).toBeGreaterThan(66);
    expect(builtPlaces.find((place) => place.name === "McMurdo Station")).toMatchObject({ timeZone: "Antarctica/McMurdo" });
    expect(builtPlaces.find((place) => place.name === "McMurdo Station")!.latitude).toBeLessThan(-66);
  });

  it("retains source identifiers that join covered sample cities to the existing atlas", () => {
    const atlas = JSON.parse(readFileSync(new URL("../../atlas/data/places.json", import.meta.url), "utf8")) as {
      places: Array<{ id: string; geonamesId: number; tzdbZone: string }>;
    };
    const matches = builtPlaces.flatMap((place) => {
      const covered = atlas.places.find((entry) => `geonames:${entry.geonamesId}` === place.id);
      if (!covered) return [];
      expect(place.timeZone).toBe(covered.tzdbZone);
      return [[place.id, covered.id]];
    });
    expect(matches).toEqual([
      ["geonames:2973783", "fr-strasbourg"],
      ["geonames:2988507", "fr-paris"],
      ["geonames:3030300", "fr-brest"],
      ["geonames:5128581", "us-new-york"]
    ]);
    // This checks identifier preservation only; precedence and time routing come later.
  });
});
