import { createHash } from "node:crypto";
import * as fsPromises from "node:fs/promises";
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGeoNamesIndex, DEFAULT_SHARD_BYTES, INDEX_FILE_LIMIT } from "../src/build-index.js";
import { parsePlaceDataset } from "../src/dataset.js";
import type { PlaceRecord } from "../src/types.js";

type BuilderInput = Parameters<typeof buildGeoNamesIndex>[0];
type BuildOptions = { -readonly [Key in keyof BuilderInput]: BuilderInput[Key] };
type Manifest = Awaited<ReturnType<typeof buildGeoNamesIndex>>;
type SourceKind = "places" | "countries" | "admin1";

const temporaryRoot = fileURLToPath(new URL("../.tmp/", import.meta.url));
let directory: string;

// These are manufactured rows in GeoNames' interchange format, not real places.
function placeRow(fields: Record<number, string> = {}): string {
  const row = [
    "900000000000001", "Amber Harbour", "Amber Harbour", "Amber Haven,Amber Harbour",
    "12.375", "-45.625", "P", "PPL", "ZQ", "", "01", "", "", "",
    "1500", "24", "26", "Etc/UTC", "2024-02-29"
  ];
  for (const [index, value] of Object.entries(fields)) row[Number(index)] = value;
  return row.join("\t");
}

function countryRow(code = "ZQ", name = "Testland"): string {
  return [code, "ZQQ", "999", "", name, "Amber Harbour", "100", "1500", "EU", "",
    "", "", "", "", "", "", "900000000000010", "", ""].join("\t");
}

const adminRow = "ZQ.01\tNorthern Reach\tNorthern Reach\t900000000000011";

function digest(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fixture(
  overrides: Partial<Record<SourceKind, string>> = {},
  folder = "sources"
): Promise<BuildOptions> {
  const inputs = join(directory, folder);
  await mkdir(inputs, { recursive: true });
  const contents = {
    places: `${placeRow()}\n`,
    countries: `# Manufactured country information\n${countryRow()}\n`,
    admin1: `${adminRow}\n`,
    ...overrides
  };
  const names = { places: "places.txt", countries: "countryInfo.txt", admin1: "admin1CodesASCII.txt" };
  const source = {} as Pick<BuildOptions, SourceKind>;
  for (const kind of ["places", "countries", "admin1"] as const) {
    const path = join(inputs, names[kind]);
    await writeFile(path, contents[kind]);
    source[kind] = { path, url: `https://example.invalid/geonames/${names[kind]}` };
  }
  return { ...source, outputDirectory: join(directory, "index") };
}

async function outputFiles(outputDirectory: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const file of (await readdir(outputDirectory)).sort()) {
    files[file] = (await readFile(join(outputDirectory, file))).toString("hex");
  }
  return files;
}

async function records(manifest: Manifest, outputDirectory: string): Promise<PlaceRecord[]> {
  const places: PlaceRecord[] = [];
  for (const shard of manifest.shards) {
    expect(basename(shard.file)).toBe(shard.file);
    const bytes = await readFile(join(outputDirectory, shard.file));
    expect(bytes.byteLength).toBe(shard.bytes);
    expect(bytes.byteLength).toBeLessThan(INDEX_FILE_LIMIT);
    expect(digest(bytes)).toBe(shard.sha256);
    const dataset = parsePlaceDataset(JSON.parse(bytes.toString("utf8")) as unknown);
    expect(dataset.provenance).toEqual(manifest.provenance);
    expect(dataset.places).toHaveLength(shard.count);
    places.push(...dataset.places);
  }
  expect(places).toHaveLength(manifest.count);
  expect(JSON.parse(await readFile(join(outputDirectory, "manifest.json"), "utf8"))).toEqual(manifest);
  return places;
}

async function rejectsAndCleans(options: BuildOptions): Promise<void> {
  await expect(buildGeoNamesIndex(options)).rejects.toThrow();
  await expect(access(options.outputDirectory)).rejects.toThrow();
}

