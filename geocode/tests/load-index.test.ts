import { createHash } from "node:crypto";
import fsPromises from "node:fs/promises";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGeoNamesIndex, INDEX_FILE_LIMIT } from "../src/build-index.js";
import { parsePlaceDataset } from "../src/dataset.js";
import { IndexLoadError, loadPlaceIndex } from "../src/load-index.js";
import type { PlaceDataset, PlaceRecord } from "../src/types.js";

const temporaryRoot = fileURLToPath(new URL("../.tmp/", import.meta.url));
let directory: string;

function place(id = "amber-harbour"): PlaceRecord {
  return {
    id: `synthetic:${id}`, name: "Imaginary 北 Harbour", asciiName: "Imaginary Harbour", aliases: [],
    countryCode: "ZQ", countryName: "Example Republic", regionCode: null, regionName: null,
    latitude: 12.5, longitude: -45.25, elevationMeters: null, demElevationMeters: 20,
    population: null, timeZone: "Etc/UTC"
  };
}

function dataset(places: readonly PlaceRecord[] = [place()]): PlaceDataset {
  return parsePlaceDataset({
    schemaVersion: 1,
    provenance: {
      dataset: "synthetic", license: "MIT", attribution: "Invented loader test records",
      sources: [{ file: "invented.tsv", url: "https://example.invalid/invented.tsv", sha256: "a".repeat(64) }]
    },
    places
  });
}

