import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parsePlaceDataset } from "./dataset.js";
import type { DatasetProvenance, PlaceRecord, SourceFile } from "./types.js";

export const INDEX_FILE_LIMIT = 2_000_000;
export const DEFAULT_SHARD_BYTES = 1_000_000;
export const MAX_SOURCE_LINE_BYTES = 131_072;

const ATTRIBUTION = "Contains geographical data from GeoNames (https://www.geonames.org/), "
  + "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). "
  + "Populated places selected; country and region labels joined; label edge whitespace trimmed; empty or control-bearing aliases omitted; aliases deduplicated and sorted; fields transformed into the geocode index format.";

export interface GeoNamesInput {
  /** A text file, or a directory containing contiguous part-NNNNNN.tsv files. */
  readonly path: string;
  /** The upstream file URL, or archive URL with its member as a fragment. */
  readonly url: string;
  /** Optional trusted digest of the local, uncompressed input bytes. */
  readonly expectedSha256?: string;
}

export interface BuildIndexOptions {
  readonly places: GeoNamesInput;
  readonly countries: GeoNamesInput;
  readonly admin1: GeoNamesInput;
  /** Must not exist. Its parent directory must already exist. */
  readonly outputDirectory: string;
  readonly maxShardBytes?: number;
}

export interface IndexManifest {
  readonly schemaVersion: 1;
  readonly format: "geocode-index";
  readonly provenance: DatasetProvenance;
  readonly count: number;
  readonly transformations: Readonly<Transformations>;
  readonly shards: readonly {
    readonly file: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly count: number;
  }[];
}

interface Transformations {
  trimmedLabels: number;
  omittedAliases: number;
  duplicateAliases: number;
}

function trimLabel(value: string, transformations: Transformations): string {
  const trimmed = value.trim();
  if (trimmed !== value) transformations.trimmedLabels++;
  return trimmed;
}

function invalid(where: string, reason: string): never {
  throw new TypeError(`Invalid GeoNames input at ${where}: ${reason}.`);
}

function text(value: string, where: string, optional = false): string {
  if (optional && value === "") return value;
  if (!value || value.trim() !== value || value.length > 512 || /[\p{Cc}\p{Cs}]/u.test(value)) {
    invalid(where, "expected trimmed text without controls");
  }
  return value;
}

function integer(value: string, where: string, signed = false): number {
  if (!(signed ? /^-?(?:0|[1-9][0-9]*)$/u : /^(?:0|[1-9][0-9]*)$/u).test(value)) {
    invalid(where, "expected a decimal integer");
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) invalid(where, "integer exceeds safe range");
  return number;
}

function id(value: string, where: string): string {
  if (integer(value, where) <= 0) invalid(where, "expected a positive identifier");
  return value;
}

function decimal(value: string, where: string): number {
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value)) invalid(where, "expected decimal degrees");
  const number = Number(value);
  if (!Number.isFinite(number)) invalid(where, "expected finite decimal degrees");
  return number;
}

function countryCode(value: string, where: string): string {
  if (!/^[A-Z]{2}$/u.test(value)) invalid(where, "expected an uppercase country code");
  return value;
}

function checkDate(value: string, where: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) invalid(where, "expected a calendar date");
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    invalid(where, "invalid calendar date");
  }
}

async function sourceReceipt(input: GeoNamesInput, role: string): Promise<SourceFile> {
  // Reuse the contract's source URL and digest validation before reading any file.
  const candidate = { file: basename(input.path), url: input.url, sha256: input.expectedSha256 ?? "0".repeat(64) };
  parsePlaceDataset({ schemaVersion: 1, provenance: {
    dataset: "geonames", license: "CC-BY-4.0", attribution: ATTRIBUTION, sources: [candidate]
  }, places: [] });
  const hash = createHash("sha256");
  for await (const chunk of sourceChunks(input.path)) hash.update(chunk);
  const sha256 = hash.digest("hex");
  if (input.expectedSha256 !== undefined && input.expectedSha256 !== sha256) invalid(role, "source digest mismatch");
  return { ...candidate, sha256 };
}