beforeEach(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(join(temporaryRoot, "build-index-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("GeoNames offline index builder", () => {
  it("writes schema-valid records, attribution and independently checked file receipts", async () => {
    const options = await fixture();
    const manifest = await buildGeoNamesIndex(options);
    expect(manifest).toMatchObject({ schemaVersion: 1, format: "geocode-index", count: 1 });
    expect(manifest.transformations).toEqual({ trimmedLabels: 0, omittedAliases: 0, duplicateAliases: 0 });
    expect(manifest.provenance).toMatchObject({ dataset: "geonames", license: "CC-BY-4.0" });
    expect(manifest.provenance.attribution).toMatch(/GeoNames/i);
    expect(manifest.provenance.sources).toHaveLength(3);
    for (const kind of ["places", "countries", "admin1"] as const) {
      const receipt = manifest.provenance.sources.find((entry) => entry.url === options[kind].url);
      expect(receipt?.sha256).toBe(digest(await readFile(options[kind].path)));
    }
    expect(await records(manifest, options.outputDirectory)).toEqual([{
      id: "geonames:900000000000001",
      name: "Amber Harbour",
      asciiName: "Amber Harbour",
      aliases: ["Amber Harbour", "Amber Haven"],
      countryCode: "ZQ",
      countryName: "Testland",
      regionCode: "01",
      regionName: "Northern Reach",
      latitude: 12.375,
      longitude: -45.625,
      elevationMeters: 24,
      demElevationMeters: 26,
      population: 1500,
      timeZone: "Etc/UTC"
    }]);
    expect(JSON.stringify(manifest)).not.toContain(directory);
  });

  it("preserves nullable unknown fields separately from numerical zero and signed heights", async () => {
    const options = await fixture({ places: [
      placeRow({ 3: "", 10: "", 14: "", 15: "", 16: "", 17: "" }),
      placeRow({ 0: "900000000000002", 4: "0", 5: "0", 14: "0", 15: "0", 16: "-32768" }),
      placeRow({ 0: "900000000000003", 10: "99", 15: "-14", 16: "-9999" })
    ].join("\n") });
    const manifest = await buildGeoNamesIndex(options);
    const result = await records(manifest, options.outputDirectory);
    expect(result[0]).toMatchObject({
      aliases: [], regionCode: null, regionName: null, population: null,
      elevationMeters: null, demElevationMeters: null, timeZone: null
    });
    expect(result[1]).toMatchObject({ latitude: 0, longitude: 0, population: 0, elevationMeters: 0, demElevationMeters: -32768 });
    expect(result[2]).toMatchObject({ regionCode: "99", regionName: null, elevationMeters: -14, demElevationMeters: -9999 });
  });

  it("deduplicates exact aliases and orders Unicode by code units without collapsing distinct spellings", async () => {
    const options = await fixture({ places: placeRow({ 3: "é,é,Zulu,amber,Amber,é,Amber,北" }) });
    const manifest = await buildGeoNamesIndex(options);
    const result = await records(manifest, options.outputDirectory);
    expect(result[0]?.aliases).toEqual(["Amber", "Zulu", "amber", "é", "é", "北"]);
    expect(manifest.transformations).toEqual({ trimmedLabels: 0, omittedAliases: 0, duplicateAliases: 2 });
  });

  it("reports explicit label sanitation while preserving the raw input receipts and geographic fields", async () => {
    const options = await fixture({
      places: placeRow({
        1: " Amber  Harbour ", 2: "\u00a0Amber Harbour\u3000",
        3: " Amber Haven ,Amber Haven,,  ,Bad\u0000Alias, Good ,Good,Different,Bad\u0085Alias"
      }),
      countries: countryRow("ZQ", "\u00a0Testland "),
      admin1: "ZQ.01\t Northern Reach \tNorthern Reach\t900000000000011"
    });
    const manifest = await buildGeoNamesIndex(options);
    expect(manifest.transformations).toEqual({ trimmedLabels: 7, omittedAliases: 4, duplicateAliases: 2 });
    expect(await records(manifest, options.outputDirectory)).toEqual([{
      id: "geonames:900000000000001", name: "Amber  Harbour", asciiName: "Amber Harbour",
      aliases: ["Amber Haven", "Different", "Good"], countryCode: "ZQ", countryName: "Testland",
      regionCode: "01", regionName: "Northern Reach", latitude: 12.375, longitude: -45.625,
      elevationMeters: 24, demElevationMeters: 26, population: 1500, timeZone: "Etc/UTC"
    }]);
    for (const kind of ["places", "countries", "admin1"] as const) {
      const receipt = manifest.provenance.sources.find((entry) => entry.url === options[kind].url);
      expect(receipt?.sha256).toBe(digest(await readFile(options[kind].path)));
    }
  });

  it("does not count an absent alias field as an omitted alias", async () => {
    const options = await fixture({ places: placeRow({ 3: "" }) });
    const manifest = await buildGeoNamesIndex(options);
    expect(manifest.transformations).toEqual({ trimmedLabels: 0, omittedAliases: 0, duplicateAliases: 0 });
    expect((await records(manifest, options.outputDirectory))[0]?.aliases).toEqual([]);
  });

  it("filters non-populated features while preserving source order across the retained records", async () => {
    const options = await fixture({ places: [
      placeRow({ 0: "900000000000003", 1: "Second by Name" }),
      placeRow({ 0: "900000000000002", 6: "H", 7: "STM" }),
      placeRow({ 0: "900000000000001", 1: "First by Name" })
    ].join("\n") });
    const manifest = await buildGeoNamesIndex(options);
    expect((await records(manifest, options.outputDirectory)).map((entry) => entry.id)).toEqual([
      "geonames:900000000000003", "geonames:900000000000001"
    ]);
  });

  it("accepts coordinate limits and a Gregorian leap day without rounding source coordinates", async () => {
    const options = await fixture({ places: [
      placeRow({ 4: "90", 5: "-180", 18: "2000-02-29" }),
      placeRow({ 0: "900000000000002", 4: "-90", 5: "180", 18: "2024-12-31" }),
      placeRow({ 0: "900000000000003", 4: "12.123456789", 5: "-45.987654321" })
    ].join("\n") });
    const manifest = await buildGeoNamesIndex(options);
    expect((await records(manifest, options.outputDirectory)).map(({ latitude, longitude }) => [latitude, longitude])).toEqual([
      [90, -180], [-90, 180], [12.123456789, -45.987654321]
    ]);
  });

  it("handles CRLF and the final line without a newline, hashing original bytes", async () => {
    const options = await fixture({
      places: `${placeRow()}\r\n${placeRow({ 0: "900000000000002" })}`,
      countries: `# comment\r\n${countryRow()}\r\n`,
      admin1: adminRow
    });
    for (const kind of ["places", "countries", "admin1"] as const) {
      options[kind] = { ...options[kind], expectedSha256: digest(await readFile(options[kind].path)) };
    }
    const manifest = await buildGeoNamesIndex(options);
    expect(await records(manifest, options.outputDirectory)).toHaveLength(2);
  });

  it("produces a valid empty manifest when no populated place is selected", async () => {
    const options = await fixture({ places: placeRow({ 6: "H", 7: "STM" }) });
    const manifest = await buildGeoNamesIndex(options);
    expect(await records(manifest, options.outputDirectory)).toEqual([]);
  });

  it("produces identical bytes sequentially in different absolute input and output directories", async () => {
    const first = await fixture();
    const second = await fixture({}, "other-sources");
    second.outputDirectory = join(directory, "other-index");
    expect(await buildGeoNamesIndex(first)).toEqual(await buildGeoNamesIndex(second));
    expect(await outputFiles(first.outputDirectory)).toEqual(await outputFiles(second.outputDirectory));
  });

  it("records digest changes in ignored source features as well as retained records", async () => {
    const first = await fixture({ places: `${placeRow()}\n${placeRow({ 0: "900000000000002", 6: "H", 7: "STM" })}` });
    const second = await fixture({ places: `${placeRow()}\n${placeRow({ 0: "900000000000002", 6: "H", 7: "STM", 1: "Renamed Stream" })}` }, "other-sources");
    second.outputDirectory = join(directory, "other-index");
    const a = await buildGeoNamesIndex(first);
    const b = await buildGeoNamesIndex(second);
    expect(await records(a, first.outputDirectory)).toEqual(await records(b, second.outputDirectory));
    expect(a.provenance.sources).not.toEqual(b.provenance.sources);
  });
});

describe("segmented source directories", () => {
  it("reads contiguous parts as exact concatenated bytes, including splits within UTF-8 and rows", async () => {
    const options = await fixture({
      places: [placeRow({ 1: "北 Harbour", 3: "北 Haven" }), placeRow({ 0: "900000000000002" })].join("\n"),
      countries: `# synthetic\r\n${countryRow("ZQ", "北 Testland")}\r\n`,
      admin1: "ZQ.01\t北 Reach\tNorthern Reach\t900000000000011"
    });
    const unsplit = await buildGeoNamesIndex(options);
    const segmented = { ...options, outputDirectory: join(directory, "segmented-index") };
    for (const kind of ["places", "countries", "admin1"] as const) {
      const bytes = await readFile(options[kind].path);
      const path = join(directory, "parts", basename(options[kind].path));
      await mkdir(path, { recursive: true });
      const cuts = [0, 3, bytes.indexOf(Buffer.from("北")) + 1, bytes.length - 2, bytes.length];
      for (let index = 0; index < cuts.length - 1; index++) {
        await writeFile(join(path, `part-${String(index).padStart(6, "0")}.tsv`), bytes.subarray(cuts[index], cuts[index + 1]));
      }
      segmented[kind] = { ...options[kind], path, expectedSha256: digest(bytes) };
    }
    const manifest = await buildGeoNamesIndex(segmented);
    expect(manifest).toEqual(unsplit);
    expect(await outputFiles(segmented.outputDirectory)).toEqual(await outputFiles(options.outputDirectory));
    expect(await records(manifest, segmented.outputDirectory)).toHaveLength(2);
  });

  it.each([
    [], ["part-000001.tsv"], ["part-000000.tsv", "part-000002.tsv"],
    ["part-000000.tsv", "README.txt"], ["part-0.tsv"]
  ].map((names) => [names] as const))("rejects missing or unexpected part names %j", async (names) => {
    const options = await fixture();
    const path = join(directory, "parts");
    await mkdir(path);
    for (const name of names) await writeFile(join(path, name), `${placeRow()}\n`);
    await rejectsAndCleans({ ...options, places: { ...options.places, path } });
  });

  it.each(["directory", "symlink"] as const)("rejects a %s in place of a regular source part", async (kind) => {
    const options = await fixture();
    const path = join(directory, "parts");
    await mkdir(path);
    const part = join(path, "part-000000.tsv");
    if (kind === "directory") await mkdir(part);
    else await symlink(options.places.path, part);
    await rejectsAndCleans({ ...options, places: { ...options.places, path } });
  });

  it("rejects a source part at the exclusive file size limit", async () => {
    const options = await fixture();
    const path = join(directory, "parts");
    await mkdir(path);
    const part = join(path, "part-000000.tsv");
    await writeFile(part, `${placeRow()}\n`);
    const originalLstat = fsPromises.lstat;
    const lstatSpy = vi.spyOn(fsPromises, "lstat").mockImplementation(async (file, settings) => {
      const stat = await originalLstat(file, settings);
      if (file === part) Object.defineProperty(stat, "size", { value: INDEX_FILE_LIMIT });
      return stat;
    });
    try {
      await expect(buildGeoNamesIndex({ ...options, places: { ...options.places, path } })).rejects.toThrow(/source part exceeds file byte limit/i);
      await expect(access(options.outputDirectory)).rejects.toThrow();
    } finally {
      lstatSpy.mockRestore();
    }
  });

  it("accepts a source part immediately below the exclusive file size limit", async () => {
    const options = await fixture();
    const path = join(directory, "parts");
    await mkdir(path);
    const bytes = Buffer.alloc(INDEX_FILE_LIMIT - 1, 32);
    for (let start = 0; start < bytes.length; start += 32_000) {
      bytes[start] = 35;
      bytes[Math.min(start + 32_000, bytes.length) - 1] = 10;
    }
    const country = Buffer.from(`${countryRow()}\n`);
    await writeFile(join(path, "part-000000.tsv"), bytes);
    await writeFile(join(path, "part-000001.tsv"), country);
    const manifest = await buildGeoNamesIndex({
      ...options, countries: { ...options.countries, path, expectedSha256: digest(Buffer.concat([bytes, country])) }
    });
    expect(await records(manifest, options.outputDirectory)).toHaveLength(1);
  });
});

describe("bounded index publication", () => {
  it("exports the repository file limit and the default shard budget", () => {
    expect(INDEX_FILE_LIMIT).toBe(2_000_000);
    expect(DEFAULT_SHARD_BYTES).toBe(1_000_000);
  });

  it("shards whole datasets within a byte cap without dropping or reordering records", async () => {
    const places = Array.from({ length: 30 }, (_, index) => placeRow({ 0: String(900000000000001 + index) })).join("\n");
    const options = await fixture({ places });
    options.maxShardBytes = 2200;
    const manifest = await buildGeoNamesIndex(options);
    expect(manifest.shards.length).toBeGreaterThan(1);
    for (const shard of manifest.shards) expect(shard.bytes).toBeLessThanOrEqual(2200);
    expect((await records(manifest, options.outputDirectory)).map((entry) => entry.id)).toEqual(
      Array.from({ length: 30 }, (_, index) => `geonames:${900000000000001 + index}`)
    );
    expect((await readFile(join(options.outputDirectory, "manifest.json"))).byteLength).toBeLessThan(INDEX_FILE_LIMIT);
  });

  it("counts UTF-8 bytes, accepts an exact shard cap and rejects a single record above it", async () => {
    const options = await fixture({ places: placeRow({ 1: "北".repeat(200), 2: "Polar Example" }) });
    const baseline = await buildGeoNamesIndex(options);
    const only = baseline.shards[0]!;
    const text = await readFile(join(options.outputDirectory, only.file), "utf8");
    expect(Buffer.byteLength(text)).toBe(only.bytes);
    expect(text.length).toBeLessThan(only.bytes);
    const exact = { ...options, outputDirectory: join(directory, "exact"), maxShardBytes: only.bytes };
    const accepted = await buildGeoNamesIndex(exact);
    expect(await records(accepted, exact.outputDirectory)).toHaveLength(1);
    await rejectsAndCleans({ ...options, outputDirectory: join(directory, "too-small"), maxShardBytes: only.bytes - 1 });
  });

  it.each([0, -1, 1.5, NaN, Infinity, 2_000_000, 2_000_001])("rejects invalid shard cap %s", async (maxShardBytes) => {
    await rejectsAndCleans({ ...await fixture(), maxShardBytes });
  });

  it("accepts a shard cap immediately below the hard file limit", async () => {
    const options = { ...await fixture(), maxShardBytes: INDEX_FILE_LIMIT - 1 };
    const manifest = await buildGeoNamesIndex(options);
    expect(await records(manifest, options.outputDirectory)).toHaveLength(1);
  });

  it("refuses an existing directory without changing any of its files", async () => {
    const options = await fixture();
    await mkdir(options.outputDirectory);
    await writeFile(join(options.outputDirectory, "keep.txt"), "retain these bytes");
    const before = await outputFiles(options.outputDirectory);
    await expect(buildGeoNamesIndex(options)).rejects.toThrow();
    expect(await outputFiles(options.outputDirectory)).toEqual(before);
  });

  it("refuses an existing empty directory", async () => {
    const options = await fixture();
    await mkdir(options.outputDirectory);
    await expect(buildGeoNamesIndex(options)).rejects.toThrow();
    expect(await readdir(options.outputDirectory)).toEqual([]);
  });

  it("cleans emitted shards after a late duplicate identifier across shards", async () => {
    const rows = Array.from({ length: 15 }, (_, index) => placeRow({ 0: String(900000000000001 + index) }));
    rows.push(placeRow());
    const options = { ...await fixture({ places: rows.join("\n") }), maxShardBytes: 2200 };
    await rejectsAndCleans(options);
  });

  it("rejects malformed UTF-8 instead of storing replacement characters", async () => {
    const options = await fixture();
    const row = Buffer.from(placeRow());
    const start = row.indexOf(Buffer.from("Amber Harbour"));
    await writeFile(options.places.path, Buffer.concat([
      row.subarray(0, start), Buffer.from([0xc3, 0x28]), row.subarray(start + 2)
    ]));
    await rejectsAndCleans(options);
  });

  it("bounds a source line even when a filtered feature would otherwise bypass place validation", async () => {
    const options = await fixture({ places: placeRow({ 1: "x".repeat(140_000), 6: "H", 7: "STM" }) });
    await expect(buildGeoNamesIndex(options)).rejects.toThrow(/line exceeds byte limit/i);
    await expect(access(options.outputDirectory)).rejects.toThrow();
  });

  it.each(["places", "countries", "admin1"] as const)("rejects a mismatched %s source digest and removes output", async (kind) => {
    const options = await fixture();
    options[kind] = { ...options[kind], expectedSha256: "0".repeat(64) };
    await rejectsAndCleans(options);
  });
});

describe("strict GeoNames field validation", () => {
  it.each([
    ["identifier", 0, "0"], ["identifier", 0, "-1"], ["identifier", 0, "01"],
    ["identifier", 0, "1.5"], ["identifier", 0, "1e3"],
    ["identifier", 0, "9007199254740992"],
    ["latitude", 4, "90.00001"], ["latitude", 4, "-90.00001"],
    ["longitude", 5, "180.00001"], ["longitude", 5, "-180.00001"],
    ["latitude", 4, ""], ["latitude", 4, "0x10"], ["latitude", 4, "1e1"],
    ["latitude", 4, " 12"], ["latitude", 4, "12 "], ["latitude", 4, "NaN"],
    ["longitude", 5, "Infinity"], ["longitude", 5, "12.3tail"],
    ["population", 14, "-1"], ["population", 14, "1.5"], ["population", 14, "1e3"],
    ["population", 14, "9007199254740992"],
    ["elevation", 15, "1.5"], ["elevation", 15, "9007199254740992"],
    ["DEM elevation", 16, "1e2"], ["DEM elevation", 16, "-9007199254740992"],
    ["modification date", 18, "2023-02-29"], ["modification date", 18, "1900-02-29"],
    ["modification date", 18, "2024-02-30"], ["modification date", 18, "2024-04-31"],
    ["modification date", 18, "2024-13-01"], ["modification date", 18, "2024-00-01"],
    ["modification date", 18, "2024-01-00"], ["modification date", 18, "2024-1-1"],
    ["modification date", 18, ""], ["country mapping", 8, "QZ"],
    ["country code", 8, "zq"], ["name", 1, ""], ["name", 1, "   "],
    ["name", 1, "Amber\u0000Harbour"], ["ASCII name", 2, "Amber\u0085Harbour"],
    ["feature class", 6, "X"], ["feature code", 7, "ppl"],
    ["name", 1, "x".repeat(513)], ["ASCII name", 2, ""],
    ["timezone", 17, "+05:45"], ["timezone", 17, "America/Some Place"],
    ["alias", 3, "x".repeat(513)]
  ] as const)("rejects invalid %s field in column %s", async (_name, column, value) => {
    const options = await fixture({ places: placeRow({ [column]: value }) });
    await rejectsAndCleans(options);
  });

  it.each([
    placeRow().split("\t").slice(0, -1).join("\t"),
    `${placeRow()}\textra-column`
  ])("rejects an incorrect place column count", async (places) => {
    await rejectsAndCleans(await fixture({ places }));
  });

  it.each([
    ["countries", "ZQ\tTestland"],
    ["admin1", "ZQ.01\tNorthern Reach\tNorthern Reach"],
    ["countries", countryRow("ZQ", "Test\u0000land")],
    ["admin1", "ZQ.01\tNorthern\u0085Reach\tNorthern Reach\t900000000000011"],
    ["countries", `${countryRow()}\n${countryRow()}`],
    ["admin1", `${adminRow}\n${adminRow}`]
  ] as const)("rejects malformed or duplicate %s mapping rows", async (kind, content) => {
    await rejectsAndCleans(await fixture({ [kind]: content }));
  });

  it("applies the dataset alias-count bound after deduplication", async () => {
    const aliases = Array.from({ length: 1025 }, (_, index) => `Alias ${index}`).join(",");
    await rejectsAndCleans(await fixture({ places: placeRow({ 3: aliases }) }));
  });

  it("does not echo a raw invalid field or the input record in errors", async () => {
    const marker = "manufactured-private-marker-734952";
    const raw = placeRow({ 1: marker, 4: marker });
    const options = await fixture({ places: raw });
    let failure: unknown;
    try {
      await buildGeoNamesIndex(options);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain(marker);
    expect((failure as Error).message).not.toContain(raw);
    await expect(access(options.outputDirectory)).rejects.toThrow();
  });
});