function receipt(file: string, bytes: Buffer, count: number) {
  return { file, bytes: bytes.length, count, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function fixture(values: readonly PlaceDataset[] = [dataset()]) {
  const path = join(directory, "index");
  await mkdir(path);
  const shards = [];
  for (const [index, value] of values.entries()) {
    const file = `places-${String(index).padStart(6, "0")}.json`;
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
    await writeFile(join(path, file), bytes);
    shards.push(receipt(file, bytes, value.places.length));
  }
  const manifest = {
    schemaVersion: 1, format: "geocode-index", provenance: dataset().provenance,
    count: values.reduce((total, value) => total + value.places.length, 0),
    transformations: { trimmedLabels: 0, omittedAliases: 0, duplicateAliases: 0 }, shards
  };
  await writeJson(join(path, "manifest.json"), manifest);
  return { path, manifest, manifestPath: join(path, "manifest.json") };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value)}\n`);
}

beforeEach(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "load-index-"));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});

describe("complete local place indexes", () => {
  it("loads a standalone dataset without network access and returns an immutable snapshot", async () => {
    const path = join(directory, "dataset.json");
    const input = dataset();
    await writeJson(path, input);
    const fetch = vi.fn(() => { throw new Error("Unexpected network request"); });
    vi.stubGlobal("fetch", fetch);
    const result = await loadPlaceIndex(path);
    expect(result).toEqual(input);
    expect(fetch).not.toHaveBeenCalled();
    for (const value of [result, result.places, result.places[0], result.places[0]?.aliases,
      result.provenance, result.provenance.sources, result.provenance.sources[0]]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    await writeJson(path, dataset([place("different-place")]));
    expect(result.places[0]?.id).toBe("synthetic:amber-harbour");
    expect((await loadPlaceIndex(path)).places[0]?.id).toBe("synthetic:different-place");
  });

  it("accepts either an index directory or its explicit manifest and retains shard order", async () => {
    const first = dataset([place("z-last")]);
    const second = dataset([place("a-first")]);
    const built = await fixture([first, second]);
    const expected = dataset([...first.places, ...second.places]);
    expect(await loadPlaceIndex(built.path)).toEqual(expected);
    expect(await loadPlaceIndex(built.manifestPath)).toEqual(expected);
    const result = await loadPlaceIndex(built.path);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.places)).toBe(true);
  });

  it("reads actual sample builder output without requiring a full downloaded dump", async () => {
    const data = fileURLToPath(new URL("../data/", import.meta.url));
    const options = {
      places: { path: join(data, "geonames-sample.tsv"), url: "https://example.invalid/places.tsv" },
      countries: { path: join(data, "country-info-sample.tsv"), url: "https://example.invalid/countries.tsv" },
      admin1: { path: join(data, "admin1-sample.tsv"), url: "https://example.invalid/admin1.tsv" },
      outputDirectory: join(directory, "built"), maxShardBytes: 10_000
    };
    const metadata = await buildGeoNamesIndex(options);
    expect(metadata.shards.length).toBeGreaterThan(1);
    const result = await loadPlaceIndex(options.outputDirectory);
    expect(result.places).toHaveLength(metadata.count);
    expect(result.provenance).toEqual(metadata.provenance);
    expect(result.places.some((entry) => entry.id === "geonames:2988507")).toBe(true);
  });

  it("accepts empty datasets and complete empty indexes", async () => {
    const path = join(directory, "empty.json");
    await writeJson(path, dataset([]));
    expect(await loadPlaceIndex(path)).toEqual(dataset([]));
    const built = await fixture([]);
    expect(await loadPlaceIndex(built.path)).toEqual(dataset([]));
  });

  it("compares normalized provenance independently of JSON object key order", async () => {
    const built = await fixture();
    const original = dataset();
    const provenance = original.provenance;
    const bytes = Buffer.from(JSON.stringify({ ...original, provenance: {
      sources: provenance.sources, attribution: provenance.attribution,
      license: provenance.license, dataset: provenance.dataset
    } }));
    const file = built.manifest.shards[0]!.file;
    await writeFile(join(built.path, file), bytes);
    built.manifest.shards[0] = receipt(file, bytes, 1);
    await writeJson(built.manifestPath, built.manifest);
    expect(await loadPlaceIndex(built.path)).toEqual(original);
  });
});

describe("manifest and shard integrity", () => {
  it.each([
    { schemaVersion: 2 }, { format: "other-format" }, { count: 2 }, { count: "1" },
    { count: -1 }, { transformations: { trimmedLabels: -1, omittedAliases: 0, duplicateAliases: 0 } },
    { transformations: { trimmedLabels: 0, omittedAliases: 0 } }, { shards: null },
    { provenance: { dataset: "geonames", license: "MIT", attribution: "Invalid", sources: [] } },
    { extraField: true }
  ])("rejects an invalid manifest field %j", async (changes) => {
    const built = await fixture();
    await writeJson(built.manifestPath, { ...built.manifest, ...changes });
    await expect(loadPlaceIndex(built.path)).rejects.toThrow(IndexLoadError);
  });

  it.each([
    "../places-000000.json", "/places-000000.json", "nested/places-000000.json",
    "nested\\places-000000.json", "C:\\places-000000.json", "https://example.invalid/shard.json",
    "places-000000.json\u0000", "Places-000000.json", "manifest.json"
  ])("rejects unsafe or unsupported shard filename %s", async (file) => {
    const built = await fixture();
    built.manifest.shards[0]!.file = file;
    await writeJson(built.manifestPath, built.manifest);
    await expect(loadPlaceIndex(built.path)).rejects.toThrow(IndexLoadError);
  });

  it.each([
    { bytes: 0 }, { bytes: -1 }, { bytes: INDEX_FILE_LIMIT }, { bytes: "100" },
    { count: 0 }, { count: 1.5 }, { sha256: "a".repeat(63) }, { sha256: "A".repeat(64) }, { extraField: true }
  ])("rejects malformed shard metadata %j", async (changes) => {
    const built = await fixture();
    await writeJson(built.manifestPath, { ...built.manifest, shards: [{ ...built.manifest.shards[0], ...changes }] });
    await expect(loadPlaceIndex(built.path)).rejects.toThrow(IndexLoadError);
  });

  it("refuses repeated shard filenames even when advertised totals agree", async () => {
    const built = await fixture();
    built.manifest.shards.push({ ...built.manifest.shards[0]! });
    built.manifest.count = 2;
    await writeJson(built.manifestPath, built.manifest);
    await expect(loadPlaceIndex(built.path)).rejects.toThrow(IndexLoadError);
  });

  it.each(["digest", "bytes", "count"] as const)("checks each shard's %s against its actual bytes", async (field) => {
    const built = await fixture();
    const shard = built.manifest.shards[0]!;
    if (field === "digest") shard.sha256 = "0".repeat(64);
    else if (field === "bytes") shard.bytes++;
    else { shard.count++; built.manifest.count++; }
    await writeJson(built.manifestPath, built.manifest);
    await expect(loadPlaceIndex(built.path)).rejects.toThrow(IndexLoadError);
  });

  it("rejects a different generation's provenance even when the shard digest is updated", async () => {
    const built = await fixture();
    const original = dataset();
    const bytes = Buffer.from(JSON.stringify({ ...original, provenance: {
      ...original.provenance, sources: [{ ...original.provenance.sources[0], sha256: "b".repeat(64) }]
    } }));
    const file = built.manifest.shards[0]!.file;
    await writeFile(join(built.path, file), bytes);
    built.manifest.shards[0] = receipt(file, bytes, 1);
    await writeJson(built.manifestPath, built.manifest);
    await expect(loadPlaceIndex(built.path)).rejects.toThrow(IndexLoadError);
  });

  it("rejects duplicate place IDs across valid independently hashed shards", async () => {
    const built = await fixture([dataset(), dataset([{ ...place(), name: "Another Settlement" }])]);
    await expect(loadPlaceIndex(built.path)).rejects.toThrow(IndexLoadError);
  });

  it("validates shard record fields even when their byte receipts match", async () => {
    const built = await fixture();
    const bytes = Buffer.from(JSON.stringify({ ...dataset(), places: [{ ...place(), latitude: 91 }] }));
    const file = built.manifest.shards[0]!.file;
    await writeFile(join(built.path, file), bytes);
    built.manifest.shards[0] = receipt(file, bytes, 1);
    await writeJson(built.manifestPath, built.manifest);
    await expect(loadPlaceIndex(built.path)).rejects.toThrow(IndexLoadError);
  });
});

describe("bounded local file reads", () => {
  it("refuses incomplete indexes and missing files without exposing their local path", async () => {
    const marker = "invented-private-path-726304";
    const path = join(directory, marker);
    for (const input of [path, "", "https://example.invalid/no-network.json"]) {
      await expect(loadPlaceIndex(input)).rejects.toMatchObject({
        name: "IndexLoadError", message: "Unable to load a valid local place index."
      });
    }
    await mkdir(path);
    await expect(loadPlaceIndex(path)).rejects.toThrow(IndexLoadError);
    const built = await fixture();
    await rm(join(built.path, built.manifest.shards[0]!.file));
    await expect(loadPlaceIndex(built.path)).rejects.toThrow(IndexLoadError);
  });

  it.each(["{invalid-private-json", "[]", "null", "{}"])("rejects invalid standalone JSON %s", async (text) => {
    const path = join(directory, "bad.json");
    await writeFile(path, text);
    await expect(loadPlaceIndex(path)).rejects.toMatchObject({
      name: "IndexLoadError", message: "Unable to load a valid local place index."
    });
  });

  it("rejects invalid UTF-8 without replacing it inside a valid record", async () => {
    const path = join(directory, "invalid-utf8.json");
    const bytes = Buffer.from(JSON.stringify(dataset()));
    bytes[bytes.indexOf(Buffer.from("北"))] = 0xff;
    await writeFile(path, bytes);
    await expect(loadPlaceIndex(path)).rejects.toThrow(IndexLoadError);
  });

  it("reads valid JSON immediately below the exclusive per-file byte limit", async () => {
    const path = join(directory, "large.json");
    const text = JSON.stringify(dataset());
    const bytes = Buffer.alloc(INDEX_FILE_LIMIT - 1, 32);
    bytes.write(text);
    await writeFile(path, bytes);
    expect((await lstat(path)).size).toBe(INDEX_FILE_LIMIT - 1);
    expect(await loadPlaceIndex(path)).toEqual(dataset());
  });

  it("refuses a file at the byte limit before reading its contents", async () => {
    const path = join(directory, "over-limit.json");
    await writeJson(path, dataset());
    const original = fsPromises.lstat;
    const spy = vi.spyOn(fsPromises, "lstat").mockImplementation(async (file, settings) => {
      const stat = await original(file, settings);
      if (file === path) Object.defineProperty(stat, "size", { value: INDEX_FILE_LIMIT });
      return stat;
    });
    syncBuiltinESMExports();
    try {
      await expect(loadPlaceIndex(path)).rejects.toThrow(IndexLoadError);
    } finally {
      spy.mockRestore();
      syncBuiltinESMExports();
    }
    expect((await readFile(path)).length).toBeLessThan(INDEX_FILE_LIMIT);
  });

  it("refuses symlink roots, manifests and shards", async () => {
    const built = await fixture();
    const link = join(directory, "linked-index");
    await symlink(built.path, link);
    await expect(loadPlaceIndex(link)).rejects.toThrow(IndexLoadError);
    const manifestLink = join(directory, "linked-manifest.json");
    await symlink(built.manifestPath, manifestLink);
    await expect(loadPlaceIndex(manifestLink)).rejects.toThrow(IndexLoadError);
    const file = join(built.path, built.manifest.shards[0]!.file);
    const real = join(directory, "real-shard.json");
    await writeFile(real, await readFile(file));
    await rm(file);
    await symlink(real, file);
    await expect(loadPlaceIndex(built.path)).rejects.toThrow(IndexLoadError);
  });

  it("refuses a directory in place of a shard", async () => {
    const built = await fixture();
    const file = join(built.path, built.manifest.shards[0]!.file);
    await rm(file);
    await mkdir(file);
    await expect(loadPlaceIndex(built.path)).rejects.toThrow(IndexLoadError);
  });
});