async function* sourceChunks(path: string): AsyncGenerator<Buffer> {
  const stat = await lstat(path);
  if (stat.isFile()) {
    for await (const chunk of createReadStream(path, { highWaterMark: 65_536 })) yield chunk as Buffer;
    return;
  }
  if (!stat.isDirectory()) invalid("source", "expected a regular file or parts directory");
  const entries = (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  if (!entries.length) invalid("source", "empty parts directory");
  for (const [i, entry] of entries.entries()) {
    if (!entry.isFile() || entry.name !== `part-${String(i).padStart(6, "0")}.tsv`) {
      invalid("source", "expected contiguous numbered regular source parts");
    }
    const part = join(path, entry.name);
    if ((await lstat(part)).size >= INDEX_FILE_LIMIT) invalid("source", "source part exceeds file byte limit");
    for await (const chunk of createReadStream(part, { highWaterMark: 65_536 })) yield chunk as Buffer;
  }
}

/** Bounded UTF-8 lines; the second-pass digest also detects input edits during a build. */
async function* lines(input: GeoNamesInput, receipt: SourceFile, role: string): AsyncGenerator<{ value: string; where: string }> {
  const hash = createHash("sha256");
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let pending: Buffer = Buffer.alloc(0);
  let line = 0;
  function decode(bytes: Buffer): { value: string; where: string } {
    const where = `${role} line ${++line}`;
    if (bytes.length > MAX_SOURCE_LINE_BYTES) invalid(where, "line exceeds byte limit");
    try {
      const value = decoder.decode(bytes);
      return { value: value.endsWith("\r") ? value.slice(0, -1) : value, where };
    } catch {
      return invalid(where, "expected valid UTF-8");
    }
  }
  for await (const bytes of sourceChunks(input.path)) {
    hash.update(bytes);
    pending = Buffer.concat([pending, bytes]);
    let start = 0;
    let end: number;
    while ((end = pending.indexOf(10, start)) !== -1) {
      yield decode(pending.subarray(start, end));
      start = end + 1;
    }
    pending = pending.subarray(start);
    if (pending.length > MAX_SOURCE_LINE_BYTES) invalid(`${role} line ${line + 1}`, "line exceeds byte limit");
  }
  if (pending.length) yield decode(pending);
  if (hash.digest("hex") !== receipt.sha256) invalid(role, "source changed during build");
}

function fields(value: string, count: number, where: string): string[] {
  const result = value.split("\t");
  if (result.length !== count) invalid(where, "unexpected field count");
  return result;
}

async function countries(input: GeoNamesInput, receipt: SourceFile, transformations: Transformations): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for await (const { value, where } of lines(input, receipt, "countries")) {
    if (!value || value.startsWith("#")) continue;
    const row = fields(value, 19, where);
    const code = countryCode(row[0]!, `${where}.countryCode`);
    const name = text(trimLabel(row[4]!, transformations), `${where}.countryName`);
    if (result.has(code)) invalid(where, "duplicate country code");
    result.set(code, name);
  }
  return result;
}

async function regions(input: GeoNamesInput, receipt: SourceFile, transformations: Transformations): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for await (const { value, where } of lines(input, receipt, "admin1")) {
    if (!value) continue;
    const row = fields(value, 4, where);
    const key = text(row[0]!, `${where}.code`);
    if (!/^[A-Z]{2}\.[A-Za-z0-9-]+$/u.test(key)) invalid(`${where}.code`, "invalid administrative code");
    const name = text(trimLabel(row[1]!, transformations), `${where}.name`);
    text(trimLabel(row[2]!, transformations), `${where}.asciiName`);
    id(row[3]!, `${where}.id`);
    if (result.has(key)) invalid(where, "duplicate administrative code");
    result.set(key, name);
  }
  return result;
}

function place(row: string[], where: string, countryNames: Map<string, string>, regionNames: Map<string, string>, provenance: DatasetProvenance, transformations: Transformations): PlaceRecord | null {
  id(row[0]!, `${where}.id`);
  if (!/^[AHLPRSTUV]$/u.test(row[6]!)) invalid(`${where}.featureClass`, "unknown feature class");
  if (!/^[A-Z][A-Z0-9]*$/u.test(row[7]!)) invalid(`${where}.featureCode`, "invalid feature code");
  // Country dumps also contain mountains, buildings and other non-settlements.
  if (row[6] !== "P") return null;
  const code = countryCode(row[8]!, `${where}.countryCode`);
  const countryName = countryNames.get(code);
  if (!countryName) invalid(`${where}.countryCode`, "missing country label");
  if (row[9] && !/^[A-Z]{2}(?:,[A-Z]{2})*$/u.test(row[9])) invalid(`${where}.cc2`, "invalid alternate country codes");
  for (const column of [10, 11, 12, 13]) text(row[column]!, `${where}.admin${column - 9}`, true);
  checkDate(row[18]!, `${where}.modificationDate`);
  const unique = new Set<string>();
  for (const alias of row[3] === "" ? [] : row[3]!.split(",")) {
    const trimmed = trimLabel(alias, transformations);
    if (!trimmed || /[\p{Cc}\p{Cs}]/u.test(trimmed)) transformations.omittedAliases++;
    else if (unique.has(trimmed)) transformations.duplicateAliases++;
    else unique.add(trimmed);
  }
  const aliases = [...unique].sort();
  const nullableInteger = (column: number, signed = false): number | null => row[column] === "" ? null : integer(row[column]!, `${where}.column${column + 1}`, signed);
  const result = {
    id: `geonames:${row[0]}`, name: trimLabel(row[1]!, transformations), asciiName: trimLabel(row[2]!, transformations), aliases,
    countryCode: code, countryName,
    regionCode: row[10] || null,
    regionName: row[10] ? regionNames.get(`${code}.${row[10]}`) ?? null : null,
    latitude: decimal(row[4]!, `${where}.latitude`), longitude: decimal(row[5]!, `${where}.longitude`),
    population: nullableInteger(14), elevationMeters: nullableInteger(15, true),
    demElevationMeters: nullableInteger(16, true), timeZone: row[17] || null
  };
  try {
    return parsePlaceDataset({ schemaVersion: 1, provenance, places: [result] }).places[0]!;
  } catch {
    return invalid(where, "place record fails the dataset contract");
  }
}

/** Offline builder. Memory holds label maps, seen IDs and one output shard, not the place dump. */
export async function buildGeoNamesIndex(options: BuildIndexOptions): Promise<IndexManifest> {
  const maxBytes = options.maxShardBytes ?? DEFAULT_SHARD_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes >= INDEX_FILE_LIMIT) {
    throw new RangeError("maxShardBytes must be a positive integer below the index file limit.");
  }
  const sources = await Promise.all([
    sourceReceipt(options.places, "places"), sourceReceipt(options.countries, "countries"), sourceReceipt(options.admin1, "admin1")
  ]);
  const provenance = parsePlaceDataset({ schemaVersion: 1, provenance: {
    dataset: "geonames", license: "CC-BY-4.0", attribution: ATTRIBUTION, sources
  }, places: [] }).provenance;
  const transformations: Transformations = { trimmedLabels: 0, omittedAliases: 0, duplicateAliases: 0 };
  const countryNames = await countries(options.countries, sources[1]!, transformations);
  const regionNames = await regions(options.admin1, sources[2]!, transformations);
  await mkdir(options.outputDirectory); // Never reuse, clear or overwrite an existing directory.
  try {
    const shards: Array<IndexManifest["shards"][number]> = [];
    const seen = new Set<string>();
    const prefix = `{"schemaVersion":1,"provenance":${JSON.stringify(provenance)},"places":[`;
    const suffix = "]}\n";
    const overhead = Buffer.byteLength(prefix + suffix);
    let encoded: string[] = [];
    let bytes = overhead;
    let count = 0;
    async function flush(): Promise<void> {
      if (!encoded.length) return;
      const content = prefix + encoded.join(",") + suffix;
      const file = `places-${String(shards.length).padStart(6, "0")}.json`;
      await writeFile(join(options.outputDirectory, file), content, { flag: "wx" });
      shards.push({ file, sha256: createHash("sha256").update(content).digest("hex"), bytes, count: encoded.length });
      encoded = [];
      bytes = overhead;
    }
    for await (const { value, where } of lines(options.places, sources[0]!, "places")) {
      if (!value) continue;
      const record = place(fields(value, 19, where), where, countryNames, regionNames, provenance, transformations);
      if (record === null) continue;
      if (seen.has(record.id)) invalid(where, "duplicate place identifier");
      seen.add(record.id);
      const json = JSON.stringify(record);
      const size = Buffer.byteLength(json);
      if (overhead + size > maxBytes) invalid(where, "record exceeds shard byte limit");
      if (bytes + size + (encoded.length ? 1 : 0) > maxBytes) await flush();
      bytes += size + (encoded.length ? 1 : 0);
      encoded.push(json);
      count++;
    }
    await flush();
    const manifest: IndexManifest = { schemaVersion: 1, format: "geocode-index", provenance, count, transformations, shards };
    const content = `${JSON.stringify(manifest, null, 2)}\n`;
    if (Buffer.byteLength(content) >= INDEX_FILE_LIMIT) throw new RangeError("Index manifest exceeds file byte limit.");
    await writeFile(join(options.outputDirectory, "manifest.json"), content, { flag: "wx" });
    return manifest;
  } catch (error) {
    await rm(options.outputDirectory, { recursive: true, force: true });
    throw error;
  }
}
